import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig, isProduction } from '@lib/config';
import { logger } from '@lib/observability/logger';
import { createMutex } from './mutex';

/**
 * Everything the public can submit: newsletter subscriptions, corrections,
 * tool submissions and contact messages.
 *
 * Newsletter uses **double opt-in**. A subscription is `pending` until the
 * emailed token is confirmed; nothing marketing-related is ever sent to a
 * pending address. Tokens are stored hashed — the raw value only exists inside
 * the confirmation email, so a database leak cannot be used to confirm
 * subscriptions on someone's behalf.
 */

let client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (!supabaseConfig.canUseServiceRole) return null;
  client ??= createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

const LOCAL_FILE = join(process.cwd(), '.data', 'inbox.json');

/**
 * Serialises the JSON-file path. Without it, two people subscribing at the same
 * moment during development lose one of the two records.
 */
const localLock = createMutex();

export interface NewsletterSubscription {
  id: string;
  email: string;
  status: 'pending' | 'confirmed' | 'unsubscribed';
  categories: string[];
  confirmTokenHash?: string;
  unsubscribeTokenHash: string;
  consentIpHash?: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface Correction {
  id: string;
  toolSlug: string;
  field: string;
  message: string;
  evidenceUrl?: string;
  email?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Submission {
  id: string;
  name: string;
  url: string;
  categorySlug?: string;
  notes: string;
  email?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

interface LocalInbox {
  newsletter: NewsletterSubscription[];
  corrections: Correction[];
  submissions: Submission[];
  contact: ContactMessage[];
}

const EMPTY: LocalInbox = { newsletter: [], corrections: [], submissions: [], contact: [] };

/**
 * One shared in-memory copy, loaded once under the lock.
 *
 * Returning a fresh object per read is what creates the lost-update window:
 * two callers mutate independent copies and the second write wins. Sharing the
 * object means concurrent mutations accumulate, and the lock makes the initial
 * load and every persist atomic.
 */
let cache: LocalInbox | null = null;

let loading: Promise<LocalInbox> | null = null;

/** Reads are lock-free against the shared object; the first load is de-duped. */
function readLocal(): Promise<LocalInbox> {
  if (isProduction) throw new Error('El almacén local está desactivado en producción.');
  if (cache) return Promise.resolve(cache);

  loading ??= readFile(LOCAL_FILE, 'utf8')
    .then((raw) => ({ ...EMPTY, ...(JSON.parse(raw) as LocalInbox) }))
    .catch(() => ({ ...EMPTY }))
    .then((inbox) => {
      cache = inbox;
      return inbox;
    });

  return loading;
}

function writeLocal(inbox: LocalInbox): Promise<void> {
  return localLock(async () => {
    if (isProduction) throw new Error('El almacén local está desactivado en producción.');
    cache = inbox;
    loading = Promise.resolve(inbox);
    await mkdir(join(process.cwd(), '.data'), { recursive: true });
    await writeFile(LOCAL_FILE, JSON.stringify(inbox, null, 2), 'utf8');
  });
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashIp(ip: string | undefined): string | undefined {
  return ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : undefined;
}

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

export interface SubscribeResult {
  ok: boolean;
  /** The raw confirm token, when a confirmation email should be sent. */
  confirmToken?: string;
  unsubscribeToken?: string;
  alreadyConfirmed?: boolean;
}

export async function subscribe(input: {
  email: string;
  categories: string[];
  ip?: string;
  userAgent?: string;
  source: string;
}): Promise<SubscribeResult> {
  const confirmToken = newToken();
  const unsubscribeToken = newToken();
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    const existing = inbox.newsletter.find((s) => s.email === input.email);

    if (existing?.status === 'confirmed') {
      return { ok: true, alreadyConfirmed: true, unsubscribeToken: undefined };
    }

    const record: NewsletterSubscription = {
      id: existing?.id ?? randomUUID(),
      email: input.email,
      status: 'pending',
      categories: input.categories,
      confirmTokenHash: hashToken(confirmToken),
      unsubscribeTokenHash: existing?.unsubscribeTokenHash ?? hashToken(unsubscribeToken),
      consentIpHash: hashIp(input.ip),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    inbox.newsletter = [...inbox.newsletter.filter((s) => s.email !== input.email), record];
    await writeLocal(inbox);
    return { ok: true, confirmToken, unsubscribeToken };
  }

  const { data: existing } = await supabaseClient
    .from('newsletter_subscriptions')
    .select('id, status')
    .eq('email', input.email)
    .maybeSingle();

  if (existing?.['status'] === 'confirmed') {
    return { ok: true, alreadyConfirmed: true };
  }

  const { error } = await supabaseClient.from('newsletter_subscriptions').upsert(
    {
      email: input.email,
      status: 'pending',
      categories: input.categories,
      confirm_token_hash: hashToken(confirmToken),
      confirm_sent_at: new Date().toISOString(),
      unsubscribe_token_hash: hashToken(unsubscribeToken),
      consent_ip_hash: hashIp(input.ip) ?? null,
      consent_user_agent: input.userAgent?.slice(0, 300) ?? null,
      source: input.source,
    },
    { onConflict: 'email' }
  );

  if (error) {
    logger.error('newsletter.subscribe_failed', { error: error.message });
    return { ok: false };
  }

  return { ok: true, confirmToken, unsubscribeToken };
}

export async function confirmSubscription(token: string): Promise<boolean> {
  const hash = hashToken(token);
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    const record = inbox.newsletter.find((s) => s.confirmTokenHash === hash);
    if (!record) return false;
    record.status = 'confirmed';
    record.confirmedAt = new Date().toISOString();
    delete record.confirmTokenHash;
    await writeLocal(inbox);
    return true;
  }

  const { data, error } = await supabaseClient
    .from('newsletter_subscriptions')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirm_token_hash: null,
    })
    .eq('confirm_token_hash', hash)
    .select('id');

  return !error && (data?.length ?? 0) > 0;
}

export async function unsubscribe(token: string): Promise<boolean> {
  const hash = hashToken(token);
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    const record = inbox.newsletter.find((s) => s.unsubscribeTokenHash === hash);
    if (!record) return false;
    record.status = 'unsubscribed';
    await writeLocal(inbox);
    return true;
  }

  const { data, error } = await supabaseClient
    .from('newsletter_subscriptions')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token_hash', hash)
    .select('id');

  return !error && (data?.length ?? 0) > 0;
}

export async function newsletterStats(): Promise<{ confirmed: number; pending: number; unsubscribed: number }> {
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    return {
      confirmed: inbox.newsletter.filter((s) => s.status === 'confirmed').length,
      pending: inbox.newsletter.filter((s) => s.status === 'pending').length,
      unsubscribed: inbox.newsletter.filter((s) => s.status === 'unsubscribed').length,
    };
  }

  const countFor = async (status: string): Promise<number> => {
    const { count } = await supabaseClient
      .from('newsletter_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    return count ?? 0;
  };

  const [confirmed, pending, unsubscribed] = await Promise.all([
    countFor('confirmed'),
    countFor('pending'),
    countFor('unsubscribed'),
  ]);

  return { confirmed, pending, unsubscribed };
}

// ---------------------------------------------------------------------------
// Corrections / submissions / contact
// ---------------------------------------------------------------------------

export async function addCorrection(
  input: Omit<Correction, 'id' | 'status' | 'createdAt'> & { userId?: string }
): Promise<boolean> {
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    inbox.corrections.push({
      ...input,
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    await writeLocal(inbox);
    return true;
  }

  const { error } = await supabaseClient.from('tool_corrections').insert({
    tool_id: `tool_${input.toolSlug}`,
    reported_by: input.userId ?? null,
    email: input.email ?? null,
    field: input.field,
    message: input.message,
    evidence_url: input.evidenceUrl ?? null,
  });

  if (error) logger.error('correction.insert_failed', { error: error.message });
  return !error;
}

export async function addSubmission(
  input: Omit<Submission, 'id' | 'status' | 'createdAt'> & { userId?: string }
): Promise<boolean> {
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    inbox.submissions.push({
      ...input,
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    await writeLocal(inbox);
    return true;
  }

  const { error } = await supabaseClient.from('tool_submissions').insert({
    submitted_by: input.userId ?? null,
    email: input.email ?? null,
    name: input.name,
    url: input.url,
    category_slug: input.categorySlug ?? null,
    notes: input.notes,
  });

  return !error;
}

export async function addContactMessage(
  input: Omit<ContactMessage, 'id' | 'createdAt'>
): Promise<boolean> {
  // Contact is not a database concern in either mode: it becomes an email to
  // the editorial address, plus a local copy in development.
  if (!isProduction) {
    const inbox = await readLocal();
    inbox.contact.push({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
    await writeLocal(inbox);
  }
  return true;
}

export async function pendingCounts(): Promise<{ corrections: number; submissions: number }> {
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    return {
      corrections: inbox.corrections.filter((c) => c.status === 'pending').length,
      submissions: inbox.submissions.filter((s) => s.status === 'pending').length,
    };
  }

  const [corrections, submissions] = await Promise.all([
    supabaseClient
      .from('tool_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseClient
      .from('tool_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  return { corrections: corrections.count ?? 0, submissions: submissions.count ?? 0 };
}

export async function listCorrections(limit = 50): Promise<Correction[]> {
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    return inbox.corrections.slice(-limit).reverse();
  }

  const { data } = await supabaseClient
    .from('tool_corrections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row['id'] as string,
    toolSlug: String(row['tool_id']).replace(/^tool_/, ''),
    field: (row['field'] as string) ?? '',
    message: row['message'] as string,
    evidenceUrl: (row['evidence_url'] as string | null) ?? undefined,
    email: (row['email'] as string | null) ?? undefined,
    status: row['status'] as Correction['status'],
    createdAt: row['created_at'] as string,
  }));
}

export async function listSubmissions(limit = 50): Promise<Submission[]> {
  const supabaseClient = db();

  if (!supabaseClient) {
    const inbox = await readLocal();
    return inbox.submissions.slice(-limit).reverse();
  }

  const { data } = await supabaseClient
    .from('tool_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row['id'] as string,
    name: row['name'] as string,
    url: row['url'] as string,
    categorySlug: (row['category_slug'] as string | null) ?? undefined,
    notes: (row['notes'] as string) ?? '',
    email: (row['email'] as string | null) ?? undefined,
    status: row['status'] as Submission['status'],
    createdAt: row['created_at'] as string,
  }));
}
