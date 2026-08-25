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
| Créditos gastados | Antes y después, si el producto los enseña |
| Cuota restante | El contador de la interfaz |
| ¿Pidió tarjeta? | En el registro o al generar |
| Tiempo | De pulsar a resultado, aproximado |
| ¿Marca de agua? | Mirando el archivo descargado, no la vista previa |

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
  "creditsSpent": "1 crédito lento",
  "creditsLeft": "9 de 10 esta semana",
  "cardRequiredObserved": "no_aparecio",
  "watermarkObserved": "no_aparecio",
  "durationSeconds": 34,
  "archivoDescargado": "C:/ruta/a/la/descarga.png",
  "notes": "Las imágenes se publican en la comunidad por defecto; hubo que cambiarlo antes de generar."
}
```

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
