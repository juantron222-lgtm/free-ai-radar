import { CapturaDeInterfaz } from '@lib/domain/muestra';
import crudas from '@/data/capturas.json';

/**
 * Las capturas de interfaz que no cuelgan de una muestra.
 *
 * Una muestra prueba qué salió del generador; esto prueba qué decía la
 * pantalla. Normalmente van juntas, pero no siempre: cuando un producto
 * responde al intento de generar con «esto es de pago», no hay generación que
 * archivar y la pantalla es lo único que queda.
 *
 * Se validan al leerlas, igual que las muestras: una captura sin hash, sin
 * transcripción literal o sin decir qué sostiene no llega a publicarse.
 */
const CAPTURAS: CapturaDeInterfaz[] = (crudas as unknown[]).map((cruda, i) => {
  const parsed = CapturaDeInterfaz.safeParse(cruda);
  if (!parsed.success) {
    throw new Error(
      `La captura ${i} de src/data/capturas.json no cumple el esquema: ${JSON.stringify(parsed.error.issues)}`
    );
  }
  return parsed.data;
});

/** Las capturas de una herramienta, de la más reciente a la más antigua. */
export function capturasDe(slug: string): CapturaDeInterfaz[] {
  return CAPTURAS.filter((c) => c.toolSlug === slug).sort((a, b) =>
    b.capturadaEl.localeCompare(a.capturadaEl)
  );
}

/** Todas, para poder contarlas en un informe. */
export function todasLasCapturas(): readonly CapturaDeInterfaz[] {
  return CAPTURAS;
}
