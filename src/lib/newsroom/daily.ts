import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as supabaseConfig } from '@lib/config';
import { logger } from '@lib/observability/logger';
import { recordRun, resumirPasada, type RunReport } from '@lib/data/newsroom-store';
import { getDesk, decide } from '@lib/data/newsroom';
import { canAutoPublish } from '@lib/domain/newsroom';
import { encontrarSupersesiones, repartirPortada } from '@lib/domain/lifecycle';
import { hydrateNews } from '@lib/domain/news';
import { readApproved, readSeed } from '@lib/data/newsroom-store';
import { fetchSource } from '../../../scripts/source-adapters.mjs';
import { runRadar } from '../../../scripts/radar/inbox.mjs';
import type { InboxCandidateShape } from '../../../scripts/radar/inbox.d.mts';
import { runTriage } from '../../../scripts/triage/triage.mjs';
import { verifyCandidate } from '../../../scripts/verify/autoverify.mjs';
import { draftFromVerification } from '../../../scripts/draft/autodraft.mjs';
import { fuentesInactivas } from '../../../scripts/newsroom-cobertura.mjs';

/**
 * La pasada diaria.
 *
 * Descubre, deduplica, tría, verifica, redacta y —cuando la evidencia da para
 * ello— publica sin que nadie mire. Ese último paso es el que hay que explicar.
 *
 * Verificar, tal y como lo define este proyecto, es leer la página del
 * fabricante y extraer de ella afirmaciones citables: una fecha que aparece en
 * la propia página, un precio copiado literal, una frase que demuestre que algo
 * está disponible. Nada se redacta que no salga de una de esas citas, y el
 * borrador pasa por `checkDraft`, la misma puerta que un texto escrito a mano.
 *
 * Publicar solo pide todavía más: `canAutoPublish` exige lo mismo que una
 * aprobación humana y además que el artículo se haya leído de verdad —no sólo
 * su feed—, que no queden huecos sustantivos sin confirmar, que la página no
 * sea la integración de un tercero y que la historia sea reciente. Lo que no
 * pasa esa puerta no se pierde: se queda en la mesa con su motivo.
 *
 * El día que nada supere ese listón, la pasada publica cero. Es el resultado
 * correcto, no un fallo: bajar el estándar para tener más noticias es
 * exactamente lo que la sección no puede hacer.
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
/**
 * Descarga un feed oficial, con memoria dentro de la misma pasada.
 *
 * Varias historias del mismo fabricante comparten feed, y pedirlo una vez por
 * candidato sería castigar a la fuente por nuestra forma de recorrer la lista.
 */
const feedCache = new Map<string, string>();

/**
 * Cuántas puede publicar sola una pasada.
 *
 * Un techo, no una cuota. Existe para que un fallo del extractor no se convierta
 * en veinte noticias malas en una mañana, no para asegurar volumen.
 */
const MAX_AUTOPUBLICADAS = 4;

/** Quién firma lo que se publica sin intervención. Se distingue en el historial. */
const AUTOR_AUTOMATICO = 'Newsroom automático';

async function fetchFeed(url: string): Promise<string> {
  const guardado = feedCache.get(url);
  if (guardado !== undefined) return guardado;

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'FreeAIRadar-Newsroom/1.0 (+https://www.freeairadar.com)',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`el feed respondió ${response.status}`);

  const cuerpo = await response.text();
  feedCache.set(url, cuerpo);
  return cuerpo;
}

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

  /*
   * En tandas y con holgura, no en serie y con prisa.
   *
   * La primera pasada real contra staging falló en las 22 fuentes con
   * «aborted» y «fetch failed». No era un bloqueo de red: un solo feed de
   * OpenAI tarda 4 segundos desde aquí y el de Google 8,5, y el tope era de 10.
   * Casi todas las fuentes lo rozaban, y en serie la pasada entera se iba a
   * 345 segundos para no traer nada.
   *
   * Veinte segundos por fuente cubre lo que estos feeds tardan de verdad;
   * cuatro a la vez mantiene el total dentro de lo que un cron puede durar,
   * sin abrir tantas conexiones a la vez como para provocar el fallo que se
   * intenta evitar.
   */
  const CONCURRENCIA = 4;
  const cola = [...sources];

  async function trabajador() {
    for (let source = cola.shift(); source; source = cola.shift()) {
      try {
        /*
         * `fetchSource` devuelve un array de entradas, no un objeto con `items`
         * y `reachable`. Este bucle esperaba lo segundo, así que `result.items`
         * era siempre `undefined` y `result.reachable` también: cero filas
         * ingeridas y las 22 fuentes marcadas «no accesible» aunque hubieran
         * respondido 200. La pasada diaria no podía descubrir nada, y el
         * informe culpaba a la red de un desajuste de forma.
         *
         * El contrato bueno es el array, que es lo que ya usa `news-radar.mjs`.
         * Alcanzable es simplemente que la llamada no haya lanzado.
         */
        const items = await fetchSource(source, { timeoutMs: 20_000 });

        for (const item of items) {
          rows.push({
            sourceId: source.id,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt ?? null,
          });
        }

        /*
         * Cero entradas de una fuente que respondió no es un error de red, pero
         * tampoco es normal: así se ve un índice rediseñado desde aquí. Se anota
         * como incidencia para que no se confunda con una semana tranquila.
         */
        if (items.length === 0) {
          errors.push(`${source.name}: responde, pero no devuelve ninguna entrada`);
        }
      } catch (error) {
        errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));

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
      veredicto = await verifyCandidate(candidato, { fetchPage, fetchFeed, checkedAt: observedAt });
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

  /*
   * Publicación automática.
   *
   * Es el único punto de todo el sistema donde algo llega a un lector sin que
   * una persona lo haya visto, así que la puerta es `canAutoPublish`, que pide
   * todo lo que exige una aprobación humana y cuatro cosas más. Lo que no la
   * pasa no se pierde: se queda en la mesa, con su motivo, esperando a alguien.
   *
   * El tope diario no es una cuota que haya que llenar, es un techo. Si un día
   * no hay nada publicable, no se publica nada — que es exactamente lo que debe
   * pasar y lo que distingue una sección viva de una que rellena.
   */
  const publicadas: string[] = [];
  const noPublicadas: Array<{ slug: string; motivos: string[] }> = [];

  try {
    const desk = await getDesk();
    for (const historia of desk.ready.slice(0, MAX_AUTOPUBLICADAS)) {
      const veredicto = canAutoPublish(historia, { today: observedAt });

      if (!veredicto.ok) {
        noPublicadas.push({ slug: historia.key, motivos: veredicto.reasons });
        continue;
      }

      const resultado = await decide({
        key: historia.key,
        action: 'approve',
        actor: AUTOR_AUTOMATICO,
        note: 'Publicada por la pasada diaria tras superar la puerta automática.',
      });

      if (resultado.ok && resultado.published) publicadas.push(historia.key);
      else noPublicadas.push({ slug: historia.key, motivos: [resultado.message] });
    }
  } catch (error) {
    errors.push(`autopublicación: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const { slug, motivos } of noPublicadas) {
    logger.info('newsroom.autopublish_blocked', { slug, reasons: motivos.slice(0, 3) });
  }

  /*
   * Higiene de portada.
   *
   * No cambia ningún dato: la partición se deriva de la fecha cada vez que se
   * construye el sitio. Lo que se hace aquí es dejarlo escrito, porque «qué
   * archivó y por qué» tiene que poder responderse sin reconstruir el sitio
   * para averiguarlo.
   */
  const archivadas: Array<{ slug: string; motivo: string }> = [];
  const superadas: Array<{ anterior: string; nueva: string; motivo: string }> = [];

  try {
    const publicadasHoy = [...readSeed(), ...(await readApproved())];
    const vistas = new Set<string>();
    const unicas = publicadasHoy.filter((n) => !vistas.has(n.slug) && vistas.add(n.slug));
    const hidratadas = unicas.map((n) => hydrateNews(n));

    const portada = repartirPortada(hidratadas);
    archivadas.push(...portada.motivos);
    superadas.push(...encontrarSupersesiones(hidratadas));

    logger.info('newsroom.portada', {
      destacadas: portada.destacadas.length,
      archivo: portada.archivo.length,
      superadas: superadas.length,
    });
  } catch (error) {
    errors.push(`portada: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const s of superadas) {
    logger.info('newsroom.superseded', { anterior: s.anterior, nueva: s.nueva, motivo: s.motivo });
  }

  /*
   * Qué fuentes llevan semanas sin aportar nada.
   *
   * Una fuente se rompe en silencio: el fabricante cambia la ruta del feed, o
   * rediseña el índice y el patrón de enlace deja de casar. Nada falla —la
   * pasada termina en verde— y simplemente deja de llegar material de ahí.
   * Sin esta comprobación eso se descubre meses después, si se descubre.
   *
   * No apaga nada por su cuenta: sustituir una fuente es una decisión
   * editorial. Lo que hace es dejar de ser invisible.
   */
  const inactivas = fuentesInactivas(inbox, sources, { hoy: new Date(observedAt) });
  for (const f of inactivas) {
    logger.warn('newsroom.source_idle', { id: f.id, nombre: f.nombre, motivo: f.motivo });
  }

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
    published: publicadas.length,
    heldForReview: noPublicadas.length,
    heldReasons: noPublicadas.map(({ slug, motivos }) => ({ slug, reasons: motivos })),
    archived: archivadas.length,
    superseded: superadas.length,
    idleSources: inactivas,
    notes: resumirPasada({
      sources: sources.length,
      errors: errors.length,
      drafted,
      published: publicadas.length,
      held: noPublicadas.map(({ slug, motivos }) => ({ slug, reasons: motivos })),
      archived: archivadas.length,
      superseded: superadas.length,
      idle: inactivas.length,
    }),
  };

  await recordRun(report, options.trigger);

  logger.info('newsroom.daily', {
    found: report.found,
    ingested: report.ingested,
    published: report.published,
    heldForReview: report.heldForReview,
    status: report.status,
  });

  return report;
}
