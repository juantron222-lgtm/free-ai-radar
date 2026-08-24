import { OPENNESS_LABEL, TRI_STATE_LABEL } from '@lib/domain/primitives';
import {
  CREDIT_RESET_LABEL,
  HOSTING_LABEL,
  START_EFFORT_LABEL,
  CAPABILITY_LABEL,
  PRODUCT_TYPE_LABEL,
  getCategory,
  getFreeModel,
} from '@lib/domain/taxonomy';
import type { Tool } from '@lib/domain/tool';

/**
 * Una celda dice lo que sabe, y también cuando no sabe.
 *
 * La tabla escribía «—» en tres situaciones que no significan lo mismo: un
 * hecho del fabricante que no hemos podido confirmar, un hueco de análisis
 * nuestro, y una fila que sencillamente no aplica a esa clase de herramienta.
 * Los tres se leían igual, y en la fila «En contra» el guion se leía además
 * como una ventaja: setenta de las noventa y cuatro fichas no tienen contras
 * escritas, así que setenta parecían no tener ninguna.
 *
 * Con `ausente` hay que elegir cuál de las tres es, y se ve escrito.
 */
export type Celda =
  | { tipo: 'valor'; texto: string }
  | { tipo: 'lista'; items: string[] }
  | { tipo: 'ausente'; texto: string; nota?: string };

export const SIN_ANALIZAR = 'Sin analizar';
export const NO_APLICA = 'No aplica';

const valor = (texto: string): Celda => ({ tipo: 'valor', texto });
const lista = (items: string[], vacio: string, nota?: string): Celda =>
  items.length ? { tipo: 'lista', items } : { tipo: 'ausente', texto: vacio, ...(nota ? { nota } : {}) };
const texto = (t: string | undefined, vacio: string): Celda =>
  t?.trim() ? { tipo: 'valor', texto: t } : { tipo: 'ausente', texto: vacio };

export interface Row {
  label: string;
  values: (tool: Tool) => Celda;
  /** Sólo para celdas de valor: qué respuesta es mejor para quien lee. */
  better?: (value: string) => boolean;
}

/**
 * El orden es el de lo que decide.
 *
 * Antes empezaba por «Modelo de gratuidad» y «Categoría», que en una
 * comparación entre dos herramientas de la misma vertical dicen lo mismo en
 * las dos columnas: dos filas idénticas antes de la primera que separa. Ahora
 * arriba va lo que discrimina —qué es, qué hace, qué te dan, qué te limita— y
 * abajo lo contextual, que sigue estando pero ya no ocupa el primer vistazo.
 */
export const ROWS: Row[] = [
  {
    label: 'Qué clase de producto es',
    values: (t) =>
      t.productType
        ? valor(PRODUCT_TYPE_LABEL[t.productType] ?? t.productType)
        : {
            tipo: 'ausente',
            texto: NO_APLICA,
            nota: 'Sólo distinguimos clase de producto donde cambia la elección: en Código.',
          },
  },
  {
    label: 'Qué sabe hacer',
    values: (t) => lista(t.capabilities.map((c) => CAPABILITY_LABEL[c] ?? c), SIN_ANALIZAR),
  },
  { label: 'Qué te dan gratis', values: (t) => texto(t.freePlan.summary, SIN_ANALIZAR) },
  { label: 'Límites', values: (t) => lista([...t.freePlan.limits], SIN_ANALIZAR) },
  {
    label: '¿Pide tarjeta?',
    values: (t) => valor(TRI_STATE_LABEL[t.freePlan.requiresCreditCard]),
    better: (v) => v === 'No',
  },
  {
    label: '¿Hay que registrarse?',
    values: (t) => valor(TRI_STATE_LABEL[t.freePlan.requiresSignup]),
    better: (v) => v === 'No',
  },
  {
    label: '¿Marca de agua?',
    values: (t) => valor(TRI_STATE_LABEL[t.freePlan.hasWatermark]),
    better: (v) => v === 'No',
  },
  {
    label: '¿Uso comercial?',
    values: (t) => valor(TRI_STATE_LABEL[t.freePlan.commercialUse]),
    better: (v) => v === 'Sí',
  },
  { label: 'Dónde se ejecuta', values: (t) => valor(HOSTING_LABEL[t.hosting]) },
  { label: 'Cuánto cuesta empezar', values: (t) => valor(START_EFFORT_LABEL[t.startEffort]) },
  {
    label: 'Por dónde se accede',
    values: (t) => {
      const vias = [
        t.access.chat === 'yes' ? (t.access.chatFree === 'yes' ? 'En un chat, gratis' : 'En un chat') : null,
        t.access.api === 'yes' ? (t.access.apiFree === 'yes' ? 'Por API, con capa gratuita' : 'Por API') : null,
        t.access.weights === 'yes' ? 'Pesos descargables' : null,
      ].filter((v): v is string => v !== null);

      /*
       * Chat, API y pesos son las tres formas de llegar a un *modelo*. Para una
       * aplicación web la pregunta no existe: se entra por su web y ya. Decir
       * «sin analizar» ahí sería confesar un hueco que no lo es.
       */
      return lista(
        vias,
        t.kind === 'model' ? SIN_ANALIZAR : NO_APLICA,
        t.kind === 'model' ? undefined : 'Chat, API y pesos son vías propias de los modelos.'
      );
    },
  },
  {
    label: 'Renovación de créditos',
    values: (t) => valor(CREDIT_RESET_LABEL[t.freePlan.creditReset]),
  },
  { label: 'Modelo de gratuidad', values: (t) => valor(getFreeModel(t.freeModel).label) },
  {
    label: '¿Open source?',
    values: (t) => valor(OPENNESS_LABEL[t.openSource]),
    better: (v) => v === 'Open source',
  },
  {
    label: '¿Se entrena con tus datos?',
    values: (t) => valor(TRI_STATE_LABEL[t.privacy.trainsOnUserData]),
    better: (v) => v === 'No',
  },
  { label: 'Categoría', values: (t) => valor(getCategory(t.categorySlug)?.name ?? SIN_ANALIZAR) },
  {
    label: 'En contra',
    values: (t) =>
      lista(
        [...t.cons],
        SIN_ANALIZAR,
        'Que esta casilla esté vacía no significa que no tenga pegas: significa que no las hemos escrito.'
      ),
  },
  { label: 'Veredicto', values: (t) => texto(t.verdict, SIN_ANALIZAR) },
  {
    label: 'Última verificación',
    values: (t) =>
      valor(
        new Date(`${t.lastVerifiedAt}T00:00:00Z`).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
      ),
  },
];

/** Lo que hay que mirar para saber si dos celdas dicen lo mismo. */
export function clave(celda: Celda): string {
  if (celda.tipo === 'lista') return celda.items.join(' // ');
  return celda.texto;
}


export interface FilaComparada {
  row: Row;
  celdas: Celda[];
  /** Todas las columnas dicen lo mismo: no aporta nada a esta comparación. */
  iguales: boolean;
}

/**
 * La comparación entera, calculada una vez y en el servidor.
 *
 * El interruptor de «sólo diferencias» necesita saber qué filas coinciden. Si
 * eso se calculase en el navegador habría dos implementaciones de la misma
 * comparación, y dos verdades sobre lo mismo acaban divergiendo. Aquí se
 * decide una vez; el interruptor sólo cambia una clase.
 */
export function filasDe(tools: readonly Tool[]): FilaComparada[] {
  return ROWS.map((row) => {
    const celdas = tools.map((tool) => row.values(tool));
    const claves = celdas.map(clave);
    return { row, celdas, iguales: claves.every((k) => k === claves[0]) };
  }).filter(
    /*
     * Una fila que no aplica a ninguna de las elegidas se cae: cuatro «No
     * aplica» seguidos son ruido. Una fila donde todas ponen «Sin analizar»
     * se queda, porque eso sí dice algo: que el hueco es nuestro.
     */
    (f) => !f.celdas.every((c) => c.tipo === 'ausente' && c.texto === NO_APLICA)
  );
}
