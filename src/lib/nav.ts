/** Single source of truth for site navigation and route paths. */

/**
 * Categorías con página propia, reconstruidas alrededor de la intención.
 *
 * Se resuelve aquí y no en cada enlace para que exista una sola URL canónica:
 * dos rutas con el mismo contenido compiten entre sí y reparten los enlaces
 * entrantes. Las viejas `/categorias/<slug>` siguen redirigiendo con un 301.
 */
const RUTA_PROPIA = new Set(['imagen', 'video', 'modelos', 'codigo', 'agentes']);

/**
 * Dos categorías técnicas, una sola página.
 *
 * `musica` y `voz` siguen sirviendo para la taxonomía y los filtros, pero como
 * páginas eran una ficha cada una y nadie busca «voz» sabiendo que no es
 * «audio». Las dos apuntan a /audio.
 */
const RUTA_UNIFICADA: Record<string, string> = { musica: '/audio', voz: '/audio' };

export const ROUTES = {
  home: '/',
  tools: '/herramientas',
  tool: (slug: string) => `/herramientas/${slug}`,
  categories: '/categorias',
  /**
   * Imagen tiene página propia mientras se prueba la arquitectura por intención.
   *
   * Se resuelve aquí y no en cada enlace para que exista una sola URL canónica:
   * dos rutas con el mismo contenido compiten entre sí en los buscadores y
   * reparten los enlaces entrantes. `/categorias/imagen` sigue redirigiendo.
   */
  category: (slug: string) =>
    RUTA_UNIFICADA[slug] ?? (RUTA_PROPIA.has(slug) ? `/${slug}` : `/categorias/${slug}`),
  models: '/modelos',
  agents: '/agentes',
  compare: '/comparar',
  collections: '/colecciones',
  collection: (slug: string) => `/colecciones/${slug}`,
  news: '/noticias',
  newsItem: (slug: string) => `/noticias/${slug}`,
  /**
   * The site's own changelog. Moved out of the primary nav: readers come for
   * what changed in the *tools*, not for what changed in this website. It
   * belongs with the other transparency pages.
   */
  radarChangelog: '/transparencia/cambios-del-radar',
  guides: '/guias',
  guide: (slug: string) => `/guias/${slug}`,
  methodology: '/metodologia',
  editorialPolicy: '/politica-editorial',
  affiliates: '/transparencia-afiliados',
  advertising: '/publicidad',
  about: '/sobre-el-proyecto',
  contact: '/contacto',
  submit: '/enviar-herramienta',
  pricing: '/pro',
  privacy: '/legal/privacidad',
  cookies: '/legal/cookies',
  terms: '/legal/terminos',
  rights: '/legal/derechos',
  // Account
  login: '/cuenta/entrar',
  register: '/cuenta/crear',
  forgot: '/cuenta/recuperar',
  reset: '/cuenta/nueva-contrasena',
  account: '/cuenta',
  favorites: '/cuenta/favoritos',
  lists: '/cuenta/listas',
  alerts: '/cuenta/alertas',
  settings: '/cuenta/preferencias',
  billing: '/cuenta/suscripcion',
  // Admin
  admin: '/admin',
} as const;

export interface NavItem {
  label: string;
  href: string;
  description?: string;
}

/**
 * Primary navigation. Deliberately short — six items is the ceiling.
 *
 * "Últimas noticias" replaces the old "Cambios": what the reader wants is what
 * changed in the *tools*, dated and sourced, not this site's own release log.
 */
/**
 * Las seis verticales, en orden editorial y no por tamaño.
 *
 * Existen como lista propia porque son la forma principal de recorrer el
 * catálogo y aparecen en tres sitios: la cabecera, el menú móvil y la portada.
 * Tenerlas en un único array evita que se queden desincronizadas, que es
 * justo lo que pasaba: cuatro de las seis no estaban en ninguna navegación.
 */
export const VERTICALS: readonly NavItem[] = [
  { label: 'Imagen', href: '/imagen', description: 'Generar y editar imágenes' },
  { label: 'Vídeo', href: '/video', description: 'Generar vídeo y animar imágenes' },
  { label: 'Audio', href: '/audio', description: 'Música, voz, clonación y transcripción' },
  { label: 'Modelos', href: ROUTES.models, description: 'Modelos de lenguaje y multimodales' },
  { label: 'Agentes', href: ROUTES.agents, description: 'Agentes y plataformas para construirlos' },
  { label: 'Código', href: '/codigo', description: 'Editores, copilotos, agentes y terminales' },
];

/*
 * Una vertical se llama igual en la navegación y en las migas.
 *
 * La cabecera, el menú y la portada decían «Imagen» y la miga de la propia
 * página decía «Categorías / Imagen IA»; en Código, Agentes y Modelos no había
 * «Categorías» y en Audio ponía «Audio IA». Tres formas de nombrar el mismo
 * sitio. No hay razón SEO que lo sostenga: el título y el H1 ya dicen «IA para
 * imágenes», y el nombre de una miga no es donde se posiciona una página.
 *
 * `categoryLabel` hace lo mismo para la miga de una ficha: si la categoría
 * tiene vertical propia —también `musica` y `voz`, que van a /audio—, la miga
 * lleva el rótulo de la vertical. La taxonomía conserva sus nombres
 * («Imagen IA», «Música IA») para filtros y búsqueda.
 */
export const categoryLabel = (slug: string, fallback: string): string =>
  VERTICALS.find((v) => v.href === ROUTES.category(slug))?.label ?? fallback;

/**
 * Cómo se nombra dónde está una ficha.
 *
 * Había dos ejes a la vez y el lector los veía juntos: la miga de Fish Audio
 * decía «Audio» y dos líneas más abajo su antetítulo decía «Voz IA», que es
 * otro nombre de otro árbol. Son dos niveles del mismo sitio, así que se dicen
 * como tales: «Audio › Voz». Cuando la categoría es la vertical, una sola
 * palabra; cuando no hay vertical —Escritura, Productividad—, el nombre de la
 * categoría solo.
 *
 * La taxonomía conserva sus nombres («Voz IA», «Música IA») para filtros,
 * búsqueda y datos estructurados: esto es cómo se lee, no cómo se guarda.
 */
const SUBNIVEL: Record<string, string> = {
  imagen: 'Imagen',
  video: 'Vídeo',
  voz: 'Voz',
  musica: 'Música',
  codigo: 'Código',
  agentes: 'Agentes',
  modelos: 'Modelos',
  'modelos-open-source': 'Open source',
};

export interface Ubicacion {
  /** A dónde lleva: la vertical si existe, la categoría si no. */
  href: string;
  /** Lo que se escribe: «Audio › Voz», «Imagen» o «Escritura». */
  texto: string;
  /** El rótulo de la vertical, cuando la hay. */
  vertical?: string;
}

export function ubicacionDe(slug: string, nombre: string): Ubicacion {
  const href = ROUTES.category(slug);
  const vertical = VERTICALS.find((v) => v.href === href);
  if (!vertical) return { href, texto: nombre };
  const sub = SUBNIVEL[slug] ?? nombre;
  return {
    href,
    vertical: vertical.label,
    texto: sub === vertical.label ? vertical.label : `${vertical.label} › ${sub}`,
  };
}

export function migasDeVertical(href: string): { name: string; path: string }[] {
  const vertical = VERTICALS.find((v) => v.href === href);
  if (!vertical) throw new Error(`${href} no es una vertical`);
  return [
    { name: 'Inicio', path: ROUTES.home },
    { name: vertical.label, path: vertical.href },
  ];
}

/*
 * Cuatro entradas: las tres cosas que se pueden hacer aquí, y cómo se comprueba.
 *
 * La cabecera llevaba ocho. «Herramientas» y las seis verticales son el mismo
 * viaje contado dos veces, y con el buscador global al lado competían por la
 * misma mirada. Las verticales no desaparecen: están en la portada, dentro del
 * catálogo y en el menú móvil, que es donde alguien elige por lo que quiere
 * hacer. «Noticias» sube desde el pie porque es la segunda razón para volver.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: 'Herramientas', href: ROUTES.tools, description: 'El catálogo completo, con filtros' },
  { label: 'Noticias', href: ROUTES.news, description: 'Qué ha cambiado en los planes gratuitos' },
  { label: 'Comparar', href: ROUTES.compare, description: 'Enfrenta hasta cuatro herramientas' },
  { label: 'Metodología', href: ROUTES.methodology, description: 'Cómo comprobamos cada dato' },
];

export const FOOTER_NAV: ReadonlyArray<{ title: string; items: NavItem[] }> = [
  {
    title: 'Descubrir',
    items: [
      { label: 'Todas las herramientas', href: ROUTES.tools },
      ...VERTICALS.map((v) => ({ label: v.label, href: v.href })),
      { label: 'Categorías', href: ROUTES.categories },
      { label: 'Colecciones', href: ROUTES.collections },
      { label: 'Comparar', href: ROUTES.compare },
      { label: 'Últimas noticias', href: ROUTES.news },
    ],
  },
  {
    title: 'Transparencia',
    items: [
      { label: 'Metodología', href: ROUTES.methodology },
      { label: 'Política editorial', href: ROUTES.editorialPolicy },
      { label: 'Afiliados', href: ROUTES.affiliates },
      { label: 'Publicidad y patrocinios', href: ROUTES.advertising },
      { label: 'Cambios del Radar', href: ROUTES.radarChangelog },
      { label: 'Sobre el proyecto', href: ROUTES.about },
    ],
  },
  {
    title: 'Participar',
    items: [
      { label: 'Enviar una herramienta', href: ROUTES.submit },
      { label: 'Contacto', href: ROUTES.contact },
      { label: 'Crear cuenta', href: ROUTES.register },
    ],
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacidad', href: ROUTES.privacy },
      { label: 'Cookies', href: ROUTES.cookies },
      { label: 'Términos', href: ROUTES.terms },
      { label: 'Tus derechos', href: ROUTES.rights },
    ],
  },
];

export const ACCOUNT_NAV: readonly NavItem[] = [
  { label: 'Resumen', href: ROUTES.account },
  { label: 'Favoritos', href: ROUTES.favorites },
  { label: 'Listas', href: ROUTES.lists },
  { label: 'Alertas', href: ROUTES.alerts },
  { label: 'Preferencias', href: ROUTES.settings },
  { label: 'Suscripción', href: ROUTES.billing },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { label: 'Panel', href: '/admin' },
  { label: 'Herramientas', href: '/admin/herramientas' },
  { label: 'Pendientes', href: '/admin/pendientes' },
  { label: 'Correcciones', href: '/admin/correcciones' },
  { label: 'Desactualizadas', href: '/admin/desactualizadas' },
  { label: 'Enlaces', href: '/admin/enlaces' },
  { label: 'Newsletter', href: '/admin/newsletter' },
  { label: 'Monetización', href: '/admin/monetizacion' },
  { label: 'AutoCraw', href: '/admin/autocraw' },
  { label: 'Auditoría', href: '/admin/auditoria' },
];

export function isActivePath(current: string, href: string): boolean {
  const normalized = current.replace(/\/+$/, '') || '/';
  if (href === '/') return normalized === '/';
  return normalized === href || normalized.startsWith(`${href}/`);
}
