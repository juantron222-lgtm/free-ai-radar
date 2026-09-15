# Verificación del catálogo · 15 de septiembre de 2026

Primera parte de la fila 7 de «Verdad y utilidad». Cubre las fichas más visibles
y dos hechos que deciden: si piden tarjeta y si permiten uso comercial. Todo se
leyó hoy en la página oficial con Chromium, y cada cita se copió literal del
texto de la página. No se ha usado ningún directorio, reseña ni prensa.

Regla aplicada: un valor sólo cambia con `stated` o `derived`. Si la página
correcta calla, se guarda `not_published` y el valor sigue `unverified`. En la
web ya no aparece como «Sin comprobar», sino como «El fabricante no lo publica».

## Resumen

| | Antes | Después |
|---|---|---|
| Fichas totales | 94 | 94 |
| Verificada | 12 | 12 |
| Verificación parcial | 74 | 75 |
| Catalogada | 8 | 7 |
| Tarjeta confirmada: no la piden | 37 | 43 |
| Evidencias nuevas | — | 46 |

Perplexity pasa de «Catalogada» a «Verificación parcial» porque ya tiene un
hecho confirmado: su uso comercial.

## Valores confirmados

| Ficha | Campo | Antes | Ahora | Tipo | Fuente |
|---|---|---|---|---|---|
| krea | tarjeta | sin confirmar | no | stated | krea.ai/pricing |
| krea | uso comercial | no (sin evidencia) | no | derived | krea.ai/pricing (FAQ) |
| heygen | tarjeta | sin confirmar | no | stated | heygen.com/pricing |
| heygen | uso comercial | sin confirmar | sí | stated | heygen.com/terms |
| synthesia | tarjeta | sin confirmar | no | stated | synthesia.io/pricing |
| descript | tarjeta | sin confirmar | no | stated | descript.com/pricing (FAQ) |
| fish-audio | tarjeta | sin confirmar | no | stated | fish.audio/plan |
| fish-audio | uso comercial | no (sin evidencia) | no | stated | fish.audio/plan (FAQ) |
| cursor | tarjeta | no (sin evidencia) | no | stated | cursor.com/pricing |
| zapier-agents | tarjeta | sin confirmar | no | derived | zapier.com/pricing (FAQ) |
| runwayml | uso comercial | sin confirmar | sí | stated | runway.com/terms-of-use §4.4 |
| chatgpt | uso comercial | sin confirmar | sí | stated | openai.com/policies/eu-terms-of-use |
| claude | uso comercial | sin confirmar | **no** | stated | anthropic.com/legal/consumer-terms (EEE) |
| perplexity-ai | uso comercial | sin confirmar | **no** | stated | perplexity.ai/hub/legal/terms-of-service §5.1 |
| pixelcut | uso comercial | sin confirmar | no | derived | pixelcut.ai/pricing |
| cartesia | uso comercial | sin confirmar | no | derived | cartesia.ai/pricing |
| suno-ai | uso comercial | no (sin evidencia) | no | stated | suno.com/pricing |

Claude y Perplexity cambian de «no lo sabemos» a «no». No contradicen nada
publicado, pero son los cambios de más peso:

- **Claude.** Las condiciones para consumidores del EEE, las que se aplican
  desde España, dicen «Non-commercial use only». La API tiene otras
  condiciones, y por eso la evidencia se limita a la web y la aplicación.
- **Perplexity.** Sus condiciones sólo permiten el uso «personal,
  non-commercial».

## El fabricante no lo publica

Se abrió la página que debería contestarlo y no lo dice.

| Campo | Fichas | Página consultada |
|---|---|---|
| Tarjeta | ideogram, leonardo-ai, recraft, pixelcut, playground-ai, runwayml, pika-labs, klingai, higgsfield, elevenlabs, suno-ai, cartesia, v0-by-vercel, bolt-new, replit-agent, devin, amazon-q-developer, codex, chatgpt, claude, perplexity-ai, google-gemini, manus, gemini-3-flash (API) | Precios |
| Uso comercial | descript, cursor, bolt-new, replit-agent, jetbrains-ai | Condiciones de uso |

En estas cinco, las condiciones dicen que el resultado es tuyo, pero no dan
permiso explícito de uso comercial. Por la regla del verificador no se deduce
un «sí».

## Contradicción que necesita tu aprobación

| Ficha | Qué dice la ficha | Qué dice hoy la fuente oficial |
|---|---|---|
| github-copilot | «NO incluye modo agente» y «NO incluye agentes ni agente de programación» | En github.com/features/copilot/plans: «Free plan supports CLI and agent mode» y el modo agente aparece como «Free plan Included». El agente en la nube sigue fuera del plan gratuito. |

No se ha tocado. Hace falta decidir si se corrige la ficha y se anota el cambio
del fabricante en `changelog[]`. Antes hay que confirmar la fecha real del
cambio y el precio actual de Pro, porque la misma página muestra tanto 10 $ como
15 $.

## Quedan pendientes

| Ficha | Campo | Qué haría falta |
|---|---|---|
| grok-imagine | tarjeta, uso comercial | x.ai/pricing es la página de la API. Hay que localizar los planes de grok.com y leer la cláusula completa de «You Own Your User Content». |
| genspark | tarjeta, uso comercial | Sus precios redirigen al inicio de sesión. Leerlo exigiría crear una cuenta, y eso necesita aprobación. |
| higgsfield, synthesia, devin | uso comercial | Sus condiciones devuelven 404 en la URL probada; hay que encontrar la vigente. |
| google-gemini | uso comercial | Hay que leer las condiciones generales de Google, que desde mayo de 2024 absorbieron las de IA generativa. |
| Fichas de imagen, vídeo y audio | marca de agua | No se ha revisado en esta pasada. |
| Todas | límites y capacidades | Siguen como estaban. Esta pasada no ha vuelto a comprobarlos. |

`lastVerifiedAt` no se ha movido: la verificación de hoy es parcial y queda
registrada en el `checkedAt` de cada evidencia.

## Comprobaciones

- `npm run data:migrate:dry`: 94 herramientas, sin descartadas ni duplicadas.
- `npm run data:migrate`: regenera `generated/tools.json`.
- `npx vitest run`: 1463 superadas.
- E2E de portada y buscador/comparador en chromium y móvil: todas superadas.
  Una prueba cambió de ficha de ejemplo porque Ideogram ya no tiene huecos
  pendientes nuestros.
