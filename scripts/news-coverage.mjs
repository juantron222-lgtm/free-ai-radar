#!/usr/bin/env node
/**
 * Coverage per vertical: what is being watched, what it produced, and what to
 * do when the answer is "nothing".
 *
 * The point of this report is the recommendation at the end, and the point of
 * the recommendation is that it is never "publish something". A vertical with
 * no candidates is a sourcing problem — too few sources, or a source that broke
 * quietly — and the fix is to add or repair sources. Filling the gap with a
 * mediocre story would make the number look better and the site worse.
 *
 * Reads only. Writes nothing anybody publishes from.
 *
 *   node scripts/news-coverage.mjs
 *   node scripts/news-coverage.mjs --json
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel, fallback) => {
  const path = resolve(here, rel);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
};

const AS_JSON = process.argv.includes('--json');

/**
 * The three verticals this report exists for, and the labels each dataset uses
 * for them.
 *
 * Sources say `voz` and `musica`; triage says `audio`. Rather than force one
 * vocabulary on both — which would mean editing either the source list or the
 * classifier for a reporting concern — the families are declared here, where
 * the reader can see exactly what was counted as what.
 */
const FAMILIES = [
  { id: 'imagen', label: 'Imagen', matches: ['imagen', 'image'] },
  { id: 'video', label: 'Vídeo', matches: ['video', 'vídeo'] },
  { id: 'audio', label: 'Audio', matches: ['audio', 'voz', 'musica', 'música'] },
];

const familyOf = (value) => {
  const v = String(value ?? '').toLowerCase();
  return FAMILIES.find((f) => f.matches.includes(v))?.id ?? null;
};

const daysSince = (iso) => {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
};

function build() {
  const sources = read('../src/data/news-sources.json', []);
  const health = read('../src/data/news/source-health.json', {});
  const inbox = read('../src/data/news/inbox.json', []);
  const triage = read('../src/data/news/triage.json', []);
  const verification = read('../src/data/news/verification.json', []);
  const news = read('../src/data/news/news.json', []);

  const triageById = new Map(triage.map((t) => [t.id, t]));

  return FAMILIES.map((family) => {
    const watched = sources.filter((s) => familyOf(s.category_defaults) === family.id);
    const active = watched.filter((s) => s.enabled);

    const byStatus = { healthy: 0, degraded: 0, broken: 0, sinDatos: 0 };
    for (const source of active) {
      const status = health[source.id]?.status;
      if (status && status in byStatus) byStatus[status] += 1;
      else byStatus.sinDatos += 1;
    }

    /*
     * A candidate counts for this family if either the radar or triage put it
     * there. They disagree sometimes, and for a coverage report the generous
     * reading is the honest one: the question is "did anything at all turn up",
     * not "did both classifiers agree on it".
     */
    const recientes = inbox.filter((row) => {
      const t = triageById.get(row.id);
      const fam = familyOf(row.vertical) ?? familyOf(t?.vertical);
      if (fam !== family.id) return false;
      const age = daysSince(row.publishedAt ?? row.observedAt);
      return age !== null && age <= 30;
    });

    const decisions = { promote: 0, hold: 0, reject: 0 };
    for (const row of recientes) {
      const decision = triageById.get(row.id)?.triageDecision;
      if (decision && decision in decisions) decisions[decision] += 1;
    }

    const utiles = recientes.filter((row) => {
      const d = triageById.get(row.id)?.triageDecision;
      return d === 'promote' || d === 'hold';
    });

    const ultima = utiles
      .map((row) => daysSince(row.publishedAt ?? row.observedAt))
      .filter((n) => n !== null)
      .sort((a, b) => a - b)[0];

    const verificadas = verification.filter(
      (v) => familyOf(v.category) === family.id || familyOf(v.vertical) === family.id
    ).length;

    const publicadas = news.filter((n) => familyOf(n.category) === family.id).length;

    return {
      vertical: family.label,
      fuentesVigiladas: active.length,
      fuentesApagadas: watched.length - active.length,
      salud: byStatus,
      candidatos30d: recientes.length,
      decisiones: decisions,
      utiles: utiles.length,
      diasDesdeUltimaUtil: ultima ?? null,
      verificadas,
      publicadas,
    };
  });
}

/**
 * What to do about it.
 *
 * Every branch that notices a gap points at sources. None of them points at
 * publishing, because the report cannot tell whether a good story exists — only
 * whether one arrived.
 */
function recommend(row) {
  if (row.salud.broken > 0) {
    return `reparar: ${row.salud.broken} fuente(s) rota(s) — no llega nada de ellas`;
  }
  if (row.salud.degraded > 0) {
    return `revisar el marcado: ${row.salud.degraded} fuente(s) devuelven 0 donde antes devolvían algo`;
  }
  if (row.fuentesVigiladas === 0) return 'ampliar: no hay ninguna fuente vigilada en esta vertical';
  if (row.fuentesVigiladas < 3) {
    return `ampliar: sólo ${row.fuentesVigiladas} fuente(s) vigiladas, pocas para cubrir la vertical`;
  }
  if (row.candidatos30d === 0) return 'ampliar: ninguna candidata en 30 días con las fuentes actuales';
  if (row.diasDesdeUltimaUtil === null) {
    return 'ampliar: hay candidatas pero ninguna ha superado el triaje';
  }
  if (row.diasDesdeUltimaUtil > 21) {
    return `ampliar: ${row.diasDesdeUltimaUtil} días desde la última candidata útil`;
  }
  return 'sin acción: la vertical produce candidatas';
}

const rows = build().map((row) => ({ ...row, recomendacion: recommend(row) }));

if (AS_JSON) {
  console.log(JSON.stringify({ generadoEl: new Date().toISOString().slice(0, 10), rows }, null, 2));
} else {
  console.log('\nCOBERTURA POR VERTICAL');
  console.log('═'.repeat(72));
  for (const row of rows) {
    console.log(`\n${row.vertical}`);
    console.log('─'.repeat(72));
    const line = (k, v) => console.log(`  ${String(k).padEnd(34)} ${v}`);
    line('Fuentes vigiladas', row.fuentesVigiladas + (row.fuentesApagadas ? `  (${row.fuentesApagadas} apagadas)` : ''));
    line(
      'Salud',
      `healthy ${row.salud.healthy} · degraded ${row.salud.degraded} · broken ${row.salud.broken}` +
        (row.salud.sinDatos ? ` · sin datos ${row.salud.sinDatos}` : '')
    );
    line('Candidatas (30 días)', row.candidatos30d);
    line('  promote / hold / reject', `${row.decisiones.promote} / ${row.decisiones.hold} / ${row.decisiones.reject}`);
    line('Verificadas', row.verificadas);
    line('Publicadas', row.publicadas);
    line(
      'Días desde la última útil',
      row.diasDesdeUltimaUtil === null ? 'ninguna' : row.diasDesdeUltimaUtil
    );
    console.log(`  → ${row.recomendacion}`);
  }
  console.log(`\n${'═'.repeat(72)}`);
  console.log('Una vertical sin candidatas es un problema de fuentes, no una');
  console.log('invitación a publicar algo mediocre para rellenar el hueco.\n');
}
