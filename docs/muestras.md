# Cómo se hace una muestra editorial

Una muestra es una generación real hecha con el acceso gratuito de una
herramienta, archivada con sus condiciones. No es material del fabricante y no
es un ranking: es lo que obtuvimos nosotros, ese día, con esa cuota.

**La generación la hace una persona.** Las once herramientas de imagen que
alojan su servicio exigen crear una cuenta, y varias devuelven 403 a cualquier
lector automático. Crear cuentas y sortear controles anti-bot queda fuera de lo
que este repositorio hace por su cuenta, así que el paso de generar es manual y
el resto está automatizado.

## 1. El prompt

Es el mismo para las seis. Se obtiene con:

```bash
node scripts/muestras.mjs --prompt
```

Exige composición, materiales, luz lateral, coherencia espacial y anatomía, y
no depende de que el modelo sepa escribir texto dentro de la imagen —eso es
otra habilidad y desviaría la comparación—. Sin marcas, sin personajes
protegidos, sin nada sexual.

Si un producto obliga a cambiarlo —límite de caracteres, un control que no
existe, un filtro que lo rechaza— **no se adapta en silencio**: se anota la
desviación en `promptDeviation` y se publica al lado del resultado.

## 2. La ejecución

Una sola generación por herramienta, con la cuenta gratuita, sin trucos:

- Una cuenta por servicio. **No se crean varias para conseguir más créditos**:
  una prueba tiene que representar lo que puede hacer una persona normal.
- No se saltan CAPTCHA ni controles anti-bot. Si un servicio no deja llegar al
  generador, la prueba se declara no completada y se dice por qué.
- Se usa el modo por defecto salvo que haya que elegir. Si se elige, se anota.

Mientras se hace, se apunta lo que sólo se ve en pantalla:

| Dato | Dónde mirarlo |
| --- | --- |
| Hora exacta | El reloj, con zona horaria |
| Modo o modelo | El selector, si lo hay |
| Proporción | Lo que se pidió |
| Créditos gastados | Sólo si el producto los enseña. Si hay que restarlos, ver abajo |
| Cuota restante | El contador de la interfaz |
| ¿Pidió tarjeta? | En el registro o al generar |
| Tiempo | De pulsar a resultado, aproximado |
| ¿Marca de agua? | Inspeccionando el archivo original **completo** a resolución nativa |

Lo que no se pueda ver se deja fuera: **no se estima nada**. Un campo ausente
se lee como «sin confirmar», que es la verdad; un campo inventado no.

## 3. La descarga

Se descarga el resultado tal como lo entrega el producto, en su resolución y
formato originales. Ese archivo es la prueba y **no se toca**: nada de retoque,
escalado externo, corrección de color, recorte ni eliminación de marca.

## 4. La ingesta

Se escribe una ficha JSON con lo observado y la ruta al archivo:

```json
{
  "toolSlug": "ideogram",
  "generatedAt": "2026-08-26T10:32:00+02:00",
  "accessSurface": "web",
  "accessUrl": "https://ideogram.ai/",
  "model": "Ideogram 3.0 · calidad lenta",
  "aspectRatio": "1:1",
  "creditsSpent": { "origen": "mostrado", "texto": "1 crédito lento" },
  "creditsLeft": "9 de 10 esta semana",
  "cardRequiredObserved": "no_aparecio",
  "watermarkObserved": "no_aparecio",
  "durationSeconds": 34,
  "archivoDescargado": "C:/ruta/a/la/descarga.png",
  "notes": "Las imágenes se publican en la comunidad por defecto; hubo que cambiarlo antes de generar."
}
```

### El coste no es una cifra, son dos cosas

`creditsSpent` lleva siempre de dónde sale:

```json
{ "origen": "mostrado", "texto": "1 crédito lento" }
{ "origen": "inferido", "texto": "2 créditos",
  "base": "El selector tarifa Krea 2 Turbo en 2 y la generación llegó con esa etiqueta. El producto no mostró el cargo." }
```

Hay productos que enseñan el cargo de la generación y productos que sólo
publican una tarifa por modelo y te dejan restar. **La resta la hacemos
nosotros y puede estar mal** —otra tarifa, un descuento, un cargo que no se
ve—, así que una cifra deducida no se archiva sin decir de qué se dedujo. Si no
hay ni cargo ni tarifa, el campo no va: sin confirmar es la verdad.

Los valores de `cardRequiredObserved` y `watermarkObserved` son
`aparecio`, `no_aparecio`, `no_aplica` o `no_se_pudo_ver`. **No son `sí`/`no`**:
son observaciones de una ejecución, no condiciones del plan, y el vocabulario
distinto está justamente para que no puedan confundirse.

Después:

```bash
node scripts/muestras.mjs --anadir ficha.json
```

Eso archiva el original, produce el derivado que se sirve, mide las dimensiones
reales del archivo recibido —no las que prometía el formulario— y deja la fila
en `src/data/muestras.json`. La ficha de esa herramienta empieza a enseñar la
sección «Probado por Free AI Radar» sin tocar nada más.

### Cómo se decide la marca de agua

`no_aparecio` significa exactamente esto: **al inspeccionar el archivo original
completo, a su resolución nativa, no se observa ninguna marca visible.** No se
decide mirando la vista previa del navegador, ni comprobando sólo los bordes:
una marca puede ir centrada, en diagonal, repetida o a media opacidad sobre el
motivo. Se mira la imagen entera.

Y sigue siendo una observación sobre *ese archivo*: otro modo, otro formato de
descarga o un cambio del fabricante pueden dar un resultado distinto.

## 4 bis. Capturas de la interfaz

Lo que enseña la pantalla mientras se genera —el contador de créditos, un
aviso de cuota, una petición de tarjeta— no deja rastro en el archivo y se
pierde al cerrar la pestaña. Si se captura, se archiva:

```json
{
  "muestraId": "ideogram-2026-08-25",
  "nombre": "creditos",
  "archivo": "C:/ruta/a/la/captura.png",
  "capturadaEl": "2026-08-26T00:28:40+02:00",
  "textoVisible": "0 / 12 credits left until your weekly limit resets in 3 days",
  "respalda": "Durante nuestra prueba la interfaz mostraba… Es una lectura de la cuenta en ese momento, no la cuota oficial del plan.",
  "recorte": { "left": 250, "top": 462, "width": 246, "height": 196,
               "porQue": "Queda el panel de la cuenta. Fuera el navegador y la barra lateral, con el correo de quien hizo la prueba." }
}
```

```bash
node scripts/muestras.mjs --auxiliar captura.json
```

`textoVisible` es la transcripción literal, sin interpretar. `respalda` dice
qué sostiene y **hasta dónde**: en pasado, lo que la pantalla hacía, y cuándo.
Nunca «el plan es». Un contador es la lectura de un instante; puede ser otro
nivel de plan, una promoción o un cambio de ayer.

### Capturas sin muestra

A veces no hay generación que archivar y la pantalla es lo único que queda.
Clipdrop es el caso: responde al intento de generar con un aviso de que la
generación es exclusiva de Pro. No hay muestra —justamente por eso— y ese
aviso no está en el HTML de la página, así que la captura es la única prueba
que existe de la condición. Vale igual para lo que un producto sólo enseña con
la sesión iniciada, como la tarifa por modelo de Krea.

Se archivan igual, cambiando `muestraId` por `toolSlug` y añadiendo `url`:

```json
{
  "toolSlug": "clipdrop",
  "nombre": "generacion-pro",
  "url": "https://clipdrop.co/text-to-image",
  "archivo": "C:/ruta/a/la/captura.png",
  "capturadaEl": "2026-08-26T17:54:13+02:00",
  "textoVisible": "Image generation is for Pro — Generate images exclusively for Pro users",
  "respalda": "Con el prompt ya escrito, el producto respondió con este aviso en vez de generar…"
}
```

Aparecen en la ficha bajo «Lo que vimos en su interfaz», separadas de la
documentación oficial. **Siguen sin ser condiciones contractuales**: son lo que
mostraba el producto ese día, con nuestra cuenta.

### El recorte

Una captura de navegador arrastra cosas que no son la prueba y que no deben
publicarse: la barra de marcadores, el correo de la cuenta, el nombre de quien
hizo la prueba. Se recorta.

Pero recortar también sirve para quitar lo que estorba, así que **el recorte se
declara**: `porQue` dice qué queda y qué se va, y lo archivado escribe la
región y el tamaño de la pantalla de la que salió. Sin `porQue` el guion no
archiva nada.

Lo que se archiva es WebP **sin pérdida**: lo que prueba una captura son sus
letras —un contador, un aviso, una tarifa— y recomprimirlas con pérdida sería
emborronar la evidencia. Los píxeles quedan idénticos y pesa alrededor de la
mitad que el PNG.

## 5. Si la prueba contradice la ficha

Ocurre y es parte del valor de hacerla. Si al generar aparece una marca de agua
que la ficha decía que no existía, o piden una tarjeta que la ficha negaba:

1. **No se maquilla la prueba** para que encaje. El resultado es el resultado.
2. La ficha lo enseña como contradicción, con las dos versiones a la vista.
3. Corregir el catálogo es una decisión aparte, y sólo con evidencia
   suficiente: una ejecución puede diferir por el modo elegido, por la región o
   porque lo cambiaron ayer. Una muestra señala; no reescribe por su cuenta.

## 6. Lo que una muestra no demuestra

Que una generación salga sin marca de agua demuestra que **en esa prueba no
apareció**. No demuestra que el plan gratuito nunca la ponga. Lo mismo con la
tarjeta, la velocidad, la resolución y los créditos.

Por eso la sección publica siempre las dos cosas por separado: lo que el
fabricante documenta y lo que nosotros observamos. La muestra complementa; no
sustituye.
