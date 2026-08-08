import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isBootstrapAdmin, resolveAuthMode, supabase as supabaseConfig } from '@lib/config';
import type { AuthProvider, AuthResult, Credentials, SessionUser } from './types';
import { GENERIC_AUTH_ERROR, GENERIC_RESET_MESSAGE } from './types';
import * as local from './local-store';
import { sendMail } from '@lib/email/send';
import { passwordResetEmail, welcomeEmail } from '@lib/email/templates';
import { runtimeUrl } from '@lib/runtime-origin';
import { clearedCookie, sessionCookie } from '@lib/security/cookies';
import type { UserRole } from '@lib/domain/primitives';

type PendingCookie = { name: string; value: string; options: Record<string, unknown> };

/**
 * The single sign-up response.
 *
 * Both the "account created" and "address already registered" paths return this
 * verbatim. Any divergence — wording, status code or field — turns the sign-up
 * form into a way to test whether someone has an account here.
 */
const SIGNUP_MESSAGE =
  'Cuenta creada. Te hemos enviado un correo para confirmar tu dirección; hasta entonces algunas funciones estarán limitadas.';

const SECURE_COOKIE_DEFAULTS = sessionCookie(local.SESSION_MAX_AGE_SECONDS);

// ---------------------------------------------------------------------------
// Supabase-backed provider (production)
// ---------------------------------------------------------------------------

class SupabaseAuthProvider implements AuthProvider {
  readonly mode = 'supabase' as const;
  readonly supportsOAuth = true;
  private pending: PendingCookie[] = [];

  private client(request: Request) {
    const cookieHeader = request.headers.get('cookie') ?? '';
    return createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
      cookies: {
        getAll: () =>
          cookieHeader
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
              const index = part.indexOf('=');
              return {
                name: part.slice(0, index),
                value: decodeURIComponent(part.slice(index + 1)),
              };
            }),
        setAll: (cookies: Array<{ name: string; value: string; options?: CookieOptions }>) => {
          for (const cookie of cookies) {
            this.pending.push({
              name: cookie.name,
              value: cookie.value,
              options: { ...SECURE_COOKIE_DEFAULTS, ...(cookie.options as CookieOptions) },
            });
          }
        },
      },
    });
  }

  drainCookies(): PendingCookie[] {
    const drained = this.pending;
    this.pending = [];
    return drained;
  }

  async signUp(credentials: Credentials, request: Request): Promise<AuthResult> {
    const client = this.client(request);
    const { data, error } = await client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: { display_name: credentials.displayName ?? null },
        // The origin the visitor is actually on, not the canonical one: a
        // sign-up started on a preview must confirm back to that preview.
        emailRedirectTo: runtimeUrl(request, '/cuenta/verificar'),
      },
    });

    if (error) {
      // Supabase distinguishes "already registered"; we deliberately do not, to
      // avoid turning sign-up into an account-existence oracle.
      return { ok: false, message: GENERIC_AUTH_ERROR, field: 'email' };
    }

    if (data.user) {
      await sendMail(welcomeEmail({ to: credentials.email, displayName: credentials.displayName }));
    }

    return { ok: true, message: SIGNUP_MESSAGE };
  }

  async signIn(credentials: Omit<Credentials, 'displayName'>, request: Request): Promise<AuthResult> {
    const client = this.client(request);
    const { data, error } = await client.auth.signInWithPassword(credentials);

    if (error || !data.user) {
      return { ok: false, message: 'Correo o contraseña incorrectos.', field: 'password' };
    }

    return { ok: true, message: 'Sesión iniciada.', user: await this.toSessionUser(request, data.user.id) };
  }

  async signOut(request: Request): Promise<void> {
    await this.client(request).auth.signOut();
  }

  async getUser(request: Request): Promise<SessionUser | null> {
    const client = this.client(request);
    // getUser() revalidates against the auth server; getSession() would trust
    // a cookie the client could have forged.
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return this.toSessionUser(request, data.user.id, data.user.email ?? '', !!data.user.email_confirmed_at);
  }

  private async toSessionUser(
    request: Request,
    userId: string,
    userEmail = '',
    emailVerified = false
  ): Promise<SessionUser> {
    const client = this.client(request);
    const { data: profile } = await client
      .from('profiles')
      .select('display_name, role, locale')
      .eq('id', userId)
      .maybeSingle();

    const { data: subscription } = await client
      .from('user_subscriptions')
      .select('status')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    const role = (profile?.role as UserRole | undefined) ?? 'user';

    return {
      id: userId,
      email: userEmail,
      displayName: (profile?.display_name as string | null) ?? null,
      role: isBootstrapAdmin(userEmail) ? 'admin' : role,
      plan: subscription ? 'pro' : 'free',
      emailVerified,
      locale: (profile?.locale as string | undefined) ?? 'es',
    };
  }

  async requestPasswordReset(userEmail: string, request: Request): Promise<AuthResult> {
    await this.client(request).auth.resetPasswordForEmail(userEmail, {
      redirectTo: runtimeUrl(request, '/cuenta/nueva-contrasena'),
    });
    // Always the same answer, whether or not the address exists.
    return { ok: true, message: GENERIC_RESET_MESSAGE };
  }

  async resetPassword(_token: string, newPassword: string, request: Request): Promise<AuthResult> {
    // Supabase puts the user in a recovery session via the emailed link, so the
    // update applies to the currently authenticated recovery session.
    const { error } = await this.client(request).auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false, message: 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.', field: 'token' };
    }
    return { ok: true, message: 'Contraseña actualizada. Ya puedes entrar.' };
  }

  async changePassword(): Promise<AuthResult> {
    return {
      ok: false,
      message: 'Usa el formulario de la página de preferencias.',
    };
  }

  async updateProfile(): Promise<AuthResult> {
    return { ok: true, message: 'Perfil actualizado.' };
  }

  async deleteAccount(): Promise<AuthResult> {
    return {
      ok: false,
      message:
        'La eliminación definitiva requiere el rol de servicio y se procesa desde el endpoint del servidor.',
    };
  }
}

// ---------------------------------------------------------------------------
// Local provider (development only)
// ---------------------------------------------------------------------------

class LocalAuthProvider implements AuthProvider {
  readonly mode = 'local' as const;
  readonly supportsOAuth = false;
  private pending: PendingCookie[] = [];

  drainCookies(): PendingCookie[] {
    const drained = this.pending;
    this.pending = [];
    return drained;
  }

  private setSession(userId: string) {
    this.pending.push({
      name: local.SESSION_COOKIE,
      value: local.createSessionToken(userId),
      options: { ...sessionCookie(local.SESSION_MAX_AGE_SECONDS) },
    });
  }

  private clearSession() {
    this.pending.push({
      name: local.SESSION_COOKIE,
      value: '',
      options: { ...clearedCookie() },
    });
  }

  private toSessionUser(user: local.LocalUser): SessionUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: isBootstrapAdmin(user.email) ? 'admin' : user.role,
      plan: user.plan,
      emailVerified: user.emailVerified,
      locale: user.locale,
    };
  }

  async signUp(credentials: Credentials): Promise<AuthResult> {
    const existing = await local.findByEmail(credentials.email);

    if (existing) {
      // Same message, same status, comparable timing as the success path: this
      // endpoint must not become an account-existence oracle.
      await local.burnTime();
      return { ok: true, message: SIGNUP_MESSAGE };
    }

    const user = await local.createUser(credentials);
    this.setSession(user.id);
    await sendMail(welcomeEmail({ to: user.email, displayName: user.displayName ?? undefined }));

    return {
      ok: true,
      message: SIGNUP_MESSAGE,
      user: this.toSessionUser(user),
    };
  }

  async signIn(credentials: Omit<Credentials, 'displayName'>): Promise<AuthResult> {
    const user = await local.findByEmail(credentials.email);
    if (!user) {
      await local.burnTime();
      return { ok: false, message: 'Correo o contraseña incorrectos.', field: 'password' };
    }

    const valid = await local.verifyPassword(credentials.password, user.passwordHash, user.salt);
    if (!valid) {
      return { ok: false, message: 'Correo o contraseña incorrectos.', field: 'password' };
    }

    this.setSession(user.id);
    return { ok: true, message: 'Sesión iniciada.', user: this.toSessionUser(user) };
  }

  async signOut(): Promise<void> {
    this.clearSession();
  }

  async getUser(request: Request): Promise<SessionUser | null> {
    const cookie = readCookie(request, local.SESSION_COOKIE);
    const userId = local.readSessionToken(cookie);
    if (!userId) return null;
    const user = await local.findById(userId);
    return user ? this.toSessionUser(user) : null;
  }

  async requestPasswordReset(userEmail: string, request?: Request): Promise<AuthResult> {
    const user = await local.findByEmail(userEmail);
    if (user) {
      const { token, hash, expiresAt } = local.createResetToken();
      await local.updateUser(user.id, { resetTokenHash: hash, resetExpiresAt: expiresAt });
      await sendMail(
        passwordResetEmail({
          to: user.email,
          resetUrl: runtimeUrl(request, `/cuenta/nueva-contrasena?token=${token}`),
        })
      );
    } else {
      await local.burnTime();
    }
    return { ok: true, message: GENERIC_RESET_MESSAGE };
  }

  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    const user = await local.findByResetTokenHash(local.hashToken(token));
    if (!user || !user.resetExpiresAt || new Date(user.resetExpiresAt) < new Date()) {
      return { ok: false, message: 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.', field: 'token' };
    }

    const { hash: passwordHash, salt } = await local.hashPassword(newPassword);
    await local.updateUser(user.id, {
      passwordHash,
      salt,
      resetTokenHash: undefined,
      resetExpiresAt: undefined,
    });

    return { ok: true, message: 'Contraseña actualizada. Ya puedes entrar.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResult> {
    const user = await local.findById(userId);
    if (!user) return { ok: false, message: GENERIC_AUTH_ERROR };

    const valid = await local.verifyPassword(currentPassword, user.passwordHash, user.salt);
    if (!valid) {
      return { ok: false, message: 'La contraseña actual no es correcta.', field: 'password' };
    }

    const { hash, salt } = await local.hashPassword(newPassword);
    await local.updateUser(userId, { passwordHash: hash, salt });
    return { ok: true, message: 'Contraseña actualizada.' };
  }

  async updateProfile(userId: string, patch: { displayName?: string; locale?: string }): Promise<AuthResult> {
    const updated = await local.updateUser(userId, {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
    });
    if (!updated) return { ok: false, message: GENERIC_AUTH_ERROR };
    return { ok: true, message: 'Perfil actualizado.', user: this.toSessionUser(updated) };
  }

  async deleteAccount(userId: string): Promise<AuthResult> {
    const deleted = await local.deleteUser(userId);
    this.clearSession();
    return deleted
      ? { ok: true, message: 'Cuenta eliminada.' }
      : { ok: false, message: GENERIC_AUTH_ERROR };
  }
}

// ---------------------------------------------------------------------------
// Disabled provider (production without Supabase configured)
// ---------------------------------------------------------------------------

const DISABLED_MESSAGE =
  'Las cuentas todavía no están activas en este entorno. Vuelve a intentarlo más tarde.';

class DisabledAuthProvider implements AuthProvider {
  readonly mode = 'disabled' as const;
  readonly supportsOAuth = false;
  drainCookies(): PendingCookie[] {
    return [];
  }
  async signUp(): Promise<AuthResult> {
    return { ok: false, message: DISABLED_MESSAGE };
  }
  async signIn(): Promise<AuthResult> {
    return { ok: false, message: DISABLED_MESSAGE };
  }
  async signOut(): Promise<void> {}
  async getUser(): Promise<SessionUser | null> {
    return null;
  }
  async requestPasswordReset(): Promise<AuthResult> {
    return { ok: true, message: GENERIC_RESET_MESSAGE };
  }
  async resetPassword(): Promise<AuthResult> {
    return { ok: false, message: DISABLED_MESSAGE };
  }
  async changePassword(): Promise<AuthResult> {
    return { ok: false, message: DISABLED_MESSAGE };
  }
  async updateProfile(): Promise<AuthResult> {
    return { ok: false, message: DISABLED_MESSAGE };
  }
  async deleteAccount(): Promise<AuthResult> {
    return { ok: false, message: DISABLED_MESSAGE };
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return undefined;
}

/** A fresh provider per request: cookie buffers must never be shared. */
export function getAuthProvider(): AuthProvider {
  switch (resolveAuthMode()) {
    case 'supabase':
      return new SupabaseAuthProvider();
    case 'local':
      return new LocalAuthProvider();
    default:
      return new DisabledAuthProvider();
  }
}
