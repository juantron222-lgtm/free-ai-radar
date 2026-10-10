import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRealProduction, supabase as supabaseConfig } from '@lib/config';
import { logger } from '@lib/observability/logger';
import type { EventoUso } from '@lib/uso';

/**
 * Los contadores de uso (migración 0017): sumar uno y leer los totales.
 *
 * Sólo se escribe en producción. En un Preview, en local o en la batería de
 * pruebas no se cuenta nada: las suites pulsan botones a miles, y un contador
 * que las sumara diría que la web se usa mucho más de lo que se usa. Por eso
 * `isRealProduction()` y no `isProduction`, que también es cierto en un
 * Preview: los dos son builds de producción.
 */

let client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (!isRealProduction() || !supabaseConfig.canUseServiceRole) return null;
  client ??= createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function contarUso(evento: EventoUso, clave: string): Promise<boolean> {
  const supabaseClient = db();
  if (!supabaseClient) return false;
  const { error } = await supabaseClient.rpc('contar_uso', { p_evento: evento, p_clave: clave });
  if (error) logger.warn('uso.contar_fallo', { evento, code: error.code });
  return !error;
}

export interface FilaUso {
  dia: string;
  evento: EventoUso;
  clave: string;
  cuenta: number;
}

export interface UsoReciente {
  /** `false` si la tabla no existe todavía o no se pudo leer: la página lo dice. */
  disponible: boolean;
  filas: FilaUso[];
}

export async function usoReciente(dias = 30): Promise<UsoReciente> {
  const supabaseClient = db();
  if (!supabaseClient) return { disponible: false, filas: [] };

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabaseClient
    .from('uso_diario')
    .select('dia, evento, clave, cuenta')
    .gte('dia', desde)
    .order('dia', { ascending: false })
    .limit(5000);

  if (error) {
    logger.warn('uso.leer_fallo', { code: error.code });
    return { disponible: false, filas: [] };
  }
  return { disponible: true, filas: (data ?? []) as FilaUso[] };
}

/** Totales por clave de un evento, de mayor a menor. */
export function totalesPor(filas: readonly FilaUso[], evento: EventoUso): Array<{ clave: string; cuenta: number }> {
  const suma = new Map<string, number>();
  for (const f of filas) if (f.evento === evento) suma.set(f.clave, (suma.get(f.clave) ?? 0) + f.cuenta);
  return [...suma.entries()].map(([clave, cuenta]) => ({ clave, cuenta })).sort((a, b) => b.cuenta - a.cuenta || a.clave.localeCompare(b.clave, 'es'));
}
