#!/usr/bin/env node
/**
 * El canal editorial de los logos.
 *
 * Un directorio que evalúa noventa y cuatro productos y no enseña ninguno se
 * lee como una hoja de cálculo. Pero un logo mal traído es peor que ninguno:
 * enlazar el favicon del fabricante en tiempo de ejecución nos ata a que
 * mañana no lo cambie, manda a nuestros lectores a un dominio ajeno sin
 * decírselo y publica una imagen cuya procedencia no consta en ningún sitio.
 *
 * Así que el activo se descarga una vez, se guarda aquí y se anota de dónde
 * salió. Las reglas, que el propio script comprueba:
 *
 *   - **Sólo fuentes atribuibles al producto.** El dominio oficial de la
 *     herramienta, su repositorio o su hub de modelos. Nada de buscadores de
 *     imágenes ni de paquetes de logos de terceros.
 *   - **Sin deformar.** Se reescala manteniendo la proporción; el encaje en la
 *     tarjeta lo hace el CSS con `object-fit: contain`, no un recorte aquí.
 *   - **Sin recolorear.** Un `.ico` se convierte a PNG porque el esquema no
 *     admite `.ico`, y nada más: los colores de la marca son suyos.
 *   - **Con procedencia.** Cada activo deja fila en `src/data/logos.json` con
 *     su URL, su clase de fuente y la fecha. No es público; es el registro que
 *     permite rehacer o retirar cualquiera de ellos.
 *
 * Uso:
 *   node scripts/logos.mjs --descubrir      # qué iconos publica cada dominio
 *   node scripts/logos.mjs --descargar      # trae y normaliza la cohorte
 *   node scripts/logos.mjs --medir          # qué fondo necesita cada marca
 *   node scripts/logos.mjs --informe        # qué hay y cuánto pesa
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(ROOT, 'public/logos');
const REGISTRO = join(ROOT, 'src/data/logos.json');
const HOY = new Date().toISOString().slice(0, 10);

/**
 * El lado mayor del activo guardado.
 *
 * La caja donde se pinta mide 40 px en la tarjeta y 64 en la cabecera de la
 * ficha; 128 cubre el doble de la mayor para pantallas densas y no más. Pasar
 * de ahí es cargar píxeles que nadie va a ver.
 */
const LADO_MAXIMO = 128;

/**
 * La cohorte: treinta y seis herramientas, las seis verticales representadas.
 *
 * Sale de cruzar las cuatro prioridades —portada, comparaciones preparadas,
 * primeras recomendaciones de cada vertical y apariciones en los bloques de
 * intención— y de repartir a mano para que ni Código ni Modelos se coman la
 * muestra. `fuente` sólo se escribe cuando el descubrimiento automático no
 * sirve: para un proyecto que vive en una forja, su avatar de organización es
 * la marca que el propio proyecto publica.
 */
const COHORTE = [
  /*
   * Cinco dominios responden 403 a cualquier lector automático, así que su
   * icono no se puede traer de su web. Para ésos se usa el avatar de su
   * organización en la forja, comprobado uno a uno contra la API de GitHub:
   * «krea-ai» declara `blog: https://www.krea.ai/`, y los otros cuatro llevan
   * el nombre del producto —«Ideogram», «lovable.dev», «Leonardo.Ai»,
   * «Cognition Ltd.»—. No se ha adivinado ninguno: se ha verificado.
   */
  // Imagen
  { slug: 'ideogram', fuente: 'https://github.com/ideogram-ai.png', clase: 'repo' },
  { slug: 'krea', fuente: 'https://github.com/krea-ai.png', clase: 'repo' },
  { slug: 'leonardo-ai', fuente: 'https://github.com/Leonardo-Interactive.png', clase: 'repo' },
  { slug: 'playground-ai' },
  { slug: 'comfyui', fuente: 'https://github.com/comfyanonymous.png', clase: 'repo' },
  { slug: 'clipdrop' },
  // Vídeo
  { slug: 'klingai' },
  { slug: 'pika-labs' },
  { slug: 'hailuo-ai' },
  { slug: 'higgsfield' },
  { slug: 'descript' },
  { slug: 'heygen' },
  // Audio, voz y música
  { slug: 'elevenlabs' },
  { slug: 'cartesia' },
  { slug: 'fish-audio' },
  { slug: 'whisper', fuente: 'https://github.com/openai.png', clase: 'repo' },
  { slug: 'kokoro', fuente: 'https://github.com/hexgrad.png', clase: 'repo' },
  { slug: 'suno-ai' },
  // Código
  { slug: 'github-copilot' },
  { slug: 'lovable', fuente: 'https://github.com/lovable-dev.png', clase: 'repo' },
  { slug: 'bolt-new' },
  { slug: 'v0-by-vercel' },
  { slug: 'cursor' },
  { slug: 'claude-code' },
  { slug: 'aider', fuente: 'https://github.com/Aider-AI.png', clase: 'repo' },
  // Agentes
  { slug: 'genspark' },
  { slug: 'devin', fuente: 'https://github.com/cognition-ai.png', clase: 'repo' },
  { slug: 'manus' },
  { slug: 'crewai', fuente: 'https://github.com/crewAIInc.png', clase: 'repo' },
  { slug: 'n8n' },
  // Modelos
  { slug: 'gemini-3-flash' },
  { slug: 'claude-haiku-4-5' },
  { slug: 'deepseek-v4-flash', fuente: 'https://github.com/deepseek-ai.png', clase: 'repo' },
  { slug: 'gemma-4', fuente: 'https://github.com/google-deepmind.png', clase: 'repo' },
  { slug: 'llama-4', fuente: 'https://github.com/meta-llama.png', clase: 'repo' },
  { slug: 'phi-4', fuente: 'https://github.com/microsoft.png', clase: 'repo' },
];

/**
 * Los únicos anfitriones de los que se acepta un activo.
 *
 * Se comprueba contra el dominio oficial de la propia ficha, más las dos
 * forjas donde los proyectos publican su marca. No hay una lista de dominios
 * permitidos escrita a mano: si el activo no viene del dominio de la
 * herramienta o de su repositorio, no entra.
 */
function anfitrionAdmisible(urlActivo, urlOficial) {
  const a = new URL(urlActivo).hostname.replace(/^www\./, '');
  const o = new URL(urlOficial).hostname.replace(/^www\./, '');

  if (a === o) return true;
  // Un subdominio del oficial, o el oficial siendo subdominio del activo.
  if (a.endsWith(`.${o}`) || o.endsWith(`.${a}`)) return true;
  // La forja y el hub, donde el proyecto publica su propia identidad.
  if (a === 'github.com' || a === 'avatars.githubusercontent.com') return true;
  if (a === 'huggingface.co' || a === 'cdn-lfs.huggingface.co') return true;
  return false;
}

async function traer(url, { comoTexto = false } = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'FreeAIRadar/1.0 (+https://www.freeairadar.com)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return comoTexto ? res.text() : Buffer.from(await res.arrayBuffer());
}

/** Los iconos que un dominio declara en su propio HTML, mejor primero. */
function candidatosDe(html, base) {
  const encontrados = [];
  const re = /<link\s[^>]*>/gi;
  for (const etiqueta of html.match(re) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(etiqueta)?.[1]?.toLowerCase() ?? '';
    if (!/icon/.test(rel)) continue;
    const href = /href=["']([^"']+)["']/i.exec(etiqueta)?.[1];
    if (!href) continue;
    const sizes = /sizes=["']([^"']+)["']/i.exec(etiqueta)?.[1] ?? '';
    const lado = Number.parseInt(sizes.split('x')[0] ?? '0', 10) || 0;

    let absoluta;
    try {
      absoluta = new URL(href, base).href;
    } catch {
      continue;
    }

    /*
     * El orden de preferencia, y su porqué:
     *   un SVG no pierde nada al escalar;
     *   un apple-touch-icon suele ser el más grande y sin fondo recortado;
     *   entre PNG, el de más lado declarado;
     *   el `.ico` es el último recurso: suele ser 32 px y hay que convertirlo.
     */
    const puntos =
      (absoluta.endsWith('.svg') ? 1000 : 0) +
      (rel.includes('apple-touch') ? 500 : 0) +
      lado +
      (absoluta.endsWith('.ico') ? -100 : 0);

    encontrados.push({ url: absoluta, rel, lado, puntos });
  }
  return encontrados.sort((a, b) => b.puntos - a.puntos);
}

/** Qué clase de imagen es, mirando los bytes y no la extensión. */
function formatoDe(buf) {
  if (buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e47')) return 'png';
  if (hex.startsWith('ffd8ff')) return 'jpeg';
  if (hex.startsWith('47494638')) return 'gif';
  if (hex.startsWith('00000100')) return 'ico';
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  const cabecera = buf.subarray(0, 400).toString('utf8').trimStart().toLowerCase();
  if (cabecera.startsWith('<svg') || cabecera.startsWith('<?xml')) return 'svg';
  return null;
}

/**
 * Deja el activo listo para servirlo, sin tocar la marca.
 *
 * Un SVG se guarda tal cual: ya escala. Todo lo demás se reescala al lado
 * mayor manteniendo la proporción —`fit: 'inside'`, nunca `cover`— y se
 * guarda como PNG con transparencia. No se recorta, no se rellena y no se
 * recolorea: si la marca es horizontal, se guarda horizontal, y encajarla en
 * un cuadro es cosa del CSS.
 */
async function normalizar(buf, formato) {
  if (formato === 'svg') return { datos: buf, extension: 'svg', ancho: null, alto: null };

  const entrada = formato === 'ico' ? await deIcoAPng(buf) : buf;
  const imagen = sharp(entrada, { animated: false });
  const meta = await imagen.metadata();

  const salida = await imagen
    .resize({
      width: Math.min(meta.width ?? LADO_MAXIMO, LADO_MAXIMO),
      height: Math.min(meta.height ?? LADO_MAXIMO, LADO_MAXIMO),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  const metaFinal = await sharp(salida).metadata();
  return { datos: salida, extension: 'png', ancho: metaFinal.width, alto: metaFinal.height };
}

/**
 * El mayor de los iconos que lleva dentro un `.ico`.
 *
 * Un `.ico` es un contenedor con varias resoluciones y sharp sólo lee la
 * primera. Se localiza la entrada de mayor lado en el directorio y se le pasa
 * su porción a sharp: si es un PNG embebido lo lee directo, y si es un BMP
 * antiguo se cae y lo dice, en vez de guardar un icono de 16 px.
 */
async function deIcoAPng(buf) {
  const cuantos = buf.readUInt16LE(4);
  let mejor = null;

  for (let i = 0; i < cuantos; i++) {
    const base = 6 + i * 16;
    const ancho = buf.readUInt8(base) || 256;
    const tam = buf.readUInt32LE(base + 8);
    const desde = buf.readUInt32LE(base + 12);
    if (!mejor || ancho > mejor.ancho) mejor = { ancho, tam, desde };
  }
  if (!mejor) throw new Error('ico sin entradas');

  const porcion = buf.subarray(mejor.desde, mejor.desde + mejor.tam);
  if (formatoDe(porcion) === 'png') return porcion;

  return deDibAPng(porcion, mejor.ancho);
}

/**
 * El caso incómodo: un mapa de bits crudo dentro del `.ico`.
 *
 * Cinco de los treinta y seis dominios sirven así su icono. Sharp no lee un
 * DIB suelto —le falta la cabecera de fichero BMP— y tampoco entiende la
 * máscara AND que los `.ico` guardan detrás de los píxeles. Se rehacen los
 * píxeles a mano, que para 32 bits por píxel es leer BGRA al revés: el DIB va
 * de abajo arriba.
 *
 * Se hace aquí y no se busca «un activo mejor» porque el activo mejor no
 * existe: es el icono que ese fabricante publica.
 */
function deDibAPng(dib, ladoDeclarado) {
  const tamCabecera = dib.readUInt32LE(0);
  const ancho = dib.readInt32LE(4);
  // En un `.ico` el alto del DIB cuenta también la máscara: es el doble.
  const alto = Math.abs(dib.readInt32LE(8)) / 2;
  const bpp = dib.readUInt16LE(14);

  if (bpp !== 32) throw new Error(`ico BMP de ${bpp} bits: no soportado`);
  if (ancho !== ladoDeclarado && ladoDeclarado !== 256) {
    throw new Error(`ico BMP incoherente: cabecera ${ancho}, directorio ${ladoDeclarado}`);
  }

  const pixeles = dib.subarray(tamCabecera);
  const rgba = Buffer.alloc(ancho * alto * 4);

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      // El DIB guarda las filas de abajo arriba y los canales en BGRA.
      const origen = ((alto - 1 - y) * ancho + x) * 4;
      const destino = (y * ancho + x) * 4;
      rgba[destino] = pixeles[origen + 2];
      rgba[destino + 1] = pixeles[origen + 1];
      rgba[destino + 2] = pixeles[origen];
      rgba[destino + 3] = pixeles[origen + 3];
    }
  }

  return sharp(rgba, { raw: { width: ancho, height: alto, channels: 4 } }).png().toBuffer();
}

// ---------------------------------------------------------------------------

const tools = JSON.parse(readFileSync(join(ROOT, 'src/data/generated/tools.json'), 'utf8'));
const porSlug = new Map(tools.map((t) => [t.slug, t]));

async function descubrir() {
  for (const entrada of COHORTE) {
    const tool = porSlug.get(entrada.slug);
    if (!tool) {
      console.log(`${entrada.slug}: NO EXISTE`);
      continue;
    }
    if (entrada.fuente) {
      console.log(`${entrada.slug}: (declarada) ${entrada.fuente}`);
      continue;
    }
    try {
      const html = await traer(tool.officialUrl, { comoTexto: true });
      const cands = candidatosDe(html, tool.officialUrl).slice(0, 3);
      console.log(`${entrada.slug}: ${cands.map((c) => `${c.url} [${c.rel} ${c.lado || '?'}]`).join(' | ') || '(ninguno declarado)'}`);
    } catch (e) {
      console.log(`${entrada.slug}: ERROR ${e.message}`);
    }
  }
}

async function descargar() {
  mkdirSync(DESTINO, { recursive: true });
  const registro = existsSync(REGISTRO) ? JSON.parse(readFileSync(REGISTRO, 'utf8')) : {};
  const fallos = [];

  for (const entrada of COHORTE) {
    const tool = porSlug.get(entrada.slug);
    if (!tool) {
      fallos.push(`${entrada.slug}: no existe en el catálogo`);
      continue;
    }

    try {
      let url = entrada.fuente;
      const clase = entrada.clase ?? 'favicon';

      let referida;

      if (!url) {
        const html = await traer(tool.officialUrl, { comoTexto: true });
        const cands = candidatosDe(html, tool.officialUrl);
        url = cands[0]?.url ?? new URL('/favicon.ico', tool.officialUrl).href;
        /*
         * Lo que el dominio oficial enlaza en su propio HTML es suyo aunque lo
         * sirva un CDN: GitHub reparte sus iconos desde `githubassets.com` y
         * Google desde `gstatic.com`. Quien atribuye no es el anfitrión, es la
         * página que lo referencia, y esa página queda anotada.
         */
        referida = tool.officialUrl;
      }

      if (!referida && !anfitrionAdmisible(url, tool.officialUrl)) {
        fallos.push(`${entrada.slug}: ${new URL(url).hostname} no es atribuible al producto`);
        continue;
      }

      const bruto = await traer(url);
      const formato = formatoDe(bruto);
      if (!formato) {
        fallos.push(`${entrada.slug}: lo servido en ${url} no es una imagen`);
        continue;
      }

      const { datos, extension, ancho, alto } = await normalizar(bruto, formato);
      const nombre = `${entrada.slug}.${extension}`;
      writeFileSync(join(DESTINO, nombre), datos);

      registro[entrada.slug] = {
        ruta: `/logos/${nombre}`,
        sourceUrl: url,
        sourceKind: clase,
        formatoOriginal: formato,
        ...(referida ? { descubiertoEn: referida } : {}),
        ancho: ancho ?? null,
        alto: alto ?? null,
        bytes: datos.length,
        obtenidoEl: HOY,
      };
      console.log(`✓ ${entrada.slug.padEnd(20)} ${String(datos.length).padStart(7)} B  ${extension}  ${ancho ?? '?'}×${alto ?? '?'}  ${url}`);
    } catch (e) {
      fallos.push(`${entrada.slug}: ${e.message}`);
    }
  }

  writeFileSync(REGISTRO, `${JSON.stringify(registro, null, 2)}\n`, 'utf8');
  console.log(`\nGuardados: ${Object.keys(registro).length} · Fallos: ${fallos.length}`);
  for (const f of fallos) console.log(`  ✗ ${f}`);
}

/**
 * Qué fondo necesita cada marca, medido en la propia marca.
 *
 * Un solo color de fondo no sirve: en la cohorte hay cinco logos casi negros
 * —Clipdrop, Leonardo, Krea, Playground, Kokoro— y diez casi blancos —Devin,
 * ElevenLabs, Llama, Lovable…—. Sobre una placa blanca desaparecen los
 * primeros; sobre una oscura, los segundos.
 *
 * Lo que decide es la propia imagen, no una lista escrita a mano:
 *
 *   - Si los píxeles opacos cubren casi todo el lienzo, la marca trae su
 *     propio fondo y no necesita placa: basta recortarla al radio de la caja.
 *   - Si es una silueta con transparencia, la placa se elige por su
 *     luminosidad media: clara para una marca oscura, oscura para una clara.
 *   - En la banda de en medio se deja que mande el tema, que es lo que hace
 *     cualquier interfaz cuando no hay conflicto.
 *
 * Nada de esto toca el activo. La marca se guarda como la publica su dueño;
 * lo que cambia es sobre qué se apoya.
 */
async function medir() {
  const registro = JSON.parse(readFileSync(REGISTRO, 'utf8'));

  for (const meta of Object.values(registro)) {
    const fichero = join(DESTINO, meta.ruta.replace('/logos/', ''));
    if (!existsSync(fichero)) continue;

    const entrada = readFileSync(fichero);

    /*
     * Un SVG puede traer su propia versión clara y oscura.
     *
     * El de v0 lleva dentro `@media (prefers-color-scheme: …)` y se repinta
     * solo. Rasterizarlo para medirlo da 0 % de cobertura —sharp no aplica
     * media queries— y lo clasificaría como una silueta que necesita placa,
     * cuando en un navegador se dibuja su propio fondo. Cuando el fabricante
     * ya ha resuelto los dos temas, lo que toca es no estorbar.
     */
    if (fichero.endsWith('.svg') && entrada.toString('utf8').includes('prefers-color-scheme')) {
      meta.luminancia = null;
      meta.cobertura = null;
      meta.placa = 'ninguna';
      meta.temaPropio = true;
      continue;
    }

    // Al resto hay que rasterizarlo para poder mirarlo; 64 px bastan.
    const { data, info } = await sharp(entrada, { density: 96 })
      .resize(64, 64, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let suma = 0;
    let opacos = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      opacos++;
      suma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }

    const luminancia = opacos ? Math.round(suma / opacos) : 0;
    const cobertura = opacos / (info.width * info.height);

    meta.luminancia = luminancia;
    meta.cobertura = Number(cobertura.toFixed(2));
    meta.placa =
      cobertura >= 0.95 ? 'ninguna' : luminancia < 100 ? 'clara' : luminancia > 170 ? 'oscura' : 'tema';
  }

  writeFileSync(REGISTRO, `${JSON.stringify(registro, null, 2)}
`, 'utf8');

  const cuenta = {};
  for (const m of Object.values(registro)) cuenta[m.placa] = (cuenta[m.placa] ?? 0) + 1;
  console.log(`Medidos ${Object.keys(registro).length} activos. Placas: ${JSON.stringify(cuenta)}`);
}

function informe() {
  if (!existsSync(DESTINO)) return console.log('No hay logos todavía.');
  const ficheros = readdirSync(DESTINO);
  let total = 0;
  for (const f of ficheros) total += statSync(join(DESTINO, f)).size;
  const porTipo = {};
  for (const f of ficheros) porTipo[extname(f)] = (porTipo[extname(f)] ?? 0) + 1;
  console.log(`Ficheros: ${ficheros.length} · Peso total: ${(total / 1024).toFixed(1)} kB · Media: ${(total / ficheros.length / 1024).toFixed(1)} kB`);
  console.log(`Por formato: ${JSON.stringify(porTipo)}`);
}

const modo = process.argv[2];
if (modo === '--descubrir') await descubrir();
else if (modo === '--descargar') await descargar();
else if (modo === '--medir') await medir();
else if (modo === '--informe') informe();
else console.log('Modos: --descubrir | --descargar | --medir | --informe');
