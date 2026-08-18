/** Single source of truth for site navigation and route paths. */

/**
 * Categorías con página propia, reconstruidas alrededor de la intención.
 *
 * Se resuelve aquí y no en cada enlace para que exista una sola URL canónica:
 * dos rutas con el mismo contenido compiten entre sí y reparten los enlaces
 * entrantes. Las viejas `/categorias/<slug>` siguen redirigiendo con un 301.
 */
const RUTA_PROPIA = new Set(['imagen', 'video']);

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
  category: (slug: string) => (RUTA_PROPIA.has(slug) ? `/${slug}` : `/categorias/${slug}`),
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
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: 'Herramientas', href: ROUTES.tools, description: 'El catálogo completo, con filtros' },
  { label: 'Modelos', href: ROUTES.models, description: 'Modelos de lenguaje y multimodales' },
  { label: 'Agentes', href: ROUTES.agents, description: 'Agentes y frameworks para construirlos' },
  { label: 'Comparar', href: ROUTES.compare, description: 'Enfrenta hasta cuatro herramientas' },
  { label: 'Últimas noticias', href: ROUTES.news, description: 'Qué ha cambiado, con fuente y fecha' },
  { label: 'Metodología', href: ROUTES.methodology, description: 'Cómo puntuamos' },
];

export const FOOTER_NAV: ReadonlyArray<{ title: string; items: NavItem[] }> = [
  {
    title: 'Descubrir',
    items: [
      { label: 'Todas las herramientas', href: ROUTES.tools },
      { label: 'Modelos', href: ROUTES.models },
      { label: 'Agentes', href: ROUTES.agents },
      { label: 'Categorías', href: ROUTES.categories },
      { label: 'Colecciones', href: ROUTES.collections },
      { label: 'Comparador', href: ROUTES.compare },
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
      { label: 'Radar Pro', href: ROUTES.pricing },
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
