import { canonicalizeUrl } from '../radar/inbox.mjs';
import { gatherEvidence } from './adapters.mjs';

/**
 * Verificación y redacción automáticas, con una regla que no se negocia:
 * ninguna afirmación existe sin una cita que la sostenga.
 *
 * La diferencia con «un cron que escribe prosa» está en quién aporta los
 * hechos. Aquí el sistema sólo aporta conectores — «según la página oficial»,
 * «sobre el precio dice» — y todo lo demás es texto literal del fabricante,
 * entre comillas y con su `factTrace`. Si una frase del borrador no puede
 * apuntar a una cita, esa frase no se escribe; y si eso deja el borrador sin
 * nada que decir, el resultado es `insufficient`.
 *
 * Concluir «esto no es publicable» es un resultado correcto y frecuente. Lo que
 * el sistema no puede hacer nunca es rellenar el hueco.
 */

const HOST_COMPARTIDO = ['github.com', 'gitlab.com', 'huggingface.co'];

function perteneceAlFabricante(url, publisher) {
  try {
    const parsed = new URL(url);
    const [host, org] = String(publisher).split('/');
    if (!host) return false;

    const coincide = parsed.hostname === host || parsed.hostname.endsWith(`.${host}`);
    if (!coincide) return false;

    if (HOST_COMPARTIDO.includes(host)) {
      if (!org) return false;
      return parsed.pathname.toLowerCase().startsWith(`/${org.toLowerCase()}/`);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica un candidato contra el HTML de su fuente oficial.
 *
 * `fetchPage` se inyecta para que las pruebas puedan ejercitar 403, muros de
 * login y páginas vacías sin salir a la red.
 */
export async function verifyCandidate(candidate, { fetchPage, fetchFeed = null, checkedAt }) {
  const url = candidate.url ?? `https://${candidate.canonicalUrl}`;
  const publisher = candidate.publisher;

  const base = {
    candidateId: candidate.id,
    title: candidate.title,
    checkedAt,
    eventType: null,
    availability: null,
    affectsFreePlan: 'unverified',
    verifiedFacts: [],
    unconfirmed: [],
  };

  if (!perteneceAlFabricante(url, publisher)) {
    return {
      ...base,
      decision: 'insufficient',
      primarySources: [
        { url, label: candidate.title, reachable: false, unreachableReason: `la url no pertenece a ${publisher}` },
      ],
      unconfirmed: ['Todo: la fuente no es del dominio del fabricante.'],
      verificationNotes: `No se verifica contra ${url}: no pertenece a ${publisher}.`,
    };
  }

  /*
   * La evidencia se reúne de las vías que el fabricante permita: su feed
   * oficial, el HTML del artículo, o las dos. Cada pieza sale con su `sourceUrl`
   * y su `via`, así que después se puede saber si una afirmación la sostiene el
   * artículo o sólo el feed.
   */
  const { evidence, notes, htmlBlocked, strategy } = await gatherEvidence(candidate, {
    fetchPage,
    fetchFeed,
  });

  const fuentes = [];
  const vistas = new Set();
  for (const item of evidence) {
    if (vistas.has(item.sourceUrl)) continue;
    vistas.add(item.sourceUrl);
    fuentes.push({
      url: item.sourceUrl,
      label: item.via === 'feed' ? `Feed oficial de ${publisher}` : candidate.title,
      reachable: true,
      unreachableReason: null,
    });
  }

  if (htmlBlocked && !vistas.has(url)) {
    fuentes.push({ url, label: candidate.title, reachable: false, unreachableReason: htmlBlocked });
  }

  if (evidence.length === 0) {
    return {
      ...base,
      decision: 'insufficient',
      primarySources: fuentes.length
        ? fuentes
        : [{ url, label: candidate.title, reachable: false, unreachableReason: htmlBlocked ?? 'sin evidencia' }],
      unconfirmed: ['Todo: ninguna vía oficial ha aportado evidencia.'],
      verificationNotes: `Sin evidencia. ${notes.join('; ')}.`,
    };
  }

  const de = (tipo) => evidence.filter((e) => e.factType === tipo);
  const fecha = de('date')[0] ?? null;
  const disponibilidad = de('availability')[0] ?? null;
  const precios = de('pricing');
  const gratis = de('free-access');
  const licencias = de('licence');

  const verifiedFacts = [];
  const unconfirmed = [];

  /*
   * Cada hecho conserva las cuatro cosas que exige la regla: de dónde salió, de
   * qué clase es, qué dice literalmente, y —cuando aplica— a qué fecha
   * corresponde. `via` viaja dentro del texto del hecho para que en la mesa se
   * lea sin abrir nada.
   */
  const anotar = (item, texto) =>
    verifiedFacts.push({
      fact: `${texto} [${item.factType}, vía ${item.via}]`,
      quote: item.quote,
      sourceUrl: item.sourceUrl,
    });

  if (fecha) anotar(fecha, `La fuente declara la fecha de publicación: ${fecha.value}.`);
  else unconfirmed.push('Fecha de publicación: ninguna vía oficial la declara.');

  if (disponibilidad) {
    anotar(disponibilidad, `La fuente describe la disponibilidad como "${disponibilidad.value}".`);
  } else {
    unconfirmed.push('Disponibilidad: ninguna vía oficial dice si se puede usar ya.');
  }

  for (const item of precios) anotar(item, 'La fuente menciona un precio.');
  if (precios.length === 0) unconfirmed.push('Precio: no aparece en ninguna vía oficial.');

  for (const item of gratis) anotar(item, 'La fuente menciona acceso gratuito.');
  for (const item of licencias) anotar(item, 'La fuente menciona pesos o licencia.');

  const affectsFreePlan = gratis.length > 0 ? 'yes' : 'unverified';
  if (affectsFreePlan === 'unverified') {
    unconfirmed.push('Plan gratuito: ninguna vía oficial menciona acceso sin pagar.');
  }

  if (htmlBlocked) {
    unconfirmed.push(
      `Cuerpo del artículo: no se ha podido leer (${htmlBlocked}). Lo verificado sale del feed oficial.`
    );
  }

  const suficiente = Boolean(fecha && disponibilidad);

  return {
    candidateId: candidate.id,
    title: de('title')[0]?.value ?? candidate.title,
    decision: suficiente ? 'verified' : 'insufficient',
    primarySources: fuentes,
    verifiedFacts,
    unconfirmed,
    eventType: disponibilidad?.eventType ?? null,
    availability: disponibilidad?.value ?? null,
    affectsFreePlan,
    checkedAt,
    canonicalUrl: canonicalizeUrl(url),
    verificationNotes: suficiente
      ? `${verifiedFacts.length} hechos con cita literal. ${notes.join('; ')}. Estrategia: ${strategy.prefer} (${strategy.note}).`
      : `No sostiene lo mínimo para redactar: falta ${!fecha ? 'la fecha' : 'una frase sobre disponibilidad'}. ${notes.join('; ')}.`,
  };
}
