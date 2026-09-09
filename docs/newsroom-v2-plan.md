# Newsroom v2 — actualidad de IA, redactada por un agente

**Fecha:** 2026-09-09
**Estado:** plan, sin implementar
**Decisiones tomadas:** alcance general · agente redacta dentro de la puerta · rutina horaria

---

## 1. Qué falla, medido

### 1.1 La redacción publica la hoja de trabajo del verificador

La única noticia autopublicada, tal y como quedó guardada:

```
TITULAR : Runway Research | Introducing GWM Worlds 2
RESUMEN : runway.com publicó esto el 2026-09-03, según la fecha que declara su
          propia página. Sobre la disponibilidad, el anuncio dice: «GWM Worlds 2
          is a research preview, and real-time generation still trades fidelity
          for speed.».
IMPACTO : La página no menciona ninguna capa gratuita, ni para confirmarla ni
          para descartarla, así que no podemos decir qué cambia para quien no
          paga. El anuncio no menciona pesos descargables ni licencia.
          Verificado leyendo la página del fabricante; queda pendiente la
          revisión editorial.
```

Tres defectos, y ninguno es de estilo:

- El titular es el `og:title` crudo, con el prefijo de sección del fabricante.
- El resumen habla de **nuestro método de verificación** («según la fecha que
  declara su propia página») y deja una cita en inglés sin traducir.
- El impacto son tres frases sobre lo que **no** pudimos averiguar.

La causa está escrita en el propio módulo, `scripts/draft/autodraft.mjs`:

> «El resultado es más seco que un texto escrito a mano, **y debe serlo**: quien
> revisa en la mesa tiene que poder ver de un vistazo qué es del fabricante y
> qué es nuestro.»

Esa plantilla se diseñó para un revisor humano. Cuando se abrió la
autopublicación, el borrador dejó de ser un documento interno y pasó a ser texto
publicado, y nadie volvió a preguntarse si servía para ese trabajo. **Es un
fallo de diseño, no una limitación del sistema.**

### 1.2 El circuito selecciona lo contrario de lo que se le pide ahora

Las ocho historias mejor puntuadas de una pasada real:

| pts | fuente | titular |
| --- | --- | --- |
| 100 | openai.com | Improving GPT‑5.6 Sol in ChatGPT |
| 92 | huggingface.co/blog | Build Low-Latency Multilingual Voice Agents |
| 92 | huggingface.co/blog | Meta is back with Muse Glimmer |
| 89 | blog.comfy.org | Seedance 2.5 now available via Partner Nodes |
| 86 | blog.comfy.org | FLUX 3 now available via Partner Nodes |
| 79 | deepmind.google | Launching Lyria 3.5 in Google Flow Music |
| 79 | cursor.com | Self-hosted machines · Cursor |
| 79 | blog.comfy.org | MiniMax H3 Day-0 Support in ComfyUI |

Dos de ocho son actualidad de IA. El resto son posts de comunidad, integraciones
de terceros y una entrada de changelog.

No es un defecto: el eje `impacto` (20 pts) premia «hay algo concreto que se
puede usar, probar o descargar» y el eje `acceso-gratuito` (20 pts) premia la
gratuidad. **Juntos son 40 de ~100 puntos optimizando «cosas gratis que puedes
usar hoy»**, que es exactamente lo que un catálogo de IA gratis necesita y
exactamente lo contrario de la actualidad del sector.

Nota sobre una hipótesis descartada: se comprobó si el eje de gratuidad estaba
hundiendo noticias frontera. **No lo está** — lo que más penaliza son listículos
de precios de Luma, y hace bien. El sesgo no está en castigar lo de pago, está
en premiar lo accionable por encima de lo significativo.

---

## 2. Lo que **no** cambia

Esto no es empezar de cero, y conviene decir por qué. Lo que funciona y está
medido:

| Pieza | Estado |
| --- | --- |
| Descubrimiento, 37 fuentes oficiales | funciona · 3.196 titulares/pasada |
| Fechas visibles (`dateline.mjs`) | funciona · desbloqueó Anthropic de 0 a 9 |
| Deduplicación por `canonical_url` | funciona · restricción en la base |
| Acotación de alcance por fabricante | funciona · detecta las integraciones |
| Verificación con citas literales | funciona · 12/22 en la banda 70-74 |
| `checkDraft` + `factTrace` | **se conserva intacta** |
| `canAutoPublish` | **se conserva intacta** |
| Caducidad de la mesa | funciona · 15 sacadas de la cola |
| Detección de fuentes calladas | funciona · señala Freepik y Udio |

Tirar esto significaría volver a resolver problemas ya resueltos. Lo que falla
son **dos etapas**: qué se considera relevante, y cómo se escribe.

---

## 3. El hallazgo que hace viable el plan

`checkDraft` **no exige que la prosa sea una cita**. Exige dos cosas distintas:

1. que el `factTrace` apunte a citas que la verificación registró de verdad;
2. que la prosa no contenga clases de afirmación peligrosas sin respaldo —
   precio, licencia, región, comparación, superlativo, disponibilidad.

Es decir: **restringe qué se puede afirmar, no con qué palabras.** Un agente
puede escribir castellano natural y pasar la puerta sin que la puerta se toque.

Eso es lo que hace que «un agente escribe, la puerta sigue» sea una arquitectura
real y no un deseo.

---

## 4. Arquitectura

```
Rutina en la nube · cada hora
  │
  ├─ 1  POST /api/cron/newsroom            (ya existe)
  │     descubre · deduplica · tría · verifica · extrae citas
  │
  ├─ 2  GET /api/newsroom/pendientes       (nuevo · sólo lectura)
  │     verificadas sin borrador, con sus citas y su candidato
  │
  ├─ 3  el agente REDACTA                  ← aquí está el salto de calidad
  │     titular, entradilla e impacto en castellano
  │     + factTrace apuntando a las citas que lo sostienen
  │
  └─ 4  POST /api/newsroom/borrador        (nuevo · escritura gateada)
        checkDraft valida en el servidor · si pasa, publica
        si no, devuelve los motivos y el agente reescribe
```

**La propiedad que importa:** la puerta corre en el servidor, no en el agente.
El agente propone; el despliegue dispone. Un agente que alucine un precio recibe
un rechazo con el motivo, no una publicación.

**Radio de daño del secreto:** quien tuviera el secreto de la rutina podría
enviar borradores, pero sólo borradores que pasen `checkDraft` contra citas ya
verificadas y guardadas en nuestra base. No puede publicar texto arbitrario.

---

## 5. Qué hay que construir

| # | Trabajo | Dónde | Tamaño |
| --- | --- | --- | --- |
| 1 | Eje editorial nuevo: significancia en lugar de gratuidad | `scripts/triage/triage.mjs` | medio |
| 2 | Bajar el peso de integraciones y posts de comunidad | `scripts/triage/triage.mjs` | pequeño |
| 3 | `GET /api/newsroom/pendientes` | ruta nueva | pequeño |
| 4 | `POST /api/newsroom/borrador` con `checkDraft` server-side | ruta nueva | medio |
| 5 | Secreto propio del agente, distinto de `CRON_SECRET` | Vercel | pequeño |
| 6 | El prompt de redacción: voz, longitud, qué nunca afirmar | `docs/` + rutina | **el más importante** |
| 7 | Rutina horaria | claude.ai/code/routines | pequeño |
| 8 | Retirar `autodraft.mjs` de la ruta de publicación | `daily.ts` | pequeño |

El 6 es donde se gana o se pierde. El resto es fontanería.

---

## 6. Lo que cuesta y lo que arriesga

- **Coste**: una rutina horaria son 24 sesiones al día. Es gasto real y
  recurrente, y hay que decidirlo con el número delante.
- **La puerta bloquea invención, no mediocridad.** Un borrador puede pasar
  `checkDraft` y seguir siendo aburrido o mal juzgado. Hace falta revisar una
  muestra las primeras semanas.
- **«Última hora» depende del fabricante.** Nuestras fuentes son sus blogs;
  sondear cada hora captura el anuncio dentro de la hora, que para el sector es
  última hora de verdad. No hay forma de ir más rápido que quien publica.
- **Identidad del sitio.** /noticias pasa a ser la puerta de entrada; el
  catálogo sigue midiendo qué es gratis. Hay que revisar que la portada y los
  textos de sección no se contradigan.

---

## 7. Decisiones pendientes

1. **La noticia de Runway sigue publicada** y se lee como se lee. ¿Se retira de
   portada mientras se rehace la redacción, o se deja?
2. **Coste de la rutina horaria**: ¿24 sesiones/día es aceptable, o se empieza
   cada 3-4 horas y se sube si el ritmo lo justifica?
3. **Quién firma.** Hoy es «Newsroom automático». Con prosa de verdad conviene
   decidir si eso se mantiene, se cambia, o se declara en la propia página.
