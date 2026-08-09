#!/usr/bin/env node
/**
 * Confirms the deployment has stopped moving before anything is measured
 * against it.
 *
 * A push starts a Vercel build, and when it finishes the branch alias swings to
 * the new deployment. During that swing the alias answers from both: the HTML
 * of one build, the hashed `/_astro/*` assets of the other. Requests for assets
 * that no longer exist come back 404, so every JavaScript-dependent behaviour
 * breaks at once while the static pages stay perfectly fine.
 *
 * That is exactly what it looked like: the consent dialog and the filters
 * failed, SEO and routing passed, and the same suite run twenty minutes later
 * was 245/245 without a single change. A regression that reports a broken site
 * because a deployment was in flight is worse than no regression — it costs a
 * diagnosis and teaches everyone to distrust the result.
 *
 * The check: fetch the page, collect the hashed assets it references, and
 * confirm every one of them resolves. Twice in a row, with the same asset set
 * both times. A deployment mid-swap fails that; a settled one passes it
 * immediately.
 *
 *   node scripts/preview-settled.mjs <url>
 */

import { existsSync, readFileSync } from 'node:fs';

const URL_ARG = process.argv[2];

if (!URL_ARG) {
  console.error('Uso: node scripts/preview-settled.mjs <url>');
  process.exit(2);
}

/** The same secret the suites send, read the same way. Never logged. */
function bypassHeaders() {
  if (!existsSync('.env.local')) return {};
  const line = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('VERCEL_PROTECTION_BYPASS='));
  const value = line?.slice('VERCEL_PROTECTION_BYPASS='.length).trim().replace(/^["']|["']$/g, '');
  return value ? { 'x-vercel-protection-bypass': value } : {};
}

const HEADERS = { ...bypassHeaders(), 'cache-control': 'no-cache' };

/** The hashed assets a page references, which is what changes between builds. */
async function assetsOf(url) {
  const response = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!response.ok) return { ok: false, reason: `la página responde ${response.status}` };

  const html = await response.text();
  const assets = [...new Set([...html.matchAll(/["'](\/_astro\/[^"']+)["']/g)].map((m) => m[1]))];

  if (!assets.length) return { ok: false, reason: 'la página no referencia ningún asset con hash' };

  // Every one of them has to exist. A 404 here is the swap in progress.
  const checks = await Promise.all(
    assets.map(async (path) => {
      const asset = await fetch(new URL(path, url), { headers: HEADERS, cache: 'no-store' });
      return { path, status: asset.status };
    })
  );

  const missing = checks.filter((c) => c.status >= 400);
  if (missing.length) {
    return { ok: false, reason: `${missing.length} de ${assets.length} assets no resuelven` };
  }

  return { ok: true, fingerprint: assets.sort().join('|'), count: assets.length };
}

const started = Date.now();
const elapsed = () => ((Date.now() - started) / 1000).toFixed(0);

let previous = null;

for (let attempt = 1; attempt <= 20; attempt += 1) {
  let current;
  try {
    current = await assetsOf(URL_ARG);
  } catch (error) {
    current = { ok: false, reason: String(error?.message ?? error).slice(0, 80) };
  }

  if (current.ok && previous === current.fingerprint) {
    console.log(`  despliegue estable: ${current.count} assets resuelven, sin cambios (${elapsed()}s) ✓`);
    process.exit(0);
  }

  if (current.ok) {
    // One good reading is not enough: the swap can land between two requests.
    previous = current.fingerprint;
  } else {
    previous = null;
    console.log(`  intento ${attempt} (${elapsed()}s): ${current.reason}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}

console.error(`\n✗ El despliegue sigue cambiando tras ${elapsed()}s. No se mide contra un blanco móvil.\n`);
process.exit(1);
