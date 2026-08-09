# Guía de despliegue

> **Nada de esta guía se ha ejecutado.** No se ha desplegado, no se ha tocado DNS, no se ha
> configurado ningún servicio externo y no se ha activado ningún cobro. Todo queda preparado y
> pendiente de aprobación humana.

---

## 1. Arrancar en local (5 minutos, sin credenciales)

```bash
npm install
cp .env.example .env     # opcional: funciona con .env vacío
npm run dev
```

Abre http://localhost:4321.

**Qué funciona sin configurar nada:**

| Funciona | Cómo |
| --- | --- |
| Todo el catálogo, filtros, búsqueda, comparador | Datos estáticos |
| Registro, login, recuperación, cambio de contraseña | Almacén local en `.data/` |
| Favoritos, listas, alertas, preferencias | JSON en `.data/` |
| Exportación y borrado de datos | Igual |
| Panel de administración | Pon tu correo en `ADMIN_EMAILS` y regístrate |
| Correos | Se renderizan y registran en consola, no se envían |
| Suscripción Pro | Flujo simulado en `/pro/simulacion` |

Para entrar al panel de administración:

```bash
echo 'ADMIN_EMAILS="tu@correo.com"' >> .env
# reinicia npm run dev, regístrate con ese correo y ve a /admin
```

---

## 2. Verificar antes de desplegar

```bash
npm run verify
```

Equivale a `lint && typecheck && test && build`. Los cuatro deben pasar.

E2E (arranca el servidor por su cuenta):

```bash
npx playwright install --with-deps    # sólo la primera vez
npm run test:e2e
```

---

## 3. Configurar Supabase

> **Requiere aprobación humana:** crea un proyecto y puede generar coste.

1. Crear proyecto en [supabase.com](https://supabase.com), **región de la UE** (Fráncfort o
   Irlanda) por proximidad y por RGPD.

2. Aplicar el esquema:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

   O manualmente, **en este orden**:

   ```bash
   psql "$DATABASE_URL" -f supabase/migrations/0001_core_schema.sql
   psql "$DATABASE_URL" -f supabase/migrations/0002_rls_policies.sql
   ```

3. Conectar el trigger de alta de usuarios (toca el esquema `auth`):

   ```sql
   create trigger on_auth_user_created
     after insert on auth.users
     for each row execute function public.handle_new_user();
   ```

4. Sembrar el catálogo. **No es opcional**: `user_favorites.tool_id` es clave
   foránea contra `public.tools`, y un esquema recién migrado la tiene vacía,
   así que hasta que esto corra ningún favorito se puede guardar.

   ```bash
   npm run data:catalog-sql
   psql "$DATABASE_URL" -f supabase/seed/catalog.sql
   ```

   El fichero es idempotente y termina con una comprobación que aborta la
   transacción si el espejo no queda como debe.

   Para revertir: vuelve el catálogo a su estado anterior en git, regenera y
   aplica otra vez. **No hay un `rollback.sql`**, y su ausencia es deliberada:
   el que existía borraba herramientas por slug, lo que arrastra en cascada
   favoritos, listas e historial. Una herramienta que sale del catálogo se
   archiva; nunca se borra.

5. **Ejecutar las comprobaciones de RLS** de
   [`security-review.md`](./security-review.md) § 12. No es opcional.

6. En *Authentication → URL Configuration*:
   - Site URL: `https://www.freeairadar.com`
   - Redirect URLs: `https://www.freeairadar.com/cuenta/verificar`,
     `https://www.freeairadar.com/cuenta/nueva-contrasena`

7. Copiar a las variables de entorno: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`.

### Google como proveedor (opcional)

*Authentication → Providers → Google*: activar y pegar client ID y secret de Google Cloud Console.
La redirección es la que indique Supabase. El código ya expone `supportsOAuth`; falta añadir el
botón, que es media hora de trabajo cuando se decida.

---

## 4. Configurar Stripe (modo test)

> **Requiere aprobación humana.** Estas instrucciones son **sólo para modo test**. Activar cobros
> reales es una decisión aparte que este documento no cubre.

1. En modo **test**, crear el producto «Radar Pro» con dos precios recurrentes: mensual y anual.

2. Copiar los `price_...` (no los `prod_...`) a `STRIPE_PRICE_PRO_MONTHLY` y
   `STRIPE_PRICE_PRO_YEARLY`.

3. `STRIPE_SECRET_KEY` con la clave **`sk_test_`**. El código lanza una excepción si detecta
   `sk_live_` fuera de producción.

4. Webhook en `https://<tu-dominio>/api/billing/webhook`, con estos eventos:

   ```
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.paid
   invoice.payment_failed
   ```

   El secreto va en `STRIPE_WEBHOOK_SECRET`.

5. En local:

   ```bash
   stripe listen --forward-to localhost:4321/api/billing/webhook
   ```

6. Probar con `4242 4242 4242 4242`, fecha futura, cualquier CVC.
   Para fallo de pago: `4000 0000 0000 0341`.

7. Activar el Customer Portal en *Settings → Billing → Customer portal* y permitir cancelación y
   cambio de plan.

**Impuestos:** el Checkout usa `automatic_tax: { enabled: true }` y `tax_id_collection`. Hay que
configurar Stripe Tax antes de cobrar en la UE.

---

## 5. Configurar Resend

> **Requiere aprobación humana.**

1. Añadir el dominio en [resend.com](https://resend.com) y crear los registros DNS (SPF, DKIM,
   opcionalmente DMARC). **Este paso toca el DNS y no se ha hecho.**
2. Crear una API key → `RESEND_API_KEY`.
3. `EMAIL_FROM` con un remitente del dominio verificado.
4. **Dejar `EMAIL_DRY_RUN=1` hasta haber comprobado las plantillas.**

Los envíos masivos están bloqueados fuera de producción por `assertCampaignAllowed()`, y el panel de
administración **no tiene botón de envío** a propósito.

---

## 6. Desplegar en Vercel

> **Requiere aprobación humana.**

1. Importar el repositorio. Vercel detecta Astro automáticamente.
2. Variables de entorno (Production y Preview por separado):

   | Variable | Production | Preview |
   | --- | --- | --- |
   | `PUBLIC_SITE_URL` | `https://www.freeairadar.com` | URL de preview |
   | `PUBLIC_SUPABASE_URL` | ✅ | ✅ (proyecto aparte, idealmente) |
   | `PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ |
   | `STRIPE_SECRET_KEY` | `sk_test_` hasta autorizar cobros | `sk_test_` |
   | `STRIPE_WEBHOOK_SECRET` | ✅ | ✅ |
   | `STRIPE_PRICE_PRO_*` | ✅ | ✅ |
   | `RESEND_API_KEY` | ✅ | vacío |
   | `EMAIL_FROM` | ✅ | ✅ |
   | `EMAIL_DRY_RUN` | vacío cuando esté validado | `1` |
   | `AUTH_SECRET` | `openssl rand -base64 48` | distinto |
   | `ADMIN_EMAILS` | ✅ | ✅ |

3. `vercel.json` ya trae las cabeceras de seguridad y las políticas de caché. No hace falta tocarlo.

4. **Antes del primer despliegue a producción, comprobar `PUBLIC_SITE_URL`.** Es literalmente el bug
   que arrastraba la v1: el canónico apuntaba a un dominio de preview y le decía a Google que el
   contenido vivía en otro sitio.

---

## 7. Dominio y DNS

> **NO SE HA TOCADO NADA.** Requiere aprobación humana explícita.

Cuando se autorice:

1. Añadir `freeairadar.com` y `www.freeairadar.com` en Vercel.
2. Elegir una versión canónica (recomendado: `www`) y redirigir la otra con 301.
3. Verificar que HSTS se sirve **sólo** cuando el dominio esté estable. `preload` es difícil de
   revertir.
4. Comprobar que `PUBLIC_SITE_URL` coincide exactamente con la versión canónica elegida.

---

## 8. Tras el despliegue

```bash
# El canónico debe apuntar al dominio real
curl -s https://www.freeairadar.com/ | grep -o '<link rel="canonical"[^>]*>'

# robots.txt debe apuntar al sitemap correcto
curl -s https://www.freeairadar.com/robots.txt

# Cabeceras de seguridad
curl -sI https://www.freeairadar.com/ | grep -iE 'content-security|strict-transport|x-frame'

# El admin no debe ser indexable
curl -sI https://www.freeairadar.com/admin | grep -i x-robots-tag
```

Después:

1. Dar de alta la propiedad en Google Search Console y enviar `sitemap.xml`.
2. Solicitar la retirada del índice de las URLs del dominio de preview antiguo.
3. Comprobar que las redirecciones 301 de `/tools`, `/about`, `/methodology`, `/privacy`,
   `/creators` y `/comfyui-sin-gpu` funcionan.
4. Validar los datos estructurados con la herramienta de resultados enriquecidos de Google.
5. Ejecutar Lighthouse sobre inicio, listado y una ficha.

---

## 9. Mantenimiento

| Tarea | Frecuencia | Comando |
| --- | --- | --- |
| Reverificar fichas | Continua | Ver `/admin/desactualizadas` |
| Comprobar enlaces | Semanal | `npm run links:check` |
| Regenerar catálogo | En cada cambio de contenido | `npm run data:migrate` |
| Auditar dependencias | Mensual | `npm audit` |
| Revisar correcciones | Diaria | `/admin/correcciones` |

---

## 10. Rollback

**Aplicación:** *Deployments* en Vercel → promover el anterior. Inmediato.

**Contenido:** `git revert` del commit que cambió `src/data/generated/tools.json`.

**Base de datos:** vuelve el catálogo a su estado anterior en git, ejecuta
`npm run data:catalog-sql` y aplica el fichero. Lo que ya no está se archiva en
vez de borrarse, así que ni los favoritos, ni las listas, ni el historial de
nadie se pierden por revertir contenido.

---

## 11. Qué necesita aprobación humana

| Acción | Por qué |
| --- | --- |
| Crear el proyecto de Supabase | Coste externo |
| Aplicar migraciones a una base real | Cambio de esquema |
| Crear el trigger sobre `auth.users` | Toca un esquema gestionado |
| Crear productos y precios en Stripe | Configuración de cobro |
| **Pasar Stripe a modo live** | **Cobros reales** |
| Verificar el dominio en Resend | Cambios en DNS |
| Enviar cualquier campaña | Comunicación real a personas |
| Conectar el dominio en Vercel | Cambios en DNS |
| Activar HSTS con `preload` | Difícil de revertir |
| Activar AdSense | Requiere CMP certificada operativa |
