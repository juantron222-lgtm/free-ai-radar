# Auditoría del estado actual — Free AI Radar

**Fecha:** 3 de agosto de 2026
**Commit auditado:** `85e8212` (rama `develop`), etiquetado como `pre-opus5-rebuild`
**Web pública revisada:** https://www.freeairadar.com/
**Autor de la auditoría:** reconstrucción Opus 5

---

## 1. Resumen ejecutivo

Free AI Radar funciona hoy como un **catálogo estático de 22 herramientas**, construido con Astro 5 en modo
totalmente estático, con los datos en un único fichero `src/data/tools.json`. El contenido editorial es
razonable y la propuesta de valor —separar la IA gratis real del humo— es sólida y diferenciada. El
problema no es la idea: es que el producto no tiene **ningún mecanismo de retorno**, ninguna capa de
datos real, ninguna cuenta de usuario y ninguna vía de ingresos, y arrastra varios **defectos técnicos
que están costando tráfico orgánico hoy mismo**.

Gravedad de lo encontrado:

| Nivel | Nº | Ejemplos |
| --- | --- | --- |
| Crítico (afecta a producción ahora) | 4 | Dominio canónico incorrecto, sitemap y robots apuntando a un dominio de preview, newsletter falsa, manifest PWA roto |
| Alto | 11 | Filtros que se pisan entre sí, sin light mode, fuentes de Google sin consentimiento, cero tests, sin lint/typecheck |
| Medio | 14 | Código muerto, imports con casing roto, SW sin página offline, sin RSS de herramientas |
| Bajo | 9 | Ornamentación redundante, textos duplicados, iconografía inconsistente |

---

## 2. Producto

### 2.1 Qué problema resuelve realmente

Resuelve un problema real y con demanda de búsqueda constante: **"¿esto es gratis de verdad o me van a
pedir la tarjeta?"**. El mercado de directorios de IA está saturado de listados generados
automáticamente, sin criterio y monetizados con afiliación encubierta. El ángulo de Free AI Radar
—verificación honesta de los planes gratuitos, con límites, marcas de agua, licencias y uso comercial—
es el activo más valioso del proyecto y hay que protegerlo.

### 2.2 Usuarios principales identificados

1. **Creador de contenido / freelance** con presupuesto cero que necesita generar imagen, vídeo o voz sin
   marca de agua y con derecho de uso comercial.
2. **Desarrollador indie** buscando APIs y modelos con capa gratuita utilizable y sin tarjeta.
3. **Usuario con GPU local** (el contenido actual menciona explícitamente RTX 4060) que quiere ejecutar
   modelos en su máquina.
4. **Pyme / equipo pequeño** evaluando qué se puede hacer sin contratar nada.

### 2.3 Qué aporta valor hoy

- La puntuación editorial con componentes explicados (gratuidad real, utilidad, facilidad, transparencia,
  potencial para creadores).
- Los campos duros: `requires_credit_card`, `has_watermark`, `commercial_use`, `open_source`,
  `local_install`. Esto es exactamente lo que nadie más publica de forma estructurada.
- La página de metodología.
- El comparativo de ComfyUI en la nube (contenido largo, con intención de búsqueda clara).

### 2.4 Qué es ornamental o redundante

- El `Hero.astro` (8,4 KB) dedica la mayor parte del espacio a decoración; el primer dato útil aparece
  muy abajo.
- `index.astro` (23,7 KB) repite tres veces listados de herramientas (destacadas, mejor puntuadas,
  recientes) sobre el mismo conjunto de 22 elementos: hay solapamiento evidente de contenido.
- Los "filtros rápidos" duplican los `<select>` inmediatamente debajo, con comportamiento distinto e
  incompatible.
- Badges decorativas que no cambian ninguna decisión del usuario.

### 2.5 Qué falta para que el visitante vuelva cada semana

Nada del producto actual da un motivo para volver. No hay:

- Aviso de **cambios de plan** (que es justo lo que caduca: un plan gratis que deja de serlo).
- Historial de cambios por herramienta.
- Alertas por categoría.
- Novedades con valor incremental (la sección de noticias existe pero está desconectada del catálogo).

### 2.6 Qué justificaría crear una cuenta / pagar

- **Cuenta gratuita:** favoritos, listas, marcar "ya probada", seguir categorías, alertas básicas,
  selección semanal personalizada.
- **Pago (Radar Pro):** alertas inmediatas de cambio de precio/plan, historial completo de cambios,
  filtros avanzados, comparaciones guardadas, exportación, sin anuncios, informes.

---

## 3. Código

### 3.1 Arquitectura actual

```
Astro 5.18 (output: static, sin adaptador)
 └── src/data/tools.json  (22 objetos, fuente única de verdad)
 └── src/pages/*.astro    (11 rutas, HTML generado en build)
 └── src/components/*.astro (11 componentes, sin islas ni framework UI)
 └── Tailwind 4 vía plugin de Vite
 └── public/sw.js         (service worker manual)
```

No hay base de datos, backend, autenticación, endpoints de API ni estado de servidor. Todo el
comportamiento dinámico es JavaScript inline que manipula `style.display` sobre el DOM ya renderizado.

### 3.2 Defectos críticos

**C-1 · El dominio canónico es un dominio de preview de Vercel.**
`astro.config.mjs:5` define
`site: 'https://free-ai-radar-git-main-nada-de-pro.vercel.app'`.
Consecuencia en producción, verificada en vivo:

- Todos los `<link rel="canonical">` de `www.freeairadar.com` apuntan al dominio de preview.
- Todos los `og:url` y `og:image` apuntan al dominio de preview.
- `public/robots.txt` declara `Sitemap: https://free-ai-radar-git-main-nada-de-pro.vercel.app/sitemap.xml`
  (comprobado en la web pública el 3/8/2026).
- `public/sitemap.xml` contiene URLs del dominio de preview.

Esto le está diciendo a Google que el contenido canónico vive en otro dominio. Es el defecto más caro
del proyecto y explica cualquier problema de indexación.

**C-2 · La newsletter es falsa.**
`src/components/Newsletter.astro:22`:
`onsubmit="event.preventDefault(); alert('Newsletter preparada...')"`.
El formulario pide un email, ofrece seleccionar intereses (checkboxes `sr-only` que además no se envían
a ningún sitio) y muestra un `alert()`. Se están perdiendo el 100% de las suscripciones y se está
prometiendo algo que no ocurre.

**C-3 · El manifest PWA declara iconos y el `apple-touch-icon` puede no resolverse.**
Los `.png` existen en `public/icons/`, pero conviven con `.svg` del mismo nombre generados por
`scripts/generate-icons.js`; no hay verificación en build de que el manifest y los ficheros estén
sincronizados. Además no hay `id`, ni `screenshots`, ni página offline, por lo que la instalación es
de baja calidad y el criterio de instalabilidad depende del navegador.

**C-4 · Sin pipeline de calidad.**
`package.json` sólo tiene `dev`, `build`, `preview`. No hay `lint`, `typecheck` ni `test`. No existe
ni un solo test en el repositorio. Cualquier regresión llega a producción sin fricción.

### 3.3 Defectos altos

**A-1 · Los filtros no son combinables y se pisan entre sí.**
`src/components/FilterBar.astro`:
- Los filtros rápidos son mutuamente excluyentes por diseño (`querySelectorAll('.filter-btn').forEach(b => b.classList.remove('filter-btn-active'))`, línea 181).
- `no_card` y `creator` (líneas 209-227) hacen `return` antes de llamar a `applyFilters()`, de modo que
  **descartan** cualquier filtro de categoría o gratuidad activo en vez de combinarse con él.
- No hay estado en la URL: un filtro aplicado no se puede compartir, ni volver atrás, ni indexar.
- El orden se aplica reordenando nodos del DOM, así que el `sort` se pierde al filtrar de nuevo.

**A-2 · Sin modo claro.** Toda la paleta está fijada en oscuro en `src/styles/global.css`. No se respeta
`prefers-color-scheme`. Para un sitio con lectura larga y tablas comparativas, esto excluye a una parte
importante de los usuarios.

**A-3 · Fuentes de Google cargadas sin consentimiento.**
`BaseLayout.astro:64-66` hace `preconnect` y carga CSS de `fonts.googleapis.com`/`fonts.gstatic.com`.
Esto transmite la IP del visitante a un tercero en EE. UU. antes de cualquier consentimiento — problema
de RGPD para un proyecto dirigido a España/UE — y además bloquea el render.

**A-4 · Sin gestión de consentimiento.** No hay CMP, ni banner, ni bloqueo previo de scripts. Si se
activa AdSense (mencionado como objetivo de monetización), el sitio sería no conforme desde el primer día.

**A-5 · Sin cabeceras de seguridad.** No hay `vercel.json`; por tanto no hay CSP, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy` ni HSTS.

**A-6 · TypeScript `strict` pero sin comprobarlo nunca.** `tsconfig.json` extiende `astro/tsconfigs/strict`
pero nada ejecuta `astro check`, así que la garantía es nominal.

**A-7 · Enlaces salientes sin `rel` de seguridad ni divulgación de afiliación.** No hay política de
afiliados implementada aunque la estrategia la contempla.

**A-8 · Sin páginas de categoría.** `Imagen IA`, `Vídeo IA`, etc. son sólo valores de un `<select>`. Se
está desperdiciando la arquitectura editorial con mayor potencial de long tail.

**A-9 · Sin comparador.** El campo `alternatives` existe en los datos pero no se explota en ninguna
interfaz.

**A-10 · Accesibilidad sin verificar.** Se detectan `role`/`aria` ausentes en los controles de filtro, un
checkbox `sr-only` en la newsletter sin `<label>` asociado por `id`, y estados comunicados sólo por color
(`filter-btn-active`). No hay skip-link.

**A-11 · Service worker con estrategia insegura para terceros.** `public/sw.js:69-77` cachea
`fonts.googleapis.com` y `fonts.gstatic.com` con estrategia *cache-first*, y `skipWaiting()` incondicional
provoca que una pestaña abierta pueda quedar sirviendo mezcla de versiones. No hay página offline.

### 3.4 Defectos medios

**M-1 · Código muerto con imports rotos.** `src/lib/index.ts` reexporta desde `./normalizeTool` y
`./crawlerConfig`, pero los ficheros reales son `normalizetool.ts` y `crawlerconfig.ts` (minúsculas).
En Windows funciona; en el build de Vercel (Linux, sensible a mayúsculas) fallaría. No falla hoy
**sólo porque nadie importa `src/lib/index.ts`**: los cuatro módulos (`index`, `normalizetool`,
`sources`, `crawlerconfig`) son código muerto. El repositorio ya sufrió este problema antes
(commit `28c54f6`: "rename all 11 components to PascalCase for Vercel").

**M-2 · El scoring tiene una constante sin sentido.** `scoring.ts:46` suma `const novelty = 10` fijo a
todas las herramientas. Es un +10 constante que no aporta información y desplaza la escala.

**M-3 · `calculateScore` puede penalizar dos veces.** `requires_credit_card` resta 15 y además baja
`score_free_real`; `free_type: "Humo probable"` resta 20 y suele venir acompañado de transparencia baja
que ya resta otros 15. No está documentado ni testeado.

**M-4 · Los `tags` se derivan pero también se almacenan** en `tools.json`, con riesgo de divergencia entre
el valor guardado y el calculado.

**M-5 · `sitemap.xml` es un fichero estático commiteado** generado por `scripts/generate-sitemap.js`. Se
queda obsoleto en cuanto se añade una herramienta sin ejecutar el script.

**M-6 · No hay RSS del catálogo** (sí existe `noticias.xml.js` para noticias).

**M-7 · Sin `hreflang` ni preparación para una versión en inglés**, siendo el mercado angloparlante el de
mayor volumen para este nicho.

**M-8 · Sin datos estructurados.** No hay `Organization`, `WebSite`, `BreadcrumbList`, `ItemList` ni
`SoftwareApplication` en ninguna página.

**M-9 · `404.astro` existe pero no hay página de error 500.**

**M-10 · Sin breadcrumbs** ni en HTML ni en JSON-LD.

**M-11 · `news.json` pesa 154 KB y se importa completo** en `noticias.astro`; todo va al bundle del build.

**M-12 · Duplicación de layout.** Los 11 `.astro` de páginas repiten `<Header />` y `<Footer />`
manualmente en vez de componerlo en el layout.

**M-13 · `comfyui-sin-gpu.astro` (24,7 KB) es contenido editorial hardcodeado en una página**, sin modelo
de datos ni posibilidad de reutilizarlo o administrarlo.

**M-14 · Sin observabilidad.** No hay logging estructurado, ni captura de errores, ni métricas.

### 3.5 Modelo de datos actual

`Tool` (definido en `src/lib/scoring.ts`) tiene 38 campos. Es un buen punto de partida pero le faltan,
para el producto objetivo: idiomas, requisitos de hardware, plataformas, país de la empresa, política de
privacidad, frecuencia de renovación de créditos, licencia concreta, historial de cambios, estado
editorial con flujo, autoría de la revisión, afiliación y patrocinio.

Además usa el patrón `boolean | "no_confirmado"` para siete campos. Es correcto conceptualmente (la
incertidumbre es información honesta) pero está sin tipar de forma reutilizable y obliga a comparaciones
`=== true` dispersas por las plantillas.

---

## 4. Web pública — revisión de rutas

Rutas existentes: `/`, `/tools`, `/tools/[slug]` (22), `/creators`, `/about`, `/methodology`,
`/privacy`, `/noticias`, `/noticias.xml`, `/comfyui-sin-gpu`, `/404`.

| Comprobación | Resultado |
| --- | --- |
| Inicio | Carga y comunica la propuesta de valor. Tres bloques de listado con solapamiento de contenido. |
| Listado de herramientas | Funciona; filtros con los defectos A-1. |
| Fichas individuales | Contenido correcto pero formato de "tarjeta ampliada", no de análisis. Sin fuentes visibles destacadas, sin historial, sin responsable de la revisión. |
| Categorías | **No existen como ruta.** |
| Novedades | Existe `/noticias`, desconectada del catálogo de herramientas. |
| Metodología | Existe y es correcta. |
| Creadores | Existe; duplica el listado filtrado por `score_creator_potential`. |
| Privacidad | Existe, texto genérico. Faltan cookies, términos, transparencia de afiliados, derechos del usuario. |
| Newsletter | **Simulada** (C-2). |
| Navegación móvil | Usable; los filtros rápidos en carrusel horizontal no indican que hay más contenido a la derecha. |
| Metadatos | Presentes pero **canónicos apuntando al dominio equivocado** (C-1). |
| Estados vacíos | Al filtrar sin resultados no se muestra ningún mensaje: la rejilla queda en blanco. |
| Enlaces rotos | `robots.txt` y `sitemap.xml` apuntan a otro dominio. Sin verificación automática de URLs oficiales. |
| Duplicados | Solapamiento entre inicio, `/tools` y `/creators` sobre el mismo conjunto de 22 elementos. |
| Llamadas a la acción | Sólo "Explorar radar" y la newsletter falsa. No hay CTA de registro ni de guardado. |
| Consistencia visual | Correcta dentro de su estilo; monotonía por uso de un único acento verde. |

---

## 5. Dependencias

Estado en el momento de la auditoría (Astro 5.18.2):

- 13 vulnerabilidades (2 críticas, 8 altas, 3 moderadas), en `vitest`/`vite`/`esbuild` (dev) y
  `sharp`/`svgo`/`path-to-regexp` (build).
- `astro@^5.0.0` con rango abierto pero fijado en la práctica a una versión con `sharp` 0.34.5, afectada
  por CVE-2026-33327/33328/35590/35591 (libvips).

**Decisión tomada:** actualizar a Astro 7 y Vitest 4. Deja 3 vulnerabilidades altas, todas del mismo
origen: `path-to-regexp` a través de `@vercel/routing-utils`, dentro de `@astrojs/vercel`. Es código de
**generación de configuración de rutas en build**, no procesa entrada de usuario en runtime. Se
documenta y se vigila en `docs/security-review.md`.

---

## 6. Conclusión y dirección de la reconstrucción

El contenido y el criterio editorial se conservan íntegros. Lo que se reconstruye es todo lo demás:

1. **Arreglar lo que sangra hoy**: dominio canónico, robots, sitemap, newsletter real.
2. **Convertir el JSON en un modelo de datos real** con esquema Postgres, RLS y migración reversible,
   manteniendo un modo local sin credenciales para poder desarrollar y testear.
3. **Dar motivos para volver**: cuentas, favoritos, listas, seguimiento de cambios, alertas.
4. **Dar motivos para pagar**: Radar Pro con Stripe en modo test.
5. **Construir la arquitectura editorial** que hoy falta: categorías, comparativas, alternativas,
   colecciones.
6. **Cumplir**: consentimiento granular, CSP, cabeceras, RLS, auditoría.

Continúa en [`docs/product-strategy.md`](./product-strategy.md) y
[`docs/architecture.md`](./architecture.md).
