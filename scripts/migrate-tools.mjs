#!/usr/bin/env node
/**
 * Migrates the legacy `src/data/tools.json` (v1 schema) to the v2 record shape
 * used by the app and the Postgres schema.
 *
 * The migration is:
 *   - **reproducible** — pure function of the input file, no network, no clock
 *     dependence for ids (ids are derived from the slug);
 *   - **dry-runnable** — `--dry-run` writes nothing and prints the full report;
 *   - **reversible** — the legacy file is never modified, and `--emit-sql`
 *     produces an idempotent seed plus a matching rollback script;
 *   - **honest** — anything the legacy data did not actually assert becomes
 *     `unverified`, never a guessed `false`.
 *
 * Usage:
 *   node scripts/migrate-tools.mjs --dry-run
 *   node scripts/migrate-tools.mjs
 *   node scripts/migrate-tools.mjs --emit-sql
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = join(ROOT, 'src/data/tools.json');
const OUT_DIR = join(ROOT, 'src/data/generated');
const OUT_JSON = join(OUT_DIR, 'tools.json');
const OUT_REPORT = join(OUT_DIR, 'migration-report.json');
const SQL_DIR = join(ROOT, 'supabase/seed');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const EMIT_SQL = args.has('--emit-sql');

// ---------------------------------------------------------------------------
// Mapping tables (kept in sync with src/lib/domain/taxonomy.ts)
// ---------------------------------------------------------------------------

const CATEGORY_MAP = {
  'imagen ia': 'imagen',
  imagen: 'imagen',
  'vídeo ia': 'video',
  'video ia': 'video',
  'voz ia': 'voz',
  'audio ia': 'voz',
  'música ia': 'musica',
  'musica ia': 'musica',
  código: 'codigo',
  codigo: 'codigo',
  chat: 'chat-asistentes',
  asistentes: 'chat-asistentes',
  'chat ia': 'chat-asistentes',
  'agentes ia': 'agentes',
  automatización: 'automatizacion',
  automatizacion: 'automatizacion',
  productividad: 'productividad',
  diseño: 'diseno',
  diseno: 'diseno',
  escritura: 'escritura',
  marketing: 'marketing',
  'cine ia': 'video',
  'modelos open-source': 'modelos-open-source',
  'herramientas locales': 'herramientas-locales',
  'apis gratuitas': 'apis',
  investigación: 'investigacion',
  investigacion: 'investigacion',
  educación: 'educacion',
  educacion: 'educacion',
};

const FREE_MODEL_MAP = {
  'gratis real': 'free_real',
  'freemium decente': 'freemium',
  freemium: 'freemium',
  'créditos gratis': 'credits',
  'creditos gratis': 'credits',
  'trial útil': 'trial',
  'trial util': 'trial',
  'open-source': 'open_source',
  'open source': 'open_source',
  local: 'local',
  'demo limitada': 'demo',
  'requiere tarjeta': 'trial',
  'humo probable': 'demo',
  'gratis limitado': 'freemium',
};

/**
 * Legacy `alternatives` were free-text names. Some are aliases of tools we do
 * have; the rest are real editorial context we keep as plain names rather than
 * delete.
 */
const ALTERNATIVE_ALIASES = {
  'automatic1111-webui': 'stable-diffusion-webui',
  'stable-diffusion-webui-local': 'stable-diffusion-webui',
  'stable-diffusion-loras-local-gratis': 'stable-diffusion-webui',
  'dall-e-via-chatgpt': 'chatgpt',
  'chatgpt-search': 'chatgpt',
  'hugging-face-models': 'hugging-face-spaces',
  'hugging-face-inference-api': 'hugging-face-spaces',
};

/** Display names for alternatives we have not reviewed yet. */
const ALTERNATIVE_DISPLAY = {
  lovable: 'Lovable',
  'replit-agent': 'Replit Agent',
  huggingchat: 'HuggingChat',
  'tensor-art': 'Tensor.Art',
  seaart: 'SeaArt',
  invokeai: 'InvokeAI',
  'github-copilot': 'GitHub Copilot',
  windsurf: 'Windsurf',
  'continue-dev': 'Continue.dev',
  playht: 'PlayHT',
  'murf-ai': 'Murf AI',
  'coqui-tts-open-source': 'Coqui TTS (open source)',
  'google-colab': 'Google Colab',
  gpt4all: 'GPT4All',
  jan: 'Jan',
  'llama-cpp': 'llama.cpp',
  'you-com': 'You.com',
  'kling-ai': 'Kling AI',
  'hailuo-ai': 'Hailuo AI',
  'stability-matrix': 'Stability Matrix',
  'instalacion-manual': 'Instalación manual',
  docker: 'Docker',
  modal: 'Modal',
  udio: 'Udio',
  'stable-audio': 'Stable Audio',
};

const KNOWN_CATEGORIES = new Set(Object.values(CATEGORY_MAP));

/**
 * Entity kind per slug.
 *
 * Assigned by hand because it is an editorial judgement, not something to
 * infer: a UI over someone else's engine is an `interface`, not a `model`,
 * and getting that wrong is exactly the model-vs-product confusion this field
 * exists to prevent. Anything not listed falls back to `app`.
 */
const TOOL_KIND = {
  'stable-diffusion-webui': 'interface',
  comfyui: 'interface',
  fooocus: 'interface',
  ollama: 'oss_project',
  'lm-studio': 'app',
  pinokio: 'app',
  'hugging-face-spaces': 'platform',
  civitai: 'platform',
  replicate: 'platform',
  chatgpt: 'app',
  claude: 'app',
  'google-gemini': 'app',
  'perplexity-ai': 'app',
  cursor: 'agent',
  'bolt-new': 'agent',
  'v0-by-vercel': 'agent',
  'leonardo-ai': 'app',
  midjourney: 'app',
  runwayml: 'app',
  'pika-labs': 'app',
  'suno-ai': 'app',
  elevenlabs: 'app',
};

/**
 * Verification state carried over from the v1 data.
 *
 * The v1 catalogue was written without a verification workflow, so nothing in
 * it can honestly claim `verified`. Everything starts at
 * `partially_verified` — the free-plan fields were researched, the secondary
 * ones were not — and only moves up when a human opens the vendor page. See
 * the `ai-catalog-verifier` skill.
 */
function inferVerification(legacy) {
  const unknowns = [
    legacy.requires_credit_card,
    legacy.requires_signup,
    legacy.has_watermark,
    legacy.commercial_use,
    legacy.open_source,
  ].filter((v) => v !== true && v !== false).length;

  return unknowns === 0 ? 'partially_verified' : 'pending_review';
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Legacy used `true | false | "no_confirmado"`. Anything that is not an
 * explicit boolean becomes `unverified` — we never invent a `no`.
 */
function tri(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  if (value === 'parcial' || value === 'partial') return 'partial';
  return 'unverified';
}

function isoDate(value, fallback) {
  const s = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function clampScore(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(10, Math.max(0, Math.round(v * 10) / 10));
}

function nonEmpty(value) {
  const s = String(value ?? '').trim();
  return s.length > 0 ? s : undefined;
}

function firstSentence(text, max = 180) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const cut = s.split(/(?<=[.!?])\s/)[0] ?? s;
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

function inferPlatforms(legacy) {
  const platforms = new Set();
  const hay = `${legacy.name} ${legacy.description_long} ${legacy.subcategory}`.toLowerCase();
  if (legacy.local_install === true) {
    platforms.add('windows');
    platforms.add('linux');
    if (!hay.includes('sólo windows') && !hay.includes('solo windows')) platforms.add('macos');
  } else {
    platforms.add('web');
  }
  if (legacy.github_url) platforms.add('cli');
  if (/\bapi\b/.test(hay)) platforms.add('api');
  if (/docker/.test(hay)) platforms.add('docker');
  if (/extensi[oó]n|extension|plugin/.test(hay)) platforms.add('extension');
  return [...platforms];
}

function inferSkillLevel(legacy) {
  const ease = Number(legacy.score_ease ?? 5);
  if (ease >= 8) return 'beginner';
  if (ease >= 5) return 'intermediate';
  return 'advanced';
}

function inferHosting(legacy) {
  if (legacy.local_install === true) {
    // Open-source tools with a hosted option are hybrid; pure local otherwise.
    return legacy.official_url?.includes('github.com') ? 'local' : 'hybrid';
  }
  return 'cloud';
}

function inferCreditReset(freeModel, summary) {
  if (freeModel !== 'credits') return 'none';
  const s = String(summary ?? '').toLowerCase();
  if (/\bdiari|al d[ií]a|cada d[ií]a|daily/.test(s)) return 'daily';
  if (/semanal|weekly/.test(s)) return 'weekly';
  if (/mensual|al mes|monthly|cada mes/.test(s)) return 'monthly';
  if (/una sola vez|no se renuev|inicial|one-?off/.test(s)) return 'one_off';
  return 'monthly';
}

function buildSources(legacy, verifiedAt) {
  const seen = new Set();
  const out = [];
  const push = (url, label, kind) => {
    const u = nonEmpty(url);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({ url: u, label, kind, checkedAt: verifiedAt });
  };
  push(legacy.official_url, 'Web oficial', 'official');
  push(legacy.pricing_url, 'Página de precios', 'pricing');
  push(legacy.docs_url, 'Documentación', 'docs');
  push(legacy.github_url, 'Repositorio', 'repo');
  for (const url of legacy.source_urls ?? []) {
    push(url, hostnameOf(url) ?? 'Fuente', 'community');
  }
  return out;
}

function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function migrateOne(legacy, report) {
  const issues = [];
  const name = nonEmpty(legacy.name);
  if (!name) {
    issues.push('Sin nombre — registro descartado');
    return { record: null, issues };
  }

  const slug = nonEmpty(legacy.slug) ? slugify(legacy.slug) : slugify(name);
  if (!slug) {
    issues.push('No se pudo derivar un slug — registro descartado');
    return { record: null, issues };
  }
  if (legacy.slug && slugify(legacy.slug) !== legacy.slug) {
    issues.push(`Slug normalizado: "${legacy.slug}" → "${slug}"`);
  }

  const categorySlug = CATEGORY_MAP[String(legacy.category ?? '').toLowerCase().trim()];
  if (!categorySlug) {
    issues.push(`Categoría desconocida "${legacy.category}" → asignada a "productividad"`);
  }

  const freeModel = FREE_MODEL_MAP[String(legacy.free_type ?? '').toLowerCase().trim()];
  if (!freeModel) {
    issues.push(`Modelo de gratuidad desconocido "${legacy.free_type}" → asignado a "freemium"`);
  }

  const officialUrl = nonEmpty(legacy.official_url);
  if (!officialUrl) {
    issues.push('Sin URL oficial — registro descartado');
    return { record: null, issues };
  }

  const detectedAt = isoDate(legacy.detected_at, '2024-01-01');
  const lastVerifiedAt = isoDate(legacy.last_checked_at, detectedAt);
  if (!legacy.last_checked_at) {
    issues.push('Sin fecha de verificación — se usa la de detección');
  }

  const resolvedFreeModel = freeModel ?? 'freemium';
  const summary = nonEmpty(legacy.free_plan_summary) ?? 'Pendiente de verificar.';

  // Legacy "Humo probable" was a verdict, not a free-tier model. Preserve the
  // editorial judgement as a tag instead of silently losing it.
  const legacyTags = Array.isArray(legacy.tags) ? legacy.tags : [];
  const editorialTags = legacyTags.filter((t) =>
    ['Bueno para RTX 4060', 'Ideal para creadores', 'Bueno para vídeo'].includes(t)
  );
  if (String(legacy.free_type).toLowerCase() === 'humo probable') {
    editorialTags.push('Humo probable');
  }

  const record = {
    id: `tool_${slug}`,
    slug,
    name,
    tagline: firstSentence(legacy.description_short) || `${name} en el radar`,
    descriptionShort: nonEmpty(legacy.description_short) ?? '',
    descriptionLong: nonEmpty(legacy.description_long) ?? '',

    kind: TOOL_KIND[slug] ?? 'app',
    verification: inferVerification(legacy),
    nextReviewAt: addDays(lastVerifiedAt, 90),

    categorySlug: categorySlug ?? 'productividad',
    secondaryCategories: [],
    tags: [...new Set(editorialTags)],
    useCases: (legacy.use_cases ?? []).filter(Boolean),

    freeModel: resolvedFreeModel,
    freePlan: {
      summary,
      limits: (legacy.limitations ?? []).filter(Boolean),
      requiresSignup: tri(legacy.requires_signup),
      requiresCreditCard: tri(legacy.requires_credit_card),
      hasWatermark: tri(legacy.has_watermark),
      commercialUse: tri(legacy.commercial_use),
      creditReset: inferCreditReset(resolvedFreeModel, summary),
      verifiedAt: lastVerifiedAt,
    },

    openSource: tri(legacy.open_source),
    hosting: inferHosting(legacy),
    platforms: inferPlatforms(legacy),
    languages: [],
    skillLevel: inferSkillLevel(legacy),

    privacy: {
      trainsOnUserData: 'unverified',
      optOutAvailable: 'unverified',
    },

    officialUrl,
    pricingUrl: nonEmpty(legacy.pricing_url),
    docsUrl: nonEmpty(legacy.docs_url),
    repoUrl: nonEmpty(legacy.github_url),
    sources: buildSources(legacy, lastVerifiedAt),

    scores: {
      freeReal: clampScore(legacy.score_free_real),
      usefulness: clampScore(legacy.score_usefulness),
      ease: clampScore(legacy.score_ease),
      transparency: clampScore(legacy.score_transparency),
      creatorValue: clampScore(legacy.score_creator_potential),
    },

    verdict: nonEmpty(legacy.verdict) ?? '',
    pros: [],
    cons: (legacy.limitations ?? []).filter(Boolean),
    bestFor: [],
    notFor: [],
    alternatives: (legacy.alternatives ?? [])
      .map(slugify)
      .filter(Boolean)
      .map((s) => ALTERNATIVE_ALIASES[s] ?? s),
    alternativeNames: [],

    changelog: legacy.novelty_summary
      ? [
          {
            date: detectedAt,
            kind: 'launch',
            summary: legacy.novelty_summary,
          },
        ]
      : [],

    affiliation: { isAffiliate: false },
    sponsorship: { isSponsored: false, placementBoost: 0 },

    status: legacy.status === 'active' ? 'published' : 'in_review',
    detectedAt,
    lastVerifiedAt,
    updatedAt: lastVerifiedAt,
  };

  // The legacy score was stored, not derived. We keep it only in the report so
  // a human can see how the v2 formula changed each tool.
  report.scoreDeltas.push({
    slug,
    legacyScore: Number(legacy.score_total ?? 0),
  });

  return { record, issues };
}

// ---------------------------------------------------------------------------
// SQL emission
// ---------------------------------------------------------------------------

function sqlString(value) {
  if (value === undefined || value === null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function emitSeedSql(records) {
  const lines = [
    '-- Generated by scripts/migrate-tools.mjs — do not edit by hand.',
    '-- Idempotent: safe to run more than once. Rerun after regenerating.',
    '',
    'begin;',
    '',
  ];

  for (const r of records) {
    lines.push(
      `insert into public.tools (
  id, slug, name, tagline, description_short, description_long,
  kind, verification, next_review_at, version,
  category_slug, secondary_categories, tags, use_cases,
  free_model, free_plan, open_source, licence, hosting, platforms, languages,
  hardware_requirements, skill_level, privacy,
  official_url, pricing_url, docs_url, repo_url, sources,
  scores, verdict, pros, cons, best_for, not_for, alternatives, alternative_names, changelog,
  affiliation, sponsorship, status, reviewed_by,
  detected_at, last_verified_at, updated_at
) values (
  ${sqlString(r.id)}, ${sqlString(r.slug)}, ${sqlString(r.name)}, ${sqlString(r.tagline)},
  ${sqlString(r.descriptionShort)}, ${sqlString(r.descriptionLong)},
  ${sqlString(r.kind)}, ${sqlString(r.verification)}, ${sqlString(r.nextReviewAt)}, ${sqlString(r.version)},
  ${sqlString(r.categorySlug)}, ${sqlJson(r.secondaryCategories)}, ${sqlJson(r.tags)}, ${sqlJson(r.useCases)},
  ${sqlString(r.freeModel)}, ${sqlJson(r.freePlan)}, ${sqlString(r.openSource)}, ${sqlString(r.licence)},
  ${sqlString(r.hosting)}, ${sqlJson(r.platforms)}, ${sqlJson(r.languages)},
  ${sqlString(r.hardwareRequirements)}, ${sqlString(r.skillLevel)}, ${sqlJson(r.privacy)},
  ${sqlString(r.officialUrl)}, ${sqlString(r.pricingUrl)}, ${sqlString(r.docsUrl)}, ${sqlString(r.repoUrl)},
  ${sqlJson(r.sources)}, ${sqlJson(r.scores)}, ${sqlString(r.verdict)},
  ${sqlJson(r.pros)}, ${sqlJson(r.cons)}, ${sqlJson(r.bestFor)}, ${sqlJson(r.notFor)},
  ${sqlJson(r.alternatives)}, ${sqlJson(r.alternativeNames)}, ${sqlJson(r.changelog)},
  ${sqlJson(r.affiliation)}, ${sqlJson(r.sponsorship)},
  ${sqlString(r.status)}, ${sqlString(r.reviewedBy)},
  ${sqlString(r.detectedAt)}, ${sqlString(r.lastVerifiedAt)}, ${sqlString(r.updatedAt)}
)
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description_short = excluded.description_short,
  description_long = excluded.description_long,
  category_slug = excluded.category_slug,
  free_model = excluded.free_model,
  free_plan = excluded.free_plan,
  scores = excluded.scores,
  sources = excluded.sources,
  last_verified_at = excluded.last_verified_at,
  updated_at = excluded.updated_at;
`
    );
  }

  lines.push('commit;', '');
  return lines.join('\n');
}

function emitRollbackSql(records) {
  return [
    '-- Rollback for seed.sql. Removes ONLY the rows this migration inserted.',
    '-- Editor-created tools and user data are untouched.',
    '',
    'begin;',
    `delete from public.tools where slug in (${records.map((r) => sqlString(r.slug)).join(', ')});`,
    'commit;',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!existsSync(LEGACY)) {
    console.error(`No se encuentra el fichero de origen: ${LEGACY}`);
    process.exit(1);
  }

  let legacyTools;
  try {
    legacyTools = JSON.parse(readFileSync(LEGACY, 'utf8'));
  } catch (error) {
    console.error(`El JSON de origen no es válido: ${error.message}`);
    process.exit(1);
  }

  if (!Array.isArray(legacyTools)) {
    console.error('El JSON de origen debe ser un array de herramientas.');
    process.exit(1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'src/data/tools.json',
    inputCount: legacyTools.length,
    outputCount: 0,
    dropped: [],
    duplicates: [],
    issues: [],
    unknownAlternatives: [],
    scoreDeltas: [],
  };

  const bySlug = new Map();

  for (const legacy of legacyTools) {
    const { record, issues } = migrateOne(legacy, report);
    const label = legacy?.name ?? legacy?.slug ?? '(sin identificar)';

    for (const issue of issues) report.issues.push({ tool: label, issue });

    if (!record) {
      report.dropped.push({ tool: label, reason: issues.join('; ') });
      continue;
    }

    if (bySlug.has(record.slug)) {
      report.duplicates.push({
        slug: record.slug,
        kept: bySlug.get(record.slug).name,
        discarded: record.name,
      });
      continue;
    }

    bySlug.set(record.slug, record);
  }

  const records = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  report.outputCount = records.length;

  // Cross-reference alternatives. Ones we have reviewed become links; the rest
  // are preserved as plain names so no editorial context is lost.
  const knownSlugs = new Set(records.map((r) => r.slug));
  for (const r of records) {
    const linked = [];
    const named = [];
    for (const alt of r.alternatives) {
      if (alt === r.slug) continue;
      if (knownSlugs.has(alt)) {
        linked.push(alt);
      } else {
        named.push(ALTERNATIVE_DISPLAY[alt] ?? titleCase(alt));
        report.unknownAlternatives.push({ tool: r.slug, alternative: alt });
      }
    }
    r.alternatives = [...new Set(linked)];
    r.alternativeNames = [...new Set(named)];
  }

  for (const c of records.map((r) => r.categorySlug)) {
    if (!KNOWN_CATEGORIES.has(c)) report.issues.push({ tool: '-', issue: `Categoría fuera de taxonomía: ${c}` });
  }

  // ---- Report ----
  console.log('\n=== Migración de herramientas: informe ===');
  console.log(`Entrada:        ${report.inputCount} herramientas`);
  console.log(`Salida:         ${report.outputCount} herramientas`);
  console.log(`Descartadas:    ${report.dropped.length}`);
  console.log(`Duplicadas:     ${report.duplicates.length}`);
  console.log(`Avisos:         ${report.issues.length}`);
  console.log(`Alternativas no resueltas: ${report.unknownAlternatives.length}`);

  if (report.dropped.length) {
    console.log('\n-- Descartadas --');
    for (const d of report.dropped) console.log(`  · ${d.tool}: ${d.reason}`);
  }
  if (report.duplicates.length) {
    console.log('\n-- Duplicadas (se conserva la primera) --');
    for (const d of report.duplicates) console.log(`  · ${d.slug}: "${d.kept}" vs "${d.discarded}"`);
  }
  if (report.issues.length) {
    console.log('\n-- Avisos --');
    for (const i of report.issues.slice(0, 40)) console.log(`  · ${i.tool}: ${i.issue}`);
    if (report.issues.length > 40) console.log(`  … y ${report.issues.length - 40} más`);
  }
  if (report.unknownAlternatives.length) {
    console.log('\n-- Alternativas aún sin ficha (se conservan como texto, sin enlace) --');
    for (const u of report.unknownAlternatives) console.log(`  · ${u.tool} → ${u.alternative}`);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] No se ha escrito ningún fichero.\n');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nEscrito: ${OUT_JSON}`);
  console.log(`Escrito: ${OUT_REPORT}`);

  if (EMIT_SQL) {
    mkdirSync(SQL_DIR, { recursive: true });
    writeFileSync(join(SQL_DIR, 'seed.sql'), emitSeedSql(records), 'utf8');
    writeFileSync(join(SQL_DIR, 'rollback.sql'), emitRollbackSql(records), 'utf8');
    console.log(`Escrito: ${join(SQL_DIR, 'seed.sql')}`);
    console.log(`Escrito: ${join(SQL_DIR, 'rollback.sql')}`);
  }

  console.log('');
}

main();
