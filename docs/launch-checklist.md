# Checklist de lanzamiento

Estado a 3 de agosto de 2026. Marcado lo verificado en esta entrega; sin marcar lo que requiere
credenciales, un servicio externo o una decisión humana.

---

## Bloqueantes — no lanzar sin esto

- [ ] **Revisión jurídica** de privacidad, cookies, términos y derechos. Los cuatro textos son
      borradores y llevan un aviso visible en la propia página.
- [ ] **Razón social, NIF y domicilio** en la política de privacidad.
- [ ] **Ejecutar las comprobaciones de RLS** contra la base real
      ([`security-review.md`](./security-review.md) § 12). Las políticas están escritas y razonadas
      pero **no probadas**.
- [ ] **Confirmar `PUBLIC_SITE_URL`** en producción. Es el bug que arrastraba la v1.
- [ ] Elegir versión canónica del dominio (`www` o desnudo) y redirigir la otra con 301.
- [ ] Verificar que `AUTH_SECRET` es un valor generado, no el de desarrollo.
- [ ] Comprobar que `STRIPE_SECRET_KEY` es `sk_test_` mientras no se autoricen cobros reales.

---

## Código y calidad

- [x] `npm run lint` — sin errores
- [x] `npm run typecheck` — 0 errores en 141 ficheros
- [x] `npm run test` — 175 pruebas, todas pasan
- [x] `npm run build` — build limpio
- [x] TypeScript en modo `strictest`
- [x] Sin secretos en el repositorio
- [x] `.env` en `.gitignore`
- [ ] `npm run test:e2e` con navegadores instalados
- [ ] Lighthouse ≥ 95 en las cuatro categorías sobre inicio, listado y ficha

---

## Contenido

- [x] 22 herramientas migradas sin pérdida
- [x] Ninguna alternativa apunta a una ficha inexistente (verificado en build y en test)
- [x] Todas las categorías dentro de la taxonomía
- [x] Todas las URLs oficiales son HTTPS
- [x] Cada ficha tiene al menos una fuente citable
- [x] Contenido de ComfyUI portado a `/guias/comfyui-sin-gpu`
- [x] Noticias portadas a `/noticias`
- [ ] Reverificar las fichas fuera de plazo (ver `/admin/desactualizadas`)
- [ ] `npm run links:check` sin URLs oficiales caídas

---

## SEO

- [x] Canónico al dominio real, en una sola constante, verificado por test
- [x] `robots.txt` generado, apuntando al sitemap correcto
- [x] Sitemap dinámico, sin rutas privadas ni permutaciones de filtros
- [x] RSS del catálogo y de los cambios
- [x] Vistas filtradas con `noindex` y canónico al listado limpio
- [x] Comparador indexable **sólo** con contenido
- [x] `hreflang` preparado para la versión inglesa
- [x] Redirecciones 301 desde todas las URLs de la v1
- [x] Breadcrumbs en HTML y JSON-LD
- [x] Datos estructurados: Organization, WebSite, SearchAction, BreadcrumbList, ItemList,
      SoftwareApplication, Article, FAQPage
- [x] **Sin `aggregateRating`** (verificado por test)
- [x] Metadatos únicos por página
- [x] 404 y 500 útiles
- [ ] Alta en Search Console y envío del sitemap
- [ ] Solicitar retirada del índice de las URLs del dominio de preview
- [ ] Validar los schemas con la herramienta de resultados enriquecidos

---

## Seguridad

- [x] CSP `script-src 'self'` sin `unsafe-inline`
- [x] HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`
- [x] CSRF en todo método mutante
- [x] Rate limiting por endpoint
- [x] Honeypot en todos los formularios públicos
- [x] Validación Zod en servidor
- [x] Protección contra open redirect (9 pruebas)
- [x] Sin enumeración de cuentas (verificado por test)
- [x] Cookies `HttpOnly`, `Secure`, `SameSite=Lax`
- [x] Admin devuelve 404, no 403
- [x] Auditoría append-only
- [x] Logger con redacción automática de campos sensibles
- [x] Webhook con firma verificada e idempotencia
- [x] Guardia contra clave `sk_live_` fuera de producción
- [ ] RLS probado contra base real
- [ ] Turnstile activado (opcional; hay honeypot y rate limit)
- [ ] Escaneo dinámico (ZAP o similar)

---

## Privacidad

- [x] Nada no esencial se carga antes del consentimiento
- [x] Consentimiento granular por finalidad
- [x] Rechazar tan fácil como aceptar (mismo nivel y tamaño)
- [x] Cerrar sin decidir no cuenta como aceptación
- [x] Retirada efectiva: borra cookies y recarga
- [x] Prueba de consentimiento con versión y fecha
- [x] Consent Mode v2 en `denied` por defecto
- [x] **Fuentes de Google eliminadas** (transmitían la IP sin consentimiento)
- [x] Exportación de datos en un clic
- [x] Borrado de cuenta en un clic
- [x] IPs siempre hasheadas
- [x] Correo comercial opt-in, nunca premarcado
- [ ] Registro de actividades de tratamiento (art. 30)
- [ ] DPA firmados con cada encargado
- [ ] Si se activa AdSense: CMP certificada e integrada con el TCF

---

## Accesibilidad

- [x] Skip link
- [x] Foco visible en todo elemento interactivo
- [x] Estados nunca comunicados sólo por color (tick + texto + peso)
- [x] Objetivos táctiles ≥ 44 px en controles principales
- [x] `prefers-reduced-motion` respetado globalmente
- [x] Modales con trampa de foco y Escape
- [x] Tablas con `caption`, `scope` y desplazamiento propio
- [x] Filtros como checkboxes reales, operables por teclado
- [x] Combobox de búsqueda con `aria-expanded`, `aria-activedescendant` y flechas
- [x] Un solo `h1` por página (verificado por e2e)
- [x] Modo claro y oscuro con preferencia del sistema
- [ ] Auditoría con lector de pantalla real (NVDA / VoiceOver)
- [ ] Verificación de contraste con herramienta automática

---

## PWA

- [x] Manifest válido con `id`, `shortcuts` e iconos maskable
- [x] Service worker registrado sin `skipWaiting` automático
- [x] Aviso de actualización dismissible
- [x] Página offline
- [x] **`/cuenta`, `/admin` y `/api` excluidos de toda caché**
- [x] Sin caché de terceros
- [ ] Probar la instalación en Android e iOS reales

---

## Integraciones

| Servicio | Código | Configurado | Probado |
| --- | --- | --- | --- |
| Supabase | ✅ | ❌ | ❌ |
| Stripe (test) | ✅ | ❌ | ❌ |
| Resend | ✅ | ❌ | ❌ |
| Turnstile | ✅ | ❌ | ❌ |
| Analítica | ⚠️ preparado | ❌ | ❌ |
| AdSense | ⚠️ preparado | ❌ | ❌ |

Sin configurar, cada una degrada a un modo local claramente etiquetado. Ninguna falla.

> La tabla describe **producción**. Supabase sí está configurado y probado
> contra un proyecto de *staging*: ver
> [`docs/rls-staging-evidence.md`](rls-staging-evidence.md) y
> [`docs/preview-account-qa-findings.md`](preview-account-qa-findings.md).

### Aplicar el esquema a una base real: dos pasos, no uno

Migrar **no basta**. `public.categories` y `public.tools` son el espejo al que
apuntan las claves foráneas de los datos de usuario, y ninguna migración las
llena. Con el esquema migrado y el espejo vacío, guardar un favorito falla
siempre con `23503` y ninguna página muestra un error — porque el sitio público
no lee esas tablas. Fue exactamente lo que ocurrió en staging.

`npm run db:migrate:staging` ya sincroniza el catálogo al terminar. Cualquier
otro camino hacia una base real (producción incluida) tiene que ejecutar la
sincronización, y volver a ejecutarla **cada vez que cambie el catálogo**: una
herramienta nueva no se puede guardar en favoritos hasta que esté en el espejo.

---

## Lo que NO se ha hecho (a propósito)

- No se ha desplegado nada.
- No se ha tocado DNS ni dominio.
- No se ha creado ningún proyecto de Supabase, Stripe ni Resend.
- No se ha activado ningún cobro.
- No se ha enviado ningún correo real.
- No se ha modificado producción.
- No se ha ejecutado ninguna migración contra una base real.
- No se ha commiteado ningún secreto.

Todo queda preparado y documentado, pendiente de aprobación humana.
