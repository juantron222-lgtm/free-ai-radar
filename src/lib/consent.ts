/**
 * Consent model.
 *
 * Bumping `CONSENT_VERSION` invalidates every stored choice and re-asks. Do it
 * whenever a new vendor or purpose is added — silently expanding the scope of
 * an old "accept" is not consent.
 */
export const CONSENT_VERSION = 2;

export const CONSENT_COOKIE = 'far_consent';
export const CONSENT_STORAGE_KEY = 'far-consent';

export type ConsentCategoryId = 'necessary' | 'analytics' | 'personalization' | 'advertising';

export interface ConsentCategory {
  id: ConsentCategoryId;
  name: string;
  description: string;
  required: boolean;
  vendors: string[];
}

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  {
    id: 'necessary',
    name: 'Necesarias',
    description:
      'Sesión, seguridad, preferencia de idioma y tema, y el propio registro de tu elección de cookies. Sin ellas el sitio no funciona.',
    required: true,
    vendors: [],
  },
  {
    id: 'analytics',
    name: 'Analítica',
    description:
      'Medición agregada de páginas vistas y búsquedas para saber qué contenido merece la pena mantener. Sin perfiles individuales.',
    required: false,
    vendors: [],
  },
  {
    id: 'personalization',
    name: 'Personalización',
    description:
      'Recordar filtros, comparaciones recientes y recomendaciones acordes a tus intereses.',
    required: false,
    vendors: [],
  },
  {
    id: 'advertising',
    name: 'Publicidad',
    description:
      'Anuncios y medición publicitaria. Si no lo aceptas, no se carga ningún script publicitario ni se crea ningún identificador.',
    required: false,
    vendors: ['Google AdSense'],
  },
] as const;

export type ConsentState = Record<ConsentCategoryId, boolean>;

export const DENY_ALL: ConsentState = {
  necessary: true,
  analytics: false,
  personalization: false,
  advertising: false,
};

export const ALLOW_ALL: ConsentState = {
  necessary: true,
  analytics: true,
  personalization: true,
  advertising: true,
};

export interface ConsentRecord {
  version: number;
  state: ConsentState;
  /** ISO timestamp of the decision — proof of consent under GDPR art. 7(1). */
  decidedAt: string;
}

export function isConsentRecord(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ConsentRecord>;
  return (
    typeof record.version === 'number' &&
    typeof record.decidedAt === 'string' &&
    !!record.state &&
    typeof record.state === 'object'
  );
}

/** Reads consent from a cookie header. Used server-side to gate SSR output. */
export function readConsentFromCookie(cookieValue: string | undefined): ConsentState {
  if (!cookieValue) return DENY_ALL;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(cookieValue));
    if (!isConsentRecord(parsed) || parsed.version !== CONSENT_VERSION) return DENY_ALL;
    return { ...DENY_ALL, ...parsed.state, necessary: true };
  } catch {
    return DENY_ALL;
  }
}
