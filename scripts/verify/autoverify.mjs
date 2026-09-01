import { extractFacts, looksLikeIndex, looksUnreadable } from './extract.mjs';
import { canonicalizeUrl } from '../radar/inbox.mjs';

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
export async function verifyCandidate(candidate, { fetchPage, checkedAt }) {
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

  const esIndice = looksLikeIndex(url);
  if (esIndice) {
    /*
     * Se rechaza antes de descargar. Un índice se lee bien y contiene frases de
     * varias historias a la vez, así que cualquier cita que saliera de aquí
     * quedaría atribuida a la noticia equivocada.
     */
    return {
      ...base,
      decision: 'insufficient',
      primarySources: [
        { url, label: candidate.title, reachable: false, unreachableReason: esIndice },
      ],
      unconfirmed: ['Todo: hace falta la url del anuncio, no la del índice.'],
      verificationNotes: `No se verifica contra un índice: ${esIndice}.`,
    };
  }

  let respuesta;
  try {
    respuesta = await fetchPage(url);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      decision: 'insufficient',
      primarySources: [{ url, label: candidate.title, reachable: false, unreachableReason: motivo }],
      unconfirmed: ['Todo: no se ha podido leer la fuente primaria.'],
      verificationNotes: `No se ha podido leer la fuente: ${motivo}.`,
    };
  }

  if (!respuesta.ok) {
    /*
     * Un 403 es información, no un fallo del sistema: dice que el fabricante no
     * nos deja leer. Se registra tal cual para que en la mesa se vea que hay
     * algo ahí y por qué está bloqueado, en lugar de desaparecer.
     */
    return {
      ...base,
      decision: 'insufficient',
      primarySources: [
        { url, label: candidate.title, reachable: false, unreachableReason: `respondió ${respuesta.status}` },
      ],
      unconfirmed: ['Todo: la fuente primaria no se ha podido leer.'],
      verificationNotes:
        respuesta.status === 403
          ? 'La fuente devuelve 403 a un lector automático. Necesita una lectura humana.'
          : `La fuente respondió ${respuesta.status}.`,
    };
  }

  const ilegible = looksUnreadable(respuesta.body);
  if (ilegible) {
    return {
      ...base,
      decision: 'insufficient',
      primarySources: [{ url, label: candidate.title, reachable: false, unreachableReason: ilegible }],
      unconfirmed: ['Todo: la página respondió, pero su contenido no se ha podido leer.'],
      verificationNotes: `${ilegible}. Responde 200, así que hace falta abrirla a mano.`,
    };
  }

  const hechos = extractFacts(respuesta.body, url);
  const fuente = { url, label: hechos.title || candidate.title, reachable: true, unreachableReason: null };

  const verifiedFacts = [];
  const unconfirmed = [];

  if (hechos.publishedAt) {
    verifiedFacts.push({
      fact: `La página declara su fecha de publicación: ${hechos.publishedAt.value}.`,
      quote: hechos.publishedAt.quote,
      sourceUrl: url,
    });
  } else {
    unconfirmed.push('Fecha de publicación: la página no la declara en un formato legible.');
  }

  if (hechos.availability) {
    verifiedFacts.push({
      fact: `La página describe la disponibilidad como "${hechos.availability.availability}".`,
      quote: hechos.availability.quote,
      sourceUrl: url,
    });
  } else {
    unconfirmed.push('Disponibilidad: la página no dice si se puede usar ya, ni con qué límites.');
  }

  for (const quote of hechos.pricing) {
    verifiedFacts.push({ fact: 'La página menciona un precio.', quote, sourceUrl: url });
  }
  if (hechos.pricing.length === 0) unconfirmed.push('Precio: la página no lo menciona.');

  for (const quote of hechos.freePlan) {
    verifiedFacts.push({ fact: 'La página menciona acceso gratuito.', quote, sourceUrl: url });
  }

  for (const quote of hechos.licence) {
    verifiedFacts.push({ fact: 'La página menciona pesos o licencia.', quote, sourceUrl: url });
  }

  /*
   * `affectsFreePlan` sólo pasa a 'yes' si hay una frase que lo dice. No existe
   * la rama que lo pone a 'no': una página que no habla de gratuidad no ha
   * negado nada, y convertir ese silencio en un 'no' es exactamente lo que la
   * regla 4 prohíbe.
   */
  const affectsFreePlan = hechos.freePlan.length > 0 ? 'yes' : 'unverified';
  if (affectsFreePlan === 'unverified') {
    unconfirmed.push('Plan gratuito: la página no menciona acceso sin pagar.');
  }

  /*
   * Lo mínimo para poder redactar sin inventar: una fecha que la página declara
   * y una frase que diga qué se puede hacer con esto. Sin las dos, cualquier
   * borrador tendría que rellenar el hueco, así que no se redacta.
   */
  const suficiente = Boolean(hechos.publishedAt && hechos.availability);

  return {
    candidateId: candidate.id,
    title: hechos.title || candidate.title,
    decision: suficiente ? 'verified' : 'insufficient',
    primarySources: [fuente],
    verifiedFacts,
    unconfirmed,
    eventType: hechos.availability?.eventType ?? null,
    availability: hechos.availability?.availability ?? null,
    affectsFreePlan,
    checkedAt,
    canonicalUrl: canonicalizeUrl(url),
    verificationNotes: suficiente
      ? `Leída la fuente oficial: ${verifiedFacts.length} hechos con cita literal.`
      : `Leída, pero no sostiene lo mínimo para redactar: falta ${
          !hechos.publishedAt ? 'la fecha' : 'una frase sobre disponibilidad'
        }.`,
  };
}
