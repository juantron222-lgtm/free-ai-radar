import { INTENCIONES } from '@lib/search/intents';

/**
 * «Pregúntale al Radar»: qué herramienta usar para una tarea, con tus
 * condiciones.
 *
 * Decide con reglas, no con un modelo de lenguaje: todo lo que hace falta para
 * decidir ya es un dato de la ficha, con su fuente y su fecha. El diseño está
 * en docs/diseno-motor-de-decision.md; lo que aquí importa son tres reglas que
 * fijan las pruebas:
 *
 *   1. Un hecho comprobado en contra descarta, y se dice por qué.
 *   2. Un hecho que no consta nunca cuenta como sí ni como no: la herramienta
 *      baja a «posibles, sin confirmar» y se dice exactamente qué no sabemos.
 *   3. Que el plan gratuito incluya la tarea también es un hecho: sólo cuenta
 *      con su cita en `includedCapabilities`. Que no figure entre las
 *      exclusiones no significa que esté incluida (Juan, 11 de octubre de 2026).
 *
 * No hay puntuación. El orden es lexicográfico y se puede explicar en una
 * frase: menos dudas, más acceso gratuito, menos esfuerzo para empezar, cuota
 * publicada, revisión más reciente y nombre.
 *
 * Es una función pura sobre `FichaMotor`, que se construye en el servidor
 * (`fichas.ts`): así la misma respuesta servirá mañana para las páginas por
 * tarea sin escribir otro motor.
 */

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

export const IDS_DE_TAREA = [
  'programar',
  'transcribir',
  'quitar-fondo',
  'generar-imagenes',
  'editar-imagen',
  'generar-video',
  'persona-a-camara',
  'crear-musica',
  'generar-voz',
  'clonar-voz',
  'agente',
  'modelo-de-lenguaje',
] as const;
export type IdDeTarea = (typeof IDS_DE_TAREA)[number];

/**
 * Cada tarea es una intención del buscador, por su nombre público.
 *
 * Las capacidades salen de `INTENCIONES` y no se copian: si el buscador
 * aprende que «Generar vídeo» incluye otra capacidad, el motor lo aprende a la
 * vez. Fuera, por ahora: «Crear una aplicación» (se reconoce por tipo de
 * producto, y la inclusión gratuita se cita por capacidad) y «Usarlo por API»
 * (sólo una ficha tiene citado que su plan gratuito la incluya).
 */
const INTENCION_DE: Record<IdDeTarea, string> = {
  programar: 'Programar con IA',
  transcribir: 'Transcribir audio a texto',
  'quitar-fondo': 'Quitar el fondo de una imagen',
  'generar-imagenes': 'Generar imágenes',
  'editar-imagen': 'Editar una imagen',
  'generar-video': 'Generar vídeo',
  'persona-a-camara': 'Vídeo con una persona a cámara',
  'crear-musica': 'Crear música',
  'generar-voz': 'Generar una voz',
  'clonar-voz': 'Clonar una voz',
  agente: 'Usar un agente que haga la tarea',
  'modelo-de-lenguaje': 'Elegir un modelo de lenguaje',
};

/** Las que producen imagen, vídeo o audio: sólo en ellas tiene sentido preguntar por la marca de agua. */
const CON_RESULTADO_QUE_SE_VE: ReadonlySet<IdDeTarea> = new Set([
  'quitar-fondo',
  'generar-imagenes',
  'editar-imagen',
  'generar-video',
  'persona-a-camara',
  'crear-musica',
  'generar-voz',
  'clonar-voz',
]);

export interface Tarea {
  id: IdDeTarea;
  etiqueta: string;
  capacidades: readonly string[];
  conMarcaDeAgua: boolean;
}

export const TAREAS: readonly Tarea[] = IDS_DE_TAREA.flatMap((id) => {
  const intencion = INTENCIONES.find((i) => i.etiqueta === INTENCION_DE[id]);
  if (!intencion?.capacidades?.length) return [];
  return [{ id, etiqueta: intencion.etiqueta, capacidades: intencion.capacidades, conMarcaDeAgua: CON_RESULTADO_QUE_SE_VE.has(id) }];
});

export function tareaPorId(id: string | null | undefined): Tarea | undefined {
  return TAREAS.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Exigencias
// ---------------------------------------------------------------------------

/**
 * Lo que quien pregunta pone como condición. Cada id es también el parámetro
 * de la URL, así que una consulta se puede compartir tal cual.
 *
 * «Que no entrene con mis datos» queda fuera de la primera versión: consta en
 * el 3 % de las fichas y casi siempre contestaría «no sabemos» (Juan, 21 de
 * octubre de 2026). Vuelve cuando haya datos.
 */
export const IDS_DE_EXIGENCIA = ['sin-tarjeta', 'sin-registro', 'comercial', 'sin-marca', 'en-local', 'abierto'] as const;
export type IdDeExigencia = (typeof IDS_DE_EXIGENCIA)[number];

export const EXIGENCIAS: Record<IdDeExigencia, { etiqueta: string; dato: string; descartadas: string }> = {
  'sin-tarjeta': { etiqueta: 'Sin dar una tarjeta', dato: 'Si pide tarjeta', descartadas: 'piden tarjeta' },
  'sin-registro': { etiqueta: 'Sin registrarme', dato: 'Si pide registro', descartadas: 'piden registro' },
  comercial: { etiqueta: 'Poder usarlo para trabajar (uso comercial)', dato: 'Si permite uso comercial', descartadas: 'no permiten uso comercial' },
  'sin-marca': { etiqueta: 'Sin marca de agua', dato: 'Si pone marca de agua', descartadas: 'ponen marca de agua' },
  'en-local': { etiqueta: 'Que funcione en mi equipo', dato: 'Si funciona en tu equipo', descartadas: 'sólo funcionan en la nube' },
  abierto: { etiqueta: 'Que sea de código abierto', dato: 'Si es de código abierto', descartadas: 'no son de código abierto' },
};

export const DONDE = ['navegador', 'ordenador', 'movil'] as const;
export type Donde = (typeof DONDE)[number];

export const DONDE_ETIQUETA: Record<Donde, string> = {
  navegador: 'En el navegador',
  ordenador: 'Instalado en mi ordenador',
  movil: 'En el móvil',
};

// ---------------------------------------------------------------------------
// Lo que el motor sabe de cada ficha
// ---------------------------------------------------------------------------

/**
 * De dónde sale un hecho.
 *
 * `cita`: la frase de la página oficial, con su dirección y la fecha en que se
 * leyó. `ficha`: el dato es anterior a las citas por campo y lo respaldan las
 * fuentes de la ficha y su fecha de comprobación; se dice así, sin disfrazarlo
 * de cita.
 */
export interface Fuente {
  tipo: 'cita' | 'ficha';
  url: string;
  fecha: string;
  cita?: string;
  /** Si la cita habla sólo de una de sus puertas (la API, los pesos…). */
  alcance?: string;
}

export type EstadoDeHecho = 'cumple' | 'no-cumple' | 'con-condiciones' | 'no-sabemos';

export interface Hecho {
  estado: EstadoDeHecho;
  /** Cómo se dice en público: «No pide tarjeta», «Tarjeta: el fabricante no lo publica». */
  texto: string;
  /** Siempre que el hecho consta. Si no consta, sólo cuando se miró y la página calla. */
  fuente?: Fuente;
}

export interface Inclusion {
  capacidad: string;
  etiqueta: string;
  condicion?: string;
  fuente: Fuente;
}

export interface FichaMotor {
  slug: string;
  nombre: string;
  vertical: string;
  logo?: string;
  /** `nivelDeAcceso`: 0 gratis continuo · 1 para probar · 2 no sabemos · 3 de pago · 4 retirada. */
  nivel: number;
  acceso: string;
  esfuerzo: 'instant' | 'signup' | 'install' | 'technical';
  esfuerzoTexto: string;
  plataformas: readonly string[];
  verificacion: string;
  revisada: string;
  capacidades: readonly string[];
  incluye: readonly Inclusion[];
  excluye: readonly string[];
  cuota?: string;
  limites: readonly string[];
  fuenteLimites: Fuente;
  hechos: Record<IdDeExigencia, Hecho>;
}

// ---------------------------------------------------------------------------
// La consulta
// ---------------------------------------------------------------------------

export interface Consulta {
  tarea: IdDeTarea;
  exigencias: readonly IdDeExigencia[];
  donde?: Donde;
}

/** De la URL a una consulta. `null` si no hay tarea o no es una de las conocidas. */
export function leerConsulta(params: URLSearchParams): Consulta | null {
  const tarea = tareaPorId(params.get('tarea'));
  if (!tarea) return null;
  const exigencias = IDS_DE_EXIGENCIA.filter((id) => params.get(id) === '1');
  const donde = (DONDE as readonly string[]).includes(params.get('donde') ?? '') ? (params.get('donde') as Donde) : undefined;
  return { tarea: tarea.id, exigencias, ...(donde ? { donde } : {}) };
}

export function urlDeConsulta(consulta: Consulta): string {
  const params = new URLSearchParams({ tarea: consulta.tarea });
  for (const id of IDS_DE_EXIGENCIA) if (consulta.exigencias.includes(id)) params.set(id, '1');
  if (consulta.donde) params.set('donde', consulta.donde);
  return `/elegir?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// La respuesta
// ---------------------------------------------------------------------------

export interface Razon {
  texto: string;
  fuente: Fuente;
}

export interface Resultado {
  ficha: FichaMotor;
  gratis: 'incluida' | 'excluida' | 'no-sabemos';
  /** Lo comprobado a favor, cada cosa con su fuente. */
  razones: Razon[];
  /** Lo que no sabemos y le impide ser recomendada. */
  dudas: string[];
}

export interface Descarte {
  exigencia: IdDeExigencia;
  texto: string;
  fichas: FichaMotor[];
}

export interface Respuesta {
  tarea: Tarea;
  /** Las exigencias que se han tenido en cuenta (la marca de agua no cuenta donde no aplica). */
  exigencias: IdDeExigencia[];
  /** Pedidas y no aplicables a esta tarea. */
  ignoradas: IdDeExigencia[];
  recomendadas: Resultado[];
  /** Las que también cumplen todo, después de las tres primeras. */
  tambien: Resultado[];
  posibles: Resultado[];
  descartadas: Descarte[];
  siPagas: Resultado[];
  /** Si nada cumple: la exigencia que más vacía la respuesta y cuántas habría sin ella. */
  vaciaPor?: { exigencia: IdDeExigencia; sinElla: number };
}

export const MAXIMO_RECOMENDADAS = 3;

const ESFUERZO: Record<FichaMotor['esfuerzo'], number> = { instant: 0, signup: 1, install: 2, technical: 3 };
const VERIFICACION: Record<string, number> = { verified: 0, partially_verified: 1, pending_review: 2, outdated: 3 };
const PLATAFORMAS_DE: Record<Donde, readonly string[]> = {
  navegador: ['web'],
  ordenador: ['windows', 'macos', 'linux'],
  movil: ['ios', 'android'],
};

function comparar(donde: Donde | undefined) {
  return (a: Resultado, b: Resultado): number => {
    const encaja = (r: Resultado) => (donde && !r.ficha.plataformas.some((p) => PLATAFORMAS_DE[donde].includes(p)) ? 1 : 0);
    return (
      a.dudas.length - b.dudas.length ||
      a.ficha.nivel - b.ficha.nivel ||
      encaja(a) - encaja(b) ||
      ESFUERZO[a.ficha.esfuerzo] - ESFUERZO[b.ficha.esfuerzo] ||
      (a.ficha.cuota ? 0 : 1) - (b.ficha.cuota ? 0 : 1) ||
      (VERIFICACION[a.ficha.verificacion] ?? 9) - (VERIFICACION[b.ficha.verificacion] ?? 9) ||
      b.ficha.revisada.localeCompare(a.ficha.revisada) ||
      a.ficha.nombre.localeCompare(b.ficha.nombre, 'es')
    );
  };
}

/** Qué tiene que decir una ficha sobre la tarea para que su plan gratuito cuente. */
function gratisPara(ficha: FichaMotor, tarea: Tarea): { estado: Resultado['gratis']; inclusion?: Inclusion } {
  if (ficha.nivel === 3) return { estado: 'excluida' };
  const inclusion = ficha.incluye.find((i) => tarea.capacidades.includes(i.capacidad));
  if (inclusion) return { estado: 'incluida', inclusion };
  const suyas = ficha.capacidades.filter((c) => tarea.capacidades.includes(c));
  if (suyas.length && suyas.every((c) => ficha.excluye.includes(c))) return { estado: 'excluida' };
  return { estado: 'no-sabemos' };
}

export function decidir(fichas: readonly FichaMotor[], consulta: Consulta): Respuesta {
  const tarea = tareaPorId(consulta.tarea);
  if (!tarea) throw new Error(`Tarea desconocida: ${consulta.tarea}`);

  const pedidas = IDS_DE_EXIGENCIA.filter((id) => consulta.exigencias.includes(id));
  const aplica = (id: IdDeExigencia) => id !== 'sin-marca' || tarea.conMarcaDeAgua;
  const exigencias = pedidas.filter(aplica);
  const ignoradas = pedidas.filter((id) => !aplica(id));

  const completas: Resultado[] = [];
  const posibles: Resultado[] = [];
  const siPagas: Resultado[] = [];
  const descartes = new Map<IdDeExigencia, FichaMotor[]>();

  for (const ficha of fichas) {
    if (ficha.nivel === 4) continue;
    if (!ficha.capacidades.some((c) => tarea.capacidades.includes(c))) continue;

    // 1. Un hecho comprobado en contra descarta. Cada ficha cuenta una vez,
    //    por la primera exigencia que no cumple.
    const fallida = exigencias.find((id) => ficha.hechos[id].estado === 'no-cumple');
    if (fallida) {
      descartes.set(fallida, [...(descartes.get(fallida) ?? []), ficha]);
      continue;
    }

    const { estado: gratis, inclusion } = gratisPara(ficha, tarea);
    const razones: Razon[] = [];
    const dudas: string[] = [];

    if (inclusion) {
      razones.push({
        texto: `El plan gratuito incluye ${inclusion.etiqueta.toLowerCase()}${inclusion.condicion ? `, ${inclusion.condicion}` : ''}`,
        fuente: inclusion.fuente,
      });
    } else if (gratis === 'no-sabemos') {
      dudas.push(`No consta si el plan gratuito incluye «${tarea.etiqueta.toLowerCase()}»`);
    }

    for (const id of exigencias) {
      const hecho = ficha.hechos[id];
      if (hecho.estado === 'cumple' && hecho.fuente) razones.push({ texto: hecho.texto, fuente: hecho.fuente });
      else if (hecho.estado !== 'cumple') dudas.push(hecho.texto);
    }

    if (ficha.cuota) razones.push({ texto: `Cuota gratuita: ${ficha.cuota}`, fuente: ficha.fuenteLimites });

    const resultado: Resultado = { ficha, gratis, razones, dudas };
    if (gratis === 'excluida') siPagas.push(resultado);
    else if (gratis === 'incluida' && dudas.length === 0) completas.push(resultado);
    else posibles.push(resultado);
  }

  const orden = comparar(consulta.donde);
  completas.sort(orden);
  posibles.sort(orden);
  siPagas.sort(orden);

  const descartadas: Descarte[] = exigencias
    .filter((id) => descartes.has(id))
    .map((id) => ({ exigencia: id, texto: EXIGENCIAS[id].descartadas, fichas: descartes.get(id)! }));

  const respuesta: Respuesta = {
    tarea,
    exigencias,
    ignoradas,
    recomendadas: completas.slice(0, MAXIMO_RECOMENDADAS),
    tambien: completas.slice(MAXIMO_RECOMENDADAS),
    posibles,
    descartadas,
    siPagas,
  };

  // El vacío honesto: qué exigencia deja la respuesta sin recomendadas, y cuántas habría sin ella.
  if (!completas.length && exigencias.length) {
    let mejor: Respuesta['vaciaPor'];
    for (const id of exigencias) {
      const sinElla = decidir(fichas, { ...consulta, exigencias: exigencias.filter((x) => x !== id) });
      const cuantas = sinElla.recomendadas.length + sinElla.tambien.length;
      if (cuantas > (mejor?.sinElla ?? 0)) mejor = { exigencia: id, sinElla: cuantas };
    }
    if (mejor) respuesta.vaciaPor = mejor;
  }

  return respuesta;
}
