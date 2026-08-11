#!/usr/bin/env node
/**
 * Triage: deciding which discovered stories are worth verifying.
 *
 * It reads `src/data/news/inbox.json` and writes `src/data/news/triage.json`.
 * It never touches either of the other two files: the inbox is the radar's
 * record and must stay as the radar left it, and `news.json` is written by a
 * human who has read the vendor's page.
 *
 * Three files, three jobs, and the boundaries visible on disk:
 *
 *   news-sources.json  what we watch
 *   inbox.json         what the radar found, and what it thought
 *   triage.json        what triage decided, and why
 *   news/news.json     what a human verified and published
 *
 * Everything that decides anything lives in `scripts/triage/triage.mjs`, which
 * is pure and unit-tested. This file only reads, writes and prints.
 *
 * Usage:
 *   node scripts/news-triage.mjs --dry-run    evaluate and report, write nothing
 *   node scripts/news-triage.mjs              evaluate, report, write triage.json
 *   node scripts/news-triage.mjs --explain=<id>   show every axis for one story
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coverageGaps,
  runTriage,
  serializeTriage,
  summarizeTriage,
} from './triage/triage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const inboxPath = resolve(here, '../src/data/news/inbox.json');
const triagePath = resolve(here, '../src/data/news/triage.json');

const args = process.argv.slice(2);
const flags = new Set(args);
const dryRun = flags.has('--dry-run');
const explainArg = args.find((arg) => arg.startsWith('--explain='));

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function pct(part, total) {
  return total === 0 ? '0' : ((part / total) * 100).toFixed(0);
}

function report(records) {
  const stats = summarizeTriage(records);
  const today = new Date().toISOString().slice(0, 10);

  console.log('\nTRIAJE');
  console.log('======');
  console.log(`Evaluadas: ${stats.total}`);
  for (const decision of ['promote', 'hold', 'reject']) {
    const n = stats.byDecision[decision] ?? 0;
    console.log(`  ${decision.padEnd(8)} ${String(n).padStart(4)}  ${pct(n, stats.total)} %`);
  }

  console.log('\nPuntuaciones');
  for (const [bucket, n] of Object.entries(stats.buckets)) {
    console.log(`  ${bucket.padEnd(8)} ${String(n).padStart(4)}`);
  }

  console.log('\nVerticales (promote + hold)');
  const verticals = Object.entries(stats.byVertical).sort((a, b) => b[1] - a[1]);
  for (const [vertical, n] of verticals) {
    console.log(`  ${vertical.padEnd(20)} ${String(n).padStart(4)}`);
  }

  console.log(`\nRescatadas del rechazo del radar: ${stats.rescued}`);

  /*
   * Coverage is reported, never enforced. A thin vertical is a reason to widen
   * the sources in the next radar pass, not a reason to promote something
   * mediocre — that would be the quota the brief explicitly refused.
   */
  console.log('\nCobertura por vertical (sin cuotas: sólo para ampliar fuentes)');
  for (const gap of coverageGaps(records, today)) {
    const age = gap.daysWithout === null ? 'sin ninguna' : `${gap.daysWithout} días`;
    console.log(`  ${gap.vertical.padEnd(20)} útiles ${String(gap.usable).padStart(3)}  última: ${age}`);
  }
}

function explain(records, id) {
  const record = records.find((r) => r.id === id || r.id.endsWith(id));
  if (!record) {
    console.error(`No hay ninguna historia con id "${id}".`);
    process.exit(1);
  }

  console.log(`\n${record.title}`);
  console.log(`${record.canonicalUrl}`);
  console.log(`\nradar: ${record.radarStatus}${record.radarReason ? ` — ${record.radarReason}` : ''}`);
  console.log(`triaje: ${record.triageDecision} (${record.triageScore}/100)`);
  if (record.overturnedRadar) console.log('RESCATADA: el radar la había descartado.');
  console.log('');
  for (const reason of record.triageReasons) {
    const points = `${reason.points >= 0 ? '+' : ''}${reason.points}`;
    console.log(`  ${reason.axis.padEnd(16)} ${points.padStart(4)}  ${reason.reason}`);
  }
}

function main() {
  const inbox = readJson(inboxPath, []);
  if (inbox.length === 0) {
    console.error(`El inbox está vacío o no existe: ${inboxPath}`);
    process.exit(1);
  }

  const triagedAt = new Date().toISOString().slice(0, 10);
  const records = runTriage({ inbox, triagedAt });

  if (explainArg) {
    explain(records, explainArg.slice('--explain='.length));
    return;
  }

  report(records);

  if (dryRun) {
    console.log('\n--dry-run: no se ha escrito nada.');
    return;
  }

  writeFileSync(triagePath, serializeTriage(records), 'utf-8');
  console.log(`\nTriaje escrito: ${triagePath}`);
}

main();
