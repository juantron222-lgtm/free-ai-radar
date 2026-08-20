#!/usr/bin/env node
/**
 * The catalogue, in the shape Postgres expects.
 *
 * `public.categories` and `public.tools` are a mirror, not a source. Editorial
 * content lives in the repository and is rendered from there; the tables exist
 * so user data can point at a tool with a foreign key and have that reference
 * mean something. Nothing on the public site reads them.
 *
 * A mirror nobody fills is worse than no mirror at all, which is exactly what
 * happened: the schema declared `user_favorites.tool_id references tools(id)`,
 * the table was empty, and so every attempt to save a favourite failed with a
 * foreign key violation. The constraint was not wrong — it was being asked to
 * guarantee integrity against nothing.
 *
 * Two rules keep this file honest:
 *
 *   - it reads the same committed dataset `catalog.ts` reads, so the mirror
 *     cannot disagree with the site;
 *   - it copies only what is stored. `scoreTotal` is computed by `hydrateTool`
 *     from the five component scores and is deliberately absent here; a derived
 *     value written to a second place is a derived value that can be wrong.
 */

import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Categories live in TypeScript, so they get compiled rather than parsed.
 *
 * esbuild is already a dependency of Vite; nothing new is installed. Reading
 * `taxonomy.ts` with a regular expression was the alternative and it is the
 * kind of shortcut that works until someone reformats the file.
 */
async function loadCategories() {
  const { buildSync } = await import('esbuild');
  const out = join(tmpdir(), `far-taxonomy-${process.pid}.mjs`);
  try {
    // The JS API rather than the CLI: on Windows `node_modules/.bin/esbuild`
    // is a shell script and only `esbuild.cmd` is executable, so spawning the
    // bare name fails with ENOENT.
    buildSync({
      entryPoints: [join(ROOT, 'src/lib/domain/taxonomy.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: out,
      logLevel: 'error',
    });
    // Awaited before the `finally` removes the file: returning the promise
    // instead would delete the module out from under the import.
    const module = await import(pathToFileURL(out).href);
    return module.CATEGORIES;
  } finally {
    rmSync(out, { force: true });
  }
}

const CAMEL = /[A-Z]/g;
const snake = (key) => key.replace(CAMEL, (c) => `_${c.toLowerCase()}`);

/**
 * Every column of `public.tools`, so a key the table does not have is dropped
 * rather than sent and rejected. Kept deliberately explicit: a typo in the
 * dataset should not silently become a missing field.
 */
const TOOL_COLUMNS = new Set([
  'id', 'slug', 'name', 'tagline', 'description_short', 'description_long',
  'kind', 'verification', 'next_review_at', 'version', 'category_slug',
  'secondary_categories', 'tags', 'use_cases', 'free_model', 'free_plan',
  'open_source', 'licence', 'hosting', 'platforms', 'languages',
  'hardware_requirements', 'skill_level', 'privacy', 'official_url',
  'pricing_url', 'docs_url', 'repo_url', 'sources', 'scores', 'verdict',
  'pros', 'cons', 'best_for', 'not_for', 'alternatives', 'alternative_names',
  'changelog', 'affiliation', 'sponsorship', 'status', 'reviewed_by',
  'detected_at', 'last_verified_at', 'created_at', 'updated_at',
  'capabilities', 'start_effort', 'start_effort_reason', 'licences', 'access',
]);

/** Campos que sólo viven en el repositorio. Ver el motivo en catalogRows(). */
const EDITORIAL_ONLY = new Set(['evidence', 'auditNotes']);

export async function catalogRows() {
  const tools = JSON.parse(readFileSync(join(ROOT, 'src/data/generated/tools.json'), 'utf8'));
  const categories = await loadCategories();
  const now = new Date().toISOString();

  const unknown = new Set();

  const toolRows = tools.map((tool) => {
    const row = {};
    for (const [key, value] of Object.entries(tool)) {
      /*
       * Editorial-only fields, left out of the mirror on purpose.
       *
       * `evidence` carries the quote and the date behind each perishable claim,
       * and `auditNotes` records why a field says what it says. Both belong to
       * the repository, where they are reviewed in a diff — the mirror exists so
       * a favourite can reference a tool by foreign key, and nothing in Postgres
       * reads either of them.
       *
       * Declared here rather than added as columns because a column nobody
       * queries is a column that drifts out of date silently.
       */
      if (EDITORIAL_ONLY.has(key)) continue;

      const column = snake(key);
      if (!TOOL_COLUMNS.has(column)) {
        unknown.add(key);
        continue;
      }
      row[column] = value;
    }
    /*
     * Two columns belong to the database, not to the catalogue.
     *
     * `created_at` records when the mirror row first appeared. `updated_at`
     * records when it last changed — and a `before update` trigger
     * (`tools_set_updated_at`) overwrites it with `now()` on every update, so
     * any value sent from here is discarded the instant it arrives. Mirroring
     * it was a lie the verification caught on its first run: twenty-four rows
     * reported as discrepant on `updated_at`, every single time.
     *
     * They still have to be supplied on insert. A default does not save us —
     * `jsonb_populate_recordset` turns an absent key into an explicit NULL, and
     * an explicit NULL defeats a default. On conflict both are left alone.
     *
     * The editorial fact that `updatedAt` carried is not lost: `lastVerifiedAt`
     * is the date the entry was actually checked, and it is mirrored.
     */
    delete row.updated_at;
    row.created_at = now;
    row.updated_at = now;
    return row;
  });

  const categoryRows = categories.map((category, index) => ({
    slug: category.slug,
    name: category.name,
    intro: category.intro,
    icon: category.icon,
    position: index,
    created_at: now,
  }));

  /*
   * A tool pointing at a category that does not exist would fail on the
   * foreign key halfway through the sync, leaving the mirror half-written.
   * Better to refuse before touching the database and say which one.
   */
  const known = new Set(categoryRows.map((c) => c.slug));
  const orphans = [...new Set(toolRows.map((t) => t.category_slug))].filter((s) => !known.has(s));

  return { toolRows, categoryRows, unknownKeys: [...unknown], orphans };
}
