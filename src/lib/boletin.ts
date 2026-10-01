import { email as emailConfig, emailSendPolicy } from '@lib/config';

/**
 * Si el boletín existe de verdad.
 *
 * La portada, Noticias, las colecciones, Pro y las preferencias de la cuenta
 * prometían «un correo a la semana», y el formulario contestaba «te hemos
 * enviado un correo para confirmar». Ninguna de las dos cosas pasaba: en
 * Production no hay clave de envío ni dominio verificado, así que el correo
 * de confirmación se quedaba en simulado, y nada en el código envía el
 * resumen semanal —su plantilla existe y nadie la llama—. Mientras tanto, cada
 * dirección se guardaba como pendiente en una base de datos de la que nunca
 * iba a salir un correo.
 *
 * Las dos condiciones tienen que cumplirse a la vez:
 *
 *   1. `ENVIO_SEMANAL_PROGRAMADO`: existe el envío —el código que arma el
 *      resumen, la tarea que lo lanza cada semana y la baja de un clic—. Hoy
 *      no existe, y esto se cambia a mano el día que exista, en el mismo
 *      commit que lo añada.
 *   2. La política de envío dice que se puede mandar correo de verdad: entorno
 *      de producción, `EMAIL_SEND_MODE=live` y una clave de Resend. Sin eso,
 *      ni el correo de confirmación sale.
 *
 * Mientras alguna falte, ninguna página pide el correo para el boletín y el
 * endpoint no guarda direcciones.
 */
export const ENVIO_SEMANAL_PROGRAMADO = false;

export function boletinEnMarcha(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}
): boolean {
  return ENVIO_SEMANAL_PROGRAMADO && emailSendPolicy(emailConfig.apiKey, env).live;
}

/** Lo que contesta el endpoint mientras el boletín no existe. */
export const BOLETIN_NO_DISPONIBLE =
  'El boletín todavía no está en marcha, así que no guardamos tu correo. Lo que cambia en los planes gratuitos lo publicamos en Noticias y en el RSS.';
