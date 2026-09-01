import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig } from '@lib/config';
import { logger } from '@lib/observability/logger';
import { NewsItem } from '@lib/domain/news';
import { DecisionLog, type DecisionRecord } from '@lib/domain/newsroom';

/**
 * Where the newsroom keeps its state.
 *
 * Two backends behind one interface, chosen by whether a service role is
 * configured. On Vercel that is Supabase, because the filesystem there is
 * ephemeral and an approval written to disk would not survive the next cold
 * start. On a laptop with no credentials it is the JSON files, so the pipeline
 * still runs offline and the test suite does not need a database.
 *
 * The fallback is deliberate and it is also the dangerous part: silently
 * reading files when Supabase was *meant* to answer would look like a working
 * newsroom with nothing in it. So the choice is made once, reported by
 * `backend()`, and the sync script refuses to build when Supabase is
 * configured but unreachable.
 */

let client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (!supabaseConfig.canUseServiceRole) return null;
  client ??= createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function backend(): 'supabase' | 'files' {
  return db() ? 'supabase' : 'files';
}

const NEWS_PATH = resolve(process.cwd(), 'src/data/news/news.json');
const DECISIONS_PATH = resolve(process.cwd(), 'src/data/news/decisions.json');

/* ----------------------------------------------------------- decisiones -- */

export async function readDecisions(): Promise<DecisionRecord[]> {
  const supabase = db();

  if (supabase) {
    const { data, error } = await supabase
      .from('newsroom_decisions')
      .select('slug, action, actor, note, decided_at')
      .order('decided_at', { ascending: true });

    if (error) {
      logger.error('newsroom.decisions_read_failed', { error: error.message });
      throw new Error(`No se ha podido leer el historial de decisiones: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      slug: row.slug as string,
      action: row.action as DecisionRecord['action'],
      actor: row.actor as string,
      at: new Date(row.decided_at as string).toISOString(),
      note: (row.note as string) ?? '',
    }));
  }

  try {
    return DecisionLog.parse(JSON.parse(readFileSync(DECISIONS_PATH, 'utf-8')));
  } catch {
    return [];
  }
}

export async function appendDecision(entry: DecisionRecord): Promise<void> {
  const supabase = db();

  if (supabase) {
    const { error } = await supabase.from('newsroom_decisions').insert({
      slug: entry.slug,
      action: entry.action,
      actor: entry.actor,
      note: entry.note,
      decided_at: entry.at,
    });

    if (error) throw new Error(`No se ha podido registrar la decisión: ${error.message}`);
    return;
  }

  const log = [...(await readDecisions()), entry];
  writeFileSync(DECISIONS_PATH, `${JSON.stringify(DecisionLog.parse(log), null, 2)}\n`, 'utf-8');
}

/* ----------------------------------------------------------- publicadas -- */

/** The seed: the items that predate the database and stay in the repository. */
export function readSeed(): NewsItem[] {
  return NewsItem.array().parse(JSON.parse(readFileSync(NEWS_PATH, 'utf-8')));
}

/**
 * Approved items, revalidated on the way out.
 *
 * A row could have been written by an older build, or edited by someone with
 * database access. Parsing it through the same schema the site enforces means
 * a bad row fails here — loudly, during the build — instead of reaching a
 * reader as confident prose.
 */
export async function readApproved(): Promise<NewsItem[]> {
  const supabase = db();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('newsroom_published')
    .select('slug, item')
    .order('approved_at', { ascending: true });

  if (error) throw new Error(`No se han podido leer las noticias aprobadas: ${error.message}`);

  const items: NewsItem[] = [];
  const broken: string[] = [];

  for (const row of data ?? []) {
    const parsed = NewsItem.safeParse(row.item);
    if (parsed.success) items.push(parsed.data);
    else broken.push(`${row.slug}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  if (broken.length) {
    throw new Error(`Hay noticias aprobadas que ya no cumplen el esquema:\n${broken.join('\n')}`);
  }

  return items;
}

/**
 * Record an approval.
 *
 * Idempotent at the database, not in the caller: `slug` is the primary key and
 * the insert ignores a conflict. A double click, a retried request or two
 * editors pressing at once all produce one row, and the first one wins — what
 * readers have already seen is never rewritten.
 */
export async function publishItem(
  item: NewsItem,
  actor: string
): Promise<{ added: boolean; backend: 'supabase' | 'files' }> {
  const supabase = db();

  if (!supabase) {
    /* Local development: the JSON file remains the store, as before. */
    const existing = readSeed();
    if (existing.some((published) => published.slug === item.slug)) {
      return { added: false, backend: 'files' };
    }
    const items = [...existing, item].sort(
      (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug)
    );
    writeFileSync(NEWS_PATH, `${JSON.stringify(items, null, 2)}\n`, 'utf-8');
    return { added: true, backend: 'files' };
  }

  const { data, error } = await supabase
    .from('newsroom_published')
    .upsert(
      { slug: item.slug, news_id: item.id, item, approved_by: actor },
      { onConflict: 'slug', ignoreDuplicates: true }
    )
    .select('slug');

  if (error) throw new Error(`No se ha podido publicar: ${error.message}`);

  return { added: (data ?? []).length > 0, backend: 'supabase' };
}

/* ------------------------------------------------------------ ejecución -- */

export interface RunReport {
  found: number;
  ingested: number;
  duplicates: number;
  triaged: number;
  verified: number;
  blocked: number;
  pending: number;
  errors: string[];
  status: 'ok' | 'partial' | 'failed';
  notes?: string;
}

/**
 * Persist the daily report.
 *
 * Requirement 10 asks for a report of every run; storing it rather than
 * printing it is what makes "did the radar run last night, and did anything
 * fail?" answerable without reading logs.
 */
export async function recordRun(
  report: RunReport,
  trigger: 'cron' | 'manual'
): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('newsroom_runs')
    .insert({
      trigger,
      status: report.status,
      found: report.found,
      ingested: report.ingested,
      duplicates: report.duplicates,
      triaged: report.triaged,
      verified: report.verified,
      blocked: report.blocked,
      pending: report.pending,
      errors: report.errors,
      notes: report.notes ?? '',
      finished_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    logger.error('newsroom.run_record_failed', { error: error.message });
    return null;
  }

  return (data?.id as string) ?? null;
}

export async function lastRun(): Promise<Record<string, unknown> | null> {
  const supabase = db();
  if (!supabase) return null;

  const { data } = await supabase
    .from('newsroom_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Record<string, unknown>) ?? null;
}
