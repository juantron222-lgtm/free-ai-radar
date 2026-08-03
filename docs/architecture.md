# Arquitectura

**Versión:** 2.0 · **Fecha:** 3 de agosto de 2026

---

## 1. Resumen

Free AI Radar es una aplicación **Astro 7 en modo híbrido** desplegada en Vercel. El contenido
editorial es estático y se sirve desde el CDN; sólo el área de cuenta, el panel de administración y
la API se renderizan por petición.

```
                    ┌──────────────────────────────────────────┐
   Visitante  ──────▶  CDN de Vercel                            │
                    │  · páginas prerenderizadas (HTML)        │
                    │  · assets con hash, inmutables            │
                    └───────────────┬──────────────────────────┘
                                    │  sólo rutas dinámicas
                    ┌───────────────▼──────────────────────────┐
                    │  Función serverless (Astro SSR)          │
                    │  · middleware: sesión, CSRF, cabeceras   │
                    │  · /cuenta/*  /admin/*  /api/*           │
                    └──┬──────────┬──────────┬─────────────────┘
                       │          │          │
                ┌──────▼───┐ ┌────▼─────┐ ┌──▼────────┐
                │ Supabase │ │  Stripe  │ │  Resend   │
                │ PG + RLS │ │ (test)   │ │  correo   │
                └──────────┘ └──────────┘ └───────────┘

   Contenido editorial: src/data/generated/tools.json (commiteado)
   → validado con Zod en build → hidratado → prerenderizado
```

---

## 2. Renderizado

| Ruta | Modo | Motivo |
| --- | --- | --- |
| `/`, `/herramientas`, `/herramientas/[slug]`, `/categorias/*`, `/colecciones/*`, `/guias/*`, `/cambios`, legales | Prerenderizado | Contenido idéntico para todos. Servido desde el CDN, sin ejecución. |
| `/comparar` | SSR | El resultado depende de la query, y de ella depende también el canónico y el `noindex`. |
| `/cuenta/*` | SSR | Requiere sesión. |
| `/admin/*` | SSR | Requiere sesión y rol. |
| `/api/*` | SSR | Endpoints. |
| `/sitemap.xml`, `/robots.txt`, `/rss.xml` | SSR | Se derivan del catálogo; un fichero estático se queda obsoleto (fue el bug de la v1). |

Astro 7 con `output: 'static'` y adaptador de Vercel: todo se prerenderiza salvo lo que declara
`export const prerender = false`. Es lo contrario del planteamiento habitual y es deliberado: el
valor del sitio es contenido, y el contenido no debería costar una invocación de función.

---

## 3. Capa de datos

### 3.1 Contenido editorial

El catálogo **no se lee de la base de datos en el sitio público**. Vive en
`src/data/generated/tools.json`, un fichero commiteado y determinista.

Razones:

1. **Rendimiento.** Cada ficha se convierte en HTML estático. No hay consulta en el camino crítico.
2. **Resiliencia.** Si Supabase cae, el sitio público sigue entero.
3. **Revisabilidad.** Un cambio de contenido aparece como un diff en un pull request. Para un
   proyecto cuyo activo es el criterio editorial, poder revisar «qué cambió en esta ficha y por qué»
   vale más que la comodidad de un CRUD.
4. **Coste.** Cero lecturas de base de datos para el 95% del tráfico.

El ciclo de publicación:

```
tools.json (fuente) ──▶ scripts/migrate-tools.mjs ──▶ src/data/generated/tools.json
                                                            │
                                            validación Zod  ▼
                                                    hidratación
                                            (scoreTotal, badges, frescura)
                                                            │
                                                            ▼
                                                     páginas estáticas
```

La validación ocurre **en build**. Si una alternativa apunta a un slug inexistente o una categoría
está fuera de la taxonomía, el build falla. Es imposible publicar un enlace roto.

### 3.2 Datos de usuario

Sí van a Postgres, porque son por definición dinámicos: favoritos, listas, alertas, preferencias,
suscripciones. Dos backends tras la misma interfaz (`src/lib/data/user-data.ts`):

- **Supabase** cuando hay credenciales.
- **Ficheros JSON bajo `.data/`** en desarrollo, con un guardia que impide cargarlo en producción.

Esto no es un capricho: permite que `npm run dev` y toda la suite de Playwright funcionen con un
`.env` vacío. Un proyecto que sólo se puede desarrollar con credenciales de producción acaba
desarrollándose contra producción.

---

## 4. Autenticación

**Producción: Supabase Auth.** Punto.

Existe además un modo local (`src/lib/auth/local-store.ts`) para desarrollo y pruebas. Está
documentado en detalle en [`technical-decisions.md`](./technical-decisions.md) § 4; lo esencial:
lanza una excepción si `import.meta.env.PROD` es cierto, así que no puede convertirse en el sistema
de autenticación por accidente.

Ambos implementan `AuthProvider` (`src/lib/auth/types.ts`). Las páginas y endpoints nunca ven cuál
está activo.

```
Petición ──▶ middleware ──▶ getAuthProvider() ──▶ Astro.locals.user
                    │
                    ├── ¿/cuenta/* sin usuario? → 302 a /cuenta/entrar?next=…
                    ├── ¿/admin/* sin rol?      → 404 (no 403)
                    └── emite token CSRF y cabeceras por respuesta
```

El 404 en lugar de 403 es intencionado: un 403 confirma que el panel existe.

---

## 5. Seguridad en capas

| Capa | Qué protege | Dónde |
| --- | --- | --- |
| Cabeceras estáticas | CSP, HSTS, `X-Frame-Options`, `Permissions-Policy` | `vercel.json` |
| Middleware | Sesión, guardas de ruta, `Cache-Control` privado, CSRF | `src/middleware.ts` |
| Guardia de endpoint | Rate limit → CSRF → honeypot → validación Zod | `src/lib/api/respond.ts` |
| Base de datos | RLS deny-by-default en todas las tablas | `supabase/migrations/0002_rls_policies.sql` |

El orden dentro del guardia importa: el rate limit va primero para que un atacante no pueda usar la
validación (que es cara) como vector de amplificación.

La CSP es `script-src 'self'` **sin `unsafe-inline`**. Para lograrlo:

- `vite.build.assetsInlineLimit: 0` fuerza que todo script sea un fichero externo.
- Los tres scripts que deben ejecutarse antes de la hidratación (tema, consentimiento, registro del
  service worker) viven en `public/` como ficheros independientes.
- No hay ni un solo `onclick=` en el código.

---

## 6. Consentimiento

`public/consent.js` es lo único que se ejecuta antes de una decisión. Establece los valores por
defecto de Google Consent Mode v2 en `denied` y sólo los actualiza tras el consentimiento.

Los scripts de terceros se declaran como `<script type="text/plain" data-consent="advertising">` y
sólo se promueven a scripts reales cuando su categoría se concede. Retirar un permiso borra las
cookies asociadas y recarga, para que el código ya cargado deje de ejecutarse de verdad.

---

## 7. Búsqueda

Sin dependencias. `src/lib/search/index.ts` implementa un índice invertido ponderado por campo más
distancia de edición acotada.

Para unos cientos de registros esto pesa ~3 KB en lugar de los ~40 KB de una biblioteca de búsqueda
difusa, y además devuelve **por qué** coincidió cada resultado (`matchedOn`), que es lo que permite
al desplegable mostrar «coincide en: caso de uso» en vez de un listado mudo.

El mismo código corre en el servidor (para el HTML inicial) y en el navegador (para el filtrado
instantáneo), sobre un índice compacto de ~350 bytes por herramienta. Una implementación, sin
divergencia posible entre lo que ve el crawler y lo que ve el usuario.

---

## 8. Estructura del proyecto

```
src/
  components/
    consent/      Banner de consentimiento
    discovery/    Explorador: filtros, búsqueda, resultados
    marketing/    Newsletter
    site/         Cabecera, pie, logo, migas, tema
    tools/        Tarjeta, puntuación, hechos, comparación, corrección
  layouts/        Base, Article, Auth, Account, Admin
  lib/
    api/          Guardia y respuestas de endpoints
    auth/         Proveedores, contraseñas, almacén local
    billing/      Planes y Stripe
    client/       Utilidades de navegador (CSRF + fetch)
    data/         Catálogo, colecciones, datos de usuario, bandeja
    domain/       Tipos, esquemas Zod, taxonomía, scoring
    email/        Envío y plantillas
    observability/ Logger y auditoría
    search/       Índice, filtros, índice de cliente
    security/     CSRF, rate limit, redirecciones
    seo/          Sitio, datos estructurados
  pages/          Rutas
  styles/         Sistema de diseño
supabase/
  migrations/     Esquema y RLS
  seed/           Semilla generada + rollback
scripts/          Migración, comprobación de enlaces, iconos, noticias
tests/
  unit/           Puro, sin E/S
  integration/    Contra el dataset real y el almacén local
  e2e/            Playwright
docs/             Esta documentación
```

---

## 9. Rendimiento

Decisiones que buscan Core Web Vitals reales, no puntuación sintética:

- **Sin fuentes web.** Se usa la pila del sistema. Cero peticiones bloqueantes, cero FOUT, cero
  transferencia de IP a Google. Ver [`technical-decisions.md`](./technical-decisions.md) § 2.
- **JavaScript sólo donde aporta.** No hay framework de UI. El explorador es el único script
  relevante y sólo se carga en las páginas que lo usan.
- **`content-visibility` implícito** vía carga estática: el HTML llega completo, sin hidratación.
- **Assets con hash** e inmutables un año; `sw.js` con `must-revalidate`.
- **Sin saltos visuales**: los contenedores de resultados no se redimensionan al filtrar porque el
  filtrado oculta elementos ya renderizados.

---

## 10. Qué se descartó y por qué

| Alternativa | Por qué no |
| --- | --- |
| Next.js | No hay nada aquí que necesite React. Astro entrega menos JavaScript para el mismo resultado. |
| Catálogo en BD para el sitio público | Añade latencia y una dependencia dura para contenido que cambia semanalmente, no por segundo. |
| CMS externo (Sanity, Contentful) | Coste recurrente y un servicio más que mantener, para un catálogo que cabe en un JSON revisable. |
| Biblioteca de búsqueda (Fuse.js, Lunr) | 10× el peso para un corpus pequeño, y sin poder explicar la coincidencia. |
| Framework de UI para los filtros | El estado cabe en la URL. Un framework aquí sería peso sin beneficio. |
| Redis para rate limiting | Un servicio más y coste fijo. El limitador en memoria cubre el caso real; el camino de migración está documentado. |

---

Ver también: [`technical-decisions.md`](./technical-decisions.md) ·
[`database-schema.md`](./database-schema.md) · [`security-review.md`](./security-review.md)
