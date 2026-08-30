#!/usr/bin/env node
/**
 * Lo que quedó rebajado de más en H1, con la fuente que sí lo dice.
 *
 * En la primera pasada dejé ChatGPT y Claude sin nombrar modelo y sin ventana de
 * uso, porque `claude.com/pricing` no publica ninguna de las dos cosas y las
 * páginas de OpenAI me devolvían 403. Rebajar de más también es un error: la
 * ficha quedó diciendo menos de lo que se puede sostener.
 *
 * Tres de los cuatro datos tienen ahora cita literal y fuente propia. El cuarto
 * —la ventana de cinco horas del plan gratuito de Claude— sigue sin aparecer en
 * ninguna página que hable del plan gratuito, así que entra como `derived`, con
 * el razonamiento escrito y no disfrazado de cita.
 *
 * Todos son datos volátiles: un modelo por defecto dura lo que dura. Por eso
 * cada uno va con su fecha dentro de la frase, no sólo en la evidencia. Una
 * línea que dice «el 30 de agosto de 2026 servía X» envejece diciendo la verdad;
 * una que dice «sirve X» empieza a mentir el día que lo cambien.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'src/data/tools-v2.json';
const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const tools = Array.isArray(catalogo) ? catalogo : catalogo.tools;
const de = (slug) => tools.find((t) => t.slug === slug);

const HOY = '2026-08-30';
const FECHA = '30 de agosto de 2026';

const fijar = (tool, entrada) => {
  tool.evidence = [...tool.evidence.filter((e) => e.field !== entrada.field), entrada];
};

// ---------------------------------------------------------------------------
// ChatGPT: GPT-5.6 Luna por defecto, e imagen incluida en el plan gratuito
// ---------------------------------------------------------------------------

/*
 * El centro de ayuda de OpenAI lo dice sin rodeos: los usuarios de Free y Go no
 * tienen acceso a GPT-5.6 Sol y su modelo por defecto es Luna. Y la generación
 * de imágenes está en el plan gratuito, con su propio límite aparte del de
 * mensajes.
 *
 * Ninguna de las dos cosas convierte la ficha en un folleto: son límites, y por
 * eso van donde van los límites.
 */
const chatgpt = de('chatgpt');
chatgpt.descriptionShort =
  'El asistente de OpenAI en el navegador y en móvil. Su plan gratuito incluye conversación, ' +
  'visión, generación de imágenes, navegación web y análisis de archivos, con cuenta obligatoria. ' +
  `El ${FECHA} servía GPT-5.6 Luna por defecto, y OpenAI cambia esa asignación sin aviso.`;
chatgpt.freePlan.summary =
  'Plan gratuito con conversación, visión, generación de imágenes, navegación web y análisis de ' +
  `archivos. Exige crear cuenta. El ${FECHA} el modelo por defecto era GPT-5.6 Luna, sin acceso a ` +
  'Sol. Los límites de mensajes existen y el fabricante no publica la cifra; la generación de ' +
  'imágenes y las demás herramientas tienen su propio límite, tampoco publicado.';
chatgpt.freePlan.limits = [
  'Hay que crear cuenta',
  `Modelo por defecto el ${FECHA}: GPT-5.6 Luna. Sin acceso a GPT-5.6 Sol`,
  'Generación de imágenes: incluida, con un límite propio que no se publica',
  'Límite de mensajes: existe, y el fabricante no publica cuánto',
  'La asignación de modelo la decide OpenAI y cambia sin aviso',
  'No es código abierto ni se ejecuta en local',
];
chatgpt.descriptionLong =
  'ChatGPT es el asistente de OpenAI. El plan gratuito da conversación con capacidades de texto y ' +
  'visión, generación de imágenes, navegación web, análisis de archivos y GPTs, además de la ' +
  `conversación por voz en la aplicación móvil. Hace falta crear una cuenta. El ${FECHA}, el modelo ` +
  'asignado por defecto era GPT-5.6 Luna, sin acceso a GPT-5.6 Sol. Esa asignación la decide OpenAI ' +
  'y ha cambiado varias veces, así que la fecha forma parte del dato.';
chatgpt.cons = [
  'El límite de mensajes no está publicado: no se sabe de antemano si alcanza',
  'La generación de imágenes tiene su propio límite, tampoco publicado',
  'Sin acceso al modelo grande de la familia, GPT-5.6 Sol',
  'No es código abierto ni se ejecuta en local',
];
fijar(chatgpt, {
  field: 'freePlan.limits',
  outcome: 'stated',
  sourceUrl: 'https://help.openai.com/en/articles/20001354-gpt-56-in-chatgpt',
  sourceKind: 'docs',
  scope: 'product',
  checkedAt: HOY,
  quote:
    'Free and Go users do not have access to GPT-5.6 Sol, and their default model is GPT-5.6 Luna, ' +
    'which also powers Think.',
});
fijar(chatgpt, {
  field: 'capabilities',
  outcome: 'stated',
  sourceUrl: 'https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq',
  sourceKind: 'docs',
  scope: 'product',
  checkedAt: HOY,
  quote:
    'File uploads, image generation, voice, data analysis, and other tools have separate usage limits ' +
    'on the Free tier.',
});

// ---------------------------------------------------------------------------
// Claude: Sonnet 5 por defecto, y la ventana de cinco horas
// ---------------------------------------------------------------------------

/*
 * Lo de Sonnet 5 tiene cita literal y nombra el plan gratuito: «it is the
 * default model for Free and Pro plans». No hay nada que deducir.
 *
 * La ventana de cinco horas es otra cosa. Anthropic documenta que el uso se
 * cuenta por sesiones que se reinician cada cinco horas, y el artículo que lo
 * dice habla de los planes de pago; ninguna página que he podido abrir lo
 * afirma del gratuito. Que el mecanismo sea el mismo es razonable y es lo que
 * el editor confirma, pero razonable no es citable: entra como `derived`, con la
 * base diciendo exactamente qué dice la fuente y qué paso damos nosotros.
 *
 * La diferencia no es burocrática. Si mañana alguien discute este dato, con una
 * cita falsa la discusión la perdemos y con una deducción declarada la
 * discusión es sobre el razonamiento, que es donde debe estar.
 */
const claude = de('claude');
claude.freePlan.summary =
  `Plan gratuito con conversación, subida de archivos y análisis de imágenes. El ${FECHA}, el modelo ` +
  'por defecto era Claude Sonnet 5, el mismo que el plan Pro. Exige crear cuenta. El uso se cuenta ' +
  'por sesiones que se reinician cada cinco horas; cuántos mensajes caben en una sesión no se ' +
  'publica y depende de la longitud de la conversación.';
claude.freePlan.limits = [
  'Hay que crear cuenta',
  `Modelo por defecto el ${FECHA}: Claude Sonnet 5, el mismo que en Pro`,
  'El uso se cuenta por sesiones que se reinician cada cinco horas',
  'Cuántos mensajes entran en una sesión: no se publica, y varía con la longitud del texto',
  'No es código abierto ni se ejecuta en local',
];
claude.descriptionShort =
  'Asistente de Anthropic con razonamiento avanzado, contexto amplio y análisis de documentos ' +
  `extensos. Su plan gratuito servía Claude Sonnet 5 el ${FECHA} —el mismo modelo que Pro— y cuenta ` +
  'el uso por sesiones de cinco horas.';
claude.descriptionLong =
  'Claude, de Anthropic, destaca en razonamiento, escritura larga y análisis de documentos extensos. ' +
  'El plan gratuito permite conversar, subir archivos y analizar imágenes, con cuenta obligatoria. ' +
  `El ${FECHA} servía Claude Sonnet 5 por defecto, el mismo modelo que el plan Pro. El uso se cuenta ` +
  'por sesiones que se reinician cada cinco horas, y cuántos mensajes caben en cada una no se ' +
  'publica: depende de lo larga que sea la conversación.';
claude.cons = [
  'Cuántos mensajes entran en una sesión no se publica: no se sabe de antemano si alcanza',
  'Las conversaciones largas agotan la sesión más rápido',
  'No es código abierto ni se ejecuta en local',
];
fijar(claude, {
  field: 'capabilities',
  outcome: 'stated',
  sourceUrl: 'https://www.anthropic.com/news/claude-sonnet-5',
  sourceKind: 'official',
  scope: 'product',
  checkedAt: HOY,
  quote:
    'it is the default model for Free and Pro plans, and is available to Max, Team, and Enterprise users',
});
fijar(claude, {
  field: 'freePlan.limits',
  outcome: 'derived',
  sourceUrl: 'https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work',
  sourceKind: 'docs',
  scope: 'product',
  checkedAt: HOY,
  basis:
    'Anthropic documenta que el uso de Claude se cuenta por sesiones que se reinician cada cinco ' +
    'horas y que cada plan tiene una asignación distinta, sin publicar la cifra de ninguno. El ' +
    'artículo describe el mecanismo y detalla los planes de pago; no aísla el gratuito. Deducimos que ' +
    'el gratuito usa la misma ventana con una asignación menor. Lo que sí consta sin deducir es que ' +
    'la cantidad de mensajes no se publica y depende de la longitud de la conversación.',
});

// ---------------------------------------------------------------------------

chatgpt.lastVerifiedAt = HOY;
claude.lastVerifiedAt = HOY;

writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
console.log(`✓ ChatGPT: GPT-5.6 Luna por defecto e imagen incluida, con cita y fecha (${FECHA})`);
console.log(`✓ Claude: Sonnet 5 por defecto, con cita que nombra el plan gratuito`);
console.log('✓ Claude: la ventana de cinco horas entra como deducción declarada, no como cita');
