// Genera iconos PWA a partir de SVGs
// Uso: node scripts/generate-icons.js

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

// ESM → cargar sharp vía createRequire (CJS, confirmado funcional)
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const rootDir = resolve(import.meta.dirname, "..");

const sizes = [
  { svg: "public/icons/icon-192.svg", out: "public/icons/icon-192.png", size: 192 },
  { svg: "public/icons/icon-512.svg", out: "public/icons/icon-512.png", size: 512 },
  { svg: "public/icons/maskable-192.svg", out: "public/icons/maskable-192.png", size: 192 },
  { svg: "public/icons/maskable-512.svg", out: "public/icons/maskable-512.png", size: 512 },
];

console.log("🔧 Free AI Radar — Generando iconos PWA...");

// Generar PNGs
const results = [];
for (const { svg, out, size } of sizes) {
  const svgPath = resolve(rootDir, svg);
  const outPath = resolve(rootDir, out);

  if (!existsSync(svgPath)) {
    results.push({ out, size, ok: false, error: `SVG no encontrado: ${svg}` });
    console.error(`  ❌ ${out}: SVG fuente no encontrado → ${svg}`);
    continue;
  }

  try {
    await sharp(svgPath).resize(size, size).png().toFile(outPath);
    results.push({ out, size, ok: true });
    console.log(`  ✅ ${out} (${size}x${size})`);
  } catch (e) {
    results.push({ out, size, ok: false, error: e.message });
    console.error(`  ❌ ${out}: ${e.message}`);
  }
}

// Resumen
const ok = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
console.log(ok > 0 ? `🎉 ${ok} iconos generados.` : "");
if (fail > 0) {
  console.error(`❌ ${fail} fallos.`);
  process.exitCode = 1;
}
