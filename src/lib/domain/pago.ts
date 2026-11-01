import { z } from 'zod';
import datos from '@/data/pago.json';

/**
 * ¿Merece la pena pagar? Lo que cambia entre el plan gratuito y el primer plan
 * de pago útil, y las comparaciones entre herramientas que resuelven lo mismo.
 *
 * Piloto aprobado por Juan el 27 de octubre de 2026, con cuatro fichas: Murf,
 * ElevenLabs, Runway y Canva. Las reglas:
 *
 *   - Cada celda dice qué clase de dato es: verificado (cita del fabricante),
 *     cálculo nuestro (con la operación), probado por nosotros, o no publicado.
 *   - La moneda es la del fabricante. Mensual, equivalente mensual en anual y
 *     total anual van por separado; lo que el fabricante no da se calcula y se
 *     marca como cálculo.
 *   - El precio por unidad sólo sale con una unidad que sea una cuota o una
 *     equivalencia publicada. Con una estimación («~30 min») no: dividir por
 *     una estimación da una cifra que parece exacta y no lo es.
 *   - Comparar exige la misma unidad medida igual. Si no, se dice por qué no.
 *   - Cantidad no es calidad: la calidad sólo la puede afirmar una prueba propia.
 *
 * Nada de esto lee la afiliación: el bloque se calcula sólo con estos datos y
 * el `slug`, así que marcar una herramienta como afiliada no puede mover ni
 * una celda.
 */

export const TIPOS_DE_DATO = ['verificado', 'calculo', 'probado', 'no-publicado'] as const;
export type TipoDeDato = (typeof TIPOS_DE_DATO)[number];

export const ETIQUETA_DE_TIPO: Record<TipoDeDato, string> = {
  verificado: 'Verificado',
  calculo: 'Cálculo nuestro',
  probado: 'Probado por nosotros',
  'no-publicado': 'No lo publica',
};

const Celda = z.object({
  texto: z.string().min(1),
  tipo: z.enum(['verificado', 'no-publicado']),
  fuentes: z.array(z.number().int().nonnegative()).min(1),
  nota: z.string().optional(),
});

const Fila = z
  .object({ etiqueta: z.string().min(1), gratis: Celda.optional(), pago: Celda.optional(), ambos: Celda.optional() })
  .refine((f) => (f.ambos ? !f.gratis && !f.pago : Boolean(f.gratis || f.pago)), 'una fila es «ambos» o gratis/pago');

const Fuente = z.object({
  url: z.string().url(),
  detalle: z.string().optional(),
  cita: z.string().min(1),
  comprobadoEl: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const Unidad = z.object({
  nombre: z.string().min(1),
  porMes: z.number().positive(),
  /** Cuota: lo que el plan incluye. Equivalencia: la conversión que publica el fabricante. Estimación: «~». */
  naturaleza: z.enum(['cuota', 'equivalencia', 'estimacion']),
  fuentes: z.array(z.number().int().nonnegative()).min(1),
  supuestos: z.array(z.string().min(1)).min(1),
});

const FichaDePago = z.object({
  producto: z.string().optional(),
  plan: z.string().min(1),
  moneda: z.enum(['USD', 'EUR']),
  notaMoneda: z.string().optional(),
  precio: z
    .object({
      mensual: z.number().positive(),
      anualPorMes: z.number().positive().optional(),
      anualTotal: z.number().positive().optional(),
      fuentes: z.array(z.number().int().nonnegative()).min(1),
      notaAnual: z.string().optional(),
    })
    .refine((p) => p.anualPorMes !== undefined || p.anualTotal !== undefined, 'falta el precio anual'),
  comercialDePago: z.enum(['yes', 'no', 'partial', 'unverified']),
  resumen: z.string().min(1),
  unidad: Unidad.optional(),
  sinUnidad: z.string().optional(),
  filas: z.array(Fila).min(1),
  fuentes: z.array(Fuente).min(1),
});

const Comparacion = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  necesidad: z.string().min(1),
  herramientas: z.array(z.string().min(1)).min(2),
});

export const DatosDePago = z.object({
  fichas: z.record(z.string(), FichaDePago),
  comparaciones: z.array(Comparacion),
});

export type FichaDePago = z.infer<typeof FichaDePago>;
export const PAGO = DatosDePago.parse(datos);

/* ─── Importes ─── */

const SIMBOLO: Record<FichaDePago['moneda'], string> = { USD: '$', EUR: '€' };

export function importe(valor: number, moneda: FichaDePago['moneda']): string {
  const entero = Number.isInteger(valor);
  const n = valor.toLocaleString('es-ES', {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: entero ? 0 : 2,
    useGrouping: true,
  });
  return `${n} ${SIMBOLO[moneda]}`;
}

export interface Importe {
  valor: number;
  texto: string;
  tipo: 'verificado' | 'calculo';
  /** La operación, cuando es un cálculo: se enseña tal cual. */
  operacion?: string;
}

export interface Precio {
  mensual: Importe;
  anualPorMes: Importe;
  anualTotal: Importe;
  nota?: string;
}

const redondeo = (v: number) => Math.round(v * 100) / 100;

export function precioDe(f: FichaDePago): Precio {
  const { mensual, anualPorMes, anualTotal } = f.precio;
  const m = f.moneda;
  const porMes: Importe =
    anualPorMes !== undefined
      ? { valor: anualPorMes, texto: importe(anualPorMes, m), tipo: 'verificado' }
      : {
          valor: redondeo(anualTotal! / 12),
          texto: importe(redondeo(anualTotal! / 12), m),
          tipo: 'calculo',
          operacion: `${importe(anualTotal!, m)} ÷ 12`,
        };
  const total: Importe =
    anualTotal !== undefined
      ? { valor: anualTotal, texto: importe(anualTotal, m), tipo: 'verificado' }
      : {
          valor: redondeo(anualPorMes! * 12),
          texto: importe(redondeo(anualPorMes! * 12), m),
          tipo: 'calculo',
          operacion: `${importe(anualPorMes!, m)} × 12`,
        };
  return {
    mensual: { valor: mensual, texto: importe(mensual, m), tipo: 'verificado' },
    anualPorMes: porMes,
    anualTotal: total,
    nota: f.precio.notaAnual,
  };
}

/* ─── Precio por unidad ─── */

export interface PrecioPorUnidad {
  unidad: string;
  mensual: Importe;
  anual: Importe;
  supuestos: string[];
}

/**
 * Sólo con una cuota o una equivalencia publicada. Con una estimación, nada:
 * `undefined`, y quien pinte el bloque dice por qué no hay cifra.
 */
export function precioPorUnidad(f: FichaDePago): PrecioPorUnidad | undefined {
  const u = f.unidad;
  if (!u || u.naturaleza === 'estimacion') return undefined;
  const p = precioDe(f);
  const m = f.moneda;
  const mensual = redondeo(p.mensual.valor / u.porMes);
  const anual = redondeo(p.anualPorMes.valor / u.porMes);
  return {
    unidad: u.nombre,
    mensual: { valor: mensual, texto: importe(mensual, m), tipo: 'calculo', operacion: `${p.mensual.texto} ÷ ${u.porMes}` },
    anual: { valor: anual, texto: importe(anual, m), tipo: 'calculo', operacion: `${p.anualPorMes.texto} ÷ ${u.porMes}` },
    supuestos: u.supuestos,
  };
}

/* ─── El bloque de la ficha ─── */

export function fichaDePago(slug: string): FichaDePago | undefined {
  return PAGO.fichas[slug];
}

/* ─── Comparaciones ─── */

export interface ColumnaComparada {
  slug: string;
  plan: string;
  moneda: FichaDePago['moneda'];
  precio: Precio;
  cantidad?: { texto: string; naturaleza: 'cuota' | 'equivalencia' | 'estimacion' };
  comercialDePago: FichaDePago['comercialDePago'];
}

export interface ComparacionResuelta {
  id: string;
  titulo: string;
  necesidad: string;
  columnas: ColumnaComparada[];
  /** Sólo si todas miden la misma unidad del mismo modo y ninguna es una estimación. */
  porUnidad?: Array<PrecioPorUnidad>;
  motivoSinPorUnidad?: string;
  supuestos: string[];
}

const NATURALEZA: Record<'cuota' | 'equivalencia' | 'estimacion', string> = {
  cuota: 'cuota',
  equivalencia: 'equivalencia publicada',
  estimacion: 'estimación del fabricante',
};

export function comparacion(id: string): ComparacionResuelta | undefined {
  const c = PAGO.comparaciones.find((x) => x.id === id);
  if (!c) return undefined;
  const fichas = c.herramientas.map((slug) => {
    const f = PAGO.fichas[slug];
    if (!f) throw new Error(`La comparación ${id} cita ${slug}, que no tiene datos de pago`);
    return { slug, f };
  });

  const columnas: ColumnaComparada[] = fichas.map(({ slug, f }) => ({
    slug,
    plan: f.plan,
    moneda: f.moneda,
    precio: precioDe(f),
    cantidad: f.unidad
      ? {
          texto: `${f.unidad.naturaleza === 'estimacion' ? '~' : ''}${f.unidad.porMes} ${plural(f.unidad.nombre, f.unidad.porMes)} al mes (${NATURALEZA[f.unidad.naturaleza]})`,
          naturaleza: f.unidad.naturaleza,
        }
      : undefined,
    comercialDePago: f.comercialDePago,
  }));

  const unidades = fichas.map(({ f }) => f.unidad);
  const misma =
    unidades.every((u) => u !== undefined) &&
    new Set(unidades.map((u) => u!.nombre)).size === 1 &&
    new Set(unidades.map((u) => u!.naturaleza)).size === 1 &&
    unidades[0]!.naturaleza !== 'estimacion' &&
    new Set(fichas.map(({ f }) => f.moneda)).size === 1;

  const supuestos = [...new Set(unidades.flatMap((u) => u?.supuestos ?? []))];

  if (misma) {
    return { ...c, columnas, porUnidad: fichas.map(({ f }) => precioPorUnidad(f)!), supuestos };
  }
  const naturalezas = fichas
    .filter(({ f }) => f.unidad)
    .map(({ f }) => `${f.plan}: ${NATURALEZA[f.unidad!.naturaleza]}`);
  return {
    ...c,
    columnas,
    motivoSinPorUnidad:
      `No calculamos precio por ${unidades[0]?.nombre ?? 'unidad'}: las cantidades no se miden igual (${naturalezas.join('; ')}). ` +
      'Dividir el precio entre ellas daría cifras que parecen comparables y no lo son.',
    supuestos,
  };
}

export function comparacionesDe(slug: string): ComparacionResuelta[] {
  return PAGO.comparaciones.filter((c) => c.herramientas.includes(slug)).map((c) => comparacion(c.id)!);
}

function plural(nombre: string, n: number): string {
  if (n === 1) return nombre;
  // «minuto de voz» → «minutos de voz»; «segundo de vídeo Gen-4.5» → «segundos de vídeo Gen-4.5».
  const [primera, ...resto] = nombre.split(' ');
  return [`${primera}s`, ...resto].join(' ');
}
