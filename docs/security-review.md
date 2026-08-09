# Revisión de seguridad

**Fecha:** 3 de agosto de 2026 · **Alcance:** aplicación completa tras la reconstrucción v2

---

## 1. Resumen

| Área | Estado |
| --- | --- |
| Validación de entrada | Zod en servidor en todos los endpoints |
| XSS | CSP `script-src 'self'` sin `unsafe-inline`; escapado por defecto de Astro |
| CSRF | Doble cookie + comprobación de `Origin`, en todo método mutante |
| Autenticación | Supabase Auth en producción; almacén local bloqueado en producción |
| Autorización | RLS deny-by-default + guardas de middleware + comprobación por endpoint |
| Rate limiting | Por endpoint, en memoria — **limitación conocida, ver § 9** |
| Secretos | Sólo servidor vía `astro:env`; ninguno en el repositorio |
| Webhooks | Firma verificada sobre el cuerpo crudo + idempotencia por `event.id` |
| Open redirect | Lista blanca estricta de rutas |
| Auditoría | Append-only, sin ruta de modificación |
| Dependencias | 3 vulnerabilidades altas, todas del mismo origen — ver § 10 |

---

## 2. Validación y sanitización

Toda entrada pasa por Zod **en el servidor**. La validación del navegador es comodidad, nunca
control.

```
guard(context, { rateLimit, honeypot })
   1. rate limit        ← primero: lo barato antes que lo caro
   2. parseo del cuerpo
   3. CSRF
   4. honeypot
   5. Zod
```

El orden evita que un atacante use la validación (costosa) como vector de amplificación.

**Salida.** Astro escapa por defecto. `set:html` se usa en exactamente tres sitios, todos con
contenido generado por nosotros y ninguno con entrada de usuario:

| Lugar | Contenido |
| --- | --- |
| `BaseLayout.astro` | JSON-LD serializado desde objetos propios |
| `ToolExplorer.astro` | Índice de búsqueda serializado |
| `colecciones/[slug].astro` | Texto editorial constante, con `**negrita**` |

El correo saliente escapa explícitamente (`escapeHtml` en `api/contact.ts`).

---

## 3. Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://*.supabase.co https://api.stripe.com;
frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;
form-action 'self';
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
upgrade-insecure-requests
```

**`script-src 'self'` sin `unsafe-inline`** es lo que hace que esta CSP sirva de algo. Se consigue
con `assetsInlineLimit: 0`, tres scripts externos en `public/` y cero atributos `onclick`.

`style-src` conserva `'unsafe-inline'` porque Astro emite estilos con ámbito en línea. Es un riesgo
mucho menor (exfiltración por selectores de atributo, no ejecución) y quitarlo exigiría renunciar a
los estilos con ámbito de componente.

Cabeceras adicionales en `vercel.json`: HSTS **sin** `preload`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` cerrando cámara, micrófono, geolocalización, FLoC y Topics,
`Cross-Origin-Opener-Policy: same-origin`.

---

## 4. Autenticación

**Producción: Supabase Auth.** Se usa `getUser()`, no `getSession()`: el primero revalida contra el
servidor de autenticación, el segundo se fía de una cookie que el cliente podría falsificar.

**Contraseñas.** Política estilo NIST SP 800-63B: 12 caracteres mínimos, sin reglas de composición
(que empujan a `P@ssw0rd1`), lista de bloqueo de las más filtradas, rechazo de cadenas repetitivas.

**No hay enumeración de cuentas:**

| Superficie | Mitigación |
| --- | --- |
| Registro | Mensaje y estado idénticos existan o no la cuenta |
| Login | Mismo mensaje para «no existe» y «contraseña mal» |
| Recuperación | Siempre 200 con el mismo texto |
| Tiempos | `burnTime()` ejecuta un scrypt equivalente cuando el usuario no existe |

> La prueba `registrar un correo existente no revela que ya existe` **detectó una fuga real** en la
> primera implementación: los dos caminos devolvían mensajes distintos. Corregido en ambos
> proveedores; el mensaje es ahora una constante compartida.

**Sesiones.** `HttpOnly`, `Secure` en HTTPS, `SameSite=Lax`, `Path=/`, 30 días. En modo local, token
opaco firmado con HMAC-SHA256 y caducidad incrustada.

**El almacén local no puede correr en producción.** `assertDevelopment()` lanza si
`import.meta.env.PROD`.

---

## 5. Autorización

Tres capas independientes:

1. **Middleware.** `/cuenta/*` sin sesión → redirección. `/admin/*` sin rol → **404, no 403**.
2. **Endpoint.** Cada handler vuelve a comprobar `locals.user` y el rol. Nada se fía del middleware.
3. **RLS.** Aunque las dos anteriores fallaran, la base sólo devuelve filas del usuario.

**El rol nunca proviene de entrada de usuario.** El trigger de alta ignora los metadatos del
registro y fija `'user'`. `ADMIN_EMAILS` es únicamente el mecanismo de arranque del primer
administrador.

**`user_subscriptions` no tiene política de escritura para el usuario.** El único escritor del estado
de facturación es el webhook. Sin esto, cualquiera podría concederse Pro.

---

## 6. CSRF

Doble cookie firmada + comprobación de `Origin`/`Referer`. Se aplica a todo método mutante, incluido
el cierre de sesión.

La única excepción es el webhook de Stripe, donde **la firma es la autenticación** y Stripe no puede
enviar nuestras cookies.

Las páginas prerenderizadas no pueden llevar un token en el HTML (sería el mismo para todos), así que
obtienen uno de `/api/csrf` desde el navegador. La cookie es legible por JavaScript a propósito: el
patrón de doble envío lo exige, y no es una sesión.

**Verificado por e2e:** un POST sin token devuelve 403.

---

## 7. Redirecciones abiertas

`safeRedirect()` acepta únicamente rutas absolutas de un solo `/`, y rechaza:

- URLs absolutas a otro dominio;
- `//dominio` y `///dominio`;
- `javascript:`, `data:` y variantes con espacios o tabuladores;
- barras invertidas;
- cualquier ruta bajo `/api/`.

Nueve pruebas unitarias cubren cada caso.

---

## 8. Webhooks

```
1. request.text()                    ← cuerpo crudo, sin parsear
2. constructEvent(body, sig, secret) ← falla → 400
3. insert en processed_webhook_events ← 23505 → duplicado, 200 y salir
4. aplicar
5. 200 siempre (los fallos propios se registran, no se reintentan)
```

Parsear antes de verificar rompería la firma. La idempotencia por clave primaria es atómica: dos
entregas simultáneas no pueden aplicarse dos veces.

**Guardia de clave live.** `getStripe()` lanza si detecta `sk_live_` fuera de producción. Es la
protección más importante del módulo de facturación.

---

## 9. Rate limiting — limitación conocida

**Estado:** ventana fija en memoria del proceso.

**Limitación honesta:** en Vercel el límite es **por instancia**, no global. Frena a un cliente
insistente; **no frena un ataque distribuido**.

| Endpoint | Límite |
| --- | --- |
| Login | 8 / 10 min |
| Registro | 5 / hora |
| Recuperación | 4 / hora |
| Newsletter | 5 / hora |
| Correcciones | 6 / hora |
| Contacto | 4 / hora |
| Checkout | 10 / 10 min |
| API general | 120 / min |

**Mitigación adicional:** honeypot en todos los formularios públicos, y Turnstile listo (se activa
con dos variables de entorno).

**Camino de migración:** `checkRateLimit()` está aislado. Pasar a Upstash Redis es cambiar un
fichero. Recomendado antes de una campaña de tráfico alto.

---

## 10. Dependencias

**Al empezar:** 13 vulnerabilidades (2 críticas, 8 altas, 3 moderadas).
**Ahora:** 3 altas.

Las tres restantes tienen un único origen: `path-to-regexp` vía `@vercel/routing-utils`, dentro de
`@astrojs/vercel`.

**Evaluación:** es código de **generación de configuración de rutas en tiempo de build**. No procesa
entrada de usuario en runtime. El vector (ReDoS mediante un patrón de ruta manipulado) requeriría que
un atacante controlase nuestro `astro.config.mjs`, en cuyo caso el ReDoS sería el menor problema.

**Acción:** vigilar `@astrojs/vercel`. No hay parche disponible al cerrar esta revisión.

---

## 11. Registro y datos sensibles

El logger **redacta por construcción**: cualquier campo cuyo nombre coincida con
`/pass(word)?|secret|token|api[_-]?key|authorization|cookie|card|cvv|iban/i` se sustituye antes de
escribirse. Un `logger.info('x', req.body)` descuidado no puede filtrar una contraseña.

- Las direcciones IP se guardan **siempre como hash** truncado.
- Los destinatarios de correo se registran hasheados.
- Los tokens de confirmación y baja se almacenan hasheados: una filtración de la base no permite
  confirmar suscripciones ajenas.
- La página 500 no muestra trazas, nombres de módulo ni errores de base de datos.

---

## 12. Verificar RLS

```sql
-- 1. Ninguna tabla pública sin RLS
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
-- Esperado: 0 filas

-- 2. Aislamiento entre usuarios
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid-A>"}';
select count(*) from user_favorites where user_id = '<uuid-B>';   -- 0
select count(*) from user_lists     where user_id = '<uuid-B>';   -- 0
select count(*) from alerts         where user_id = '<uuid-B>';   -- 0

-- 3. Nadie se promueve solo
update profiles set role = 'admin' where id = '<uuid-A>';
-- Esperado: 0 filas afectadas

-- 4. Nadie se concede Pro
insert into user_subscriptions (user_id, status) values ('<uuid-A>', 'active');
-- Esperado: violación de política

-- 5. La auditoría no se reescribe
update audit_logs set action = 'x' where id = 1;   -- 0 filas
delete from audit_logs where id = 1;               -- 0 filas

-- 6. Anónimo no ve borradores
set local role anon;
select count(*) from tools where status = 'draft';  -- 0
```

> Estas comprobaciones **no se han ejecutado** en esta entrega: requieren una instancia de Supabase
> con credenciales reales. Son el primer punto del
> [`launch-checklist.md`](./launch-checklist.md).

---

## 13. Riesgos abiertos

| # | Riesgo | Gravedad | Mitigación / plan |
| --- | --- | --- | --- |
| R-1 | Rate limiting no distribuido | Media | Migrar a Upstash antes de tráfico alto |
| R-2 | `path-to-regexp` en `@vercel/routing-utils` | Baja (build-time) | Vigilar actualización |
| R-3 | RLS no verificado contra instancia real | **Alta hasta comprobarlo** | Ejecutar § 12 antes de lanzar |
| R-4 | `style-src 'unsafe-inline'` | Baja | Requiere renunciar a estilos con ámbito |
| R-5 | Turnstile inactivo | Media si hay abuso | Dos variables de entorno |
| R-6 | Sin 2FA | Media | Supabase lo soporta; no implementado |
| R-7 | Textos legales sin revisión jurídica | Alta para publicar | Marcados como borrador en la propia página |

---

## 14. Lo que no se ha hecho

Por honestidad, y porque una revisión que sólo lista logros no sirve:

- No se ha ejecutado un escaneo dinámico (ZAP, Burp).
- No se ha hecho pentest manual.
- Las políticas RLS están escritas y razonadas, pero **no probadas contra una base real**.
- Stripe no se ha probado con eventos reales (falta la clave de test).
- No hay pruebas de carga.
