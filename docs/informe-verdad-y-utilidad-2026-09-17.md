# Verdad y utilidad · informe final para autorizar publicación

17 de septiembre de 2026. Rama `verdad-y-utilidad`, 20 commits por encima de `main` (`e3e7176`, lo que hay hoy en
Production). **No se ha publicado nada**, no se ha tocado Supabase y no hay push.

## 1. QA

| Comprobación | Resultado |
|---|---|
| Pruebas unitarias e integración (Vitest) | 1493 / 1493 |
| Lint (`--max-warnings=0`) | 0 avisos |
| Tipos (`astro check`) | 0 errores |
| Build de producción en local (`astro build`) | Correcto |
| E2E Chromium | 231 / 231 |
| E2E Firefox | 221 / 221 (10 omitidas por diseño: Firefox no emula viewport móvil) |
| E2E WebKit | 231 / 231 |
| E2E móvil (Pixel 7) | 231 / 231 |
| E2E móvil Safari (iPhone 14) | 231 / 231 |
| E2E escritorio | 231 / 231 |
| Rastreo completo (consola, red, canónicos, títulos, h1, imágenes, 404, sitemap, RSS) | Verde en los seis |
| CSP de producción sobre las rutas principales | Verde |

**Inspección manual en navegador real** (servidor local, consola y red leídas en cada una): portada, catálogo con
búsqueda por tarea, ficha de Copilot, /imagen, /audio, comparador de 3 y de 5 herramientas, metodología,
privacidad, términos, noticias, 404, /cuenta y /admin sin sesión (redirigen a entrar). Sin errores de consola ni
peticiones propias fallidas; el único 404 es la URL inexistente pedida a propósito. Probados a mano: menú móvil
(abre, Escape cierra y devuelve el foco), cartel de cookies (rechazar, reabrir desde el pie con opciones, reserva
de espacio) y ciclo de tema claro → oscuro → sistema.

**Auditoría visual**: 8 plantillas × 375 / 768 / 1440 px × claro / oscuro.

**Defectos encontrados en el QA y corregidos**:

1. `/legal/privacidad` se desplazaba 156 px en horizontal a 375 px por una tabla sin contenedor. Las cinco tablas
   de las páginas de texto largo van ahora en una región desplazable, etiquetada y accesible con teclado. La prueba
   de viewport móvil cubre ya privacidad, cookies, metodología y política editorial.
2. La prueba nueva del cartel de cookies medía antes de que Firefox terminara su desplazamiento suave; la reserva de
   espacio sí funcionaba (268 px en Firefox y Chromium).
3. La prueba de logos y monogramas buscaba la mezcla en /codigo, que ya sólo tiene logos; ahora usa /imagen.

**No comprobado**:

- Sesión registrada y de administrador a mano en el navegador. Esas rutas sí las cubren las pruebas E2E de cuenta,
  contra el almacén local.
- Zoom al 200 %.
- Contraste medido con herramienta.

## 2. Qué incluye la rama

### Fase «Verdad y utilidad» (P0, P1 y P2)

- **Cifras.** Un único cálculo de cifras: chips, notas, pie, portada, colecciones y categorías dicen el mismo
  número.
- **Estados de las fichas.**
  - Sin ningún hecho confirmado, «Catalogada», no «parcial».
  - Retiradas las promesas de funciones inexistentes («Avisarme», venta de Radar Pro).
  - El pie dice lo comercial que hay hoy: nada.
- **Portada.**
  - La tabla «Para empezar hoy, sin pagar» sólo enseña fichas con tarjeta y registro confirmados.
  - Lo que falta dice de quién es el hueco.
  - Una línea bajo el H1 dice qué diferencia al sitio.
- **Títulos y colecciones.** Ya no llaman «gratuitas» a herramientas de pago. «En local» deja de prometer a las
  híbridas lo que sólo cumple lo local.
- **Búsqueda.** Separa «lo incluye gratis» de «lo hace pagando o a prueba», con separador y recuentos correctos.
- **Alternativas y comparador.**
  - Las alternativas y «Añadir otra» salen por tarea compartida, clase de producto y forma de uso.
  - En el comparador, un dato que falta no cuenta como diferencia ni como coincidencia.
  - Pedir más de cuatro dice cuál se queda fuera.
- **Vocabulario de lo que no sabemos.** Una sola etiqueta por caso: «Sin comprobar», «El fabricante no lo
  publica», «No aplica».
- **Nombres y enlaces.** «Audio › Voz» en fichas y tarjetas; un solo «Comparar»; pie sin duplicados; /guias
  enlazada.
- **Cookies y sitemap.** El cartel de cookies ya no tapa el pie; el sitemap fecha cada página con lo que enseña.

### Encargos del 16 de septiembre

- **GitHub Copilot** (autorizado).
  - El plan Free incluye modo agente y Copilot CLI con créditos limitados.
  - El agente en la nube, la revisión de código, las tareas que abren pull request y los agentes de terceros siguen
    fuera, cada uno con su fila citada.
  - Entrada en el historial con fuente oficial; la fecha es la de la comprobación, porque GitHub no publica la del
    cambio.
- **Logos** (autorizado). 84 de 94 con logo local, optimizado (310 kB en total) y con procedencia registrada. Reglas:
  - Sólo la web oficial, la organización oficial en GitHub o la organización en Hugging Face.
  - Nunca el avatar de una cuenta personal.
  - Nada de hotlinks.
  - ComfyUI pasa al logo de su organización; Kokoro vuelve a iniciales.
  - Siguen con iniciales: Fooocus, SD WebUI, SD.Next, F5-TTS, GPT Researcher y Kokoro (repos de cuentas personales);
    Adobe Firefly, Hugging Face Spaces, Luma y Zapier Agents (sin icono fiable legible).
- **Marca de agua**, sólo lo que el fabricante dice.
  - HeyGen, Synthesia, Descript, Higgsfield y Runway: «sí», con cita de su centro de ayuda.
  - Krea, Recraft, Playground, Suno, Fish Audio, Cartesia, Kling, Leonardo (imágenes) y los doce generadores
    locales: «El fabricante no lo publica», con la página consultada.
- **Límites.** 13 fichas con cita oficial comprobada literalmente contra el texto guardado (ver §4).
- **Legal.** Sin cambios de contenido. Los datos del titular se rellenan en `src/lib/legal/titular.ts`: cambiar
  `null` por el dato basta, las páginas no se tocan. Hoy se ven como «Pendiente · lo aporta el titular».

## 3. Catálogo antes y después

| | `main` | Rama |
|---|---|---|
| Evidencias con fuente | 183 | 275 |
| «El fabricante no lo publica» | 8 | 58 |
| Tarjeta: no la piden | 37 | 49 |
| Tarjeta: sin dato | 56 | 44 |
| Uso comercial: sí / no / sin dato | 15 / 9 / 67 | 18 / 13 / 60 |
| Marca de agua: sí / sin dato | 2 / 77 | 6 / 73 |
| Fichas con logo | 34 | 84 |

## 4. Datos publicados que cambian y puedes vetar

Todos llevan cita oficial. Se listan aparte porque corrigen algo que Production dice hoy.

| Ficha | Production dice | La rama dice | Fuente |
|---|---|---|---|
| GitHub Copilot | Sin modo agente ni agentes | Modo agente y CLI incluidos, con créditos; agente en la nube de pago | github.com/features/copilot/plans |
| Claude | Uso comercial sin confirmar | **No**: condiciones para consumidores del EEE | anthropic.com/legal/consumer-terms |
| Perplexity | Uso comercial sin confirmar | **No**: uso «personal, non-commercial» | perplexity.ai/hub/legal/terms-of-service |
| ChatGPT, Runway, HeyGen | Uso comercial sin confirmar | Sí | Condiciones de uso de cada uno |
| ComfyUI | Requiere GPU NVIDIA | NVIDIA, AMD, Intel, Apple Silicon, Ascend y CPU | README oficial |
| SD WebUI | Requiere GPU NVIDIA 4 GB | Instalación documentada para NVIDIA, AMD, Intel y Apple Silicon | README oficial |
| Ollama | Sin interfaz gráfica oficial | App para macOS y Windows desde el 30/07/2025 (historial) | ollama.com/blog/new-app |
| DeepSeek V4 Pro | Hora valle 0,22 / 0,66 $ | 0,66 / 1,98 $ (la mitad de punta) | api-docs.deepseek.com |
| Suno | 50 créditos = 10 canciones; descargas «a partir del 3/9» | Sin equivalencia publicada; sin descargas desde el 3/9 (historial) | suno.com/pricing |
| LM Studio | «Gratuito para uso personal», sin límites | Plan Free con límites publicados; nube de pago desde 20 $/mes | lmstudio.ai/pricing |
| Hugging Face Spaces | «Sin límites» | CPU Basic y ZeroGPU gratis, ZeroGPU con cuota | huggingface.co/pricing |

## 5. Decisiones que te tocan

1. **DeepSeek V4 Flash está retirado de la API.** DeepSeek escribe que «V4-Flash & V4-Flash-Vision-Exp are retired»
   (10 sep); las llamadas van a V4.1-Flash. La ficha sigue enseñando los precios de API de V4-Flash. No la he
   tocado: una retirada exige tu aprobación. Opciones: dejar la ficha de los pesos (siguen publicados con licencia
   MIT) y quitar la API, o crear una ficha de V4.1-Flash.
2. **«Nada por inferencia».**
   - La rama tiene 21 evidencias `derived`, deducciones declaradas con su base: por ejemplo, Pika marca la descarga
     sin marca de agua con el icono de «no incluido», y Krea, Pixelcut y Cartesia sólo venden la licencia comercial
     en planes de pago.
   - ¿Las mantengo, o las paso a «sin comprobar»?
3. **Privacidad.** La tabla de datos incluye «Datos de facturación · Cobrar la suscripción», y hoy no se cobra nada.
   No la he tocado porque pediste dejar legal como está; conviene revisarla con los datos del titular.
4. **Hailuo AI.** Su página de suscripción no se deja leer (es una app de una sola página sin texto). Queda con
   «condiciones sin publicar» y un precio de partida que no he podido recomprobar.
5. **Noticias.** El diagnóstico está hecho en la rama `noticias-editorial`, en el worktree
   `free-ai-radar-noticias`, con el informe en `docs/noticias-diagnostico-editorial.md`. No ha borrado ni
   despublicado nada.
   - **Clasificación de las 25 piezas:** mantener 2; editar 21 (20 ya corregidas en la semilla, Cohere con texto
     preparado); archivar 1; retirar 1 (Together).
   - **Errores de fondo nuevos:** GPT-6 Astra con fecha equivocada, subida de precio de Sonnet 5 ya cancelada,
     Claude for Teachers y Ollama 0.32.0.
   - **Pendiente de tu autorización:**
     1. retirar Together (sólo existe en Supabase);
     2. aplicar la reescritura de Cohere;
     3. qué hacer con Runway (mantener la reescritura, slug nuevo con 301 o retirar);
     4. el slug de NVIDIA;
     5. pausar o endurecer la autopublicación;
     6. los cambios de presentación de /noticias;
     7. la fuente que faltaba de Accomplish.
   - Esa rama sale de este trabajo a mitad de camino (`26b7ff4`): hay que integrarla antes de publicar.

## 6. Propuesta de publicación, cuando la autorices

1. Resolver lo que decidas del §5 en esta rama.
2. Integrar `noticias-editorial` en `verdad-y-utilidad` y repetir el QA completo.
3. Sincronizar con `main` desde el worktree de `main`: merge, push y despliegue a Production.
4. Verificar www.freeairadar.com. Si algo falla, revertir al deployment actual.
