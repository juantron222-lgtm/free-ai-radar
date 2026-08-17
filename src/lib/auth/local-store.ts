import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHmac,
  randomUUID,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isProduction } from '@lib/config';
import { createMutex } from '@lib/data/mutex';
import { dataFile } from '@lib/data/data-dir';
import type { UserRole } from '@lib/domain/primitives';

/**
 * ============================================================================
 *  DEVELOPMENT-ONLY IDENTITY STORE — NOT A PRODUCTION AUTH SYSTEM
 * ============================================================================
 *
 * Production authentication is Supabase Auth. Full stop. This file exists so
 * that `npm run dev` and the Playwright suite can exercise sign-up, sign-in,
 * password reset and account deletion **without any external credentials**,
 * which is a hard requirement for this repository.
 *
 * It refuses to initialise when `import.meta.env.PROD` is true, so it cannot
 * become the auth system by accident. It uses Node's `scrypt` with per-user
 * salts and `timingSafeEqual`, and HMAC-signed opaque session tokens — not
 * because that is a substitute for a real identity provider, but because a
 * development stub that stores plaintext passwords is a bad habit that leaks
 * into real systems.
 *
 * Data lives in `dev-users.json` under the local data directory (`.data/` by
 * default, gitignored). See `@lib/data/data-dir`.
 *
 * See `docs/technical-decisions.md` § "Autenticación en local".
 */

/**
 * `promisify` picks the 3-argument scrypt overload, so the options object needs
 * an explicit signature to survive strict typing.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>;

const USERS_FILE = dataFile('dev-users.json');

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export const SESSION_COOKIE = 'far_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface LocalUser {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string;
  salt: string;
  role: UserRole;
  plan: 'free' | 'pro';
  emailVerified: boolean;
  locale: string;
  createdAt: string;
  resetTokenHash?: string;
  resetExpiresAt?: string;
  verifyTokenHash?: string;
}

interface Store {
  users: LocalUser[];
}

function assertDevelopment(): void {
  if (isProduction) {
    throw new Error(
      'El almacén de usuarios local está desactivado en producción. Configura Supabase (PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY).'
    );
  }
}

let cache: Store | null = null;

/**
 * Only *writes* are serialised.
 *
 * Putting reads through the same lock made every request queue behind an
 * in-flight scrypt, which is deliberately slow — the suite went from seconds to
 * minutes and started timing out. Reads share the one in-memory object, so they
 * are consistent without a lock; the initial load is de-duplicated by caching
 * the promise rather than the result, so concurrent first calls cannot each
 * build their own store.
 */
const exclusive = createMutex();

let loading: Promise<Store> | null = null;

function loadUnsafe(): Promise<Store> {
  assertDevelopment();
  if (cache) return Promise.resolve(cache);

  loading ??= readFile(USERS_FILE, 'utf8')
    .then((raw) => JSON.parse(raw) as Store)
    .catch(() => ({ users: [] }) as Store)
    .then((store) => {
      cache = store;
      return store;
    });

  return loading;
}

async function persistUnsafe(store: Store): Promise<void> {
  assertDevelopment();
  cache = store;
  loading = Promise.resolve(store);
  await mkdir(dirname(USERS_FILE), { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt ?? randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, useSalt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return { hash: derived.toString('hex'), salt: useSalt };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string
): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Constant-time-ish dummy verification.
 *
 * Called when the email does not exist so that "unknown user" and "wrong
 * password" take comparable time, closing the timing side-channel that would
 * otherwise let an attacker enumerate accounts.
 */
export async function burnTime(): Promise<void> {
  await hashPassword('not-a-real-password-value', 'ffffffffffffffffffffffffffffffff');
}

// ---------------------------------------------------------------------------
// Session tokens (opaque + HMAC signature)
// ---------------------------------------------------------------------------

function signingKey(): string {
  // A fixed development key is acceptable *because* this never runs in prod.
  return process.env['AUTH_SECRET'] || 'free-ai-radar-development-only-key';
}

export function createSessionToken(userId: string): string {
  const payload = `${userId}.${Date.now() + SESSION_MAX_AGE_SECONDS * 1000}`;
  const signature = createHmac('sha256', signingKey()).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = createHmac('sha256', signingKey()).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [userId, expiresAt] = payload.split('.');
  if (!userId || !expiresAt) return null;
  if (Number(expiresAt) < Date.now()) return null;
  return userId;
}

export function hashToken(token: string): string {
  return createHmac('sha256', signingKey()).update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Runs a lookup, and retries once from disk if it finds nothing.
 *
 * The reason is specific to development. Vite's HMR can hand two parts of the
 * same request — the middleware and the endpoint it wraps — separate instances
 * of this module, each with its own `cache`. Sign-up then writes a user into
 * one instance while the other keeps serving a snapshot taken before it
 * existed, so the session cookie is valid and the user is nowhere to be found.
 * That surfaced as twelve failing account tests and a bug that did not exist.
 *
 * Re-reading on a miss makes a stale cache self-healing. It costs one file
 * read in the only case that was already going to fail, and nothing at all on
 * the happy path. None of this reaches production, where Supabase owns
 * identity and this module refuses to load at all.
 */
async function lookup(match: (user: LocalUser) => boolean): Promise<LocalUser | undefined> {
  const hit = (await loadUnsafe()).users.find(match);
  if (hit) return hit;

  cache = null;
  loading = null;
  return (await loadUnsafe()).users.find(match);
}

export async function findByEmail(userEmail: string): Promise<LocalUser | undefined> {
  const email = userEmail.toLowerCase();
  return lookup((u) => u.email === email);
}

export async function findById(id: string): Promise<LocalUser | undefined> {
  return lookup((u) => u.id === id);
}

export async function findByResetTokenHash(hash: string): Promise<LocalUser | undefined> {
  return lookup((u) => u.resetTokenHash === hash);
}

export function createUser(input: {
  email: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}): Promise<LocalUser> {
  return exclusive(async () => {
    const store = await loadUnsafe();
    const { hash, salt } = await hashPassword(input.password);

    const user: LocalUser = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      displayName: input.displayName ?? null,
      passwordHash: hash,
      salt,
      role: input.role ?? 'user',
      plan: 'free',
      // Local mode skips the mail round-trip; the flow itself is still
      // exercised by the verification endpoint and its tests.
      emailVerified: true,
      locale: 'es',
      createdAt: new Date().toISOString(),
    };

    store.users.push(user);
    await persistUnsafe(store);
    return user;
  });
}

export function updateUser(id: string, patch: Partial<LocalUser>): Promise<LocalUser | undefined> {
  return exclusive(async () => {
    const store = await loadUnsafe();
    const index = store.users.findIndex((u) => u.id === id);
    if (index === -1) return undefined;
    store.users[index] = { ...store.users[index]!, ...patch, id };
    await persistUnsafe(store);
    return store.users[index];
  });
}

export function deleteUser(id: string): Promise<boolean> {
  return exclusive(async () => {
    const store = await loadUnsafe();
    const next = store.users.filter((u) => u.id !== id);
    if (next.length === store.users.length) return false;
    await persistUnsafe({ users: next });
    return true;
  });
}

export function createResetToken(): { token: string; hash: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}
