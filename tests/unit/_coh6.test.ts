import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { COMPARACIONES } from '@lib/data/comparaciones';
import { destacadas, VERTICALES, candidatasDe } from '@lib/data/home';
import { buildSearchDocs, searchWithIntents } from '@lib/search/index';
import { INTENCIONES } from '@lib/search/intents';
import { getPopulatedCategories } from '@lib/data/catalog';

const t = getAllTools();
const cats = new Map(getPopulatedCategories().map((c) => [c.slug, c.name]));
const docs = buildSearchDocs(t, (s) => cats.get(s) ?? s);

it('cohorte', () => {
  const home = destacadas(6).map((d) => d.tool.slug);
  const comparadas = [...new Set(COMPARACIONES.flatMap((c) => c.slugs))];

  // Primeras recomendaciones de cada vertical.
  const primeras = VERTICALES.flatMap((v) => candidatasDe(t, v.slugs).slice(0, 4).map((x) => x.slug));

  // Apariciones en los primeros puestos de cada intención declarada.
  const apariciones = new Map<string, number>();
  for (const i of INTENCIONES) {
    const r = searchWithIntents(docs, i.frases[0]!, { limit: 5 });
    for (const h of r.hits) apariciones.set(h.slug, (apariciones.get(h.slug) ?? 0) + 1);
  }

  const puntos = new Map<string, string[]>();
  const anota = (slug: string, motivo: string) => {
    if (!puntos.has(slug)) puntos.set(slug, []);
    puntos.get(slug)!.push(motivo);
  };
  for (const s of home) anota(s, 'Home');
  for (const s of comparadas) anota(s, 'comparación');
  for (const s of primeras) anota(s, 'vertical');
  for (const [s, n] of apariciones) if (n >= 1) anota(s, `intención×${n}`);

  const porSlug = new Map(t.map((x) => [x.slug, x]));
  const filas = [...puntos.entries()]
    .map(([slug, motivos]) => ({ slug, motivos, n: motivos.length, cat: porSlug.get(slug)!.categorySlug, url: porSlug.get(slug)!.officialUrl }))
    .sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug));

  const l = filas.map((f) => `${String(f.n).padStart(2)} ${f.slug.padEnd(24)} ${f.cat.padEnd(13)} ${f.motivos.join(', ')}`);
  l.unshift(`candidatas con al menos un motivo: ${filas.length}`, '');
  writeFileSync('C:/Users/juanl/AppData/Local/Temp/claude/C--Users-juanl--openclaw-autoclaw-workspace-free-ai-radar/f873eee8-5cb2-47c2-adfe-3275dc029a0e/scratchpad/coh6.txt', l.join('\n'), 'utf8');
});
