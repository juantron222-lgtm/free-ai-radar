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
import { Inbox, runRadar, serializeInbox, summarize } from './radar/inbox.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sourcesPath = resolve(here, '../src/data/news-sources.json');
const newsPath = resolve(here, '../src/data/news/news.json');
const inboxPath = resolve(here, '../src/data/news/inbox.json');

const TIMEOUT_MS = 8000;
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const offline = args.has('--offline');

/* ------------------------------------------------------------------ feed -- */

function stripTags(value) {
  if (!value) return '';
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(xml, tag) {
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'));
  if (cdata) return stripTags(cdata[1]);
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return plain ? stripTags(plain[1]) : '';
}

/**
 * A date the feed actually carried, as a calendar day — or null.
 *
 * Never falls back to "now". A missing date is information: the classifier
 * rejects the row for it, which is the honest outcome, whereas stamping today
 * on it would invent the one field editorial rule 3 says never to invent.
 */
function feedDate(raw) {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() > Date.now() + 86_400_000) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseFeed(xml, sourceId) {
  const blocks = xml.match(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/g) ?? [];

  return blocks.map((block) => {
    const link =
      pick(block, 'link') || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '').trim();

    return {
      sourceId,
      title: pick(block, 'title'),
      url: link,
      publishedAt:
        feedDate(pick(block, 'pubDate')) ??
        feedDate(pick(block, 'published')) ??
        feedDate(pick(block, 'updated')) ??
        feedDate(pick(block, 'dc:date')),
    };
  });
}

async function fetchFeed(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(source.feed_url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FreeAIRadar/2.0 (+https://www.freeairadar.com)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseFeed(await response.text(), source.id);
  } finally {
    clearTimeout(timer);
  }
}

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

  if (!offline) {
    for (const source of sources) {
      try {
        const items = await fetchFeed(source);
        rows.push(...items);
        console.log(`✓ ${source.name}: ${items.length} elementos`);
      } catch (error) {
        failed.push(`${source.name} (${error.message})`);
        console.error(`✗ ${source.name}: ${error.message}`);
      }
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

  if (dryRun) {
    console.log('--dry-run: no se ha escrito nada.');
    return;
  }

  writeFileSync(inboxPath, serializeInbox(inbox), 'utf-8');
  console.log(`Inbox actualizado: ${inboxPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
