# Auditoría del catálogo

**Fecha:** 7 de agosto de 2026
**Entradas:** 24
**Método:** [`ai-catalog-verifier`](../.claude/skills/ai-catalog-verifier/SKILL.md)

Este documento dice qué sabemos de verdad sobre cada ficha y qué no. No es una
lista de tareas: es el estado que un lector tendría derecho a conocer si
preguntara «¿de dónde sale esto?».

---

## 1. El hallazgo principal

**Veintidós de las veinticuatro fichas declaran haber sido verificadas el mismo
día: el 8 de julio de 2026.**

Eso no describe un proceso de verificación. Describe una importación. El
catálogo v1 se migró con una fecha común, y esa fecha se presenta al lector con
el mismo formato que una comprobación real hecha herramienta por herramienta.

Es la clase de dato que erosiona exactamente la confianza que el sitio dice
querer. Se ha mitigado, no resuelto:

- ninguna ficha migrada afirma `verified`;
- trece están como `partially_verified` (los cinco campos duros del plan
  gratuito eran booleanos explícitos en el origen);
- nueve están como `pending_review` (alguno de esos campos no lo era);
- todas llevan `nextReviewAt` a noventa días de su fecha declarada.

**Pendiente:** sustituir la fecha común por la fecha real de cada comprobación,
a medida que se revisen. Hasta entonces, el estado de verificación es más
informativo que la fecha, y así se muestra en la ficha.

| Estado | Entradas |
| --- | ---: |
| `verified` | 1 |
| `partially_verified` | 14 |
| `pending_review` | 9 |
| `outdated` | 0 |
| `discontinued` | 0 |

La única ficha `verified` es Gemma 4, comprobada hoy contra la documentación y
los términos de licencia de Google.

---

## 2. Qué está bien

- **Todas las fichas citan fuentes.** Ninguna de las 24 está sin respaldo.
  Reparto por tipo: 23 oficiales, 21 de documentación, 16 de precios, 16 de
  comunidad, 4 de repositorio.
- **Ningún dato del plan gratuito está inventado.** Los cuatro hechos duros
  (registro, tarjeta, marca de agua, uso comercial) son `unverified` cuando el
  fabricante no lo dice, nunca un `no` supuesto.
- **Ninguna ficha supera los noventa días sin verificar** respecto a su fecha
  declarada.

---

## 3. Huecos concretos

### 3.1 Privacidad: casi todo sin verificar

**23 de 24 fichas tienen `trainsOnUserData: unverified`.**

Es el hueco más grande del catálogo y también el más importante, porque es la
pregunta que más consecuencias tiene para quien usa la capa gratuita: si el
plan gratuito se paga con tus datos, eso no es un detalle de la política de
privacidad, es el precio.

La única excepción es Gemma 4, y sólo porque se ejecuta en local: no hay nada
que enviar.

**Pendiente:** revisar la política de privacidad de cada fabricante y registrar
si entrena con las entradas del plan gratuito y si se puede desactivar sin
pagar.

### 3.2 Uso comercial sin confirmar (5)

`claude-sonnet-5`, `hugging-face-spaces`, `lm-studio`, `pika-labs`, `pinokio`.

En los cinco casos el fabricante no lo afirma con claridad. Se muestran como
sin verificar, por lo que no aparecen al filtrar por «uso comercial» — que es
el comportamiento correcto, pero también significa que cinco herramientas
potencialmente válidas quedan invisibles ante ese filtro.

### 3.3 Tarjeta sin confirmar (2)

`claude-sonnet-5` (la ficha describe el modelo; la tarjeta la decide el plan de
la aplicación) y `replicate`.

### 3.4 Sin página de precios (8)

`civitai`, `comfyui`, `fooocus`, `gemma-4`, `lm-studio`, `ollama`, `pinokio`,
`stable-diffusion-webui`.

En la mayoría no es un defecto: un proyecto open source no tiene página de
precios. Merece revisión el caso de `civitai` y `lm-studio`, donde sí existe
capa comercial.

---

## 4. Composición

| Tipo | Entradas |
| --- | ---: |
| Aplicación | 12 |
| Agente | 3 |
| Interfaz | 3 |
| Plataforma | 3 |
| Modelo | 2 |
| Proyecto open source | 1 |
| Framework | 0 |
| API | 0 |

**Dos modelos.** El catálogo se construyó alrededor de aplicaciones, y esa es
la razón de que `/modelos` naciera vacío. Las dos primeras entradas —Gemma 4 y
Claude Sonnet 5— están elegidas para marcar el contraste que la sección existe
para explicar: unos pesos que descargas y son tuyos frente a un modelo servido
cuya gratuidad depende del plan de un producto.

**Cero frameworks y cero APIs.** Son huecos reales de cobertura, no errores de
clasificación.

---

## 5. Qué hacer a continuación, por orden

1. **Privacidad de las diez fichas más visitadas.** Es el dato que más cambia
   una decisión y el que peor cubierto está.
2. **Fechas de verificación reales.** Cada ficha revisada sustituye la fecha
   común de importación por la del día en que se abrió la página del
   fabricante.
3. **Uso comercial de las cinco pendientes.** Cinco herramientas invisibles a
   un filtro que la gente usa.
4. **Ampliar modelos y APIs.** La sección funciona; le falta catálogo.
5. **Revisar `civitai` y `lm-studio`**, donde falta la URL de precios y sí hay
   capa de pago.

---

## 6. Cómo se regenera esto

```bash
npm run data:migrate
```

Lee `src/data/tools.json` (legado v1) y `src/data/tools-v2.json` (fichas
escritas ya en la forma actual), y escribe
`src/data/generated/tools.json`. Un slug repetido se informa y gana el legado:
un duplicado es un error, y resolverlo en silencio sería esconderlo.
