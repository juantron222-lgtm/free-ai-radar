/**
 * Los temas del formulario de contacto.
 *
 * Los comparten el formulario, que los ofrece, y /admin/contacto, que los
 * nombra al leer cada mensaje. Un tema que se guardó con un valor que ya no
 * está en la lista se enseña tal cual se guardó.
 */
export const TEMAS_CONTACTO = [
  { value: 'correccion', label: 'Corregir un dato de una ficha' },
  { value: 'herramienta', label: 'Proponer una herramienta' },
  { value: 'publicidad', label: 'Publicidad o patrocinio' },
  { value: 'datos', label: 'Privacidad y mis datos' },
  { value: 'facturacion', label: 'Suscripción o facturación' },
  { value: 'otro', label: 'Otra cosa' },
] as const;

export function temaDeContacto(valor: string): string {
  return TEMAS_CONTACTO.find((t) => t.value === valor)?.label ?? valor;
}
