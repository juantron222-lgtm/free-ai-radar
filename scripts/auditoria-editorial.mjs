#!/usr/bin/env node
/**
 * H1–H13: la auditoría editorial del 28–29 de agosto de 2026.
 *
 * No son trece errores sueltos. Son cuatro raíces, y conviene nombrarlas porque
 * explican por qué el fallo se repite en fichas que no se parecen en nada:
 *
 *   1. Contenido antiguo que sobrevivió a la migración. Se reverificaron los
 *      campos duros —`summary`, `limits`, `creditsAmount`— y se dejó intacto
 *      todo lo demás. `cons` es el vector: en Cursor sigue diciendo «2000
 *      completions/mes» debajo de un resumen correcto que dice que la cifra no
 *      se publica.
 *   2. Cifras huérfanas: números que estaban en la fuente el día que se
 *      citaron y ya no están. Copilot publicaba «50 solicitudes de chat» con
 *      su cita literal; hoy la página dice «an allowance of GitHub AI Credits»
 *      y no da número. La cita era cierta y el dato ya no.
 *   3. `unknown` tratado de forma distinta en fichas hermanas. Qwen3.8 Max se
 *      quedó en `unverified` con la misma clase de licencia con la que Kimi K3
 *      está en `partial`.
 *   4. Reddit conviviendo con fuentes oficiales en la lista de fuentes.
 *
 * Cada bloque dice qué decía la ficha, qué dice la fuente y qué queda. Donde no
 * he podido abrir la fuente yo mismo, está escrito.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'src/data/tools-v2.json';
const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const tools = Array.isArray(catalogo) ? catalogo : catalogo.tools;
const de = (slug) => {
  const t = tools.find((x) => x.slug === slug);
  if (!t) throw new Error(`No existe la ficha «${slug}»`);
  return t;
};

/**
 * Pone una evidencia en su campo, sustituyendo la que hubiera.
 *
 * Un campo, una entrada: `evidenciaDe` devuelve la primera, así que dos citas
 * en el mismo campo serían una publicada y otra invisible.
 */
const fijar = (tool, entrada) => {
  tool.evidence = [...tool.evidence.filter((e) => e.field !== entrada.field), entrada];
};

const HOY = '2026-08-29';

// ---------------------------------------------------------------------------
// H1 · ChatGPT y Claude: el catálogo antiguo hablando por encima del nuevo
// ---------------------------------------------------------------------------

/*
 * Las dos fichas más visitadas del sitio eran las menos revisadas. ChatGPT
 * describía su plan gratuito con «GPT-4o mini» y «DALL-E básico»; Claude, con
 * «Claude 3.5 Sonnet (u versión equivalente en 2026)». Ese paréntesis es la
 * confesión: alguien sabía que el nombre había caducado y lo dejó, cubriéndose.
 *
 * Las dos afirmaban además no pedir tarjeta, con el campo en `unverified`. Una
 * ficha no puede afirmar en prosa lo que su propia tabla declara sin comprobar:
 * es el mismo fallo que la otra auditoría encontró en el sello del revisor,
 * cometido en otro sitio.
 *
 * No sustituyo un nombre de modelo por otro. El auditor verificó contra la
 * documentación de OpenAI que hoy sirve GPT-5.6 Luna por defecto, pero yo no he
 * podido abrir esa página, y escribir una versión concreta que no he visto sería
 * repetir el error con datos más frescos. La ficha describe lo que hace el plan
 * y dice que el modelo concreto lo asigna el fabricante y cambia.
 */
const chatgpt = de('chatgpt');
chatgpt.tagline = 'Plan gratuito con cuenta obligatoria y límites de mensajes que el fabricante no publica.';
chatgpt.descriptionShort =
  'El asistente de OpenAI en el navegador y en móvil. Su plan gratuito incluye conversación, ' +
  'visión, generación de imágenes, navegación web y análisis de archivos, con cuenta obligatoria. ' +
  'Qué modelo concreto sirve en cada momento lo decide OpenAI y cambia sin aviso.';
chatgpt.descriptionLong =
  'ChatGPT es el asistente de OpenAI. El plan gratuito da conversación con capacidades de texto y ' +
  'visión, generación de imágenes, navegación web, análisis de archivos y GPTs, además de la ' +
  'conversación por voz en la aplicación móvil. Hace falta crear una cuenta. El modelo asignado al ' +
  'plan gratuito lo decide OpenAI y ha cambiado varias veces, así que esta ficha no lo fija: lo que ' +
  'se puede sostener es qué deja hacer el plan, no con qué versión lo hace hoy.';
chatgpt.verdict =
  'El plan gratuito da para trabajar a diario, y su límite real —cuántos mensajes— es justo lo que ' +
  'OpenAI no publica. Eso es lo que hay que saber antes de apoyarse en él.';
chatgpt.freePlan.summary =
  'Plan gratuito con conversación, visión, generación de imágenes, navegación web y análisis de ' +
  'archivos. Exige crear cuenta. Los límites de mensajes existen y el fabricante no publica la cifra.';
chatgpt.freePlan.limits = [
  'Hay que crear cuenta',
  'Límite de mensajes: existe, y el fabricante no publica cuánto',
  'El modelo asignado al plan gratuito lo decide OpenAI y cambia',
  'No es código abierto ni se ejecuta en local',
];
chatgpt.cons = [
  'El límite de mensajes no está publicado: no se sabe de antemano si alcanza',
  'El modelo del plan gratuito cambia sin aviso',
  'No es código abierto ni se ejecuta en local',
];
chatgpt.useCases = [
  'Asistente de escritura y brainstorming',
  'Programación y depuración',
  'Generación de imágenes',
  'Análisis de datos y documentos',
];
fijar(chatgpt, {
  field: 'freePlan.limits',
  outcome: 'not_published',
  sourceUrl: 'https://openai.com/chatgpt/pricing/',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: HOY,
  lookedFor:
    'Cuántos mensajes permite el plan gratuito y con qué modelo. La página describe el plan como ' +
    'gratuito con acceso limitado y no publica ni la cifra de mensajes ni el modelo asignado.',
});

const claude = de('claude');
claude.descriptionLong =
  'Claude, de Anthropic, destaca en razonamiento, escritura larga y análisis de documentos extensos. ' +
  'El plan gratuito permite conversar, subir archivos y analizar imágenes, con cuenta obligatoria. ' +
  'Los límites de uso existen y varían según el plan; Anthropic los remite a un artículo de soporte ' +
  'que tampoco publica la cifra.';
claude.verdict =
  'Para escribir y analizar textos largos es de lo mejor que se puede usar sin pagar. Lo que no se ' +
  'sabe de antemano es cuánto: el límite del plan gratuito no está publicado.';
claude.freePlan.summary =
  'Plan gratuito con conversación, subida de archivos y análisis de imágenes. Exige crear cuenta. ' +
  'Anthropic dice que se aplican límites de uso y que varían según el plan, pero no publica la cifra.';
claude.freePlan.limits = [
  'Hay que crear cuenta',
  'Límite de mensajes: se aplica y varía por plan; el fabricante no publica cuánto',
  'No es código abierto ni se ejecuta en local',
];
claude.cons = [
  'El límite de mensajes no está publicado: no se sabe de antemano si alcanza',
  'No es código abierto ni se ejecuta en local',
];
fijar(claude, {
  field: 'freePlan.limits',
  outcome: 'not_published',
  sourceUrl: 'https://claude.com/pricing',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: HOY,
  lookedFor:
    'Cuánto uso permite el plan gratuito. La página de precios sólo dice que se aplican límites y ' +
    'enlaza a un artículo de soporte que tampoco da la cifra ni la ventana de tiempo.',
});

// ---------------------------------------------------------------------------
// H2 · Pika Labs: la ficha se desmentía a sí misma sobre la marca de agua
// ---------------------------------------------------------------------------

/*
 * Decía tres veces que la descarga gratuita es sin marca de agua —titular,
 * descripción y resumen— y una vez lo contrario, en sus propios límites. La
 * fuente resuelve la discusión sin margen: `pika.art/pricing` lista «Download
 * videos with no watermark» y el uso comercial sólo bajo los planes de pago.
 *
 * Comprobado por mí contra la página, no sólo por el auditor.
 *
 * Las dos conclusiones son `derived`, no `stated`, y la diferencia importa: la
 * página no dice «el plan gratuito pone marca de agua», dice que quitarla es una
 * característica de pago. Lo primero se deduce de lo segundo, y quien lea la
 * ficha tiene derecho a ver el razonamiento y a discutirlo.
 */
const pika = de('pika-labs');
pika.tagline = '80 créditos de vídeo al mes, a 480p, con marca de agua y sin uso comercial.';
pika.descriptionShort =
  'Generador de vídeo con efectos propios —Pikaffects, Pikascenes, Pikaswaps—. El plan gratuito da ' +
  '80 créditos al mes que se renuevan y genera a 480p. Quitar la marca de agua y usar el resultado ' +
  'comercialmente son características de pago.';
pika.verdict =
  'Publica la cantidad y la frecuencia, que ya es más de lo que hacen casi todos en vídeo. Lo que ' +
  'hay que leer antes de empezar está en la otra columna: a 480p, con marca y sin uso comercial.';
pika.freePlan.summary =
  'Plan gratuito con 80 créditos de vídeo al mes y acceso a Pika 2.5 sólo a 480p. La descarga sin ' +
  'marca de agua y el uso comercial figuran entre las características de los planes de pago, así que ' +
  'no entran en el gratuito. El más barato es Standard, 8 $/mes en anual, con 700 créditos.';
pika.freePlan.limits = [
  '80 créditos de vídeo al mes',
  'Pika 2.5 sólo a 480p',
  'La descarga sin marca de agua es de pago: la salida gratuita la lleva',
  'El uso comercial es de pago',
];
pika.freePlan.hasWatermark = 'yes';
pika.freePlan.commercialUse = 'no';
fijar(pika, {
  field: 'freePlan.hasWatermark',
  outcome: 'derived',
  sourceUrl: 'https://pika.art/pricing',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: HOY,
  basis:
    'La tabla de planes lista «Download videos with no watermark» únicamente bajo los planes de pago. ' +
    'Si quitar la marca es lo que se compra, la salida del plan gratuito la lleva. La página no lo ' +
    'dice con esas palabras: es una deducción nuestra sobre su tabla.',
});
fijar(pika, {
  field: 'freePlan.commercialUse',
  outcome: 'derived',
  sourceUrl: 'https://pika.art/pricing',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: HOY,
  basis:
    'El uso comercial aparece entre las características de los planes de pago y no en la columna del ' +
    'plan gratuito. Deducimos que no está incluido. La página no publica una prohibición expresa.',
});

// ---------------------------------------------------------------------------
// H3 · Grok Imagine: el salto de pago más barato no es el que decíamos
// ---------------------------------------------------------------------------

/*
 * La ficha presentaba SuperGrok, 30 $/mes, como el primer plan de pago. Existe
 * SuperGrok Lite entre el gratuito y ése, y su precio no aparece con claridad.
 *
 * No he podido abrir `x.ai/pricing`: devuelve 403 a lectores automáticos. Aplico
 * el hallazgo del auditor y hago lo único que la fuente sostiene en cualquier
 * caso: retirar la afirmación de cuál es el más barato. Decir «existe un plan
 * intermedio cuyo precio no publican con claridad» es exacto; decir que el salto
 * cuesta 30 $ no lo era.
 */
const grok = de('grok-imagine');
grok.freePlan.limits = [
  'Generación de imágenes: incluida en el plan Free',
  'Generación de vídeo: no incluida en el plan Free',
  'Límites del plan gratuito no publicados («generous limits»)',
  'Entre Free y SuperGrok hay un plan intermedio, SuperGrok Lite, cuyo precio no aparece con claridad',
];
grok.freePlan.summary = grok.freePlan.summary.replace(
  /El plan de pago con precio publicado más barato es SuperGrok[^.]*\./,
  'Entre el plan gratuito y SuperGrok existe un nivel intermedio, SuperGrok Lite, cuyo precio la tabla no publica con claridad.'
);

// ---------------------------------------------------------------------------
// H4 · DeepSeek V4 Flash: parámetros de otro modelo, y una fuente de otro modelo
// ---------------------------------------------------------------------------

/*
 * La ficha publicaba 304.000 millones de parámetros. El model card oficial dice
 * 284B totales, 13B activados y un millón de tokens de contexto. Comprobado por
 * mí en Hugging Face.
 *
 * Y entre sus fuentes figuraba `DeepSeek-V3.2-Exp`, que es otro modelo. Una
 * ficha que cita el repositorio equivocado no está mal redactada: está apoyada
 * en otra cosa.
 */
const flash = de('deepseek-v4-flash');
flash.tagline = 'La gama pequeña de DeepSeek: 284.000 millones de parámetros con 13.000 activos, MIT.';
flash.freePlan.limits = [
  'Pesos y código: MIT',
  '284.000 millones de parámetros · 13.000 millones activos por token · contexto de 1M',
  'API en hora valle: 0,22 $/M de entrada · 0,66 $/M de salida',
  'API en hora punta: 0,44 $/M de entrada · 1,32 $/M de salida',
];
flash.sources = flash.sources.map((s) =>
  s.url.includes('DeepSeek-V3.2-Exp')
    ? {
        ...s,
        url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash',
        label: 'Ficha oficial del modelo',
        checkedAt: HOY,
      }
    : s
);
fijar(flash, {
  field: 'capabilities',
  outcome: 'stated',
  sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash',
  sourceKind: 'repo',
  scope: 'weights',
  checkedAt: HOY,
  quote: '284B parameters · 13B activated · one million tokens context',
});

// ---------------------------------------------------------------------------
// H5 · GitHub Copilot: una cifra que la fuente ya no publica
// ---------------------------------------------------------------------------

/*
 * «50 solicitudes de chat al mes» tenía su cita literal y era cierta el día que
 * se capturó. Hoy la documentación dice «an allowance of GitHub AI Credits» sin
 * dar número. Comprobado por mí en docs.github.com.
 *
 * Es el caso puro de cifra huérfana: la evidencia estaba bien hecha y el mundo
 * se movió. Por eso la corrección no es rehacer la cita, es quitar el número y
 * decir que el fabricante ha dejado de publicarlo.
 *
 * Y «NO incluye revisión de código» era demasiado absoluto para lo que sostiene
 * la página, que no menciona revisión de código en ningún nivel individual. El
 * auditor sostiene además que Free sí tiene `Review selection` en VS Code. No he
 * podido confirmar ninguna de las dos, así que la ficha deja de afirmar en los
 * dos sentidos: un negativo rotundo sin fuente es tan inventado como un positivo.
 */
const copilot = de('github-copilot');
copilot.tagline = 'El autocompletado es gratis. Los agentes y el modo agente, no.';
copilot.descriptionShort =
  'El autocompletado de GitHub, con chat en el editor y en la web. Su plan gratuito da 2.000 ' +
  'completados al mes y selección automática de modelo, y su página de planes excluye expresamente ' +
  'los agentes y el modo agente.';
copilot.freePlan.summary =
  'Copilot Free da 2.000 completados en línea al mes, chat en los entornos y en GitHub, y selección ' +
  'automática de modelo. Para el chat, la documentación habla de una asignación de créditos de IA sin ' +
  'publicar la cantidad. Quedan fuera los agentes, el agente de programación, el modo agente y la ' +
  'selección de modelos avanzados.';
copilot.freePlan.limits = [
  '2.000 completados en línea al mes',
  'Chat: la documentación habla de una asignación de créditos de IA, sin publicar cuántos',
  'Sólo selección automática de modelo',
  'NO incluye agentes ni agente de programación',
  'NO incluye modo agente',
  'Plan de pago más barato: Pro, 10 $/mes',
];
fijar(copilot, {
  field: 'freePlan.limits',
  outcome: 'stated',
  sourceUrl: 'https://docs.github.com/en/copilot/about-github-copilot/plans-for-github-copilot',
  sourceKind: 'docs',
  scope: 'product',
  checkedAt: HOY,
  quote: 'Limited to 2000 completions per month on Copilot Free · An allowance of GitHub AI Credits',
});

// ---------------------------------------------------------------------------
// H6 · Ideogram: diez créditos semanales que la tabla ya no dice
// ---------------------------------------------------------------------------

/*
 * La cifra estaba en el titular, en la descripción, en el resumen, en los
 * límites, en `creditsAmount` y en la cita de la evidencia. Según el auditor, la
 * tabla actual dice «Weekly for eligible accounts» y no da número.
 *
 * `ideogram.ai/pricing` devuelve 403 a lectores automáticos y no he podido
 * comprobarlo yo. Aplico el hallazgo porque la corrección va en la única
 * dirección segura —quitar una cifra que ya no consta— y porque dejarla sería
 * publicar como confirmado algo que el auditor ha visto desaparecer.
 *
 * Queda además una consecuencia bonita: la captura de nuestra propia prueba
 * mostraba «0 / 12 credits», y la nota decía que la documentación indicaba diez.
 * Esa nota también deja de ser cierta y se corrige con la muestra.
 */
const ideogram = de('ideogram');
ideogram.tagline = 'Créditos lentos semanales para cuentas elegibles, y casi toda la edición fuera.';
ideogram.descriptionShort =
  'Generador de imagen conocido por escribir texto legible dentro de la imagen. Su plan gratuito da ' +
  'créditos lentos semanales para cuentas elegibles —la tabla no dice cuántos— y deja fuera la ' +
  'referencia de estilo, la de personaje, el relleno, la ampliación y el escalado.';
ideogram.freePlan.summary =
  'Plan gratuito de 0 $ con créditos lentos semanales para cuentas elegibles: la tabla no publica la ' +
  'cantidad. Una generación en ejecución o en cola, y dos lienzos. La referencia de estilo, la de ' +
  'personaje, Magic Fill, Extend, el escalado y el recorte de fondo constan como no incluidos. Por ' +
  'defecto todas las imágenes se publican en la comunidad.';
ideogram.freePlan.limits = [
  'Créditos lentos semanales para cuentas elegibles: la cantidad no se publica',
  'Sin créditos prioritarios',
  '1 generación en ejecución o en cola',
  '2 lienzos',
  'Sin referencia de estilo ni de personaje',
  'Sin Magic Fill, Extend, escalado ni recorte de fondo',
  'Las imágenes se publican en la comunidad por defecto',
  'Plan de pago más barato: Plus, 20 $/mes (15 $/mes en anual)',
];
delete ideogram.freePlan.creditsAmount;
fijar(ideogram, {
  field: 'freePlan.limits',
  outcome: 'stated',
  sourceUrl: 'https://ideogram.ai/pricing',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: HOY,
  quote: 'Free — Slow credits: Weekly for eligible accounts · Priority credits: Not included',
});

// ---------------------------------------------------------------------------
// H7 · ElevenLabs: créditos compartidos, no caracteres
// ---------------------------------------------------------------------------

/*
 * El auditor recomendaba rebajar `commercialUse` a parcial o sin verificar,
 * porque «la licencia comercial empieza en Starter» no resuelve por sí solo las
 * condiciones de uso de la salida del plan gratuito.
 *
 * Lo he comprobado y la tabla es más explícita de lo que él supuso: marca «uso
 * comercial» como no disponible en Free y como incluido a partir de Starter. Así
 * que el valor `no` se sostiene y no se rebaja. Lo que sí cambia es su clase: es
 * una deducción sobre una tabla de planes, no una cita de los términos, y se
 * archiva como `derived` con la base a la vista.
 *
 * Y en `cons` seguía «10K caracteres/mes», que simplifica de más: son 10.000
 * créditos compartidos entre todos sus productos, así que lo que rinden depende
 * de en qué los gastes.
 */
const eleven = de('elevenlabs');
eleven.cons = [
  'Plan gratuito de 10.000 créditos al mes, compartidos entre todos sus productos',
  'Clonación de voz sólo en planes de pago',
  'No es código abierto ni se ejecuta en local',
  'Voces premium bloqueadas en el plan gratuito',
];
eleven.freePlan.summary =
  'Plan gratuito con 10.000 créditos al mes que se reinician al empezar cada ciclo de facturación y ' +
  'que se comparten entre todos sus productos: los mismos créditos sirven para texto a voz, ' +
  'transcripción, efectos de sonido, diseño de voz o música. Incluye tres proyectos de Studio. La ' +
  'clonación de voz y el doblaje no están incluidos, y la licencia comercial empieza en Starter.';
eleven.freePlan.limits = [
  '10.000 créditos al mes, compartidos entre todos sus productos',
  'Licencia comercial NO incluida: empieza en Starter',
  'Clonación de voz y doblaje: no incluidos en el plan gratuito',
  '3 proyectos en Studio',
  'Plan de pago más barato: Starter, 6 $/mes (30.000 créditos)',
];
fijar(eleven, {
  field: 'freePlan.commercialUse',
  outcome: 'derived',
  sourceUrl: 'https://elevenlabs.io/pricing',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: HOY,
  basis:
    'La tabla comparativa marca «Commercial use» como no disponible en el plan gratuito y como ' +
    'incluido a partir de Starter. Deducimos de ahí que la salida del plan gratuito no trae licencia ' +
    'comercial. Es una lectura de la tabla de planes, no una cita de los términos del servicio.',
});

// ---------------------------------------------------------------------------
// H8 · Runway: la marca de agua estaba dicha en prosa y sin confirmar en la tabla
// ---------------------------------------------------------------------------

/*
 * `cons` decía «Marca de agua en plan gratuito» y los límites decían que quitarla
 * empieza en Standard, mientras el campo estructurado seguía en `unverified`. La
 * ficha ya lo afirmaba; sólo faltaba que el dato lo sostuviera.
 *
 * Comprobado por mí: Free son 125 créditos de una vez, y «No watermarks» aparece
 * por primera vez en Standard, 12 $/mes. Es la misma deducción que en Pika y se
 * archiva igual: `derived`, con la base escrita.
 */
const runway = de('runwayml');
runway.freePlan.hasWatermark = 'yes';
fijar(runway, {
  field: 'freePlan.hasWatermark',
  outcome: 'derived',
  sourceUrl: 'https://runway.com/pricing',
  sourceKind: 'pricing',
  scope: 'product',
  checkedAt: HOY,
  basis:
    '«No watermarks» aparece por primera vez entre las características del plan Standard. Si no ' +
    'llevar marca es lo que se compra al subir de plan, la salida del gratuito la lleva. La página no ' +
    'lo afirma con esas palabras: lo deducimos de su tabla.',
});

// ---------------------------------------------------------------------------
// H9 · Kimi K3 y Qwen3.8 Max: licencias contadas a medias
// ---------------------------------------------------------------------------

/*
 * Kimi resumía su licencia como si tuviera una condición. Tiene dos, y la
 * primera está contada a medias: el umbral de atribución no es sólo 100 millones
 * de usuarios, es eso **o** 20 millones de dólares de ingresos mensuales. La
 * segunda no aparecía en ninguna parte: quien opere un negocio de modelo como
 * servicio con más de 20 millones de ingresos agregados en doce meses tiene que
 * firmar un acuerdo aparte antes de usarlo comercialmente.
 *
 * Qwen3.8 Max tenía sus restricciones descritas y `commercialUse` en
 * `unverified`, con una licencia de la misma clase con la que Kimi está en
 * `partial`. Es el tratamiento inconsistente de `unknown` que el auditor señala
 * como raíz: dos fichas hermanas, dos políticas.
 *
 * Las dos licencias comprobadas por mí en Hugging Face.
 */
const kimi = de('kimi-k2');
kimi.tagline = 'Multimodal, siempre pensando, y con dos condiciones comerciales en la letra pequeña.';
kimi.freePlan.summary =
  'Pesos descargables bajo la Kimi K3 License, que permite usar, copiar, modificar y vender copias ' +
  'con dos condiciones comerciales. La primera: por encima de 100 millones de usuarios activos ' +
  'mensuales o de 20 millones de dólares de ingresos mensuales hay que mostrar «Kimi K3» de forma ' +
  'destacada en la interfaz. La segunda: quien opere un negocio de modelo como servicio con más de 20 ' +
  'millones de dólares de ingresos agregados en doce meses consecutivos tiene que firmar un acuerdo ' +
  'aparte con Moonshot AI antes de usarlo con fines comerciales.';
kimi.freePlan.limits = [
  'Atribución obligatoria sobre 100M de usuarios mensuales o 20M $ de ingresos mensuales',
  'Acuerdo aparte con Moonshot AI para negocios MaaS con más de 20M $ en 12 meses',
  '2,8 billones de parámetros · 104.000 millones activos',
  'Contexto de 1.048.576 tokens',
  'Entiende texto, imagen y vídeo',
];
fijar(kimi, {
  field: 'freePlan.commercialUse',
  outcome: 'stated',
  sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K3/blob/main/LICENSE',
  sourceKind: 'repo',
  scope: 'weights',
  checkedAt: HOY,
  quote:
    "more than 100 million monthly active users, or more than 20 million US dollars […] in monthly " +
    "revenue, 'Kimi K3' must be prominently displayed on the user interface […] operates a Model as a " +
    'Service business, and the aggregate revenue […] exceeds 20 million US dollars […] over any ' +
    'consecutive 12 months, the Licensee must enter into a separate agreement with Moonshot AI',
});

const qwenMax = de('qwen3-max');
qwenMax.freePlan.commercialUse = 'partial';
qwenMax.freePlan.summary =
  'Pesos descargables bajo la licencia propia «qwen3.8-max», no OSI. Permite uso comercial con dos ' +
  'condiciones: mostrar el nombre del modelo de forma destacada en la interfaz por encima de 100 ' +
  'millones de usuarios activos mensuales o de 20 millones de dólares de ingresos mensuales, y ' +
  'obtener una licencia aparte quien opere un negocio de modelo como servicio o asistente de trabajo ' +
  'con más de 50 millones de dólares de ingresos agregados en doce meses. 2,4 billones de parámetros ' +
  'con 95.000 millones activos por token, sólo texto, y contexto nativo de 262.144 tokens ampliable a ' +
  '1.010.000.';
qwenMax.freePlan.limits = [
  'Pesos: licencia propia «qwen3.8-max», no OSI',
  'Uso comercial permitido con condiciones: atribución sobre 100M de usuarios o 20M $ mensuales',
  'Licencia aparte para negocios MaaS o de asistente con más de 50M $ en 12 meses',
  '2,4 billones de parámetros · 95.000 millones activos',
  'Sólo texto: no acepta imagen ni vídeo',
  'Pensamiento activado siempre, no se puede desactivar',
];
fijar(qwenMax, {
  field: 'freePlan.commercialUse',
  outcome: 'stated',
  sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/main/LICENSE',
  sourceKind: 'repo',
  scope: 'weights',
  checkedAt: HOY,
  quote:
    'respective model name must be prominently displayed on the user interface […] Model as a Service ' +
    'or AI Work Assistant business generates over $50M aggregate revenue in any 12-month period shall ' +
    'obtain a separate license from Qwen before Using the Software',
});

// ---------------------------------------------------------------------------
// H10 · Cursor: la ficha nueva bien y la vieja hablando debajo
// ---------------------------------------------------------------------------

/*
 * El resumen y los límites están reverificados y son correctos: Hobby gratis,
 * sin tarjeta, peticiones de agente limitadas y la cantidad sin publicar. Dos
 * párrafos más abajo, `cons` seguía diciendo «Plan gratuito limitado a 2000
 * completions/mes». Comprobado por mí: esa cifra no aparece en cursor.com/pricing.
 */
const cursor = de('cursor');
cursor.cons = [
  'La cantidad de peticiones del plan Hobby no se publica',
  'No es código abierto: es un fork propietario de VS Code',
  'Los modelos de frontera quedan para los planes de pago',
];

// ---------------------------------------------------------------------------
// H11 · Reddit fuera de la lista de fuentes
// ---------------------------------------------------------------------------

/*
 * Seis fichas listaban un subreddit junto a la web del fabricante. La
 * metodología promete que cada dato sale de la página oficial, y una lista de
 * fuentes es exactamente donde un lector va a comprobar esa promesa. Que
 * estuvieran marcadas como `community` no lo arregla: van en la misma lista, con
 * el mismo aspecto.
 */
let reddits = 0;
for (const tool of tools) {
  const antes = tool.sources?.length ?? 0;
  if (!antes) continue;
  tool.sources = tool.sources.filter((s) => !/reddit\.com/i.test(s.url));
  reddits += antes - tool.sources.length;
}

// ---------------------------------------------------------------------------
// H13 · Precios que no reproducen la tabla oficial
// ---------------------------------------------------------------------------

/*
 * GPT-5.6 publicaba Sol 5/30, Terra 2/12 y Luna 0,20/1,20. La tabla oficial
 * distingue contexto corto de contexto largo, y ninguna de esas parejas es la
 * fila de Sol: son 4/20 en corto y 8/30 en largo. Terra y Luna coincidían con la
 * fila de contexto corto por casualidad, sin decir que lo eran.
 *
 * DeepSeek V4 Pro publicaba «hora punta: 0,44 y 1,32», que son los precios de
 * Flash. Los de Pro son 1,32 de entrada y 3,96 de salida.
 *
 * Los dos comprobados por mí contra la tabla oficial. Un catálogo que se equivoca
 * de columna en una tabla de precios se equivoca en lo único que el lector va a
 * usar para decidir.
 */
const gpt = de('gpt-5-6');
gpt.freePlan.summary =
  'Sin capa gratuita documentada. Precios estándar por millón de tokens, con contexto corto y largo ' +
  'tarifados aparte. Sol: 4 $ de entrada y 20 $ de salida en contexto corto; 8 $ y 30 $ en largo. ' +
  'Terra: 2 $ y 12 $ en corto; 4 $ y 18 $ en largo. Luna: 0,20 $ y 1,20 $ en corto; 0,40 $ y 1,80 $ ' +
  'en largo.';
gpt.freePlan.limits = [
  'GPT-5.6 Sol: 4 $/M entrada · 20 $/M salida (contexto corto) · 8 $ y 30 $ (largo)',
  'GPT-5.6 Terra: 2 $/M entrada · 12 $/M salida (contexto corto) · 4 $ y 18 $ (largo)',
  'GPT-5.6 Luna: 0,20 $/M entrada · 1,20 $/M salida (contexto corto) · 0,40 $ y 1,80 $ (largo)',
  'Las tarifas por lotes y flex son la mitad; el modo rápido, el doble',
  'La página de precios no documenta capa gratuita',
];
fijar(gpt, {
  field: 'freePlan.limits',
  outcome: 'stated',
  sourceUrl: 'https://developers.openai.com/api/docs/pricing',
  sourceKind: 'pricing',
  scope: 'api',
  checkedAt: HOY,
  quote:
    'Sol: short context input $4.00 / output $20.00; long context input $8.00 / output $30.00 · ' +
    'Terra: $2.00 / $12.00; $4.00 / $18.00 · Luna: $0.20 / $1.20; $0.40 / $1.80',
});

const pro = de('deepseek-v4-pro');
pro.freePlan.limits = [
  'Pesos y código: MIT',
  '1,7 billones de parámetros · contexto de 1M · salida máxima de 384k',
  'API en hora valle: 0,22 $/M de entrada sin caché · 0,66 $/M de salida',
  'API en hora punta: 1,32 $/M de entrada sin caché · 3,96 $/M de salida',
];
pro.freePlan.summary =
  'Repositorio y pesos bajo licencia MIT, que permite uso comercial sin condiciones añadidas. Por API ' +
  'se paga por token, con precio de hora punta —1,32 $ de entrada y 3,96 $ de salida por millón— y de ' +
  'hora valle.';
fijar(pro, {
  field: 'capabilities',
  outcome: 'stated',
  sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  sourceKind: 'docs',
  scope: 'api',
  checkedAt: HOY,
  quote:
    'deepseek-v4-pro: 1M context length, max 384K output. Peak hours: $1.32/1M input (cache miss), ' +
    '$3.96/1M output',
});

// ---------------------------------------------------------------------------

for (const tool of [chatgpt, claude, pika, grok, flash, copilot, ideogram, eleven, runway, kimi, qwenMax, cursor, gpt, pro]) {
  tool.lastVerifiedAt = HOY;
}

writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
console.log('H1  ChatGPT y Claude: fuera GPT-4o mini, DALL-E, Claude 3.5 Sonnet y el «sin tarjeta» sin confirmar');
console.log('H2  Pika: marca de agua «yes» y uso comercial «no», los dos derivados de su tabla de planes');
console.log('H3  Grok Imagine: retirada la afirmación de cuál es el plan de pago más barato');
console.log('H4  DeepSeek V4 Flash: 284B/13B/1M y fuera el repositorio de V3.2-Exp');
console.log('H5  Copilot: fuera «50 solicitudes de chat» y el negativo rotundo sobre revisión de código');
console.log('H6  Ideogram: fuera «10 créditos lentos/semana», que la tabla ya no publica');
console.log('H7  ElevenLabs: uso comercial pasa a «derived»; créditos compartidos, no caracteres');
console.log('H8  Runway: marca de agua «yes», derivada de que quitarla empieza en Standard');
console.log('H9  Kimi K3 con sus dos condiciones; Qwen3.8 Max pasa de «unverified» a «partial»');
console.log('H10 Cursor: fuera «2000 completions/mes» de los contras');
console.log(`H11 Reddit: ${reddits} fuentes retiradas`);
console.log('H13 GPT-5.6 con contexto corto y largo; DeepSeek V4 Pro con sus precios, no los de Flash');
