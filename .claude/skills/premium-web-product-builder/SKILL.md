---
name: premium-web-product-builder
description: Diseña y construye páginas de Free AI Radar con estándar de producto premium — mobile-first, WCAG 2.2 AA, Core Web Vitals, JavaScript bajo control y estados de carga/error/vacío/éxito. Úsala al crear o rediseñar cualquier página o componente, y antes de dar una página por terminada. Obliga a justificar cada decisión de UX y a verificar en navegador real antes de declarar nada acabado.
---

# Constructor de producto web premium

## 1. Objetivo

Producir páginas que se distingan de un directorio genérico de IA por **criterio
de diseño**, no por decoración: legibles, rápidas, accesibles, utilizables con
una mano en un móvil, y sin un solo elemento que exista «porque queda bien».

El listón: si un elemento no cambia una decisión del lector ni le ahorra
trabajo, no entra.

## 2. Cuándo se activa

- Al crear una página o componente nuevo.
- Al rediseñar una existente.
- Cuando el usuario diga «esto se ve mal», «está vacío», «no se entiende».
- Antes de declarar terminada cualquier página.
- Al añadir una sección al sistema de diseño.

## 3. Procedimiento operativo

### 3.1 Antes de escribir CSS: decidir el contenido

Responde por escrito, antes de maquetar:

1. ¿Qué decisión toma aquí el lector?
2. ¿Qué dato necesita para tomarla?
3. ¿Qué es lo primero que debe ver en 375 px?
4. ¿Qué pasa si no hay datos? ¿Y si fallan? ¿Y si están cargando?

Si no puedes responder a (1), la página no debería existir.

### 3.2 Mobile-first, literal

Escribe el CSS base para 375 px y **sube** con `min-width`. Nunca al revés.

```css
/* correcto */
.grid { display: grid; gap: var(--space-s); }
@media (min-width: 48rem) { .grid { grid-template-columns: 1fr 1fr; } }

/* incorrecto: pensado en escritorio y recortado después */
.grid { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 48rem) { .grid { grid-template-columns: 1fr; } }
```

### 3.3 Justificar cada decisión de UX importante

Toda decisión no trivial se documenta en el propio componente, en una línea:

```astro
{/* Stretched link: toda la tarjeta es clicable con un solo tab stop.
    Alternativa descartada: enlazar sólo el título — objetivo táctil de 24 px
    en móvil, por debajo del mínimo de WCAG 2.5.8. */}
```

Sin justificación, la siguiente persona la deshace o la copia mal.

### 3.4 Los cuatro estados, siempre

Ningún componente que dependa de datos se da por hecho sin sus cuatro estados:

| Estado | Requisito |
| --- | --- |
| Carga | Esqueleto con la **misma altura** que el contenido final (CLS = 0) |
| Vacío | Explica **por qué** está vacío y ofrece la salida más cercana |
| Error | Dice qué falló y qué puede hacer el lector; nunca una traza |
| Éxito | Confirmación perceptible, anunciada a lectores de pantalla |

Un estado vacío que sólo dice «Sin resultados» es un defecto.

### 3.5 Presupuesto de JavaScript

```bash
npm run build
node -e "
const fs=require('fs');
// El adaptador de Vercel reubica la salida: dist/_astro NO existe.
const cand=['dist/client/_astro','.vercel/output/static/_astro','dist/_astro'];
const p=cand.find(d=>fs.existsSync(d));
if(!p){console.log('sin salida de build — ejecuta npm run build');process.exit(1)}
const js=fs.readdirSync(p).filter(f=>f.endsWith('.js'));
let t=0; js.forEach(f=>t+=fs.statSync(p+'/'+f).size);
console.log('ruta:',p);
console.log('JS total:',(t/1024).toFixed(1),'KB en',js.length,'ficheros');
js.map(f=>[f,fs.statSync(p+'/'+f).size]).sort((a,b)=>b[1]-a[1]).slice(0,5)
  .forEach(([f,s])=>console.log('  ',(s/1024).toFixed(1),'KB',f));
"
```

Reglas: sin framework de UI. Cada script nuevo se justifica. Si el estado cabe
en la URL o en el DOM, no se crea un store.

### 3.6 Antes de tocar dependencias

```bash
npm ls --depth=0
```
Una dependencia nueva exige: qué problema resuelve, cuánto pesa, qué pasa si se
abandona, y por qué no se resuelve con 30 líneas propias. Sin las cuatro
respuestas no entra — y además requiere aprobación humana (§10).

### 3.7 Verificación en navegador real

```bash
npx astro dev stop 2>/dev/null; E2E=1 npx astro dev --port 4321
```

Para cada página, en 375 / 768 / 1440 px, en claro y oscuro:

```
mcp__Claude_Browser__navigate               → la ruta
mcp__Claude_Browser__resize_window          → cada ancho
mcp__Claude_Browser__read_console_messages  { onlyErrors: true }
mcp__Claude_Browser__read_network_requests
mcp__Claude_Browser__read_page              → orden y jerarquía reales
mcp__Claude_Browser__computer               { action: "screenshot" }
```

**Mira las capturas.** Un `read_page` correcto no descarta un layout roto.

### 3.8 Accesibilidad — comprobaciones ejecutables

```js
// Sin scroll horizontal
document.documentElement.scrollWidth - document.documentElement.clientWidth  // <= 0

// Un solo h1
document.querySelectorAll('h1').length  // === 1

// Objetivos táctiles < 24 px (WCAG 2.2 AA, 2.5.8)
[...document.querySelectorAll('a,button,input,select,[role=button]')]
  .filter(e => { const r = e.getBoundingClientRect();
                 return r.width && r.height && (r.width < 24 || r.height < 24); })
  .map(e => e.outerHTML.slice(0, 90))   // debe estar vacío

// Controles sin nombre accesible
[...document.querySelectorAll('button,a,input,select,textarea')]
  .filter(e => !(e.textContent || '').trim() && !e.getAttribute('aria-label')
               && !e.getAttribute('aria-labelledby') && !e.labels?.length)
  .map(e => e.outerHTML.slice(0, 90))   // debe estar vacío

// Imágenes sin alt
[...document.images].filter(i => !i.hasAttribute('alt')).length   // === 0

// Imágenes rotas
[...document.images].filter(i => i.complete && i.naturalWidth === 0).length  // === 0
```

Además, a mano:
- Recorrer con Tab: orden lógico, foco siempre visible, sin trampas.
- Escape cierra modales y menús.
- Zoom del navegador al 200 %: sin pérdida de contenido ni de función.
- `prefers-reduced-motion: reduce`: sin animación que persista.
- Ningún estado comunicado sólo por color.

### 3.9 Core Web Vitals

En la build de producción, no en desarrollo:

```js
new PerformanceObserver(l => l.getEntries().forEach(e =>
  console.log('LCP', e.startTime.toFixed(0), e.element?.tagName)))
  .observe({ type: 'largest-contentful-paint', buffered: true });

let cls = 0;
new PerformanceObserver(l => l.getEntries().forEach(e => {
  if (!e.hadRecentInput) cls += e.value; console.log('CLS', cls.toFixed(4)); }))
  .observe({ type: 'layout-shift', buffered: true });
```

Objetivos: LCP < 2,5 s · INP < 200 ms · CLS < 0,1.

### 3.10 Multinavegador

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project=mobile
```

WebKit revela diferencias de `dvh`, `:has()` y flex que Chromium oculta. Si un
proyecto no está configurado o su navegador no está descargado, **dilo en el
informe**; no lo des por cubierto.

## 4. Herramientas permitidas

- `Read` / `Write` / `Edit` — `src/`, `public/`, `tests/`.
- `mcp__Claude_Browser__*` — navegador real, incluidas capturas.
- `Bash` / `PowerShell` — `npm run dev|build|lint|typecheck|test|test:e2e`.
- `Glob` / `Grep` — localizar componentes y tokens.

No se permite instalar dependencias sin aprobación (§10), ni desplegar, ni
tocar configuración fuera del proyecto.

## 5. Comprobaciones obligatorias

Antes de declarar una página terminada, **las doce**:

| # | Comprobación | Cómo |
| --- | --- | --- |
| 1 | Navegación | Cada enlace lleva a una ruta que responde 200 |
| 2 | Botones | Cada botón hace algo real o está marcado como no disponible |
| 3 | Formularios | Envían, validan, muestran error y éxito, funcionan sin JS |
| 4 | Consola | `read_console_messages { onlyErrors: true }` vacío |
| 5 | Red | Sin 4xx/5xx de origen propio |
| 6 | Enlaces | Sin internos rotos |
| 7 | Responsive | 375 / 768 / 1440 sin scroll horizontal ni desbordes |
| 8 | Accesibilidad | Los seis snippets de §3.8 en verde + recorrido con teclado |
| 9 | Rendimiento | LCP/INP/CLS dentro de objetivo; presupuesto de JS revisado |
| 10 | SEO | `<title>` único, meta descripción, canónico correcto, un `h1`, JSON-LD válido |
| 11 | Claro y oscuro | Ambos revisados **con capturas**, contraste AA en los dos |
| 12 | Anónimo y autenticado | Ambos estados; y admin si la ruta lo toca |

## 6. Prohibiciones

- ❌ Componentes decorativos sin función.
- ❌ Estética genérica de IA: neón, degradados morados, cerebros, robots, glow.
- ❌ Diseñar en escritorio y recortar para móvil.
- ❌ Declarar terminada una página sin haberla abierto en un navegador.
- ❌ Estados vacíos que no explican nada.
- ❌ Esqueletos de altura distinta al contenido final.
- ❌ Estados comunicados sólo por color.
- ❌ Añadir una dependencia sin las cuatro respuestas de §3.6.
- ❌ Añadir un framework de UI.
- ❌ `!important` para tapar un problema de especificidad.
- ❌ Valores de color en crudo: siempre tokens semánticos.
- ❌ Manejadores `onclick` en el HTML (rompen la CSP `script-src 'self'`).
- ❌ Animación que ignore `prefers-reduced-motion`.
- ❌ Perseguir puntuación de Lighthouse degradando la experiencia real.

### Límites de seguridad (comunes a todas las skills del proyecto)

Esta skill **no puede**, bajo ninguna circunstancia y sin autorización explícita
del propietario en el chat:

trabajar en `main` · hacer `git push` · desplegar en producción · modificar DNS ·
activar Stripe **live** · usar Supabase de **producción** · enviar campañas
reales · guardar secretos en el repositorio · aplicar migraciones destructivas ·
activar **HSTS `preload`** · introducir analítica o anuncios **sin
consentimiento**.

La verificación de estos límites es responsabilidad de `release-guardian`, que
debe ejecutarse antes de cualquier operación de escritura en git.

## 7. Criterios de terminación

Una página está terminada cuando:

1. Las doce comprobaciones de §5 pasan.
2. `npm run lint && npm run typecheck && npm run test && npm run build` en verde.
3. Chromium, Firefox, WebKit y móvil pasan — o consta qué no se pudo probar.
4. Capturas de móvil y escritorio **revisadas**, en claro y oscuro.
5. Las decisiones de UX no triviales están justificadas en el código.
6. Los cuatro estados existen donde hay datos.
7. El presupuesto de JS no ha crecido sin justificación.
8. Ningún elemento sobrevive sin responder «¿qué decisión ayuda a tomar?».

## 8. Formato de informe

```markdown
## Página: <ruta> — <fecha>

### Decisión que ayuda a tomar
<una frase>

### Decisiones de UX y su motivo
| Decisión | Por qué | Alternativa descartada |
|---|---|---|

### Comprobaciones obligatorias
| # | Comprobación | Resultado |
|---|---|---|
| 1..12 | | |

### Navegadores
| Navegador | Resultado |
|---|---|
| Chromium / Firefox / WebKit / Móvil | ✔ / ✘ / no probado (motivo) |

### Capturas revisadas
| Vista | 375 | 768 | 1440 |
|---|---|---|---|
| Claro / Oscuro | | | |

### Rendimiento
LCP · INP · CLS · JS total (Δ respecto a antes)

### Accesibilidad
Objetivos táctiles · nombres accesibles · alt · teclado · zoom 200% · movimiento

### Defectos encontrados y corregidos
| # | Defecto | Corregido |
|---|---|---|

### Pendiente / no comprobado
```

## 9. Ejemplos de uso

**Correcto**
```
Encargo: la sección de noticias se ve vacía.
→ ¿Qué decisión ayuda a tomar? "¿Esto me afecta a mí, que uso el plan gratuito?"
→ El dato que falta es el impacto, no más tarjetas.
→ Cada noticia muestra: qué cambia · a qué herramienta · si toca el plan gratuito
→ Estado vacío: "Sin cambios esta semana" + enlace a las verificadas hace poco
→ 375/768/1440, claro y oscuro, capturas revisadas
→ Consola limpia, LCP 1,2 s, CLS 0,00, JS +0 KB
```

**Incorrecto**
```
Encargo: la sección de noticias se ve vacía.
→ Se añaden tarjetas más grandes y un degradado de fondo   ❌
   El problema era falta de información útil, no falta de píxeles.
```

## 10. Situaciones que requieren aprobación humana

- Añadir o eliminar cualquier **dependencia**.
- Cambiar la **arquitectura de renderizado** de una ruta.
- Eliminar una **página o función** existente.
- Cambiar **rutas públicas** ya indexadas (implica redirecciones).
- Cambiar la **paleta o la tipografía** del sistema de diseño.
- Descargar **navegadores de Playwright** adicionales.
- Cualquier cambio que **degrade** una métrica de Core Web Vitals.
- Modificar algo fuera de
  `C:\Users\juanl\.openclaw-autoclaw\workspace\free-ai-radar`.

Nunca: trabajar en `main`, `git push`, desplegar, tocar DNS, activar HSTS
`preload`, ni cargar analítica o anuncios sin consentimiento.
