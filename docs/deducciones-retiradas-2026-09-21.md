# Deducciones retiradas del catálogo

21 de septiembre de 2026. Decisión de Juan: «nada por inferencia», aplicada en estricto.

> Pásalas a «Sin comprobar», salvo las que ahora tengan evidencia directa suficiente. Prefiero perder
> cobertura antes que mezclar hechos comprobados con conclusiones nuestras. Puedes conservar
> internamente la deducción y su razonamiento para investigarla después, pero no debe presentarse al
> usuario como hecho confirmado.

Este documento **es** esa conservación. No se publica en la web: existe para que el razonamiento no se
pierda y para que otra pasada pueda retomarlo por donde se quedó.

## Qué se hizo

El catálogo tenía 21 evidencias `derived`: casos en los que la fuente oficial no contestaba la
pregunta y la respuesta salía de un razonamiento nuestro. Todas salieron del dato publicado.

- **13** se quedan en «Sin comprobar». Su razonamiento está abajo, con qué haría falta para cerrarlas.
- **8** volvieron con cita literal, porque al releer la fuente sí contestaba. Se cuentan aquí para que
  se vea que no fue una amnistía.

Después de esto el catálogo no publica **ninguna** deducción. Lo vigila
`tests/unit/evidencia.test.ts`, en «el catálogo no publica ninguna deducción, por decisión editorial».

## El criterio, para poder discutirlo

Una fuente «contesta directamente» cuando dice la respuesta con sus palabras o con su propia notación
—una tabla que etiqueta cada fila «Included:» o «Not included:» está contestando—. No contesta cuando
la respuesta hay que sacarla de lo que **no** dice.

El caso que mejor lo separa son las licencias de pesos abiertos:

| Licencia | ¿Contesta «uso comercial»? | Por qué |
|---|---|---|
| MIT | **Sí** | Concede «the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies». Vender es uso comercial, escrito. |
| CC BY-NC 4.0 | **Sí** | «NonCommercial — You may not use the material for commercial purposes.» |
| Apache-2.0 | **No** | Concede mucho y no menciona el uso comercial en ningún punto de su articulado. Responder «sí» por ella es una conclusión nuestra. |

Por eso Whisper, F5-TTS y DeepSeek V4 Flash conservan su respuesta y Kokoro no.

## Las 13 que se quedan en «Sin comprobar»

Cada una lleva el valor que tenía, la página que se consultó y qué haría falta para recuperarlo.

### Uso comercial (4)

| Ficha | Decía | Razonamiento retirado | Qué haría falta |
|---|---|---|---|
| Kokoro | Sí | «With Apache-licensed weights, Kokoro can be deployed anywhere from production environments to personal projects» + Apache-2.0 permite el uso comercial. | Una frase del proyecto que hable de uso comercial, o un `NOTICE`/README que lo diga. La licencia sola no basta. |
| Cartesia | No | La licencia comercial figura en la lista del plan Pro, que empieza «Everything in Free, plus», así que no está en el gratuito. | Que su tabla marque la fila como no incluida en Free, o una frase en sus condiciones. |
| Pixelcut | No | La licencia comercial figura en las columnas Pro y Business y no en la de Free. | Igual que Cartesia: una marca explícita o una cláusula. |
| Lovable | Sí | Sus condiciones dicen «you own your Customer Data… create, deploy, operate, and make available» y no reservan el uso comercial a los planes de pago. | Que las condiciones digan qué puede hacer el plan gratuito, en vez de callarlo. |

### Tarjeta y registro (8)

Ocho fichas decían «no pide tarjeta» por el mismo razonamiento: es software que se descarga y se
ejecuta en tu equipo, así que no hay alta ni cobro donde pedirla. Es casi seguro cierto y **no está
publicado en ninguna parte**, que es justo la diferencia que esta decisión pone por encima de todo.

| Ficha | Campo | Página consultada |
|---|---|---|
| ComfyUI | Tarjeta | github.com/Comfy-Org/ComfyUI |
| Fooocus | Tarjeta | github.com/lllyasviel/Fooocus |
| LM Studio | Tarjeta | lmstudio.ai/docs/app |
| Ollama | Tarjeta | ollama.com/pricing |
| Pinokio | Tarjeta | pinokio.co |
| Stable Diffusion WebUI | Tarjeta | github.com/AUTOMATIC1111/stable-diffusion-webui |
| Whisper | Tarjeta y registro | github.com/openai/whisper |
| Zapier Agents | Tarjeta | zapier.com/pricing (aquí el razonamiento era otro: crear la cuenta que da acceso al plan Free no pide tarjeta) |

**Qué haría falta.** Dos caminos, y el segundo es mejor:

1. Que cada fabricante lo publique. No depende de nosotros y en software local no va a pasar.
2. **Que el catálogo distinga «no aplica» de «no lo sabemos».** Preguntarle a un binario que se
   descarga si pide tarjeta no tiene respuesta, igual que preguntarle a Ollama si deja marca de agua
   —eso ya está resuelto con `excludedCapabilities`—. Hoy las ocho se cuentan como huecos nuestros y
   eso las hace parecer peor documentadas de lo que están. Es la continuación natural de este trabajo.

### Privacidad (1)

Ninguna: la de Gemini 3 Flash volvió con cita.

## Las 8 que volvieron con cita

Se releyó la fuente y contestaba. Ninguna es una deducción rescatada: todas son citas nuevas.

| Ficha | Campo | Valor | Qué dice la fuente |
|---|---|---|---|
| Whisper | Uso comercial | Sí | La licencia MIT del repositorio oficial: «…and/or sell copies of the Software». |
| DeepSeek V4 Flash | Uso comercial | Sí | Igual, en el `LICENSE` de su repositorio en Hugging Face. La evidencia anterior además apuntaba a la ficha de **V3.2-Exp**, que es otro modelo. |
| F5-TTS | Uso comercial | No | CC BY-NC 4.0: «You may not use the material for commercial purposes». El README asigna esa licencia a los pesos preentrenados. |
| Gemini 3 Flash | Entrena con tus datos | Sí | Su tabla de precios tiene la fila «Used to improve our products» con «Yes» en la columna Free Tier y «No» en la de pago. |
| Krea | Uso comercial | No | En la tarjeta del plan Free, «Commercial license» lleva el icono `lucide-x`; en Basic lleva `lucide-check`. La tabla lo marca, no lo calla. |
| Pika | Marca de agua | **No** (era «sí») | Su tabla etiqueta cada fila: «Included: No watermark». |
| Pika | Uso comercial | No | «Not included: Commercial license». |
| Claude Haiku 4.5 | Renovación de créditos | Sin créditos | No es una cita: es coherencia interna. La ficha es `paid_only` y una sin capa gratuita no tiene créditos que renovar. No se enseña en ninguna página. |

## Lo que salió al releer

Releer las fuentes para esta decisión destapó dos cosas que no eran el encargo:

1. **Pika cambió su plan gratuito.** Su tabla da hoy «0 credits / month · packs only». La ficha decía
   80 créditos de vídeo al mes renovables y generación limitada a 480p. Corregido, con entrada en el
   historial y la advertencia de que Pika no publica la fecha del cambio.
2. **La marca de agua de Pika era al revés.** La ficha deducía que la salida gratuita llevaba marca;
   su tabla dice «Included: No watermark».

Las dos van en la lista de datos publicados que cambian.

## Lo que queda pendiente y no entra aquí

Doce valores del catálogo están decididos sin ninguna evidencia registrada, casi todos licencias de
pesos abiertos anteriores al registro de evidencias: AudioCraft, DeepSeek V4 Pro, Gemma 4 (uso
comercial y entrenamiento), GLM-5, Kling, Llama 4, Ministral, Mistral Large, Mistral Small, Phi-4 y
Qwen3-27B.

No se han tocado: la decisión del 21 de septiembre era sobre las 21 deducciones, y bajarlos sin leer
sus licencias tiraría información cierta. Están nombrados uno a uno en
`tests/unit/evidencia.test.ts` para que la lista no crezca sola. **Son la siguiente tanda.**
