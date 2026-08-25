import { EditorialSample } from '@lib/domain/muestra';
import crudas from '@/data/muestras.json';

/**
 * Las muestras editoriales, validadas al leerlas.
 *
 * Hoy el fichero está vacío a propósito: las seis generaciones del piloto de
 * Imagen exigen crear cuenta en cada servicio y eso lo hace una persona, no
 * este repositorio. El módulo de ficha no pinta nada mientras no haya
 * muestras, así que un fichero vacío es un estado válido y no un fallo.
 *
 * Cuando existan, entran por aquí y el esquema las revisa: una muestra sin
 * activo, sin fecha con hora o sin observación explícita no llega a
 * publicarse.
 */
const MUESTRAS: EditorialSample[] = (crudas as unknown[]).map((cruda, i) => {
  const parsed = EditorialSample.safeParse(cruda);
  if (!parsed.success) {
    throw new Error(
      `La muestra ${i} de src/data/muestras.json no cumple el esquema: ${JSON.stringify(parsed.error.issues)}`
    );
  }
  return parsed.data;
});

/** Todas las muestras de una herramienta, de la más reciente a la más antigua. */
export function muestrasDe(slug: string): EditorialSample[] {
  return MUESTRAS.filter((m) => m.toolSlug === slug).sort((a, b) =>
    b.generatedAt.localeCompare(a.generatedAt)
  );
}

/** Si esta herramienta se ha probado alguna vez. */
export function estaProbada(slug: string): boolean {
  return MUESTRAS.some((m) => m.toolSlug === slug);
}

/** Cuántas hay en total, para poder contarlas en un informe. */
export function todasLasMuestras(): readonly EditorialSample[] {
  return MUESTRAS;
}
