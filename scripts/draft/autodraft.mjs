import { checkDraft } from './drafts.mjs';

/**
 * Redacción automática, compuesta enteramente de citas.
 *
 * El borrador que sale de aquí tiene exactamente dos clases de texto: citas
 * literales del fabricante, entre comillas angulares, y conectores nuestros que
 * no afirman nada — «según su propia página», «sobre el precio dice». No hay
 * una tercera clase. Si algo no puede decirse citando, no se dice.
 *
 * Eso lo hace comprobable de una forma que la prosa libre no permite: cada
 * parte del borrador apunta en `factTrace` a las citas que la sostienen, y el
 * borrador entero pasa por `checkDraft`, la misma puerta que se aplica a lo que
 * escribe una persona. Un borrador automático que no la pase no se guarda.
 *
 * El resultado es más seco que un texto escrito a mano, y debe serlo: quien
 * revisa en la mesa tiene que poder ver de un vistazo qué es del fabricante y
 * qué es nuestro.
 */

const CATEGORIA_POR_VERTICAL = {
  imagen: 'imagen',
  video: 'video',
  audio: 'audio',
  agentes: 'agentes',
  'plataforma-agentes': 'plataforma-agentes',
  multimodal: 'modelo-multimodal',
  'modelo-lenguaje': 'modelo-lenguaje',
  'local-open-source': 'local-open-source',
  herramientas: 'programacion',
};

function slugify(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function recortar(cita, max = 220) {
  const limpia = String(cita).replace(/\s+/g, ' ').trim();
  return limpia.length <= max ? limpia : `${limpia.slice(0, max - 1).trimEnd()}…`;
}

function citasDe(record, patron) {
  return record.verifiedFacts.filter((f) => patron.test(f.fact)).map((f) => f.quote);
}

/**
 * Compone el borrador desde el registro de verificación.
 *
 * Devuelve `null` cuando la evidencia no da para un texto: es la vía normal
 * para «esto no es publicable todavía», no un error.
 */
export function draftFromVerification(record, candidate, { author = 'Newsroom automático' } = {}) {
  if (record.decision !== 'verified') return null;

  const fechaCita = citasDe(record, /fecha de publicación/i)[0];
  const dispCita = citasDe(record, /disponibilidad/i)[0];
  const precioCitas = citasDe(record, /precio/i);
  const gratisCitas = citasDe(record, /acceso gratuito/i);
  const licenciaCitas = citasDe(record, /pesos o licencia/i);

  if (!fechaCita || !dispCita) return null;

  const titulo = String(record.title ?? candidate.title).trim();
  const fabricante = String(candidate.publisher).split('/')[0];
  const publishedAt = record.verifiedFacts
    .find((f) => /fecha de publicación/i.test(f.fact))
    ?.fact.match(/(\d{4}-\d{2}-\d{2})/)?.[1];

  if (!publishedAt) return null;

  /*
   * El resumen: quién, cuándo, y qué dice la página sobre lo que se puede
   * hacer. La única frase con contenido factual es la cita, y va entrecomillada
   * para que quien revisa vea dónde acaba lo nuestro.
   */
  const partesResumen = [
    `${fabricante} publicó esto el ${publishedAt}, según la fecha que declara su propia página.`,
    `Sobre la disponibilidad, el anuncio dice: «${recortar(dispCita)}».`,
  ];

  if (precioCitas.length > 0) {
    partesResumen.push(`Sobre el precio: «${recortar(precioCitas[0], 160)}».`);
  }

  /*
   * El impacto: qué cambia para quien no paga. Cuando la página lo dice, se
   * cita. Cuando no lo dice, se dice que no lo dice — nunca que no lo hay.
   */
  const partesImpacto = [];

  if (gratisCitas.length > 0) {
    partesImpacto.push(`Sobre el acceso sin pagar, la página afirma: «${recortar(gratisCitas[0], 200)}».`);
  } else {
    partesImpacto.push(
      'La página no menciona ninguna capa gratuita, ni para confirmarla ni para descartarla, así que no podemos decir qué cambia para quien no paga.'
    );
  }

  if (licenciaCitas.length > 0) {
    partesImpacto.push(`Sobre pesos y licencia: «${recortar(licenciaCitas[0], 180)}».`);
  } else {
    partesImpacto.push('El anuncio no menciona pesos descargables ni licencia.');
  }

  partesImpacto.push('Verificado leyendo la página del fabricante; queda pendiente la revisión editorial.');

  const summary = partesResumen.join(' ').slice(0, 600);
  const impact = partesImpacto.join(' ').slice(0, 600);

  if (summary.length < 20 || impact.length < 20) return null;

  const slug = slugify(`${fabricante}-${titulo}`) || slugify(candidate.id);

  const draft = {
    candidateId: record.candidateId,
    id: `news-${publishedAt}-${slug}`.slice(0, 90),
    slug,
    title: titulo.slice(0, 160),
    summary,
    impact,
    category: CATEGORIA_POR_VERTICAL[candidate.vertical] ?? 'modelo-lenguaje',
    eventType: record.eventType,
    availability: record.availability,
    affectsFreePlan: record.affectsFreePlan,
    relatedTools: [],
    officialUrl: record.primarySources[0].url,
    sources: [
      {
        url: record.primarySources[0].url,
        label: record.primarySources[0].label,
        kind: 'official',
        publisher: candidate.publisher,
        checkedAt: record.checkedAt,
      },
    ],
    factTrace: {
      summary: [fechaCita, dispCita, ...precioCitas.slice(0, 1)],
      impact: [...gratisCitas.slice(0, 1), ...licenciaCitas.slice(0, 1)].filter(Boolean),
      eventType: [dispCita],
      availability: [dispCita],
      pricing: precioCitas.slice(0, 1),
      freePlan: gratisCitas.slice(0, 1),
    },
    status: 'draft',
    author,
  };

  /*
   * `factTrace.impact` no puede quedar vacío: el esquema exige al menos una
   * cita por parte. Cuando el impacto es enteramente «la página no lo dice»,
   * la cita que lo sostiene es la de disponibilidad, que es lo que sí se leyó.
   */
  if (draft.factTrace.impact.length === 0) draft.factTrace.impact = [dispCita];

  /*
   * La misma puerta que a un borrador humano. Un texto automático que no la
   * pase se descarta entero: preferimos una historia bloqueada con su motivo a
   * un borrador que haya que desconfiar frase a frase.
   */
  const puerta = checkDraft(draft, record);
  if (!puerta.ok) return { draft: null, blocked: puerta.reasons };

  return { draft, blocked: [] };
}
