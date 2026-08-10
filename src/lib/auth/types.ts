import type { PlanTier, UserRole } from '@lib/domain/primitives';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  plan: PlanTier;
  emailVerified: boolean;
  locale: string;
}

export interface AuthResult {
  ok: boolean;
  /** User-facing message. Never leaks whether an account exists. */
  message: string;
  user?: SessionUser;
  /** Field to focus and mark invalid, when the failure is attributable. */
  field?: 'email' | 'password' | 'displayName' | 'token';
  /**
   * The account exists but there is no session yet: the address has to be
   * confirmed first.
   *
   * Without this the caller cannot tell "signed up and signed in" from "signed
   * up, now go and read your email", and it sent both to `/cuenta` — which
   * needs a session, so the second case bounced to the login page with the
   * explanation stripped off by the redirect. The user saw a login form and no
   * reason for it.
   */
  pendingConfirmation?: boolean;
}

export interface Credentials {
  email: string;
  password: string;
  displayName?: string;
}

/**
 * Everything the app needs from an identity provider.
 *
 * Two implementations exist: Supabase Auth (production) and a development-only
 * local store. Pages and endpoints only ever see this interface, so swapping in
 * a third provider later touches one file.
 */
export interface AuthProvider {
  readonly mode: 'supabase' | 'local' | 'disabled';
  readonly supportsOAuth: boolean;

  signUp(credentials: Credentials, request: Request): Promise<AuthResult>;
  signIn(credentials: Omit<Credentials, 'displayName'>, request: Request): Promise<AuthResult>;
  signOut(request: Request): Promise<void>;
  getUser(request: Request): Promise<SessionUser | null>;
  requestPasswordReset(userEmail: string, request: Request): Promise<AuthResult>;
  resetPassword(token: string, newPassword: string, request: Request): Promise<AuthResult>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult>;
  updateProfile(userId: string, patch: { displayName?: string; locale?: string }): Promise<AuthResult>;
  deleteAccount(userId: string): Promise<AuthResult>;
  /**
   * Completes the email confirmation link.
   *
   * Supabase's SSR client runs PKCE, so the link lands back on us carrying a
   * one-time `code` rather than a session. Exchanging it needs the verifier
   * cookie written during sign-up, which is why this belongs to the provider
   * and not to the page: the page should not know what a code verifier is.
   */
  completeEmailVerification(code: string, request: Request): Promise<AuthResult>;
  /** Cookies the response must set. Collected during the call above. */
  drainCookies(): Array<{ name: string; value: string; options: Record<string, unknown> }>;
}

/** Generic message used whenever revealing more would enable enumeration. */
export const GENERIC_AUTH_ERROR =
  'No hemos podido completar la operación. Revisa los datos e inténtalo de nuevo.';

export const GENERIC_RESET_MESSAGE =
  'Si ese correo tiene una cuenta, te hemos enviado un enlace para restablecer la contraseña. Revisa también la carpeta de spam.';
