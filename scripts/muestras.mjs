#!/usr/bin/env node
/**
 * El canal de ingesta de una muestra editorial.
 *
 * La generación la hace una persona con su cuenta —ver `docs/muestras.md`—;
 * esto se encarga de todo lo demás: archivar el original intacto, producir el
 * derivado que se sirve, medir lo que de verdad devolvió el servicio y dejar
 * la fila en `src/data/muestras.json`.
 *
 * Lo que el guion garantiza, y por lo que existe:
 *
 *   - **El original no se toca.** Se copia tal cual llegó. Nada de escalar,
 *     recortar, corregir color ni quitar marcas: es la prueba, y una prueba
 *     retocada no prueba nada.
 *   - **Las dimensiones se miden, no se copian del formulario.** Lo que
 *     importa es lo que llegó, no lo que el producto prometía.
 *   - **El derivado dice de qué viene.** Sólo se reescala y se recomprime, y
 *     `derivacion` lo escribe con las dos cifras.
 *
 * Uso:
 *   node scripts/muestras.mjs --anadir ficha.json
 *   node scripts/muestras.mjs --informe
 *
 * `ficha.json` lleva los metadatos que sólo puede saber quien hizo la prueba
 * —hora, créditos, cuota restante, si pidió tarjeta, si vio marca— y la ruta
 * al fichero descargado. Todo lo demás lo rellena esto.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINALES = join(ROOT, 'public/muestras/originales');
const AUXILIAR = join(ROOT, 'public/muestras/auxiliar');
const WEB = join(ROOT, 'public/muestras/web');
const REGISTRO = join(ROOT, 'src/data/muestras.json');
const CAPTURAS = join(ROOT, 'src/data/capturas.json');

/**
 * El ancho de la versión servida.
 *
 * La ficha le da a la muestra el ancho de su columna, que en escritorio no
 * pasa de 720 px. 1440 cubre el doble para pantallas densas; servir el
 * original de 2 MB para pintarlo a 700 px sería regalar megabytes.
 */
const ANCHO_WEB = 1440;

/**
 * El prompt común del piloto de Imagen.
 *
 * Exige composición, materiales, luz, coherencia espacial y anatomía, y no
 * depende de que el modelo sepa escribir texto dentro de la imagen —que es
 * una habilidad aparte y desviaría la comparación—. Sin marcas, sin personajes
 * protegidos y sin nada sexual.
 */
export const PROMPT_BASE =
  'Un taller de relojería al amanecer: una relojera de unos sesenta años, ' +
  'inclinada sobre un banco de madera desgastada, sostiene unas pinzas sobre ' +
  'un mecanismo abierto. Luz lateral fría entrando por una ventana alta, ' +
  'polvo suspendido en el haz. Sobre el banco, latón pulido, un paño de ' +
  'gamuza azul, un vaso de agua a medias y virutas metálicas. Fotografía ' +
  'documental, profundidad de campo corta, sin texto.';

// ---------------------------------------------------------------------------

async function anadir(rutaFicha) {
  const ficha = JSON.parse(readFileSync(rutaFicha, 'utf8'));
  const obligatorios = [
    'toolSlug',
    'generatedAt',
    'accessSurface',
    'accessUrl',
    'cardRequiredObserved',
    'watermarkObserved',
    'archivoDescargado',
  ];
  for (const campo of obligatorios) {
    if (!ficha[campo]) throw new Error(`Falta «${campo}» en ${rutaFicha}`);
  }

  const origen = ficha.archivoDescargado;
  if (!existsSync(origen)) throw new Error(`No existe el archivo descargado: ${origen}`);

  mkdirSync(ORIGINALES, { recursive: true });
  mkdirSync(WEB, { recursive: true });

  /*
   * 1. El original, copiado sin abrirlo siquiera, y su huella.
   *
   * `copyFileSync` no recodifica nada: el fichero archivado es byte a byte el
   * que salió del generador, en su formato —un PNG sigue siendo PNG y un JPEG
   * sigue siendo JPEG—. El hash se calcula sobre la copia, no sobre el origen,
   * para que certifique lo que de verdad se guarda.
   */
  const ext = extname(origen).toLowerCase() || '.png';
  const nombreOriginal = `${ficha.toolSlug}${ext}`;
  copyFileSync(origen, join(ORIGINALES, nombreOriginal));
  const bytesOriginal = readFileSync(join(ORIGINALES, nombreOriginal));
  const originalBytes = bytesOriginal.length;
  const originalSha256 = createHash('sha256').update(bytesOriginal).digest('hex');

  if (originalBytes !== statSync(origen).size) {
    throw new Error('La copia no coincide en tamaño con el original: no se archiva nada dudoso.');
  }

  // 2. Lo que de verdad llegó, medido en el fichero.
  const meta = await sharp(origen).metadata();
  if (!meta.width || !meta.height) throw new Error(`No se pueden leer las dimensiones de ${origen}`);

  // 3. El derivado: reescalado y recompresión, y nada más.
  const anchoDestino = Math.min(meta.width, ANCHO_WEB);
  const salida = await sharp(origen)
    .resize({ width: anchoDestino, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const nombreWeb = `${ficha.toolSlug}.webp`;
  writeFileSync(join(WEB, nombreWeb), salida);
  const metaWeb = await sharp(salida).metadata();

  const muestra = {
    id: `${ficha.toolSlug}-${ficha.generatedAt.slice(0, 10)}`,
    toolSlug: ficha.toolSlug,
    generatedAt: ficha.generatedAt,
    accessSurface: ficha.accessSurface,
    accessUrl: ficha.accessUrl,
    prompt: ficha.prompt ?? PROMPT_BASE,
    ...(ficha.promptDeviation ? { promptDeviation: ficha.promptDeviation } : {}),
    ...(ficha.model ? { model: ficha.model } : {}),
    ...(ficha.aspectRatio ? { aspectRatio: ficha.aspectRatio } : {}),
    dimensions: { width: meta.width, height: meta.height },
    ...(ficha.creditsSpent ? { creditsSpent: ficha.creditsSpent } : {}),
    ...(ficha.creditsLeft ? { creditsLeft: ficha.creditsLeft } : {}),
    cardRequiredObserved: ficha.cardRequiredObserved,
    watermarkObserved: ficha.watermarkObserved,
    ...(ficha.durationSeconds ? { durationSeconds: ficha.durationSeconds } : {}),
    asset: {
      original: `/muestras/originales/${nombreOriginal}`,
      originalBytes,
      originalSha256,
      web: `/muestras/web/${nombreWeb}`,
      webBytes: salida.length,
      webDimensiones: { width: metaWeb.width, height: metaWeb.height },
      derivacion: `Reescalado de ${meta.width}×${meta.height} a ${metaWeb.width}×${metaWeb.height} y recomprimido a WebP calidad 82. Sin recorte, sin corrección de color, sin retoque.`,
    },
    auxiliar: [],
    ...(ficha.notes ? { notes: ficha.notes } : {}),
  };

  const registro = existsSync(REGISTRO) ? JSON.parse(readFileSync(REGISTRO, 'utf8')) : [];
  const sinLaVieja = registro.filter((m) => m.id !== muestra.id);
  sinLaVieja.push(muestra);
  sinLaVieja.sort((a, b) => a.toolSlug.localeCompare(b.toolSlug));
  writeFileSync(REGISTRO, `${JSON.stringify(sinLaVieja, null, 2)}\n`, 'utf8');

  console.log(
    `✓ ${muestra.toolSlug}: original ${(originalBytes / 1024).toFixed(0)} kB ${meta.format} ${meta.width}×${meta.height} · sha256 ${originalSha256.slice(0, 16)}… → web ${(salida.length / 1024).toFixed(0)} kB ${metaWeb.width}×${metaWeb.height}`
  );
}

/**
 * Archiva una captura de la interfaz.
 *
 * Se guarda con su huella, y se le exige decir dos cosas: qué se lee
 * literalmente en ella y qué sostiene. Lo segundo es lo que impide que una
 * captura de un contador acabe leyéndose como la cuota oficial del producto.
 *
 * Va atada a una muestra (`muestraId`) cuando documenta las condiciones de esa
 * ejecución, o a una herramienta (`toolSlug`) cuando no hay generación detrás
 * —porque el producto no dejó generar, o porque lo que enseña sólo se ve con
 * la sesión iniciada—.
 *
 * **El recorte.** Una captura de navegador arrastra la barra de marcadores, el
 * correo de la cuenta y el nombre de quien hizo la prueba. Nada de eso es la
 * prueba y ninguna de esas cosas debería acabar publicada, así que se recorta;
 * pero recortar también sirve para quitar lo que incomoda, de modo que el
 * recorte se declara: qué región queda, de qué pantalla, y por qué.
 */
async function auxiliar(rutaFicha) {
  const ficha = JSON.parse(readFileSync(rutaFicha, 'utf8'));
  for (const campo of ['archivo', 'capturadaEl', 'textoVisible', 'respalda']) {
    if (!ficha[campo]) throw new Error(`Falta «${campo}» en ${rutaFicha}`);
  }
  if (!ficha.muestraId && !ficha.toolSlug) {
    throw new Error('Una captura va atada a una muestra («muestraId») o a una herramienta («toolSlug»).');
  }
  if (ficha.muestraId && ficha.toolSlug) {
    throw new Error('Elige una: «muestraId» o «toolSlug», no las dos.');
  }
  if (!existsSync(ficha.archivo)) throw new Error(`No existe la captura: ${ficha.archivo}`);

  const registro = JSON.parse(readFileSync(REGISTRO, 'utf8'));
  const muestra = ficha.muestraId ? registro.find((m) => m.id === ficha.muestraId) : undefined;
  if (ficha.muestraId && !muestra) throw new Error(`No hay ninguna muestra con id «${ficha.muestraId}»`);

  const slug = muestra ? muestra.toolSlug : ficha.toolSlug;
  if (!ficha.nombre) throw new Error('Falta «nombre»: el sufijo que identifica esta captura.');
  if (!ficha.muestraId && !ficha.url) throw new Error('Una captura de herramienta necesita «url»: dónde se tomó.');

  mkdirSync(AUXILIAR, { recursive: true });

  const nombre = `${slug}-${ficha.nombre}.webp`;
  const destino = join(AUXILIAR, nombre);

  /*
   * El recorte, si lo hay, y después WebP **sin pérdida**.
   *
   * Lo que prueba una captura son sus letras: un contador, un aviso, una
   * tarifa. Recomprimir eso con pérdida sería emborronar justo la evidencia,
   * así que no se hace. WebP sin pérdida deja los píxeles idénticos y pesa
   * alrededor de la mitad que el PNG —el aviso de Clipdrop pasó de 241 kB a
   * 109 kB—, y estas imágenes se sirven en fichas que ya cargan una muestra.
   */
  let recorte;
  let fuente = sharp(ficha.archivo);
  if (ficha.recorte) {
    const { left, top, width, height, porQue } = ficha.recorte;
    if (!porQue) throw new Error('Un recorte sin «porQue» no se archiva: recortar en silencio es editar.');
    const entera = await sharp(ficha.archivo).metadata();
    fuente = fuente.extract({ left, top, width, height });
    recorte = `Recorte de ${width}×${height} sobre una pantalla de ${entera.width}×${entera.height}, desde (${left}, ${top}). ${porQue}`;
  }
  await fuente.webp({ lossless: true }).toFile(destino);

  const bytes = readFileSync(destino);
  const meta = await sharp(destino).metadata();

  const entrada = {
    tipo: 'captura_interfaz',
    ruta: `/muestras/auxiliar/${nombre}`,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    dimensiones: { width: meta.width, height: meta.height },
    capturadaEl: ficha.capturadaEl,
    textoVisible: ficha.textoVisible,
    respalda: ficha.respalda,
    ...(recorte ? { recorte } : {}),
  };

  if (muestra) {
    muestra.auxiliar = [...(muestra.auxiliar ?? []).filter((a) => a.ruta !== entrada.ruta), entrada];
    writeFileSync(REGISTRO, `${JSON.stringify(registro, null, 2)}
`, 'utf8');
  } else {
    const previas = existsSync(CAPTURAS) ? JSON.parse(readFileSync(CAPTURAS, 'utf8')) : [];
    const id = `${slug}-${ficha.nombre}`;
    const sinLaVieja = previas.filter((c) => c.id !== id);
    sinLaVieja.push({ id, toolSlug: slug, url: ficha.url, ...entrada });
    sinLaVieja.sort((a, b) => a.id.localeCompare(b.id));
    writeFileSync(CAPTURAS, `${JSON.stringify(sinLaVieja, null, 2)}
`, 'utf8');
  }

  console.log(
    `✓ captura de ${slug} (${muestra ? `muestra ${muestra.id}` : 'sin muestra'}): ${(entrada.bytes / 1024).toFixed(0)} kB ${meta.width}×${meta.height} · sha256 ${entrada.sha256.slice(0, 16)}…${recorte ? ' · recortada' : ''}`
  );
}

function informe() {
  const registro = existsSync(REGISTRO) ? JSON.parse(readFileSync(REGISTRO, 'utf8')) : [];
  if (registro.length === 0) return console.log('No hay ninguna muestra todavía.');

  let orig = 0;
  let web = 0;
  for (const m of registro) {
    orig += m.asset.originalBytes;
    web += m.asset.webBytes;
    console.log(
      `${m.toolSlug.padEnd(18)} ${m.generatedAt}  original ${(m.asset.originalBytes / 1024).toFixed(0)} kB  web ${(m.asset.webBytes / 1024).toFixed(0)} kB  marca=${m.watermarkObserved}`
    );
  }
  console.log(
    `\n${registro.length} muestras · archivo ${(orig / 1024 / 1024).toFixed(2)} MB · servido ${(web / 1024).toFixed(0)} kB · media servida ${(web / registro.length / 1024).toFixed(0)} kB`
  );
}

const modo = process.argv[2];
if (modo === '--anadir') await anadir(process.argv[3] ?? (() => { throw new Error('Falta la ficha JSON'); })());
else if (modo === '--auxiliar') await auxiliar(process.argv[3] ?? (() => { throw new Error('Falta la ficha JSON'); })());
else if (modo === '--informe') informe();
else if (modo === '--prompt') console.log(PROMPT_BASE);
else console.log('Modos: --anadir <ficha.json> | --auxiliar <ficha.json> | --informe | --prompt');
