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
  /** Publicadas por la propia pasada, sin intervención. */
  published?: number;
  /** Verificadas y redactadas, pero que la puerta automática dejó para una persona. */
  heldForReview?: number;
  /**
   * Por qué se quedó cada una.
   *
   * La pregunta que hay que poder contestar cualquier mañana es «¿por qué hoy
   * cero?», y un recuento no la contesta. Cero es a menudo la respuesta
   * correcta —el listón no se baja para tener volumen—, pero cero por un
   * extractor roto y cero por falta de evidencia se parecen demasiado desde
   * fuera como para distinguirlos sin esto.
   *
   * No va a `newsroom_runs`: la tabla tiene sus columnas y no se amplía por
   * esto. Viaja en la respuesta del disparo y, resumido, en `notes`.
   */
  heldReasons?: Array<{ slug: string; reasons: string[] }>;
  /**
   * Fuentes que llevan semanas sin aportar un candidato.
   *
   * Una fuente no se rompe con un error: el fabricante cambia la ruta del feed
   * o rediseña el índice, la pasada sigue terminando en verde y sencillamente
   * deja de llegar material de ahí. Esto es lo que impide que eso pase
   * inadvertido durante meses.
   */
  idleSources?: Array<{ id: string; nombre: string; ultimaVez: string | null; motivo: string }>;
  /** Salidas de portada por edad o por sitio. Siguen publicadas y accesibles. */
  archived?: number;
  /** Historias que una noticia posterior ha dejado desactualizadas. */
  superseded?: number;
  errors: string[];
  status: 'ok' | 'partial' | 'failed';
  notes?: string;
}

/**
 * La frase que resume una pasada, que es lo que alguien lee por la mañana.
 *
 * Se separa del código que la produce porque es la única superficie por la que
 * se sabe qué hizo el sistema anoche, y una plantilla sin pruebas que resume un
 * proceso autónomo es justo donde se pierde el dato que importaba.
 */
export function resumirPasada(datos: {
  sources: number;
  errors: number;
  drafted: number;
  published: number;
  held: Array<{ slug: string; reasons: string[] }>;
  archived: number;
  superseded: number;
  /** Fuentes que llevan semanas sin aportar nada. */
  idle?: number;
}): string {
  const base =
    `${datos.sources} fuentes vigiladas, ${datos.errors} con incidencias, ` +
    `${datos.idle ? `${datos.idle} calladas semanas, ` : ''}` +
    `${datos.drafted} borradores redactados, ${datos.published} publicadas, ` +
    `${datos.held.length} a la espera de revisión, ${datos.archived} fuera de portada, ` +
    `${datos.superseded} superadas por una noticia posterior`;

  if (datos.held.length === 0) return base;

  /*
   * Sólo el primer motivo de cada historia: es el que la bloquea, y la lista
   * completa viaja en la respuesta del disparo. `notes` es una columna de
   * texto, no un registro estructurado, y llenarla entera la vuelve ilegible.
   */
  const retenidas = datos.held
    .map(({ slug, reasons }) => `${slug} (${reasons[0] ?? 'sin motivo'})`)
    .join('; ');

  return `${base}. Retenidas: ${retenidas}`;
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

/* ------------------------------------------------------------- pipeline -- */

/**
 * Las cuatro etapas que alimentan la mesa de edición.
 *
 * Estaban importadas como JSON estático, y ahí se rompía el circuito sin hacer
 * ruido: el cron escribía en Supabase y `/admin/noticias` seguía enseñando los
 * ficheros del repositorio. Todo funcionaba —la pasada diaria, el triaje, los
 * borradores— y nada de ello llegaba a la persona que tenía que aprobarlo.
 *
 * Con Supabase configurado se lee de Supabase. Sin él se leen los ficheros, que
 * es lo que permite ejecutar la mesa en un portátil sin credenciales y lo que
 * hace que la suite no necesite una base de datos.
 */
export interface PipelineSnapshot {
  inbox: Array<Record<string, unknown>>;
  triage: Array<Record<string, unknown>>;
  verification: Array<Record<string, unknown>>;
  drafts: Array<Record<string, unknown>>;
  from: 'supabase' | 'files';
}

function fileJson(relative: string): Array<Record<string, unknown>> {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), relative), 'utf-8'));
  } catch {
    return [];
  }
}

/** Las filas de Supabase vuelven a la forma que el dominio ya sabe leer. */
function toDraft(row: Record<string, unknown>): Record<string, unknown> {
  return {
    candidateId: row.candidate_id,
    id: row.news_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    impact: row.impact,
    category: row.category,
    eventType: row.event_type,
    availability: row.availability,
    affectsFreePlan: row.affects_free_plan,
    relatedTools: row.related_tools ?? [],
    officialUrl: row.official_url,
    sources: row.sources ?? [],
    factTrace: row.fact_trace ?? {},
    status: row.status ?? 'draft',
  };
}

function toVerification(row: Record<string, unknown>): Record<string, unknown> {
  return {
    candidateId: row.candidate_id,
    decision: row.decision,
    primarySources: row.primary_sources ?? [],
    verifiedFacts: row.verified_facts ?? [],
    unconfirmed: row.unconfirmed ?? [],
    eventType: row.event_type,
    availability: row.availability,
    affectsFreePlan: row.affects_free_plan,
    verificationNotes: row.verification_notes ?? '',
    checkedAt: row.checked_at,
  };
}

function toTriage(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.candidate_id,
    triageDecision: row.decision,
    triageScore: row.score,
    triageReasons: row.reasons ?? [],
    vertical: row.vertical,
    eventClass: row.event_class,
    product: row.product,
    radarStatus: row.radar_status,
    radarReason: row.radar_reason,
    overturnedRadar: row.overturned_radar ?? false,
    triagedAt: row.triaged_at,
    title: row.title,
    publisher: row.publisher,
    publishedAt: row.published_at,
    canonicalUrl: row.canonical_url,
  };
}

export async function readPipeline(): Promise<PipelineSnapshot> {
  const supabase = db();

  if (!supabase) {
    return {
      inbox: fileJson('src/data/news/inbox.json'),
      triage: fileJson('src/data/news/triage.json'),
      verification: fileJson('src/data/news/verification.json'),
      drafts: fileJson('src/data/news/drafts.json'),
      from: 'files',
    };
  }

  /*
   * El triaje se lee unido a su candidato porque la mesa necesita el titular,
   * el fabricante y la fecha, y esos viven en `newsroom_candidates`. Sin la
   * unión, cada historia aparecería sin nada con lo que reconocerla.
   */
  const [inbox, triage, verification, drafts] = await Promise.all([
    supabase.from('newsroom_candidates').select('*'),
    supabase
      .from('newsroom_triage')
      .select('*, newsroom_candidates(title, publisher, published_at, canonical_url)'),
    supabase.from('newsroom_verification').select('*'),
    supabase.from('newsroom_drafts').select('*'),
  ]);

  for (const [nombre, resultado] of [
    ['candidatos', inbox],
    ['triaje', triage],
    ['verificación', verification],
    ['borradores', drafts],
  ] as const) {
    if (resultado.error) {
      logger.error('newsroom.pipeline_read_failed', { stage: nombre, error: resultado.error.message });
      throw new Error(`No se ha podido leer ${nombre}: ${resultado.error.message}`);
    }
  }

  return {
    inbox: (inbox.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      canonicalUrl: row.canonical_url,
      publisher: row.publisher,
      observedAt: row.observed_at,
      publishedAt: row.published_at,
      discoveredVia: row.discovered_via,
      vertical: row.vertical,
      status: row.status,
      reason: row.reason,
    })),
    triage: (triage.data ?? []).map((row) => {
      const c = (row as Record<string, unknown>).newsroom_candidates as Record<string, unknown> | null;
      return toTriage({ ...row, ...(c ?? {}) });
    }),
    verification: (verification.data ?? []).map(toVerification),
    drafts: (drafts.data ?? []).map(toDraft),
    from: 'supabase',
  };
}
