import { slugify } from './primitives';

export interface CategoryDef {
  slug: string;
  name: string;
  /** Legacy names found in tools.json that map onto this category. */
  aliases: string[];
  /** Used as the H1 lede and meta description seed on the category hub. */
  intro: string;
  icon: CategoryIcon;
}

export type CategoryIcon =
  | 'image'
  | 'video'
  | 'audio'
  | 'music'
  | 'code'
  | 'agent'
  | 'automation'
  | 'productivity'
  | 'design'
  | 'writing'
  | 'marketing'
  | 'model'
  | 'local'
  | 'api'
  | 'research'
  | 'education'
  | 'chat';

export const CATEGORIES: readonly CategoryDef[] = [
  {
    slug: 'imagen',
    name: 'Imagen IA',
    aliases: ['Imagen IA', 'Imagen', 'Image'],
    intro:
      'Generación y edición de imágenes con IA. Aquí lo que decide es la marca de agua, la licencia de las imágenes generadas y si puedes usarlas comercialmente.',
    icon: 'image',
  },
  {
    slug: 'video',
    name: 'Vídeo IA',
    aliases: ['Vídeo IA', 'Video IA', 'Vídeo', 'Video'],
    intro:
      'Generación y edición de vídeo. Es la categoría donde más rápido se agotan los créditos gratuitos y donde la marca de agua es más habitual.',
    icon: 'video',
  },
  {
    slug: 'voz',
    name: 'Voz IA',
    aliases: ['Voz IA', 'Audio IA', 'Voz', 'Audio'],
    intro:
      'Síntesis de voz, clonación y transcripción. Revisa siempre los derechos sobre el audio generado y la política de retención de tu voz.',
    icon: 'audio',
  },
  {
    slug: 'musica',
    name: 'Música IA',
    aliases: ['Música IA', 'Musica IA', 'Música'],
    intro:
      'Composición y producción musical asistida. El punto crítico es la licencia: muchos planes gratuitos no permiten monetizar lo generado.',
    icon: 'music',
  },
  {
    slug: 'codigo',
    name: 'Código',
    aliases: ['Código', 'Codigo', 'Code', 'Programación'],
    intro:
      'Asistentes de programación, generadores de código y entornos con IA integrada. Fíjate en los límites de contexto y en qué se hace con tu código.',
    icon: 'code',
  },
  {
    slug: 'chat-asistentes',
    name: 'Chat y asistentes',
    aliases: ['Chat', 'Asistentes', 'Chatbots', 'Conversacional'],
    intro:
      'Modelos conversacionales de propósito general. Lo relevante es el límite de mensajes, el modelo real que sirve el plan gratuito y si se entrena con tus datos.',
    icon: 'chat',
  },
  {
    slug: 'agentes',
    name: 'Agentes IA',
    aliases: ['Agentes IA', 'Agentes', 'Agents'],
    intro:
      'Sistemas que ejecutan tareas de varios pasos por su cuenta. Suelen consumir créditos muy rápido: mira el coste por ejecución, no por mes.',
    icon: 'agent',
  },
  {
    slug: 'automatizacion',
    name: 'Automatización',
    aliases: ['Automatización', 'Automatizacion', 'No-code'],
    intro:
      'Flujos de trabajo y conectores con IA. El límite gratuito casi siempre se mide en ejecuciones al mes, no en funciones.',
    icon: 'automation',
  },
  {
    slug: 'productividad',
    name: 'Productividad',
    aliases: ['Productividad', 'Notas', 'Oficina'],
    intro:
      'Herramientas de trabajo diario con IA: notas, reuniones, documentos y correo.',
    icon: 'productivity',
  },
  {
    slug: 'diseno',
    name: 'Diseño',
    aliases: ['Diseño', 'Diseno', 'Design', 'UI'],
    intro:
      'Diseño gráfico, interfaces y presentaciones con asistencia de IA. Revisa la exportación: muchos planes gratuitos limitan la resolución o el formato.',
    icon: 'design',
  },
  {
    slug: 'escritura',
    name: 'Escritura',
    aliases: ['Escritura', 'Writing', 'Redacción'],
    intro:
      'Redacción, corrección y traducción. Comprueba el límite de palabras y si el texto generado se puede usar comercialmente.',
    icon: 'writing',
  },
  {
    slug: 'marketing',
    name: 'Marketing',
    aliases: ['Marketing', 'SEO', 'Publicidad'],
    intro: 'Creación de campañas, copy y análisis con IA.',
    icon: 'marketing',
  },
  {
    slug: 'modelos',
    name: 'Modelos de IA',
    aliases: ['modelos', 'llm', 'modelo-lenguaje'],
    intro:
      'Los modelos, separados de las aplicaciones que los usan. Aquí se responde qué puedes usar gratis y por dónde: en un chat, por API o descargando los pesos. Son tres preguntas distintas y ninguna se hereda de las otras.',
    icon: 'model',
  },
  {
    slug: 'modelos-open-source',
    name: 'Modelos open-source',
    aliases: ['Modelos open-source', 'Open source', 'Modelos'],
    intro:
      'Modelos con pesos abiertos que puedes descargar y ejecutar. Aquí "gratis" es real, pero el coste se traslada a tu hardware.',
    icon: 'model',
  },
  {
    slug: 'herramientas-locales',
    name: 'Herramientas locales',
    aliases: ['Herramientas locales', 'Local', 'On-premise'],
    intro:
      'Software que se ejecuta en tu máquina. Sin cuotas, sin envío de datos a terceros y sin depender de que nadie cambie su plan gratuito.',
    icon: 'local',
  },
  {
    slug: 'apis',
    name: 'APIs y plataformas',
    aliases: ['APIs gratuitas', 'API', 'Plataformas', 'Infraestructura'],
    intro:
      'Acceso programático a modelos. Lo determinante es si hay capa gratuita permanente o sólo crédito inicial, y si piden tarjeta.',
    icon: 'api',
  },
  {
    slug: 'investigacion',
    name: 'Investigación',
    aliases: ['Investigación', 'Investigacion', 'Research'],
    intro: 'Búsqueda, síntesis de fuentes y análisis documental con IA.',
    icon: 'research',
  },
  {
    slug: 'educacion',
    name: 'Educación',
    aliases: ['Educación', 'Educacion', 'Aprendizaje'],
    intro: 'Aprendizaje asistido, generación de material y tutores con IA.',
    icon: 'education',
  },
] as const;

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));
const CATEGORY_BY_ALIAS = new Map<string, CategoryDef>();
for (const c of CATEGORIES) {
  CATEGORY_BY_ALIAS.set(c.name.toLowerCase(), c);
  CATEGORY_BY_ALIAS.set(slugify(c.name), c);
  for (const alias of c.aliases) {
    CATEGORY_BY_ALIAS.set(alias.toLowerCase(), c);
    CATEGORY_BY_ALIAS.set(slugify(alias), c);
  }
}

export function getCategory(slug: string): CategoryDef | undefined {
  return CATEGORY_BY_SLUG.get(slug);
}

/** Resolves a free-text category from legacy data onto a canonical category. */
export function resolveCategory(input: string): CategoryDef | undefined {
  if (!input) return undefined;
  return CATEGORY_BY_ALIAS.get(input.toLowerCase()) ?? CATEGORY_BY_ALIAS.get(slugify(input));
}

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

// ---------------------------------------------------------------------------
// Free-tier model
// ---------------------------------------------------------------------------

export type FreeModel =
  | 'free_real'
  | 'freemium'
  | 'credits'
  | 'trial'
  | 'open_source'
  | 'local'
  | 'demo'
  | 'paid_only'
  | 'unknown';

export interface FreeModelDef {
  id: FreeModel;
  label: string;
  /** One line the user can act on. Shown in the tool card tooltip. */
  meaning: string;
  tone: 'good' | 'neutral' | 'warn' | 'bad';
}

export const FREE_MODELS: readonly FreeModelDef[] = [
  {
    id: 'free_real',
    label: 'Gratis real',
    meaning: 'Capa gratuita permanente y utilizable. No caduca ni se convierte en prueba.',
    tone: 'good',
  },
  {
    id: 'open_source',
    label: 'Open source',
    meaning: 'Código y/o pesos abiertos. Gratis por licencia, no por cortesía comercial.',
    tone: 'good',
  },
  {
    id: 'local',
    label: 'Local',
    meaning: 'Se ejecuta en tu equipo. Sin cuotas ni envío de datos, pero exige hardware.',
    tone: 'good',
  },
  {
    id: 'freemium',
    label: 'Freemium decente',
    meaning: 'Plan gratuito permanente pero recortado. Sirve para trabajar con límites.',
    tone: 'neutral',
  },
  {
    id: 'credits',
    label: 'Créditos gratis',
    meaning: 'Créditos que se agotan. Comprueba si se renuevan y con qué frecuencia.',
    tone: 'neutral',
  },
  {
    id: 'trial',
    label: 'Prueba temporal',
    meaning: 'Acceso limitado en el tiempo. Después hay que pagar.',
    tone: 'warn',
  },
  {
    id: 'demo',
    label: 'Demo limitada',
    meaning: 'Sólo permite probar. No sirve para producir trabajo real.',
    tone: 'warn',
  },
  {
    id: 'paid_only',
    label: 'Sin capa gratuita',
    meaning: 'No hay nada gratis utilizable. Se documenta para que no pierdas el tiempo.',
    tone: 'bad',
  },
  {
    /*
     * The honest answer when the vendor's page cannot be read.
     *
     * Four of the catalogue's tools sit behind protections that refuse
     * automated reads, and before this the only way to store that was to pick
     * one of the other eight — which turns "we could not check" into a claim.
     * Midjourney was stored as `trial` on exactly that basis.
     */
    id: 'unknown',
    label: 'Sin confirmar',
    meaning: 'No hemos podido comprobarlo en una fuente oficial. No afirmamos nada todavía.',
    tone: 'neutral',
  },
] as const;

const FREE_MODEL_BY_ID = new Map(FREE_MODELS.map((m) => [m.id, m]));

export function getFreeModel(id: FreeModel): FreeModelDef {
  const found = FREE_MODEL_BY_ID.get(id);
  if (!found) throw new Error(`Modelo de gratuidad desconocido: ${id}`);
  return found;
}

const LEGACY_FREE_TYPE: Record<string, FreeModel> = {
  'gratis real': 'free_real',
  'freemium decente': 'freemium',
  freemium: 'freemium',
  'créditos gratis': 'credits',
  'creditos gratis': 'credits',
  'trial útil': 'trial',
  'trial util': 'trial',
  trial: 'trial',
  'open-source': 'open_source',
  'open source': 'open_source',
  local: 'local',
  'demo limitada': 'demo',
  demo: 'demo',
  'requiere tarjeta': 'trial',
  'humo probable': 'demo',
  'de pago': 'paid_only',
};

export function resolveFreeModel(input: string): FreeModel | undefined {
  return LEGACY_FREE_TYPE[input?.toLowerCase()?.trim()];
}

// ---------------------------------------------------------------------------
// Platforms, skill level, licences
// ---------------------------------------------------------------------------

export const PLATFORMS = [
  'web',
  'windows',
  'macos',
  'linux',
  'ios',
  'android',
  'api',
  'cli',
  'extension',
  'docker',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  web: 'Web',
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
  api: 'API',
  cli: 'Terminal',
  extension: 'Extensión',
  docker: 'Docker',
};

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

export const HOSTING = ['cloud', 'local', 'hybrid'] as const;
export type Hosting = (typeof HOSTING)[number];

export const HOSTING_LABEL: Record<Hosting, string> = {
  cloud: 'Nube',
  local: 'Local',
  hybrid: 'Nube o local',
};

/*
 * `unknown` is not a gap in this list, it is a value.
 *
 * Without it, a tool whose page mentions credits but never says how often they
 * come back had to be stored as `none` — which reads as "there are no credits"
 * and is a different, false claim. The audit found four tools with documented
 * credits and every one of them stored as `none`.
 */
export const CREDIT_RESET = ['none', 'daily', 'weekly', 'monthly', 'one_off', 'unknown'] as const;
export type CreditReset = (typeof CREDIT_RESET)[number];

export const CREDIT_RESET_LABEL: Record<CreditReset, string> = {
  none: 'Sin créditos',
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
  one_off: 'Única (no se renueva)',
  unknown: 'Sin confirmar',
};

// ---------------------------------------------------------------------------
// Capacidades
// ---------------------------------------------------------------------------

/**
 * Qué sabe hacer una herramienta, separado de en qué categoría vive.
 *
 * La categoría dice de qué trata; la capacidad dice qué puedes pedirle. Sin
 * esta separación, "Imagen" contenía a la vez una comunidad de modelos, dos
 * interfaces locales, un grafo de nodos y dos generadores web — seis cosas que
 * no se pueden comparar entre sí porque no hacen lo mismo.
 *
 * **Una capacidad sólo se marca si una página oficial la nombra.** No se deduce
 * de que "todos los generadores hacen esto": el catálogo acaba de salir de una
 * auditoría donde veintidós fichas afirmaban por defecto algo que nadie había
 * comprobado, y esta lista es exactamente igual de fácil de rellenar a ojo.
 */
export const CAPABILITIES = [
  // Imagen
  'text-to-image',
  'image-to-image',
  'image-editing',
  'inpainting',
  'outpainting',
  'reference-image',
  'character-consistency',
  'upscaling',
  'background-removal',
  // Vídeo
  'text-to-video',
  'image-to-video',
  'reference-to-video',
  'video-editing',
  'video-extend',
  'video-upscaling',
  'lip-sync',
  'avatar-video',
  'native-audio',
  // Audio
  'text-to-speech',
  'voice-clone',
  'speech-to-speech',
  'dubbing',
  'text-to-music',
  'sound-effects',
  'transcription',
  'audio-editing',
  // Texto y código
  'text-generation',
  'code-generation',
  /*
   * Modelos: lo que la documentación demuestra, no lo que la portada promete.
   *
   * «Frontier intelligence» no es una capacidad; «thinking mode enabled by
   * default» sí, porque una página oficial lo dice y otra no. Estas cuatro son
   * las que hicieron falta para describir modelos sin inventar: razonar con un
   * modo documentado, entender imágenes, oír y ver vídeo.
   */
  'reasoning',
  'vision',
  'audio-input',
  'video-understanding',
  /*
   * Agentes: lo que el agente hace, no lo que la portada dice que es.
   *
   * `agents` ya existía y significaba «esto tiene que ver con agentes», que no
   * decide nada: la palabra está en la portada de casi todo. Estas once
   * describen comportamientos concretos que una fuente oficial puede
   * demostrar o no, y son las que dan acceso a /agentes. La vieja se queda
   * porque tres fichas la llevan, pero no cuenta como prueba de nada.
   */
  'tool-use',
  'web-browsing',
  'computer-use',
  'code-execution',
  'terminal',
  'repository-editing',
  'multi-agent',
  'workflow-automation',
  'research',
  'memory',
  'integrations',
  'agents',
  // Infraestructura
  'api',
  'model-hosting',
  'model-download',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  'text-to-image': 'Texto a imagen',
  'image-to-image': 'Imagen a imagen',
  'image-editing': 'Edición de imagen',
  inpainting: 'Rellenar zonas',
  outpainting: 'Ampliar el encuadre',
  'reference-image': 'Imagen de referencia',
  'character-consistency': 'Personaje consistente',
  upscaling: 'Escalado',
  'background-removal': 'Quitar fondo',
  'text-to-video': 'Texto a vídeo',
  'image-to-video': 'Imagen a vídeo',
  'reference-to-video': 'Referencia a vídeo',
  'video-editing': 'Edición de vídeo',
  'video-extend': 'Alargar el vídeo',
  'video-upscaling': 'Escalado de vídeo',
  'lip-sync': 'Sincronía labial',
  'avatar-video': 'Vídeo con avatar',
  'native-audio': 'Audio generado con el vídeo',
  'text-to-speech': 'Texto a voz',
  'voice-clone': 'Clonación de voz',
  'speech-to-speech': 'Voz a voz',
  dubbing: 'Doblaje',
  'text-to-music': 'Texto a música',
  'sound-effects': 'Efectos de sonido',
  transcription: 'Transcripción',
  'audio-editing': 'Edición de audio',
  'text-generation': 'Generación de texto',
  reasoning: 'Razonamiento',
  vision: 'Entiende imágenes',
  'audio-input': 'Entiende audio',
  'video-understanding': 'Entiende vídeo',
  'code-generation': 'Generación de código',
  'tool-use': 'Usa herramientas',
  'web-browsing': 'Navega por la web',
  'computer-use': 'Maneja el ordenador',
  'code-execution': 'Ejecuta código',
  terminal: 'Usa la terminal',
  'repository-editing': 'Edita repositorios',
  'multi-agent': 'Reparte en subagentes',
  'workflow-automation': 'Automatiza flujos',
  research: 'Investigación multietapa',
  memory: 'Memoria entre sesiones',
  integrations: 'Se conecta con otras aplicaciones',
  agents: 'Agentes',
  api: 'API',
  'model-hosting': 'Ejecuta modelos alojados',
  'model-download': 'Descarga de modelos',
};

// ---------------------------------------------------------------------------
// Esfuerzo para empezar
// ---------------------------------------------------------------------------

/**
 * Cuánto hay entre abrir la página y obtener un resultado.
 *
 * Sustituye a `skillLevel`, que medía la pericia del usuario y no el trabajo
 * que exige la herramienta. Con `skillLevel` se podía llamar "principiante" a
 * Fooocus —una aplicación Python que necesita GPU— y a un generador web, y la
 * comparación resultante era engañosa aunque cada etiqueta fuese defendible por
 * separado.
 *
 * Esto no es una afirmación sobre el fabricante, sino una lectura editorial de
 * lo que cuesta empezar. Por eso no exige cita: lo que exige cita es lo que la
 * empresa promete, no lo que nosotros observamos.
 */
export const START_EFFORT = ['instant', 'signup', 'install', 'technical'] as const;
export type StartEffort = (typeof START_EFFORT)[number];

export const START_EFFORT_LABEL: Record<StartEffort, string> = {
  instant: 'Abres y generas',
  signup: 'Cuenta y algo de configuración',
  install: 'Instalación sencilla',
  technical: 'Instalación técnica, modelos o GPU',
};

export const START_EFFORT_MEANING: Record<StartEffort, string> = {
  instant: 'Entras en la web y generas. Sin instalar nada.',
  signup: 'Hace falta crear cuenta o configurar algo antes del primer resultado.',
  install: 'Se instala en tu equipo, pero el proceso es guiado y no exige conocimientos.',
  technical: 'Exige descargar modelos, configurar entornos o disponer de GPU.',
};
