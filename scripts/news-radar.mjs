#!/usr/bin/env node
/**
 * The radar: fetches the configured feeds and files what it finds in the inbox.
 *
 * It is a discovery tool and only a discovery tool. It writes exactly one file,
 * `src/data/news/inbox.json`, and it has no code path that can reach
 * `src/data/news/news.json` — that file is written by a human who has read the
 * vendor's page. The two datasets are separate on disk so that the separation
 * survives someone being in a hurry.
 *
 * Everything that decides anything lives in `scripts/radar/inbox.mjs`, which is
 * pure and unit-tested. This file is the part that talks to the network.
 *
 * Usage:
 *   node scripts/news-radar.mjs --dry-run    fetch and report, write nothing
 *   node scripts/news-radar.mjs              fetch, report, update the inbox
 *   node scripts/news-radar.mjs --offline    re-classify the inbox, no network
 *   node scripts/news-radar.mjs --since=90   widen the discovery window
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource, judgeHealth } from './source-adapters.mjs';
import { Inbox, runRadar, serializeInbox, summarize } from './radar/inbox.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sourcesPath = resolve(here, '../src/data/news-sources.json');
const newsPath = resolve(here, '../src/data/news/news.json');
const inboxPath = resolve(here, '../src/data/news/inbox.json');

const healthPath = resolve(here, '../src/data/news/source-health.json');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const offline = args.has('--offline');

/* ------------------------------------------------------------------ feed -- */

/* ------------------------------------------------------------------- run -- */

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    console.error(`No se pudo leer ${path}: ${error.message}`);
    process.exit(1);
  }
}

function report(stats, failed) {
  const line = (label, value) => console.log(`  ${String(label).padEnd(52)} ${value}`);

  console.log('\nINFORME DEL RADAR');
  console.log('─'.repeat(62));
  line('Total en el inbox', stats.total);
  for (const [status, count] of Object.entries(stats.byStatus).sort()) line(`· ${status}`, count);

  if (Object.keys(stats.byVertical).length) {
    console.log('\n  Candidatos por vertical');
    for (const [vertical, count] of Object.entries(stats.byVertical).sort((a, b) => b[1] - a[1])) {
      line(`  · ${vertical}`, count);
    }
  }

  const reasons = Object.entries(stats.byReason).sort((a, b) => b[1] - a[1]);
  if (reasons.length) {
    console.log('\n  Motivos de descarte');
    for (const [reason, count] of reasons) line(`  · ${reason}`, count);
  }

  if (failed.length) {
    console.log('\n  Fuentes que fallaron');
    for (const entry of failed) line(`  · ${entry}`, '');
  }
  console.log('─'.repeat(62));
}

async function main() {
  const sources = readJson(sourcesPath, []).filter((source) => source.enabled);
  const newsItems = readJson(newsPath, []);
  const existing = Inbox.parse(readJson(inboxPath, []));

  if (!sources.length) {
    console.error('No hay ninguna fuente activa en news-sources.json.');
    process.exit(1);
  }

  const rows = [];
  const failed = [];

  /*
   * What each source did last time.
   *
   * Without it, "returned nothing" cannot be told from "returns nothing" — a
   * redesigned index page and a quiet week look identical. Comparing against
   * the last run is what turns the first into a visible `degraded`.
   */
  const previousHealth = readJson(healthPath, {});
  const health = {};

  if (!offline) {
    for (const source of sources) {
      const previous = previousHealth[source.id] ?? { items: 0 };
      let items = [];
      let reachable = true;
      let error = null;

      try {
        items = await fetchSource(source);
        rows.push(...items.map((item) => ({ ...item, sourceId: source.id })));
      } catch (caught) {
        reachable = false;
        error = caught.message;
        failed.push(`${source.name} (${caught.message})`);
      }

      const status = judgeHealth({ reachable, items: items.length, previousItems: previous.items });
      health[source.id] = {
        name: source.name,
        type: source.source_type,
        vertical: source.category_defaults ?? null,
        status,
        items: items.length,
        previousItems: previous.items,
        checkedAt: new Date().toISOString().slice(0, 10),
        ...(error ? { error } : {}),
      };

      const mark = status === 'healthy' ? '✓' : status === 'degraded' ? '⚠' : '✗';
      const detail =
        status === 'degraded'
          ? `0 elementos, antes ${previous.items} — revisa el marcado del índice`
          : reachable
            ? `${items.length} elementos`
            : error;
      console.log(`${mark} ${source.name.padEnd(24)} ${status.padEnd(9)} ${detail}`);
    }

    /*
     * Every source failing means the network is down, not that the world went
     * quiet. Writing an unchanged inbox would be harmless, but exiting non-zero
     * is what makes a scheduled run visible when it stops working.
     */
    if (rows.length === 0 && failed.length === sources.length) {
      console.error('\nTodas las fuentes han fallado. El inbox se deja intacto.');
      process.exit(1);
    }
  }

  const observedAt = new Date().toISOString().slice(0, 10);
  const windowArg = [...args].find((arg) => arg.startsWith('--since='));
  const windowDays = windowArg ? Number(windowArg.slice('--since='.length)) : undefined;

  if (windowArg && (!Number.isFinite(windowDays) || windowDays <= 0)) {
    console.error(`--since debe ser un número de días positivo, recibido "${windowArg}".`);
    process.exit(1);
  }

  const { inbox, added, outsideWindow } = runRadar({
    rows,
    sources,
    newsItems,
    existing,
    observedAt,
    ...(windowDays ? { windowDays } : {}),
  });

  report(summarize(inbox), failed);
  console.log(`\nLeídas de los feeds: ${rows.length}`);
  console.log(`Fuera de la ventana de descubrimiento: ${outsideWindow}`);
  console.log(`Nuevos en esta ejecución: ${added.length}`);

  /*
   * A degraded source is the failure this whole health check exists for, and it
   * has to be louder than a line in a table: it means a source that used to
   * work is now silently contributing nothing.
   */
  const degradadas = Object.values(health).filter((h) => h.status === 'degraded');
  const rotas = Object.values(health).filter((h) => h.status === 'broken');

  if (degradadas.length || rotas.length) {
    console.log('\nFuentes que necesitan atención');
    console.log('─'.repeat(62));
    for (const h of degradadas) {
      console.log(`  ⚠ ${h.name.padEnd(24)} degradada — devolvía ${h.previousItems}, ahora 0`);
    }
    for (const h of rotas) console.log(`  ✗ ${h.name.padEnd(24)} rota — ${h.error}`);
  }

  if (dryRun) {
    console.log('--dry-run: no se ha escrito nada.');
    return;
  }

  if (Object.keys(health).length) {
    writeFileSync(healthPath, `${JSON.stringify(health, null, 2)}
`, 'utf-8');
  }

  writeFileSync(inboxPath, serializeInbox(inbox), 'utf-8');
  console.log(`Inbox actualizado: ${inboxPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
