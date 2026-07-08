# Free AI Radar 🔍

**Novedades de IA gratis, filtradas y explicadas.**

Una aplicación web que rastrea, recopila, clasifica y muestra novedades de herramientas, modelos, servicios y recursos de inteligencia artificial gratuitos o con plan gratuito útil.

---

## 🚀 Instalación

```bash
cd free-ai-radar
npm install
```

## 🖥️ Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:4321](http://localhost:4321) en tu navegador.

## 📦 Build de producción

```bash
npm run build
npm run preview
```

## 📁 Estructura del proyecto

```
free-ai-radar/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/       # Componentes Astro reutilizables
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── ToolCard.astro
│   │   ├── SearchBar.astro
│   │   ├── FilterBar.astro
│   │   ├── ScoreBadge.astro
│   │   ├── VerdictTag.astro
│   │   ├── Newsletter.astro
│   │   ├── CategoryBadge.astro
│   │   └── FreeTypeBadge.astro
│   ├── data/
│   │   └── tools.json          # Base de datos de herramientas (JSON)
│   ├── layouts/
│   │   └── BaseLayout.astro    # Layout principal
│   ├── lib/
│   │   ├── index.ts            # Barrel export
│   │   ├── scoring.ts          # Sistema de puntuación
│   │   ├── normalizeTool.ts    # Normalizador de datos
│   │   ├── crawlerConfig.ts    # Configuración del crawler
│   │   └── sources.ts          # Fuentes de rastreo
│   ├── pages/
│   │   ├── index.astro         # Home page
│   │   └── tools/
│   │       ├── index.astro     # Listado completo
│   │       └── [slug].astro    # Ficha individual
│   └── styles/
│       └── global.css          # Estilos globales (Tailwind v4)
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── README.md
```

## ➕ Cómo añadir herramientas manualmente

Edita `src/data/tools.json` y añade una nueva entrada:

```json
{
  "id": "mi-herramienta-01",
  "name": "Nombre de la herramienta",
  "slug": "nombre-de-la-herramienta",
  "official_url": "https://...",
  "category": "Imagen IA",
  "subcategory": "",
  "description_short": "Descripción corta en una línea.",
  "description_long": "Descripción más detallada.",
  "free_type": "Gratis real",
  "free_plan_summary": "Resumen del plan gratuito.",
  "requires_signup": false,
  "requires_credit_card": false,
  "has_watermark": false,
  "commercial_use": "parcial",
  "open_source": false,
  "local_install": false,
  "github_url": "",
  "pricing_url": "",
  "docs_url": "",
  "source_urls": ["https://..."],
  "detected_at": "2026-07-08",
  "last_checked_at": "2026-07-08",
  "novelty_summary": "Qué novedad aporta esta herramienta.",
  "use_cases": ["Caso de uso 1", "Caso de uso 2"],
  "limitations": ["Limitación 1"],
  "alternatives": ["Alternativa 1"],
  "verdict": "Merece probar: free tier útil y fácil de usar.",
  "score_free_real": 9,
  "score_usefulness": 8,
  "score_ease": 7,
  "score_creator_potential": 6,
  "score_transparency": 8,
  "status": "active"
}
```

## 📊 Sistema de puntuación

La puntuación total (0-100) se calcula así:

| Componente | Peso | Máximo |
|---|---|---|
| Gratis real | ×2.5 | 25 |
| Utilidad práctica | ×2.5 | 25 |
| Facilidad de uso | ×1.5 | 15 |
| Transparencia | ×1.5 | 15 |
| Potencial creadores | ×1.0 | 10 |
| Actualidad/novedad | base | 10 |

**Penalizaciones:**

- Requiere tarjeta: **-15**
- Trial muy corto / demo limitada: **-10**
- Marca de agua: **-10**
- Transparencia < 4/10: **-15**
- Humo probable: **-20**

**Niveles de riesgo:**

- 🟢 **Bajo** (≥75): merece probar
- 🟡 **Medio** (45-74): revisar con cuidado
- 🔴 **Alto** (<45): humo probable

## 🔍 Cómo añadir nuevas fuentes de rastreo

Edita `src/lib/sources.ts` y añade una nueva entrada al array `sources`:

```typescript
{
  id: "mi-fuente",
  name: "Nombre de la fuente",
  url: "https://...",
  type: "web", // web | rss | github | reddit | huggingface | producthunt | newsletter
  category: "General",
  enabled: true,
  notes: "Descripción de qué buscar aquí.",
}
```

## 📡 Crawling automático

El crawler está preparado pero **deshabilitado por defecto** (`crawlerConfig.enabled = false`).

Para activarlo:

1. Edita `src/lib/crawlerConfig.ts` → `enabled: true`
2. Configura la `schedule` (formato cron)
3. Ajusta `requestDelayMs` para ser respetuoso con los servidores

**Reglas de extracción** definidas en `crawlerConfig.extractionRules`:
- Nombre de la herramienta
- URL oficial
- Descripción
- Información de pricing
- Detección de free tier
- Enlace a GitHub

## 🗺️ Próximos pasos

- [ ] Crawling automático programado con GitHub Actions o cron job
- [ ] Panel de revisión manual simple (aprovechar Astro actions)
- [ ] Integración real de newsletter (Resend, Buttondown, Mailchimp)
- [ ] Alertas por categoría (RSS/email)
- [ ] Sistema de afiliados (enlaces con referral)
- [ ] Exportar base de datos a CSV
- [ ] API pública JSON para consultar el radar
- [ ] Sección premium futura (herramientas verificadas con más detalle)
- [ ] Generar iconos PNG definitivos (npm run generate-icons)
- [ ] Publicar en Vercel/Netlify con dominio propio
- [ ] Publicar en Google Play vía Trusted Web Activity (ver docs/play-store.md)

## 🛠️ Stack técnico

- **[Astro](https://astro.build)** - Framework web estático
- **[Tailwind CSS v4](https://tailwindcss.com)** - Estilos utility-first
- **JSON estático** - Base de datos sin backend
- **TypeScript** - Lógica de puntuación y normalización
- **PWA** - Instalable en móvil con service worker y manifest

## 🚀 Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Conecta tu repositorio a Vercel
2. Framework: **Astro** (detectado automáticamente)
3. Build command: `npm run build` (por defecto)
4. Output directory: `dist` (por defecto)
5. Deploy

O desde CLI:

```bash
npm install -g vercel
vercel
```

### Netlify

1. Conecta tu repositorio a Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Deploy

O desde CLI:

```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

### Cloudflare Pages

1. Conecta tu repositorio a Cloudflare Pages
2. Framework preset: **Astro**
3. Build command: `npm run build`
4. Output directory: `dist`

### PWA checklist para producción

Antes de publicar, verifica:

```bash
npm run build
# Abre dist/ en un servidor local y comprueba:
# 1. manifest.webmanifest accesible en /manifest.webmanifest
# 2. Service worker registrado (DevTools > Application > Service Workers)
# 3. Lighthouse PWA audit ≥ 90
# 4. Iconos cargan correctamente
# 5. Instalación funciona en Android Chrome y iPhone Safari
```

### Generar iconos PNG

Los iconos PWA están en formato SVG. Para generar PNGs para producción:

```bash
npm install sharp
node scripts/generate-icons.js
```

Si no tienes sharp, convierte los SVG de `public/icons/` manualmente o usa un conversor online.

## ⚖️ Principios editoriales

1. **Nunca inventar datos.** Si no se puede confirmar, marcar "No confirmado".
2. **Priorizar precisión sobre cantidad.**
3. **Veredicto claro en cada herramienta:** ¿merece probar o es humo?
4. **Transparencia total** sobre fuentes y método de puntuación.
5. **Sin afiliados ocultos.** Si hay enlace de afiliado en el futuro, se indicará claramente.

---

**Free AI Radar** — Julio 2026  
Hecho con Astro + Tailwind CSS + escepticismo saludable.
