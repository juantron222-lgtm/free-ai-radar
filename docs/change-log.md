# Registro de cambios

## 2.0.0 — 3 de agosto de 2026

Reconstrucción completa. Rama `opus5-premium-rebuild`, partiendo de `85e8212` (etiquetado como
`pre-opus5-rebuild`).

---

### Corregido en producción (lo que estaba sangrando)

- **Dominio canónico.** `astro.config.mjs` declaraba
  `site: 'https://free-ai-radar-git-main-nada-de-pro.vercel.app'`. En consecuencia,
  `www.freeairadar.com` servía canónicos, `og:url`, `og:image`, `robots.txt` y `sitemap.xml`
  apuntando a un dominio de preview — le decía a Google que el contenido canónico vivía en otro
  sitio. Ahora hay una única constante (`SITE_URL`) verificada por test.
- **Newsletter falsa.** El formulario hacía `preventDefault()` y mostraba un `alert()`. Se perdía el
  100% de las suscripciones. Sustituida por doble opt-in real con Resend, tokens hasheados y baja en
  un clic conforme a RFC 8058.
- **Fuentes de Google.** Se cargaban desde `fonts.googleapis.com`, transmitiendo la IP del visitante
  a EE. UU. antes de cualquier consentimiento. Eliminadas.
- **Filtros que se pisaban.** `no_card` y `creator` hacían `return` antes de aplicar los demás, así
  que descartaban cualquier filtro activo en vez de combinarse. Reescritos como AND combinables con
  estado en la URL.
- **Manifest PWA.** Sin `id`, sin `shortcuts`, sin verificación de que los iconos existieran.
- **Service worker.** Cacheaba fuentes de Google *cache-first*, hacía `skipWaiting()` incondicional
  y no tenía página offline. Reescrito.

### Añadido

**Descubrimiento**
- Buscador propio con índice invertido ponderado, tolerancia a erratas por longitud de palabra,
  sugerencias, historial local y navegación por teclado (`/` para enfocar).
- 17 filtros combinables con estado compartible en la URL.
- Estado vacío que identifica **qué filtro concreto** deja la lista sin resultados y ofrece quitarlo.
- Comparador de 2 a 4 herramientas, con URL compartible e indexable sólo cuando tiene contenido.
- Bandeja de comparación persistente entre páginas.

**Contenido**
- 17 categorías con página propia y FAQ generada de datos verificados.
- 7 colecciones que son reglas sobre datos, no listas mantenidas a mano.
- `/cambios`: registro público de cambios en planes gratuitos, con RSS.
- Fichas reestructuradas como análisis: desglose de puntuación, límites reales, privacidad,
  para quién sirve y para quién no, alternativas, historial, fuentes con fecha y responsable.
- Aviso visible cuando una ficha lleva demasiado tiempo sin verificarse.
- Guía de ComfyUI portada y ahora generada desde su JSON.

**Cuentas**
- Registro, login, recuperación, cambio de contraseña, exportación y borrado.
- Favoritos, listas, «ya probada», historial, alertas, preferencias por categoría.
- Panel de cuenta con lo que necesita atención primero.

**Administración**
- Panel protegido con cola de trabajo, catálogo, fichas atrasadas, correcciones, propuestas,
  inventario de enlaces, boletín, monetización y auditoría.
- 404 en lugar de 403 para quien no tiene rol.

**Monetización**
- Radar Pro con Stripe en modo test: Checkout idempotente, webhooks firmados, Customer Portal,
  gestión de pagos fallidos, IVA automático.
- Afiliación con divulgación antes del clic y página de transparencia autogenerada.
- Patrocinios con `placementBoost` tipado como `min(0).max(0)`: el compilador impide que un
  patrocinio mueva nada.

**Infraestructura**
- Esquema Postgres de 28 tablas con RLS deny-by-default.
- Migración reproducible, con dry-run, informe de errores y rollback.
- 175 pruebas unitarias y de integración; suite e2e de Playwright para público y cuenta.
- Logger estructurado con redacción automática de campos sensibles.
- Auditoría append-only.

### Cambiado

- **Astro 5.18 → 7.1.** Reduce de 13 vulnerabilidades (2 críticas) a 3 altas, todas de build.
- **TypeScript `strict` → `strictest`**, y ahora se comprueba de verdad (`astro check`).
- **Renderizado estático → híbrido.** Contenido en el CDN, sólo cuenta/admin/API por petición.
- **Scoring reescrito.** La v1 sumaba `const novelty = 10` a todas las herramientas y penalizaba dos
  veces el mismo hecho. Ahora los pesos suman 1, el total se deriva en cada lectura y cada
  penalización lleva etiqueta y motivo publicables.
- **Booleanos → tri-estado.** `unverified` es un valor de primera clase que ni suma ni resta puntos,
  y que **nunca satisface un filtro duro**.
- **Rutas en español.** `/tools` → `/herramientas`, etc. Todas con 301 desde la v1.
- **Sistema de diseño propio** con modo claro y oscuro, sin degradados morados ni neón decorativo.

### Eliminado

- 11 componentes de la v1, sustituidos.
- 4 módulos de `src/lib/` que eran código muerto con imports rotos por mayúsculas
  (`index.ts` importaba `./normalizeTool` siendo el fichero `normalizetool.ts`; habría fallado en un
  build Linux si algo los hubiera importado).
- `public/sitemap.xml` y `public/robots.txt` estáticos, sustituidos por endpoints.
- `scripts/generate-sitemap.js` y `scripts/preview-seo-titles.js`.

### Seguridad

- CSP `script-src 'self'` **sin `unsafe-inline`**.
- HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- CSRF de doble cookie con verificación de `Origin` en todo método mutante.
- Rate limiting por endpoint; honeypot en todos los formularios públicos.
- Protección contra open redirect, con 9 casos cubiertos.
- **Corregida una fuga de enumeración de cuentas** que detectó la propia suite de pruebas: el
  registro devolvía mensajes distintos según existiera o no el correo.
- Guardia que impide arrancar con una clave `sk_live_` de Stripe fuera de producción.

### Corregido durante el desarrollo

- `getAlternativesFor` devolvía una lista vacía para una herramienta que fuera la única de su
  categoría (`pinokio`). Detectado por un test de integración; ahora rellena por afinidad.

### Documentación

`docs/`: auditoría, estrategia de producto, arquitectura, decisiones técnicas, esquema de base de
datos, monetización, revisión de seguridad, privacidad y consentimiento, guía de despliegue,
checklist de lanzamiento y este registro. Más `.env.example` con todas las variables comentadas.

---

## 1.0.0 — anterior

Catálogo estático de 22 herramientas en Astro 5. Ver
[`current-state-audit.md`](./current-state-audit.md) para el análisis detallado del punto de partida.
