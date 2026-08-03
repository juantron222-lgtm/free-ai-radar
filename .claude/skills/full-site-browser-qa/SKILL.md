---
name: full-site-browser-qa
description: Barrido completo de QA de Free AI Radar en navegador real. Recorre todas las rutas públicas y privadas, pulsa cada botón y pestaña, y falla ante errores de consola, peticiones fallidas, enlaces rotos, 404/500 inesperados, canónicos incorrectos o títulos duplicados. Úsala antes de dar por terminada cualquier fase, tras tocar navegación o layout, y cuando el usuario diga que algo "no responde".
---

# QA completa en navegador real

## Objetivo

Detectar en un navegador de verdad lo que las pruebas unitarias no ven:
enlaces que no llevan a ningún sitio, botones sin comportamiento, errores de
consola, peticiones fallidas, rutas rotas y regresiones visuales.

Nunca afirmes que el sitio está libre de errores basándote sólo en Vitest.

## Cuándo activarse

- Antes de cerrar cualquier fase de trabajo.
- Después de tocar navegación, rutas, layout o el sistema de diseño.
- Cuando el usuario diga «no funciona», «no responde», «está roto».
- Antes de preparar un commit que afecte a más de una página.
- Tras añadir una sección nueva.

## Herramientas permitidas

- `mcp__Claude_Browser__*` — navegador real: `navigate`, `read_page`,
  `read_console_messages`, `read_network_requests`, `computer`, `resize_window`.
- `Bash` / `PowerShell` — arrancar el servidor y ejecutar Playwright.
- `Read` / `Edit` — sólo para corregir lo que se encuentre.

## Preparación

```bash
npx astro dev stop 2>/dev/null; rm -rf .data
E2E=1 npx astro dev --port 4321      # en segundo plano
```

`E2E=1` desactiva la barra de herramientas de desarrollo de Astro, cuyo overlay
fijo intercepta clics en la parte inferior de la ventana.

## Procedimiento

### 1. Barrido automático de rutas

```bash
npx playwright test tests/e2e/crawl.spec.ts --reporter=line
```

Debe recorrer todas las rutas públicas y fallar ante:

- [ ] 404 inesperado
- [ ] 500
- [ ] enlace interno roto
- [ ] botón sin destino ni manejador
- [ ] error de consola
- [ ] petición de red fallida
- [ ] contenido vacío no previsto
- [ ] canónico incorrecto o ausente
- [ ] `<title>` duplicado entre rutas
- [ ] imagen rota (`naturalWidth === 0`)
- [ ] más de un `<h1>`

### 2. Multinavegador

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project=mobile
```

Los cuatro deben pasar. WebKit suele revelar diferencias de layout y de
`dvh` que Chromium oculta.

> **Dependencias.** Comprueba antes que existen el spec y los proyectos:
> ```bash
> test -f tests/e2e/crawl.spec.ts && echo "crawl OK" || echo "crawl AUSENTE"
> node -e "const s=require('fs').readFileSync('playwright.config.ts','utf8');
>   console.log([...s.matchAll(/name:\s*'([^']+)'/g)].map(x=>x[1]).join(', '))"
> npx playwright install --dry-run 2>&1 | head -5   # navegadores descargados
> ```
> Si falta `crawl.spec.ts` o los proyectos `firefox` / `webkit`, se crean en la
> fase de pruebas de navegación. Mientras tanto ejecuta lo que sí exista y
> **declara en el informe qué no se ha podido comprobar**, en vez de dar por
> buena una cobertura que no hubo.

### 3. Inspección manual en navegador real

Rutas mínimas a recorrer:

```
/                      /herramientas          /herramientas/<slug>
/categorias            /categorias/<slug>     /modelos
/agentes               /comparar              /comparar?t=a,b
/noticias              /noticias/<slug>       /colecciones
/colecciones/<slug>    /guias                 /guias/<slug>
/metodologia           /politica-editorial    /transparencia/cambios-del-radar
/pro                   /contacto              /enviar-herramienta
/legal/privacidad      /legal/cookies         /legal/terminos    /legal/derechos
/cuenta/entrar         /cuenta/crear          /cuenta            /cuenta/favoritos
/cuenta/listas         /cuenta/alertas        /cuenta/preferencias
/cuenta/suscripcion    /admin                 /admin/herramientas
/admin/desactualizadas /admin/correcciones    /admin/noticias
/404-inexistente       /sin-conexion
```

Para cada una, con el navegador abierto:

```
mcp__Claude_Browser__navigate  → la ruta
mcp__Claude_Browser__read_console_messages { onlyErrors: true }   → debe estar vacío
mcp__Claude_Browser__read_network_requests                        → sin 4xx/5xx propios
mcp__Claude_Browser__read_page                                    → estructura y textos
```

### 4. Elementos interactivos

Pulsa y comprueba que **hace algo real**:

- logo → `/`
- cada elemento de la navegación principal
- menú móvil: abre, cierra con Escape, cierra al pasar a escritorio
- buscador: escribe, sugerencias, flechas, Enter, Escape
- cada chip de filtro: marca, desmarca, cambia la URL
- «Quitar filtros»
- ordenación
- tarjeta de herramienta → ficha
- «Comparar» → bandeja → `/comparar`
- «Guardar» y «Avisarme»
- formulario de corrección
- newsletter
- login, registro, recuperación
- cierre de sesión
- alternador de tema (system → claro → oscuro → system)
- banner de consentimiento: aceptar, rechazar, personalizar, reabrir desde el pie
- cada enlace del pie
- migas de pan
- paginación
- CTA de Pro

> Un botón sin acción real es un defecto. O hace algo, o está marcado
> explícitamente como no disponible.

### 5. Estados de usuario

| Estado | Qué comprobar |
| --- | --- |
| Anónimo | `/cuenta` y `/admin` redirigen a entrar |
| Registrado | favoritos, listas, alertas, preferencias, exportación |
| Administrador | `/admin/*` accesible; para el resto devuelve 404, no 403 |

### 6. Auditoría visual

Para cada plantilla, en 375 px, 768 px y 1440 px, en claro y oscuro:

- [ ] sin scroll horizontal (`document.documentElement.scrollWidth <= clientWidth`)
- [ ] sin textos cortados ni desbordados
- [ ] sin elementos fuera de pantalla
- [ ] tablas anchas con scroll propio, no el de la página
- [ ] filtros sin solaparse
- [ ] modales con foco atrapado y Escape
- [ ] foco visible en todo elemento interactivo
- [ ] contraste AA
- [ ] zoom al 200 % sin pérdida de contenido
- [ ] sin páginas con más de media pantalla vacía habiendo contenido
- [ ] sin saltos de diseño al cargar

Comprobación reproducible del scroll horizontal:
```js
mcp__Claude_Browser__javascript_tool
  "document.documentElement.scrollWidth - document.documentElement.clientWidth"
// debe ser <= 0
```

## Criterios de verificación

El barrido **pasa** sólo si:

1. Cero errores de consola en todas las rutas.
2. Cero peticiones fallidas de origen propio.
3. Cero enlaces internos rotos.
4. Cero botones sin comportamiento.
5. Chromium, Firefox, WebKit y móvil en verde.
6. Canónico correcto y único por ruta.
7. Sin títulos duplicados entre rutas distintas.
8. Sin scroll horizontal en 375 px.
9. Rutas privadas protegidas en los tres estados de usuario.

## Prohibiciones

- ❌ No declares «sin errores» sin haber leído la consola de cada ruta.
- ❌ No sustituyas la comprobación en navegador por pruebas unitarias.
- ❌ No ignores un aviso de consola por parecer inofensivo: anótalo.
- ❌ No pruebes sólo Chromium.
- ❌ No pruebes sólo escritorio.
- ❌ No arregles un test para que pase ocultando el defecto que detecta.
- ❌ No dejes el servidor de desarrollo corriendo al terminar.

## Formato del informe final

```markdown
## QA en navegador — <fecha>

### Rutas probadas: N
| Ruta | Estado | Consola | Red | Canónico | h1 |
|---|---|---|---|---|---|

### Elementos interactivos probados: N
| Elemento | Página | Resultado |
|---|---|---|

### Resultado por navegador
| Navegador | Pasan | Fallan |
|---|---|---|
| Chromium | | |
| Firefox | | |
| WebKit | | |
| Móvil | | |

### Estados de usuario
| Estado | Resultado |
|---|---|

### Defectos encontrados
| # | Gravedad | Ruta | Descripción | ¿Corregido? |
|---|---|---|---|---|

### Auditoría visual
| Plantilla | 375 | 768 | 1440 | Claro | Oscuro |
|---|---|---|---|---|---|

### Pendientes
```

## Ejemplos de uso

**Correcto**
```
→ navigate /noticias
→ read_console_messages { onlyErrors: true }  → []
→ read_network_requests                       → sin 4xx propios
→ find "enlace de la primera noticia" → click → llega a /noticias/<slug>
→ scrollWidth - clientWidth = 0
✔ ruta correcta
```

**Incorrecto**
```
→ npm run test  → 175 pasan
→ "la web no tiene errores"  ❌
   Las pruebas unitarias no abren el navegador ni leen la consola.
```

## Detente y pide aprobación si

- Un defecto obliga a **cambiar el modelo de datos** o a migrar.
- La corrección implica **borrar contenido** existente.
- Aparece una **vulnerabilidad** (XSS, fuga de sesión, ruta privada expuesta).
- Un fallo sólo se reproduce **en producción**, que no debe tocarse.
- Corregirlo exige **instalar dependencias nuevas**.
