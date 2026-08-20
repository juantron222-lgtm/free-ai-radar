import { z } from 'zod';

/**
 * Tri-state facts.
 *
 * Free AI Radar's whole credibility rests on never guessing. When we have not
 * verified something we say so, instead of defaulting to `false` and
 * accidentally publishing a claim we cannot back up.
 */
export const TriState = z.enum(['yes', 'no', 'partial', 'unverified']);
export type TriState = z.infer<typeof TriState>;

/**
 * Lo abierto, con un valor más que el resto de los hechos.
 *
 * `weights` existe porque «pesos abiertos» y «open source» no son lo mismo y
 * la diferencia decide cosas. Llama 4 se descarga y se ejecuta, pero su
 * licencia obliga a pedir permiso a Meta por encima de 700 millones de
 * usuarios mensuales y a enseñar «Built with Llama»; Kimi K3 pide atribución a
 * partir de 100 millones. Ninguna de las dos es una licencia OSI, y ponerlas
 * en la misma casilla que Apache 2.0 sería decir de ellas algo que no es
 * cierto.
 *
 * No se mete en `TriState` porque este valor sólo tiene sentido aquí: nadie
 * necesita responder `weights` a «¿pide tarjeta?».
 */
export const Openness = z.enum(['yes', 'no', 'partial', 'weights', 'unverified']);
export type Openness = z.infer<typeof Openness>;

export const OPENNESS_LABEL: Record<Openness, string> = {
  yes: 'Open source',
  no: 'Cerrado',
  partial: 'Parcialmente abierto',
  weights: 'Pesos abiertos',
  unverified: 'Sin confirmar',
};

export const TRI_STATE_LABEL: Record<TriState, string> = {
  yes: 'Sí',
  no: 'No',
  partial: 'Parcial',
  unverified: 'Sin verificar',
};

/** Ordering used when a filter asks for "definitely not X" style questions. */
export function triIs(value: TriState, expected: 'yes' | 'no'): boolean {
  return value === expected;
}

export function triIsNot(value: TriState, unwanted: 'yes' | 'no'): boolean {
  return value !== unwanted && value !== 'unverified';
}

/** A slug is the stable public identity of a record. It never changes silently. */
export const Slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido: sólo minúsculas, números y guiones');
export type Slug = z.infer<typeof Slug>;

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida, formato esperado YYYY-MM-DD');

export const HttpUrl = z.string().url().startsWith('http');

export const OptionalHttpUrl = z
  .union([HttpUrl, z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * Turns arbitrary text into a slug. Deterministic and accent-aware so that
 * "Cámara IA" and "Camara IA" collapse to the same slug and get flagged as a
 * duplicate during migration rather than silently creating two records.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    // strip combining diacritical marks (U+0300–U+036F)
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Editorial workflow state. Only `published` is publicly visible. */
export const EditorialStatus = z.enum(['draft', 'in_review', 'published', 'archived', 'rejected']);
export type EditorialStatus = z.infer<typeof EditorialStatus>;

export const UserRole = z.enum(['user', 'editor', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const PlanTier = z.enum(['free', 'pro']);
export type PlanTier = z.infer<typeof PlanTier>;
