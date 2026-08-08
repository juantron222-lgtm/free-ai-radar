# Amazon Afiliados: preparación en staging

**Estado: preparado, no conectado.** No hay cuenta de Afiliados dada de alta, ni
etiqueta, ni claves de PA-API, ni un solo producto de Amazon en la base. El
sitio se comporta exactamente igual que si Amazon no existiera.

| | |
| --- | --- |
| Reglas | [`src/lib/domain/amazon.ts`](../src/lib/domain/amazon.ts) |
| Pruebas | [`tests/unit/amazon.test.ts`](../tests/unit/amazon.test.ts) — 20 |
| Contrato base | [`docs/autocraw-affiliate-integration.md`](autocraw-affiliate-integration.md) |

---

## 1. Qué está hecho

Amazon es más estricto que un comerciante genérico en dos cosas, y ambas están
impuestas por código antes de que exista una sola oferta:

**El enlace debe llevar la etiqueta.** Un enlace sin `?tag=` no es un enlace de
afiliado: no genera comisión y aun así habría que etiquetarlo como publicidad.
Está mal en las dos direcciones a la vez.

**El anfitrión debe corresponder al mercado.** Una etiqueta de `amazon.es` en un
enlace `amazon.com` no cobra nada y manda a un lector español a la tienda
equivocada. La tabla de mercados incluye que Portugal compra a través de
`amazon.es`, porque Amazon no tiene tienda `.pt`.

`checkAmazonLink` devuelve **todos** los problemas, no el primero: arreglar uno
y redescubrir el siguiente es cómo una tarea corta se convierte en tres.

---

## 2. La declaración de afiliación

Amazon obliga a mostrarla. La redacción verificada, literal del §5 del Operating
Agreement de `affiliate-program.amazon.com`, comprobada el 8 de agosto de 2026:

> As an Amazon Associate I earn from qualifying purchases.

**La redacción en español no está aquí, y es deliberado.** Las páginas de ayuda
de `afiliados.amazon.es` indexan el Operating Agreement sin reproducirlo, y
`programa-afiliados.amazon.es` no resuelve. No he podido obtenerla de una fuente
primaria.

Inventar el texto de una declaración legal es exactamente el modo de fallo que
este proyecto existe para evitar, y una declaración equivocada es **peor** que
una ausente, porque aparenta cumplimiento.

Así que `requireDisclosure` se niega a aceptar un comerciante sin ella, y
también rechaza un marcador de posición (`[...]`, `TODO`, `PENDIENTE`). Alguien
tiene que pegar el texto real desde el panel de Afiliados antes de que una
oferta de Amazon pueda publicarse. El hueco no se puede olvidar porque el
sistema no arranca sin él.

---

## 3. Lo que Amazon hereda del contrato de AutoCraw

Nada de esto se relaja para Amazon. Verificado contra staging el 8 de agosto de
2026, 42 sondas, 0 bypass — [`autocraw-staging-run.json`](evidence/autocraw-staging-run.json):

| Regla | Cómo aplica a Amazon |
| --- | --- |
| Toda alta entra como `pending_review` | Un producto de Amazon lo aprueba una persona, aunque venga de PA-API |
| `disclosure_required` es `check (= true)` | Ni el service role puede crear un enlace de Amazon sin divulgación |
| El anfitrión del enlace debe ser el del comerciante | Un enlace que no apunte a Amazon se rechaza |
| Precio con más de 30 días se retira | Los precios de Amazon cambian a diario: aquí caducan antes de mentir |
| Registro sin comprobar en 60 días desaparece | Si PA-API deja de responder, las cajas se vacían solas |
| `commercial_priority` no toca el orden editorial | Una comisión más alta no mueve una ficha |
| AutoCraw no borra nada | Retirar un producto de Amazon es marcarlo inactivo |

---

## 4. Lo que falta, y sólo lo puede hacer una persona

Por orden. Ninguno de estos pasos lo puede dar un agente.

1. **Dar de alta la cuenta en Amazon Afiliados** y aceptar el Operating
   Agreement. Requiere identidad fiscal y aprobación de Amazon.
2. **Copiar la declaración de afiliación en español** desde el panel, literal.
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

## 5. Lo que no he verificado

Se dice para que nadie lo dé por hecho:

- **Las reglas de Amazon sobre mostrar precios.** El Operating Agreement no las
  contiene; están en las Program Policies, que no pude recuperar. La política
  de caducidad a 30 días de este proyecto es *nuestra*, más estricta que nada
  que Amazon exija hasta donde sé, pero **no confirmada como suficiente**.
  Antes de publicar precios de Amazon hay que leer esas políticas.
- **La redacción española de la declaración**, ya dicho en §2.
- **Si PA-API impone un tiempo máximo de caché** para precios y disponibilidad.
  Suele haber uno. No lo he confirmado.

Las tres son deberes de lectura para la persona que dé de alta la cuenta, no
cosas que el código pueda resolver.
