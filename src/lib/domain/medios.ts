import type { Capability } from './taxonomy';

/**
 * Qué capacidades producen un archivo: una imagen, un vídeo o un audio.
 *
 * La marca de agua sólo tiene sentido ahí. Preguntarle a Ollama o a un agente
 * de código si deja marca de agua no tiene respuesta, y contar su «no» como
 * «sin marca de agua» llenaba el filtro de herramientas que no generan nada
 * que se pueda marcar: el 23 de octubre de 2026, 14 de sus 18 resultados eran
 * de código o de agentes.
 *
 * Una sola lista para todo el sitio: la cobertura de la verificación, el filtro
 * del catálogo, su frase de cobertura, la colección «sin marca de agua», las
 * páginas de categoría y la etiqueta de la ficha. Si cada una tuviera la suya,
 * volverían a contar cosas distintas.
 */
export const CAPACIDADES_DE_MEDIOS: readonly Capability[] = [
  'text-to-image',
  'image-to-image',
  'image-editing',
  'inpainting',
  'outpainting',
  'upscaling',
  'background-removal',
  'text-to-video',
  'image-to-video',
  'video-editing',
  'avatar-video',
  'text-to-speech',
  'voice-clone',
  'text-to-music',
  'sound-effects',
  'dubbing',
];

export function produceMedios(capabilities: readonly string[] | undefined): boolean {
  return (capabilities ?? []).some((c) => (CAPACIDADES_DE_MEDIOS as readonly string[]).includes(c));
}
