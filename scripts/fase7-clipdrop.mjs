#!/usr/bin/env node
/**
 * La corrección de Clipdrop, y el hueco que la hizo posible.
 *
 * La ficha presentaba a Clipdrop como generación de imagen gratuita: su
 * `tagline` empezaba por «Generación», su `descriptionShort` metía «texto a
 * imagen» en la lista de lo que cubre el plan gratuito, y `capabilities`
 * declaraba `text-to-image`, que es lo que lo colaba en el bloque «Genera
 * imágenes gratis ahora».
 *
 * Al intentarlo de verdad, su propia interfaz responde que la generación es
 * exclusiva de Pro. No es que la ficha exagerara: anunciaba como gratis
 * justamente lo que no lo es.
 *
 * El arreglo no es borrar la capacidad —el producto sabe generar, y negarlo
 * sería la mentira contraria—, sino separar las dos preguntas con
 * `freePlan.excludedCapabilities`. Lo que el producto hace sigue en
 * `capabilities`; lo que su plan gratuito no te deja hacer, aquí.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'src/data/tools-v2.json';
const HOY = '2026-08-26';
const catalogo = JSON.parse(readFileSync(RUTA, 'utf8'));
const tools = Array.isArray(catalogo) ? catalogo : catalogo.tools;
const de = (slug) => tools.find((t) => t.slug === slug);

// ---------------------------------------------------------------------------
// Clipdrop: generar no entra en el plan gratuito.
// ---------------------------------------------------------------------------
const clipdrop = de('clipdrop');
clipdrop.freePlan.excludedCapabilities = ['text-to-image'];
clipdrop.tagline =
  'Edición de imagen con cuotas gratuitas que se renuevan cada 24 horas. Generar imágenes es de pago.';
clipdrop.descriptionShort =
  'Suite de imagen en el navegador. Su plan gratuito cubre las herramientas de edición —quitar fondo, ' +
  'escalar, limpiar, reiluminar, quitar texto— con cuotas por herramienta que se renuevan cada 24 horas. ' +
  'La generación de texto a imagen no entra: al intentarlo, la propia interfaz responde que es exclusiva de Pro.';
clipdrop.verdict =
  'Cuotas diarias documentadas herramienta por herramienta, que es justo lo que un catálogo de acceso ' +
  'gratuito debe poder decir. Con una excepción que conviene saber antes de entrar: generar imágenes no ' +
  'está incluido.';

/*
 * La evidencia va al campo nuevo, no sólo a `limits`.
 *
 * `scope: 'web'` a propósito y no `product`: lo comprobamos en la aplicación
 * web. Clipdrop tiene API, y lo que valga allí es otra afirmación que nadie ha
 * comprobado. Universalizar desde una puerta es el error que el alcance existe
 * para impedir.
 */
clipdrop.evidence = [
  ...clipdrop.evidence.filter((e) => e.field !== 'freePlan.excludedCapabilities'),
  {
    field: 'freePlan.excludedCapabilities',
    outcome: 'stated',
    sourceUrl: 'https://clipdrop.co/text-to-image',
    sourceKind: 'official',
    scope: 'web',
    checkedAt: HOY,
    quote: 'Image generation is for Pro — Generate images exclusively for Pro users',
  },
];

// ---------------------------------------------------------------------------
// Krea y Leonardo: una cita documental no puede llevar dentro nuestro saldo.
// ---------------------------------------------------------------------------

/*
 * Las dos entradas que archivé ayer citaban «92 Credits remaining · 100 per
 * day» y «Fast Tokens 134 / 150». Los números de la izquierda no son
 * documentación de nadie: son el saldo de nuestra cuenta en ese instante, que
 * es exactamente la clase de dato que esta fase separa. Se quedan en la
 * captura, que es su sitio.
 *
 * De Krea sobrevive lo que sí dice el fabricante —«100 per day»— y su tarifa
 * por modelo, que no está en ninguna URL pública. De Leonardo no sobrevive
 * nada: lo único documental que aportaba —que existe un plan gratuito de 150
 * fichas— ya estaba en la ficha desde su página de precios.
 */
const krea = de('krea');
for (const ev of krea.evidence) {
  if (ev.field === 'freePlan.creditReset') ev.quote = '100 per day';
  if (ev.field === 'freePlan.limits') {
    ev.quote = 'Krea 2 Turbo 2 · Krea 2 Large 20 · Krea 2 Medium 9 · ChatGPT 2 ~75 · Nano Banana Pro ~100';
  }
}
const tarifa = 'Coste por generación en el selector: Krea 2 Turbo 2, Medium 9, Large 20';
krea.freePlan.limits = [...krea.freePlan.limits.filter((l) => !l.startsWith('Coste por generación')), tarifa];

const leonardo = de('leonardo-ai');
leonardo.evidence = leonardo.evidence.filter(
  (e) => !(e.field === 'freePlan.limits' && e.checkedAt === HOY)
);

writeFileSync(RUTA, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
console.log('✓ Clipdrop: text-to-image fuera del plan gratuito, con evidencia');
console.log('✓ Krea: citas recortadas a lo que dice el fabricante; tarifa por modelo en los límites');
console.log('✓ Leonardo: retirada la evidencia documental que citaba nuestro saldo');
