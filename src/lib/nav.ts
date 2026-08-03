/** Single source of truth for site navigation and route paths. */

export const ROUTES = {
  home: '/',
  tools: '/herramientas',
  tool: (slug: string) => `/herramientas/${slug}`,
  categories: '/categorias',
  category: (slug: string) => `/categorias/${slug}`,
  compare: '/comparar',
  collections: '/colecciones',
  collection: (slug: string) => `/colecciones/${slug}`,
  changes: '/cambios',
  news: '/noticias',
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

/** Primary navigation. Deliberately short — five items is the ceiling. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: 'Herramientas', href: ROUTES.tools, description: 'El catálogo completo, con filtros' },
  { label: 'Categorías', href: ROUTES.categories, description: 'Por tipo de trabajo' },
  { label: 'Comparar', href: ROUTES.compare, description: 'Enfrenta hasta cuatro herramientas' },
  { label: 'Cambios', href: ROUTES.changes, description: 'Qué planes gratuitos han cambiado' },
  { label: 'Metodología', href: ROUTES.methodology, description: 'Cómo puntuamos' },
];

export const FOOTER_NAV: ReadonlyArray<{ title: string; items: NavItem[] }> = [
  {
    title: 'Descubrir',
    items: [
      { label: 'Todas las herramientas', href: ROUTES.tools },
      { label: 'Categorías', href: ROUTES.categories },
      { label: 'Colecciones', href: ROUTES.collections },
      { label: 'Comparador', href: ROUTES.compare },
      { label: 'Registro de cambios', href: ROUTES.changes },
      { label: 'Novedades', href: ROUTES.news },
    ],
  },
  {
    title: 'Transparencia',
    items: [
      { label: 'Metodología', href: ROUTES.methodology },
      { label: 'Política editorial', href: ROUTES.editorialPolicy },
      { label: 'Afiliados', href: ROUTES.affiliates },
      { label: 'Publicidad y patrocinios', href: ROUTES.advertising },
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
  { label: 'Auditoría', href: '/admin/auditoria' },
];

export function isActivePath(current: string, href: string): boolean {
  const normalized = current.replace(/\/+$/, '') || '/';
  if (href === '/') return normalized === '/';
  return normalized === href || normalized.startsWith(`${href}/`);
}
