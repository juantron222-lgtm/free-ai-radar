#!/usr/bin/env node
/**
 * Outbound link checker.
 *
 * Reads every external URL from the generated catalogue and probes it, writing
 * a report to `docs/reports/links.json`.
 *
 * Deliberate choices:
 *   · `HEAD` first, falling back to a ranged `GET` — some vendors reject HEAD.
 *   · One request at a time per host, with a delay, so this never looks like
 *     scraping to the sites we depend on.
 *   · A browser-like User-Agent with a contact URL: if a vendor wants to block
 *     us, they should be able to identify us first.
 *   · A 404 on a tool's official URL is treated as a finding worth a changelog
 *     entry, not as a script failure.
 *
 * Usage:
 *   node scripts/check-links.mjs
 *   node scripts/check-links.mjs --only=official
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'src/data/generated/tools.json');
const OUT_DIR = join(ROOT, 'docs/reports');
const OUT_FILE = join(OUT_DIR, 'links.json');

const args = process.argv.slice(2);
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1] : null;

const TIMEOUT_MS = 12_000;
const DELAY_PER_HOST_MS = 1200;
const USER_AGENT =
  'FreeAIRadarLinkCheck/1.0 (+https://www.freeairadar.com/contacto; verificación de enlaces editoriales)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const attempt = async (method, extraHeaders = {}) => {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        ...extraHeaders,
      },
    });
    return response;
  };

  try {
    let response = await attempt('HEAD');

    // Plenty of sites answer HEAD with 403/405 but serve GET fine.
    if (response.status === 405 || response.status === 403 || response.status === 501) {
      response = await attempt('GET', { Range: 'bytes=0-2048' });
    }

    return {
      ok: response.ok || response.status === 206,
      status: response.status,
      finalUrl: response.url,
      redirected: response.url !== url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.name === 'AbortError' ? 'timeout' : String(error.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!existsSync(CATALOG)) {
    console.error(`No existe ${CATALOG}. Ejecuta antes: npm run data:migrate`);
    process.exit(1);
  }

  const tools = JSON.parse(readFileSync(CATALOG, 'utf8'));

  const targets = [];
  for (const tool of tools) {
    const push = (kind, url) => {
      if (!url) return;
      if (ONLY && kind !== ONLY) return;
      targets.push({ tool: tool.name, slug: tool.slug, kind, url });
    };
    push('official', tool.officialUrl);
    push('pricing', tool.pricingUrl);
    push('docs', tool.docsUrl);
    push('repo', tool.repoUrl);
  }

  console.log(`Comprobando ${targets.length} enlaces…\n`);

  // Group by host so we can pace ourselves per domain rather than globally.
  const byHost = new Map();
  for (const target of targets) {
    const host = hostOf(target.url) ?? 'desconocido';
    const bucket = byHost.get(host) ?? [];
    bucket.push(target);
    byHost.set(host, bucket);
  }

  const results = [];

  await Promise.all(
    [...byHost.values()].map(async (group) => {
      for (const target of group) {
        const outcome = await probe(target.url);
        results.push({ ...target, ...outcome });

        const mark = outcome.ok ? '·' : '✗';
        const detail = outcome.ok
          ? outcome.redirected
            ? `${outcome.status} → ${outcome.finalUrl}`
            : String(outcome.status)
          : outcome.error ?? String(outcome.status);
        console.log(`${mark} [${target.kind}] ${target.slug}: ${detail}`);

        await sleep(DELAY_PER_HOST_MS);
      }
    })
  );

  const broken = results.filter((result) => !result.ok);
  const redirected = results.filter((result) => result.ok && result.redirected);
  const brokenOfficial = broken.filter((result) => result.kind === 'official');

  const report = {
    generatedAt: new Date().toISOString(),
    checked: results.length,
    ok: results.length - broken.length,
    broken: broken.length,
    redirected: redirected.length,
    results: results.sort((a, b) => a.slug.localeCompare(b.slug)),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n=== Informe ===');
  console.log(`Comprobados: ${report.checked}`);
  console.log(`Correctos:   ${report.ok}`);
  console.log(`Rotos:       ${report.broken}`);
  console.log(`Redirigidos: ${report.redirected}`);
  console.log(`\nEscrito: ${OUT_FILE}`);

  if (brokenOfficial.length > 0) {
    console.log('\n-- URLs oficiales caídas (revisar: puede ser un cierre) --');
    for (const result of brokenOfficial) {
      console.log(`  · ${result.slug}: ${result.url} (${result.error ?? result.status})`);
    }
  }

  if (redirected.length > 0) {
    console.log('\n-- Redirecciones (conviene actualizar la URL en la ficha) --');
    for (const result of redirected.slice(0, 20)) {
      console.log(`  · ${result.slug} [${result.kind}]: ${result.url} → ${result.finalUrl}`);
    }
  }

  // Exit non-zero only when an official URL is down: that is an editorial
  // event, and CI should surface it. Everything else is informational.
  process.exit(brokenOfficial.length > 0 ? 1 : 0);
}

main();
