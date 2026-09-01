import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig } from '@lib/config';
import { logger } from '@lib/observability/logger';
import { recordRun, type RunReport } from '@lib/data/newsroom-store';
import { fetchSource } from '../../../scripts/source-adapters.mjs';
import { runRadar } from '../../../scripts/radar/inbox.mjs';
import type { InboxCandidateShape } from '../../../scripts/radar/inbox.d.mts';
import { runTriage } from '../../../scripts/triage/triage.mjs';
import { verifyCandidate } from '../../../scripts/verify/autoverify.mjs';
import { draftFromVerification } from '../../../scripts/draft/autodraft.mjs';

/**
 * La pasada diaria.
 *
 * Descubre, deduplica, tría e intenta verificar. **No redacta y no publica.**
 *
 * Esa frontera es el punto entero del sistema y conviene decir por qué está
 * donde está. Verificar, tal y como lo define este proyecto, es leer la página
 * del fabricante y extraer de ella afirmaciones citables: una fecha que aparece
 * en la propia página, un precio copiado literal, una frase que demuestre que
 * algo está disponible. Un cron puede comprobar que esa página existe, que
 * responde y que pertenece al dominio del fabricante. No puede leerla.
 *
 * Así que lo que hace aquí la etapa de verificación es lo mecánico —
 * accesibilidad y titularidad — y marca `insufficient` todo lo demás, con el
 * motivo. Fabricar prosa con `factTrace` automáticamente sería justo lo que la
 * restricción prohíbe: bajar el estándar de evidencia para tener más noticias.
 *
 * El resultado de una noche es una mesa con candidatos triados, con su fuente
 * localizada y comprobada, y con lo que falta dicho en voz alta.
 */

let client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (!supabaseConfig.canUseServiceRole) return null;
  client ??= createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

interface Source {
  id: string;
  name: string;
  enabled?: boolean;
  [key: string]: unknown;
}

function loadSources(): Source[] {
  const path = resolve(process.cwd(), 'src/data/news-sources.json');
  return (JSON.parse(readFileSync(path, 'utf-8')) as Source[]).filter((s) => s.enabled);
}

function loadNewsSeed(): unknown[] {
  const path = resolve(process.cwd(), 'src/data/news/news.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as unknown[];
}

/** Candidatos ya conocidos, para que el radar no los reproponga. */
async function existingCandidates(supabase: SupabaseClient): Promise<InboxCandidateShape[]> {
  const { data, error } = await supabase
    .from('newsroom_candidates')
    .select('id, title, url, canonical_url, publisher, observed_at, published_at, discovered_via, vertical, status, reason');

  if (error) throw new Error(`No se ha podido leer el inbox: ${error.message}`);

  return (data ?? []).map((row) => ({
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
  })) as InboxCandidateShape[];
}

/**
 * Descarga una página para poder leerla.
 *
 * Se separa de la verificación a propósito: así el verificador es puro y las
 * pruebas pueden ejercitar un 403, un muro de login o un esqueleto de
 * JavaScript sin salir a la red.
 */
async function fetchPage(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'FreeAIRadar-Newsroom/1.0 (+https://www.freeairadar.com)',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  });

  return {
    ok: response.ok,
    status: response.status,
    body: response.ok ? await response.text() : '',
  };
}

export interface DailyOptions {
  trigger: 'cron' | 'manual';
  /** Tope de verificaciones por pasada: cada una es una petición de red. */
  probeLimit?: number;
}

/**
 * Ejecuta la pasada y devuelve el informe.
 *
 * Ninguna fuente caída detiene el resto: cada fallo se anota y se sigue. Una
 * pasada que aborta a la primera fuente rota es una pasada que no encuentra
 * nada la mitad de las noches.
 */
export async function runDailyNewsroom(options: DailyOptions): Promise<RunReport> {
  const supabase = db();
  const errors: string[] = [];

  if (!supabase) {
    return {
      found: 0,
      ingested: 0,
      duplicates: 0,
      triaged: 0,
      verified: 0,
      blocked: 0,
      pending: 0,
      errors: ['Supabase no está configurado: la pasada diaria necesita persistencia'],
      status: 'failed',
    };
  }

  const sources = loadSources();
  const rows: Record<string, unknown>[] = [];

  for (const source of sources) {
    try {
      const result = await fetchSource(source, { timeoutMs: 10_000 });
      for (const item of result.items ?? []) {
        rows.push({
          sourceId: source.id,
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt ?? null,
        });
      }
      if (!result.reachable) errors.push(`${source.name}: ${result.reason ?? 'no accesible'}`);
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const observedAt = new Date().toISOString().slice(0, 10);
  const existing = await existingCandidates(supabase);

  const { inbox, added } = runRadar({
    rows,
    sources,
    newsItems: loadNewsSeed(),
    existing,
    observedAt,
  });

  /*
   * La deduplicación real la hace la restricción `unique` sobre canonical_url.
   * `ignoreDuplicates` convierte una colisión en un no-evento en lugar de un
   * error, que es lo que permite que dos pasadas seguidas sean idempotentes
   * aunque el radar vuelva a ver los mismos titulares.
   */
  let ingested = 0;
  if (added.length > 0) {
    const { data, error } = await supabase
      .from('newsroom_candidates')
      .upsert(
        added.map((c) => ({
          id: c.id,
          title: c.title,
          url: c.url,
          canonical_url: c.canonicalUrl,
          publisher: c.publisher,
          observed_at: c.observedAt,
          published_at: c.publishedAt,
          discovered_via: c.discoveredVia,
          vertical: c.vertical,
          status: c.status,
          reason: c.reason,
        })),
        { onConflict: 'canonical_url', ignoreDuplicates: true }
      )
      .select('id');

    if (error) errors.push(`inserción de candidatos: ${error.message}`);
    else ingested = (data ?? []).length;
  }

  const duplicates = added.length - ingested;

  /* Triaje sobre el inbox completo: una historia vieja puede subir de nota. */
  const triageRecords = runTriage({ inbox, triagedAt: observedAt });

  if (triageRecords.length > 0) {
    const { error } = await supabase.from('newsroom_triage').upsert(
      triageRecords.map((r) => ({
        candidate_id: r.id,
        decision: r.triageDecision,
        score: r.triageScore,
        reasons: r.triageReasons,
        vertical: r.vertical,
        event_class: r.eventClass,
        product: r.product,
        radar_status: r.radarStatus,
        radar_reason: r.radarReason,
        overturned_radar: r.overturnedRadar,
        triaged_at: r.triagedAt,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'candidate_id' }
    );

    if (error) errors.push(`triaje: ${error.message}`);
  }

  /* Verificación mecánica de los promovidos que aún no tienen veredicto. */
  const promoted = triageRecords.filter(
    (r) => r.triageDecision === 'promote'
  );

  const { data: yaVerificados } = await supabase
    .from('newsroom_verification')
    .select('candidate_id');
  const verificados = new Set((yaVerificados ?? []).map((r) => r.candidate_id as string));

  const pendientes = promoted
    .filter((r) => !verificados.has(r.id))
    .slice(0, options.probeLimit ?? 12);

  let verified = 0;
  let blocked = 0;
  let drafted = 0;

  for (const record of pendientes) {
    const candidato = {
      id: record.id,
      title: record.title,
      url: `https://${record.canonicalUrl}`,
      canonicalUrl: record.canonicalUrl,
      publisher: record.publisher,
      vertical: record.vertical,
    };

    /*
     * Aquí se lee la página de verdad y se extraen hechos con su cita literal.
     * `verifyCandidate` decide `verified` sólo si la fuente sostiene lo mínimo
     * para redactar sin rellenar huecos: una fecha que la página declara y una
     * frase que diga qué se puede hacer. Todo lo demás sale `insufficient` con
     * el motivo, que es un resultado correcto y no un fallo.
     */
    let veredicto;
    try {
      veredicto = await verifyCandidate(candidato, { fetchPage, checkedAt: observedAt });
    } catch (error) {
      errors.push(`verificación ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const { error: errVerif } = await supabase.from('newsroom_verification').upsert(
      {
        candidate_id: veredicto.candidateId,
        decision: veredicto.decision,
        primary_sources: veredicto.primarySources,
        verified_facts: veredicto.verifiedFacts,
        unconfirmed: veredicto.unconfirmed,
        event_type: veredicto.eventType,
        availability: veredicto.availability,
        affects_free_plan: veredicto.affectsFreePlan,
        verification_notes: veredicto.verificationNotes,
        checked_at: veredicto.checkedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'candidate_id' }
    );

    if (errVerif) {
      errors.push(`verificación ${record.id}: ${errVerif.message}`);
      continue;
    }

    if (veredicto.decision !== 'verified') {
      blocked += 1;
      continue;
    }

    verified += 1;

    /*
     * El borrador se compone de citas y pasa por `checkDraft`, la misma puerta
     * que un texto escrito a mano. Si no la pasa, se queda la verificación y no
     * el borrador: preferimos una historia con evidencia y sin redactar a un
     * texto del que haya que desconfiar frase a frase.
     */
    const salida = draftFromVerification(veredicto, candidato);
    if (!salida?.draft) {
      if (salida?.blocked?.length) {
        errors.push(`borrador ${record.id} bloqueado: ${salida.blocked.join('; ')}`);
      }
      continue;
    }

    const d = salida.draft;
    const { error: errDraft } = await supabase.from('newsroom_drafts').upsert(
      {
        slug: d.slug,
        candidate_id: d.candidateId,
        news_id: d.id,
        title: d.title,
        summary: d.summary,
        impact: d.impact,
        category: d.category,
        event_type: d.eventType,
        availability: d.availability,
        affects_free_plan: d.affectsFreePlan,
        related_tools: d.relatedTools,
        official_url: d.officialUrl,
        sources: d.sources,
        fact_trace: d.factTrace,
        status: 'draft',
      },
      { onConflict: 'slug' }
    );

    if (errDraft) errors.push(`borrador ${record.id}: ${errDraft.message}`);
    else drafted += 1;
  }

  const pending = promoted.length - verificados.size - pendientes.length;

  const report: RunReport = {
    found: rows.length,
    ingested,
    duplicates,
    triaged: triageRecords.length,
    verified,
    blocked,
    pending: Math.max(0, pending),
    errors,
    status: errors.length === 0 ? 'ok' : errors.length >= sources.length ? 'failed' : 'partial',
    notes: `${sources.length} fuentes vigiladas, ${errors.length} con incidencias, ${drafted} borradores redactados`,
  };

  await recordRun(report, options.trigger);

  logger.info('newsroom.daily', {
    found: report.found,
    ingested: report.ingested,
    status: report.status,
  });

  return report;
}
