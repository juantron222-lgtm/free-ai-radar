# Amazon Afiliados: preparación en staging

**Estado: preparado, no conectado.** No hay cuenta de Afiliados dada de alta, ni
etiqueta, ni claves de PA-API, ni un solo producto de Amazon en la base. El
sitio se comporta exactamente igual que si Amazon no existiera.

| | |
| --- | --- |
| Reglas | [`src/lib/domain/amazon.ts`](../src/lib/domain/amazon.ts) |
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
| Toda alta entra como `pending_review` | Un producto de Amazon lo aprueba una persona, aunque venga de PA-API |
| `disclosure_required` es `check (= true)` | Ni el service role puede crear un enlace de Amazon sin divulgación |
| El anfitrión del enlace debe ser el del comerciante | Un enlace que no apunte a Amazon se rechaza |
| Precio con más de **24 horas** se retira | Es la licencia de Amazon, no una preferencia nuestra. Ver §4 |
| Registro sin comprobar en 60 días desaparece | Si PA-API deja de responder, las cajas se vacían solas |
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

Pasado el máximo hay que **obtener contenido nuevo** por Creators API, PA-API o
Data Feed. No vale releer lo guardado.

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
4. **Solicitar acceso a PA-API.** Amazon exige ventas previas para concederlo:
   una cuenta nueva no tiene claves hasta haber generado comisiones, así que
   este paso puede tardar semanas y no depende de nosotros.
5. **Rellenar las variables** en `.env.local` de staging — nunca en el
   repositorio:

```
AMAZON_ASSOCIATE_TAG=""
AMAZON_MARKET="ES"
AMAZON_DISCLOSURE_TEXT=""
AMAZON_PAAPI_ACCESS_KEY=""
AMAZON_PAAPI_SECRET_KEY=""
```

`amazonReadiness()` informa de cuáles faltan sin leer ninguna. Hay una prueba
que comprueba que **hoy no hay ninguna presente**: si algún día falla, es que
alguien conectó Amazon sin decirlo.

---

## 6. Lo que sigue sin verificar

Las reglas de caché, precios y declaraciones ya están confirmadas por el
propietario contra fuentes oficiales. Queda pendiente, y se dice para que nadie
lo dé por hecho:

- **Los límites de tasa de PA-API.** Amazon los ajusta según el volumen de
  ventas. Afectan a con qué frecuencia puede refrescar AutoCraw, y con un
  máximo de 24 horas eso deja de ser un detalle: si el límite impidiera
  refrescar a diario, habría contenido que sencillamente no podríamos mostrar.
- **Si la ventana de 24 horas se cuenta desde la petición a la API o desde la
  respuesta.** La diferencia es de segundos y sólo importa en el borde; el
  código toma el instante de observación, que es el más conservador.
- **Qué exige exactamente Amazon para «mecanismo autorizado»** más allá de
  Creators API, PA-API y Data Feed.

Son deberes de lectura para quien dé de alta la cuenta, no cosas que el código
pueda resolver.
