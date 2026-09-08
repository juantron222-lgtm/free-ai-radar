/**
 * Cuánto rinde cada fabricante, y cuáles han dejado de rendir.
 *
 * La pregunta que contesta es la que decide si esta sección parece una redacción
 * o un tablón abandonado: **de dónde salen las noticias, y dónde se pierden**.
 * Sin medirlo por fabricante, «hoy no hay nada» es indistinguible de «esta
 * fuente lleva dos meses rota y nadie lo ha visto».
 *
 * El embudo tiene cuatro pasos y cada uno se puede romper por su cuenta:
 *
 *   titulares    lo que el feed o el índice devuelve
 *   con fecha    los que traen fecha legible — sin ella la ventana los descarta
 *                sin mirarlos, que es como Anthropic aportaba cero
 *   en ventana   los de los últimos 45 días, que es lo que el radar considera
 *   triados      qué decidió el triaje: promote, hold o reject
 *
 * Y con Supabase delante, los dos pasos que sólo existen en la historia:
 * verificados y publicados.
 *
 *   node scripts/newsroom-cobertura.mjs            embudo en vivo, sin base de datos
 *   node scripts/newsroom-cobertura.mjs --historial  lo que la base recuerda
 *   node scripts/newsroom-cobertura.mjs --dias 30    ventana de inactividad
 *   node scripts/newsroom-cobertura.mjs --pasadas    la serie por banda de los últimos días
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Cuánto silencio se tolera antes de dar una fuente por inactiva.
 *
 * Tres semanas. Un fabricante pequeño puede pasar un mes sin publicar y eso no
 * es una avería, así que esto no dice «rota»: dice «mírala». La diferencia
 * importa, porque un aviso que se dispara solo acaba ignorándose.
 */
export const DIAS_SIN_APORTAR = 21;

/**
 * Qué fuentes llevan demasiado tiempo sin aportar un candidato.
 *
 * Se mide sobre candidatos ingeridos y no sobre titulares vistos, y es
 * deliberado: una fuente que devuelve doscientos titulares de los que ninguno
 * entra en la ventana está tan callada, para lo que aquí importa, como una que
 * devuelve un 404. Las dos merecen la misma mirada.
 */
export function fuentesInactivas(candidatos, fuentes, { hoy, dias = DIAS_SIN_APORTAR } = {}) {
  const referencia = hoy instanceof Date ? hoy : new Date(hoy ?? Date.now());

  const ultima = new Map();
  for (const fila of candidatos ?? []) {
    const id = fila.discovered_via ?? fila.discoveredVia;
    const dia = fila.observed_at ?? fila.observedAt;
    if (!id || !dia) continue;
    if (!ultima.has(id) || dia > ultima.get(id)) ultima.set(id, dia);
  }

  const salida = [];

  for (const fuente of fuentes ?? []) {
    if (!fuente.enabled) continue;

    /*
     * Una fuente recién añadida no está callada: es que acaba de llegar.
     *
     * Sin esto, el día que se amplían las fuentes el informe señala todas las
     * nuevas como inactivas. Un aviso que salta cuando no toca se aprende a
     * ignorar, y a partir de ahí deja de avisar también de las que sí lo están.
     * `since` es opcional: sin él se asume anterior a la ventana, que es lo
     * correcto para las fuentes que ya llevaban tiempo.
     */
    if (fuente.since) {
      const desde = (referencia.getTime() - Date.parse(`${fuente.since}T00:00:00Z`)) / 86_400_000;
      if (!Number.isNaN(desde) && desde < dias) continue;
    }

    const vista = ultima.get(fuente.id);

    if (!vista) {
      salida.push({
        id: fuente.id,
        nombre: fuente.name,
        ultimaVez: null,
        diasSin: null,
        motivo: 'no ha aportado ningún candidato todavía',
      });
      continue;
    }

    const diasSin = Math.floor((referencia.getTime() - Date.parse(`${vista}T00:00:00Z`)) / 86_400_000);
    if (diasSin >= dias) {
      salida.push({
        id: fuente.id,
        nombre: fuente.name,
        ultimaVez: vista,
        diasSin,
        motivo: `${diasSin} días sin aportar nada`,
      });
    }
  }

  return salida.sort((a, b) => (b.diasSin ?? Infinity) - (a.diasSin ?? Infinity));
}

/**
 * El embudo por fuente, a partir de lo que la base recuerda.
 *
 * `discovered_via` guarda el identificador de la fuente, así que el reparto por
 * fabricante sale de ahí y no de adivinar por el dominio.
 */
export function embudoDesdeHistorial({ candidatos, verificaciones, publicadas, fuentes }) {
  const porId = new Map((fuentes ?? []).map((f) => [f.id, f]));
  const veredicto = new Map((verificaciones ?? []).map((v) => [v.candidate_id, v.decision]));

  /* Lo publicado se ata a su candidato por el slug del borrador cuando existe. */
  const publicadasPorSlug = new Set((publicadas ?? []).map((p) => p.slug));

  const filas = new Map();
  const fila = (id) => {
    if (!filas.has(id)) {
      filas.set(id, {
        id,
        nombre: porId.get(id)?.name ?? id,
        candidatos: 0,
        leidos: 0,
        verificados: 0,
        publicados: 0,
        ultimaVez: null,
      });
    }
    return filas.get(id);
  };

  for (const c of candidatos ?? []) {
    const f = fila(c.discovered_via ?? 'desconocida');
    f.candidatos += 1;

    const dia = c.observed_at;
    if (dia && (!f.ultimaVez || dia > f.ultimaVez)) f.ultimaVez = dia;

    const decision = veredicto.get(c.id);
    /* «Leído» es haber llegado a un veredicto: se abrió la página y se juzgó. */
    if (decision) f.leidos += 1;
    if (decision === 'verified') f.verificados += 1;
    if (publicadasPorSlug.has(c.id)) f.publicados += 1;
  }

  return [...filas.values()].sort((a, b) => b.candidatos - a.candidatos);
}

/* ------------------------------------------------------------------ vivo -- */

async function embudoEnVivo({ dias }) {
  const { fetchSource } = await import('./source-adapters.mjs');
  const { runRadar } = await import('./radar/inbox.mjs');
  const { runTriage } = await import('./triage/triage.mjs');

  const fuentes = JSON.parse(readFileSync(resolve(ROOT, 'src/data/news-sources.json'), 'utf-8'));
  const activas = fuentes.filter((s) => s.enabled);
  const newsItems = JSON.parse(readFileSync(resolve(ROOT, 'src/data/news/news.json'), 'utf-8'));
  const observedAt = new Date().toISOString().slice(0, 10);
  const hoy = Date.now();

  const porFuente = new Map();
  const rows = [];
  const cola = [...activas];

  await Promise.all(
    Array.from({ length: 6 }, async () => {
      let s;
      while ((s = cola.shift())) {
        const registro = { id: s.id, nombre: s.name, tipo: s.source_type, titulares: 0, conFecha: 0, enVentana: 0, error: null };
        try {
          const items = await fetchSource(s, { timeoutMs: 20_000 });
          registro.titulares = items.length;
          for (const it of items) {
            if (it.publishedAt) registro.conFecha += 1;
            if (it.publishedAt && (hoy - Date.parse(it.publishedAt)) / 86_400_000 <= 45) registro.enVentana += 1;
            rows.push({ ...it, sourceId: s.id, source: s.name, publisher: s.homepage, vertical: s.category_defaults });
          }
        } catch (error) {
          registro.error = String(error?.message ?? error).slice(0, 40);
        }
        porFuente.set(s.id, registro);
      }
    })
  );

  const { inbox } = runRadar({ rows, sources: activas, newsItems, existing: [], observedAt });
  const triaje = runTriage({ inbox, triagedAt: observedAt });

  const decisionPorId = new Map(triaje.map((t) => [t.id, t]));
  for (const c of inbox) {
    const r = porFuente.get(c.discoveredVia);
    if (!r) continue;
    r.radar = (r.radar ?? 0) + 1;
    const t = decisionPorId.get(c.id);
    if (t) r[t.triageDecision] = (r[t.triageDecision] ?? 0) + 1;
  }

  return { porFuente: [...porFuente.values()], inbox, triaje, activas, dias };
}

function imprimirVivo({ porFuente, triaje, activas, dias }) {
  console.log('\nEmbudo por fabricante');
  console.log('─────────────────────────────────────────────────────────────────────────');
  console.log('id     tipo  titulares  fecha  ventana  radar  prom  hold  recha  fuente');

  const orden = [...porFuente].sort((a, b) => (b.radar ?? 0) - (a.radar ?? 0));
  for (const r of orden) {
    console.log(
      r.id.padEnd(6),
      (r.tipo ?? '').padEnd(5),
      String(r.titulares).padStart(9),
      String(r.conFecha).padStart(6),
      String(r.enVentana).padStart(8),
      String(r.radar ?? 0).padStart(6),
      String(r.promote ?? 0).padStart(5),
      String(r.hold ?? 0).padStart(5),
      String(r.reject ?? 0).padStart(6),
      ' ',
      r.error ? `ERROR ${r.error}` : r.nombre
    );
  }

  const total = (campo) => porFuente.reduce((n, r) => n + (r[campo] ?? 0), 0);
  console.log('─────────────────────────────────────────────────────────────────────────');
  console.log(
    `${activas.length} fuentes activas · ${total('titulares')} titulares · ${total('enVentana')} en ventana · ` +
      `${total('radar')} pasan el radar · promote ${total('promote')} · hold ${total('hold')} · reject ${total('reject')}`
  );

  /*
   * La distribución importa más que el total: dice cuánto material hay pegado
   * justo por debajo del umbral, que es la diferencia entre «no hay noticias» y
   * «el listón está donde está».
   */
  const bandas = { '80-100 (promote)': 0, '70-79': 0, '55-69': 0, '25-54': 0, '0-24': 0 };
  for (const t of triaje) {
    const s = t.triageScore;
    if (s >= 80) bandas['80-100 (promote)'] += 1;
    else if (s >= 70) bandas['70-79'] += 1;
    else if (s >= 55) bandas['55-69'] += 1;
    else if (s >= 25) bandas['25-54'] += 1;
    else bandas['0-24'] += 1;
  }
  console.log('\nDistribución de puntuación del triaje');
  for (const [banda, n] of Object.entries(bandas)) {
    console.log(`  ${banda.padEnd(18)} ${String(n).padStart(4)}  ${'█'.repeat(Math.min(40, n))}`);
  }

  const sinNada = porFuente.filter((r) => (r.radar ?? 0) === 0);
  if (sinNada.length) {
    console.log(`\nSin aportar nada al radar hoy (${sinNada.length}):`);
    for (const r of sinNada) console.log(`  · ${r.id} ${r.nombre}${r.error ? ` — ${r.error}` : ''}`);
    console.log(`  Que hoy no aporten no las condena: la inactividad se juzga a ${dias} días con --historial.`);
  }
}

/* ------------------------------------------------------------- historial -- */

async function pedir(url, key, ruta) {
  const respuesta = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${ruta}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!respuesta.ok) throw new Error(`Supabase respondió ${respuesta.status} en ${ruta}`);
  return respuesta.json();
}

async function historial({ dias }) {
  const url = process.env.PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.error('\nFaltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para leer el historial.\n');
    process.exit(1);
  }

  const fuentes = JSON.parse(readFileSync(resolve(ROOT, 'src/data/news-sources.json'), 'utf-8'));

  const [candidatos, verificaciones, publicadas] = await Promise.all([
    pedir(url, key, 'newsroom_candidates?select=id,discovered_via,observed_at,publisher&limit=10000'),
    pedir(url, key, 'newsroom_verification?select=candidate_id,decision&limit=10000'),
    pedir(url, key, 'newsroom_published?select=slug&limit=10000'),
  ]);

  const filas = embudoDesdeHistorial({ candidatos, verificaciones, publicadas, fuentes });

  console.log(`\nHistorial en ${new URL(url).host}`);
  console.log('──────────────────────────────────────────────────────────────');
  console.log('id     candidatos  leídos  verific.  public.  última     fuente');
  for (const f of filas) {
    console.log(
      f.id.padEnd(6),
      String(f.candidatos).padStart(10),
      String(f.leidos).padStart(7),
      String(f.verificados).padStart(9),
      String(f.publicados).padStart(8),
      ' ',
      (f.ultimaVez ?? '—').padEnd(10),
      f.nombre
    );
  }

  const inactivas = fuentesInactivas(candidatos, fuentes, { hoy: new Date(), dias });
  console.log(`\nFuentes que piden una mirada (sin aportar en ${dias} días o más): ${inactivas.length}`);
  for (const i of inactivas) console.log(`  · ${i.id.padEnd(6)} ${i.nombre.padEnd(30)} ${i.motivo}`);
  if (!inactivas.length) console.log('  ninguna');
}

/**
 * La comparación entre bandas a lo largo de varios días.
 *
 * Es la pregunta que justifica toda la política de recall: ¿de qué banda sale
 * lo que acaba llegando a un lector? Un solo día no la contesta —la auditoría
 * que motivó esto miró 38 historias, que es poco— y por eso esto acumula.
 */
async function pasadas({ dias }) {
  const url = process.env.PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.error('\nFaltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para leer las pasadas.\n');
    process.exit(1);
  }

  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const runs = await pedir(
    url,
    key,
    `newsroom_runs?select=started_at,trigger,status,notes&started_at=gte.${desde}&order=started_at.asc&limit=500`
  );

  const { total, pasadas: filas } = serieDeBandas(runs);

  console.log(`\nPasadas de los últimos ${dias} días en ${new URL(url).host}`);
  console.log('──────────────────────────────────────────────────────────────────────');

  if (filas.length === 0) {
    console.log('  Ninguna pasada ha registrado reparto por banda todavía.');
    console.log('  El formato se escribe desde la política de recall: hacen falta pasadas nuevas.');
    return;
  }

  console.log('día         disparo  estado   lectura  bandas (leídas/verif/borr/publ)');
  for (const f of filas) {
    const detalle = Object.entries(f.bandas)
      .map(([b, v]) => `${b} ${v.leidas}/${v.verificadas}/${v.borradores}/${v.publicadas}`)
      .join('  ');
    console.log(
      ' ',
      f.dia.padEnd(11),
      String(f.trigger ?? '').padEnd(8),
      String(f.status ?? '').padEnd(8),
      `${f.lectura ?? '?'}s`.padStart(7),
      ' ',
      detalle
    );
  }

  console.log('\nAcumulado por banda');
  console.log('banda    leídas  verificadas  borradores  publicadas   verif/leída  publ/leída');
  const orden = ['80+', '75-79', '70-74'];
  for (const b of orden) {
    const v = total[b];
    if (!v) continue;
    const pct = (n) => (v.leidas ? `${((n / v.leidas) * 100).toFixed(0)} %` : '—');
    console.log(
      b.padEnd(8),
      String(v.leidas).padStart(6),
      String(v.verificadas).padStart(12),
      String(v.borradores).padStart(11),
      String(v.publicadas).padStart(11),
      pct(v.verificadas).padStart(13),
      pct(v.publicadas).padStart(12)
    );
  }

  const leidasTotal = Object.values(total).reduce((n, v) => n + v.leidas, 0);
  const publTotal = Object.values(total).reduce((n, v) => n + v.publicadas, 0);
  console.log(`\n${filas.length} pasadas · ${leidasTotal} historias leídas · ${publTotal} publicadas`);
}

/* -------------------------------------------------------------------- cli -- */

/*
 * Sin `await` de nivel superior, y a propósito.
 *
 * `fuentesInactivas` la importa la pasada diaria, así que este fichero acaba
 * dentro del paquete de una función serverless. Un `await` en el cuerpo del
 * módulo obliga a todo el grafo que lo importe a ser asíncrono al cargarse, y
 * eso es una propiedad que no conviene regalarle a una función que ya se
 * ejecuta con un presupuesto de tiempo.
 */
const invocadoDirectamente = process.argv[1]?.replace(/\\/g, '/').endsWith('newsroom-cobertura.mjs');

if (invocadoDirectamente) {
  const args = process.argv.slice(2);
  const dias = Number(args[args.indexOf('--dias') + 1]) || DIAS_SIN_APORTAR;

  (async () => {
    if (args.includes('--pasadas')) await pasadas({ dias });
    else if (args.includes('--historial')) await historial({ dias });
    else imprimirVivo(await embudoEnVivo({ dias }));
  })().catch((error) => {
    console.error('\n✗', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

/* ------------------------------------------------------ serie por bandas -- */

/**
 * Qué banda produjo qué, leído de vuelta desde `notes`.
 *
 * La serie de una semana tiene que poder reconstruirse, y `newsroom_runs` no
 * tiene columna para esto. Añadir una obligaría a otra migración a mano contra
 * el Supabase de producción —que no se alcanza desde aquí—, así que el reparto
 * viaja dentro del texto en un formato que una persona lee de corrido y una
 * expresión regular recupera entero.
 *
 * Vive aquí y no junto a `resumirPasada`, que es quien lo escribe, para que
 * haya una sola implementación: una prueba de ida y vuelta ata las dos.
 */
export function leerBandas(notes) {
  const salida = {};
  const rx = /bandas (\d{2}\+|\d{2}-\d{2}) (\d+)\/(\d+)\/(\d+)\/(\d+)/g;

  let m;
  while ((m = rx.exec(String(notes ?? ''))) !== null) {
    salida[m[1]] = {
      leidas: Number(m[2]),
      verificadas: Number(m[3]),
      borradores: Number(m[4]),
      publicadas: Number(m[5]),
    };
  }
  return salida;
}

/** Cuánto duró la lectura de esa pasada, en segundos. */
export function leerTiempoLectura(notes) {
  const m = String(notes ?? '').match(/lectura ([\d.]+)s/);
  return m ? Number(m[1]) : null;
}

/**
 * Suma la serie de varias pasadas.
 *
 * Devuelve el acumulado por banda más la lista de pasadas, porque las dos
 * cosas contestan preguntas distintas: el acumulado dice qué banda rinde, y la
 * lista dice si eso fue estable o vino de un solo día bueno.
 */
export function serieDeBandas(runs) {
  const total = {};
  const pasadas = [];

  for (const run of runs ?? []) {
    const bandas = leerBandas(run.notes);
    if (Object.keys(bandas).length === 0) continue;

    for (const [b, v] of Object.entries(bandas)) {
      total[b] ??= { leidas: 0, verificadas: 0, borradores: 0, publicadas: 0 };
      for (const campo of Object.keys(v)) total[b][campo] += v[campo];
    }

    pasadas.push({
      dia: String(run.started_at ?? '').slice(0, 10),
      trigger: run.trigger,
      status: run.status,
      lectura: leerTiempoLectura(run.notes),
      bandas,
    });
  }

  return { total, pasadas };
}
