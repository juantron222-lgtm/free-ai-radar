# Amazon Afiliados: preparación en staging

**Estado: preparado, no conectado.** No hay cuenta de Afiliados dada de alta, ni
etiqueta, ni credenciales de Creators API, ni un solo producto de Amazon en la
base. El sitio se comporta exactamente igual que si Amazon no existiera.

**La integración se construye sobre Creators API, no sobre PA-API 5.0.** Amazon
ha deprecado PA-API y Creators API la sustituye; una arquitectura nueva no debe
apoyarse en lo que se está retirando.

| | |
| --- | --- |
| Reglas | [`src/lib/domain/amazon.ts`](../src/lib/domain/amazon.ts) |
| Creators API | [`src/lib/amazon/creators-api.ts`](../src/lib/amazon/creators-api.ts) — 43 pruebas |
| Estado compartido | [`0008_amazon_creators_state.sql`](../supabase/migrations/0008_amazon_creators_state.sql) |
| Pruebas | [`tests/unit/amazon.test.ts`](../tests/unit/amazon.test.ts) — 40, más 10 de caducidad en `affiliate.test.ts` |
| Caché e instante | [`0007_amazon_cache_instant.sql`](../supabase/migrations/0007_amazon_cache_instant.sql) |
| Contrato base | [`docs/autocraw-affiliate-integration.md`](autocraw-affiliate-integration.md) |

---

## 1. Qué está hecho

Amazon es más estricto que un comerciante genérico en cuatro cosas, todas
impuestas por código antes de que exista una sola oferta:

**El enlace debe llevar la etiqueta.** Un enlace sin `?tag=` no es un enlace de
afiliado: no genera comisión y aun así habría que etiquetarlo como publicidad.
Está mal en las dos direcciones a la vez.

**El anfitrión debe corresponder al mercado.** Una etiqueta de `amazon.es` en un
enlace `amazon.com` no cobra nada y manda a un lector español a la tienda
equivocada. La tabla de mercados incluye que Portugal compra a través de
`amazon.es`, porque Amazon no tiene tienda `.pt`.

**La caché caduca en horas, no en días**, y la imagen no se puede almacenar en
absoluto. Ver §4.

**Cada enlace lleva su propia divulgación**, junto a él, además de la general
del sitio. Ver §2.

`checkAmazonLink` devuelve **todos** los problemas, no el primero: arreglar uno
y redescubrir el siguiente es cómo una tarea corta se convierte en tres.

---

## 2. Las declaraciones

Verificadas por el propietario del proyecto contra las fuentes oficiales de
Amazon Afiliados España. Son **constantes, no plantillas**: una declaración
legal que alguien parafrasea deja de decir lo que Amazon exige.

**Declaración general del sitio**, redacción oficial de Amazon España:

> En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas
> que cumplen los requisitos aplicables

**Junto a cada enlace**, además de la general, una divulgación clara y visible.
Amazon España nombra estas cuatro:

- `(enlace pagado)`
- `#publicidad`
- `#publi`
- `#ColaboraciónPagada`

Es una lista cerrada. `AmazonLinkDisclosure` rechaza cualquier otra cosa,
incluida «enlace patrocinado» — suena equivalente y no es una de las que Amazon
nombró, que es exactamente el riesgo con la redacción de una divulgación.

`requireDisclosure(texto, isAmazon = true)` **rechaza una paráfrasis**, no sólo
un texto vacío. Hay una prueba que le pasa una versión razonable y comprueba que
la rechaza.

---

## 3. Lo que Amazon hereda del contrato de AutoCraw

Nada de esto se relaja para Amazon. Verificado contra staging el 8 de agosto de
2026, 42 sondas, 0 bypass — [`autocraw-staging-run.json`](evidence/autocraw-staging-run.json):

| Regla | Cómo aplica a Amazon |
| --- | --- |
| Toda alta entra como `pending_review` | Un producto de Amazon lo aprueba una persona, aunque venga de Creators API |
| `disclosure_required` es `check (= true)` | Ni el service role puede crear un enlace de Amazon sin divulgación |
| El anfitrión del enlace debe ser el del comerciante | Un enlace que no apunte a Amazon se rechaza |
| Precio con más de **24 horas** se retira | Es la licencia de Amazon, no una preferencia nuestra. Ver §4 |
| Registro sin comprobar en 60 días desaparece | Si Creators API deja de responder, las cajas se vacían solas |
| `commercial_priority` no toca el orden editorial | Una comisión más alta no mueve una ficha |
| AutoCraw no borra nada | Retirar un producto de Amazon es marcarlo inactivo |

---

## 4. Caché, precios y disponibilidad

Los límites son de la licencia de Amazon EU, no preferencias nuestras. Esa
distinción está en el código: `DEFAULT_CACHE_POLICY` es nuestro criterio
editorial sobre cuándo un precio deja de ser un hecho; `AMAZON_CACHE_POLICY` es
un término contractual. Mezclarlos permitiría relajar una obligación legal
ajustando una preferencia.

| Contenido | Máximo en caché |
| --- | --- |
| Contenido publicitario que no sea imagen | **24 horas** |
| La imagen en sí | **No se almacena**, nunca |
| URL o enlace de la imagen | **24 horas** |
| ASIN | Mientras la licencia siga vigente |

Pasado el máximo hay que **obtener contenido nuevo** por Creators API o Data
Feed. No vale releer lo guardado.

### Precios y disponibilidad

- Sólo se muestran si proceden de un mecanismo autorizado por Amazon.
- Si se actualizan menos de una vez por hora, hay que mostrar **sello de fecha
  y hora**. Aquí nada se actualiza cada hora, así que el sello es siempre
  obligatorio y siempre se muestra.
- Debe acompañarlos el aviso de que precio y disponibilidad pueden cambiar.
  Es una constante, `AMAZON_PRICE_NOTICE`, no un texto que cada plantilla
  redacte.

### El defecto que esto destapó en mi esquema

`observed_price_at` era un `date`. **Una fecha no puede expresar un límite de
24 horas**: no distingue «visto hace dos horas» de «visto hace veintiséis»
cuando caen en días contiguos. La columna tenía la forma equivocada para la
obligación, así que la regla no se podría haber cumplido ni queriendo.

La migración 0007 añade `observed_price_at_utc timestamptz`, con una
restricción que obliga a que el instante y el día concuerden — si no, una fila
podría contarle una cosa a la comprobación de frescura y otra al lector.

Y una oferta de Amazon **sin** instante nunca se considera fresca. La ausencia
de sello no es motivo para suponer que es reciente.

---

## 5. Lo que falta, y sólo lo puede hacer una persona

Por orden. Ninguno de estos pasos lo puede dar un agente.

1. **Dar de alta la cuenta en Amazon Afiliados** y aceptar el Operating
   Agreement. Requiere identidad fiscal y aprobación de Amazon.
2. **Confirmar que la declaración oficial del §2 sigue siendo la vigente** en el panel: Amazon la ha cambiado antes.
3. **Obtener la etiqueta** (`nombre-21` para España).
4. **Solicitar acceso a Creators API.** Amazon exige ventas previas para
   concederlo: una cuenta nueva no tiene credenciales hasta haber generado
   comisiones, así que este paso puede tardar semanas y no depende de nosotros.
   **No solicitar PA-API 5.0**: está deprecada.
5. **Rellenar las variables** en `.env.local` de staging — nunca en el
   repositorio:

```
AMAZON_ASSOCIATE_TAG=""
AMAZON_MARKET="ES"
AMAZON_DISCLOSURE_TEXT=""
AMAZON_CREATORS_CLIENT_ID=""
AMAZON_CREATORS_CLIENT_SECRET=""

# Opcional. Corrige la cuota sin desplegar cuando Amazon la ajuste.
# {"maxTps":1,"maxTpd":8640,"recordedAt":"...","source":"...","provisional":true}
AMAZON_QUOTA_JSON=""
```

`amazonReadiness()` informa de cuáles faltan sin leer ninguna. Hay una prueba
que comprueba que **hoy no hay ninguna presente**: si algún día falla, es que
alguien conectó Amazon sin decirlo.

---

## 6. Lo que sigue sin verificar

Las reglas de caché, precios y declaraciones ya están confirmadas por el
propietario contra fuentes oficiales. Queda pendiente, y se dice para que nadie
lo dé por hecho:

- **Cuál será la cuota real de esta cuenta pasados los primeros 30 días.**
  Depende del rendimiento y sólo se sabrá cuando ocurra. El sistema ya trata
  la cifra inicial como provisional y se niega a confiar en ella pasado un mes
  sin recomprobar, que es lo único que se puede hacer por adelantado.
- **Si la ventana de 24 horas se cuenta desde la petición a la API o desde la
  respuesta.** La diferencia es de segundos y sólo importa en el borde; el
  código toma el instante de observación, que es el más conservador.
- **Qué exige exactamente Amazon para «mecanismo autorizado»** más allá de
  Creators API y Data Feed.

Son deberes de lectura para quien dé de alta la cuenta, no cosas que el código
pueda resolver.

---

## 7. Creators API: cuota, tokens y qué pasa cuando falla

Toda llamada pasa por `CreatorsApiClient`. No hay otro método que llegue al
transporte, así que un llamante no puede saltarse el limitador ni el token por
descuido.

### La cuota es configuración, nunca una constante

Amazon publica **1 TPS** y **8.640 transacciones al día durante los primeros 30
días**. Después depende del rendimiento de la cuenta: puede subir y puede bajar.

Por eso `AmazonQuota` guarda, además de las cifras, **cuándo se comprobaron** y
**de dónde salieron**. Una cifra sin fecha es una cifra que nadie puede
evaluar: 8.640 fue cierto para los primeros treinta días de *alguna* cuenta en
*algún* momento, y tratarlo como garantía permanente es cómo un sistema empieza
a superar en silencio un límite que cree respetar.

`AMAZON_INITIAL_QUOTA` se llama así a propósito y viene marcada como
`provisional: true`. Pasados 30 días sin recomprobar, `refreshFeasibility`
**se niega a confiar en ella** y los emplazamientos de Amazon se ocultan.

### El limitador es central y compartido

`AmazonRateLimiter` aplica TPS y TPD. Los contadores viven en
`amazon_api_usage`, no en memoria, porque **si AutoCraw corre en dos procesos,
dos contadores privados superan juntos el límite mientras cada uno se cree
dentro**. El límite es de la cuenta, no de cada instancia.

Al agotarse la cuota diaria el cliente **no reintenta**: lo que falta no es un
backoff, es un día distinto. Devuelve error de inmediato en vez de dormir horas.

### Tokens: uno por hora, no uno por llamada

Los tokens de LwA duran una hora. `AmazonTokenCache`:

- **reutiliza** el vigente en lugar de pedir uno nuevo por llamada;
- lo guarda en `amazon_lwa_token`, **compartido**, de modo que un segundo
  proceso aprovecha el del primero;
- renueva con **60 segundos de margen**, porque un token que caduca en cuatro
  no sirve para una petición que tarda tres, y ese fallo llega como un 401
  opaco en vez de como «se acabó el token»;
- colapsa las llamadas concurrentes en **una sola petición**: diez llamadas
  simultáneas en frío pedían diez tokens, que es justo lo que la caché existe
  para evitar.

La tabla del token **no tiene política de lectura para staff**. Es una
credencial, nadie necesita verla en un panel, y una credencial cómoda de leer
acaba en una captura de pantalla.

### 429 y backoff

- **`Retry-After` manda** cuando Amazon lo envía: ellos saben cuándo se
  reabre la ventana y nosotros estamos adivinando. Se entiende tanto en
  segundos como en fecha HTTP.
- Sin cabecera, retardo exponencial con techo de 60 s.
- **Con jitter.** Sin él, todos los procesos limitados a la vez reintentan a la
  vez, que es cómo un límite de tasa se convierte en una estampida sincronizada
  que vuelve a limitarlos a todos.
- Un 401 invalida el token y reintenta con uno nuevo. Un 5xx se reintenta. Un
  400 no: no va a mejorar repitiéndolo.

### Si no da tiempo a refrescar en 24 h

`refreshFeasibility` responde a la pregunta que decide si un emplazamiento se
muestra: *¿alcanza la cuota para refrescar todo lo que pensamos enseñar antes
de que caduque?*

Si no alcanza, **el emplazamiento se omite**. No se muestra contenido caducado
y **la caché no se extiende** — es un término de la licencia, no una
preferencia que se pueda ajustar cuando viene mal. Hay una prueba que comprueba
que el motivo que se registra nunca propone alargarla.

La pregunta se hace sobre el **conjunto**, no elemento a elemento: veinte
productos que por separado parecen asumibles no lo son juntos.

### Si Creators API está caída

El sitio sigue funcionando. Los datos comerciales se leen de una instantánea, y
`src/lib/data/affiliate.ts` **nunca lanza**: ante datos ausentes, corruptos o
incoherentes devuelve lista vacía. Los registros caducan solos a los 60 días y
los precios de Amazon a las 24 horas, así que una API caída vacía las cajas
poco a poco en vez de dejar contenido viejo indefinidamente.
