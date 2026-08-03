# Decisiones técnicas

Cada entrada recoge el contexto, la decisión y **lo que se pierde**. Una decisión sin coste
declarado no se ha pensado del todo.

---

## 1. Astro 7 en lugar de Astro 5

**Contexto.** El repositorio venía con Astro 5.18, que arrastra `sharp` 0.34.5, afectado por cuatro
CVE de libvips (CVE-2026-33327/33328/35590/35591). El audit inicial daba 13 vulnerabilidades, dos
críticas.

**Decisión.** Subir a Astro 7 y Vitest 4.

**Resultado.** De 13 vulnerabilidades (2 críticas) a 3 altas, todas del mismo origen:
`path-to-regexp` a través de `@vercel/routing-utils`, dentro de `@astrojs/vercel`. Es código de
**generación de configuración de rutas en build**; no procesa entrada de usuario en runtime.

**Coste.** Salto de dos versiones mayores. Se mitigó verificando el build con el código heredado
*antes* de reescribir nada: Astro 7 construía el proyecto v1 sin cambios, lo que acotó el riesgo.

**Pendiente.** Vigilar `@astrojs/vercel` para una versión que actualice `path-to-regexp`. Anotado en
[`security-review.md`](./security-review.md).

---

## 2. Pila tipográfica del sistema, sin fuentes web

**Contexto.** La v1 cargaba Sora e Inter desde `fonts.googleapis.com`.

**Problema, doble.**

1. **RGPD.** Cargar fuentes desde Google transmite la IP del visitante a un tercero en EE. UU.
   *antes* de cualquier consentimiento. Un tribunal alemán ya ha condenado por esto (LG München,
   3 O 17493/20). Para un proyecto dirigido a España y la UE, es un riesgo evitable.
2. **Rendimiento.** Dos `preconnect` más una hoja de estilos bloqueante en la ruta crítica.

**Decisión.** Pila del sistema con `Segoe UI Variable` / `SF Pro` / `Inter` local y respaldo
genérico, más numerales tabulares donde hay cifras comparables.

**Coste.** El sitio no se ve idéntico en todas las plataformas. Para una publicación cuyo valor es
la legibilidad de datos, es un intercambio que sale a favor: cero peticiones bloqueantes, cero
transferencia a terceros, cero FOUT.

**Camino de vuelta.** Si algún día se quiere una tipografía propia: subconjunto woff2 autoalojado
con `font-display: swap` y `preload`. Documentado, no implementado — no hace falta todavía.

---

## 3. Catálogo en fichero, datos de usuario en Postgres

**Contexto.** La instrucción pedía Supabase para PostgreSQL. La tentación es meterlo todo.

**Decisión.** Separar por naturaleza del dato:

- **Contenido editorial** → fichero generado y commiteado. Cambia semanalmente, lo escriben una o dos
  personas, y su historial es un activo.
- **Datos de usuario** → Postgres con RLS. Cambian por segundo, los escriben miles de personas, y
  necesitan aislamiento.

**Por qué el contenido no va en la base.** Porque el sitio público sería entonces un CRUD con
latencia añadida, dependiente de un servicio externo, y los cambios editoriales dejarían de ser
revisables. Un `git diff` sobre una ficha responde «qué cambió, quién y por qué» mejor que cualquier
tabla de auditoría.

**Coste.** Publicar requiere un commit y un despliegue, no un botón. Para un catálogo de cientos de
fichas revisadas a mano, eso es correcto: la fricción está donde debe estar.

---

## 4. Almacén de identidad local para desarrollo

**Contexto.** La instrucción dice, con razón: *«No construyas autenticación o criptografía casera»*.
También exige que *«el registro y el login funcionen en entorno local»* y que la suite de pruebas
pase sin credenciales.

**La tensión es real** y conviene nombrarla en vez de esconderla.

**Decisión.** La autenticación de producción es **Supabase Auth, sin excepciones**. Además existe
`src/lib/auth/local-store.ts`, un banco de pruebas de desarrollo que:

- **lanza una excepción si `import.meta.env.PROD` es cierto** — no puede activarse en producción ni
  por error de configuración;
- usa `scrypt` de Node con sal por usuario y `timingSafeEqual`, no un esquema inventado;
- firma los tokens de sesión con HMAC-SHA256;
- guarda los tokens de recuperación hasheados;
- devuelve respuestas idénticas para «cuenta existente» y «cuenta nueva», igual que el proveedor real.

**Por qué no un mock más simple.** Porque un stub que guarda contraseñas en claro enseña un mal
hábito, y porque las pruebas de enumeración de cuentas y de tiempo constante sólo tienen sentido si el
sustituto se comporta como el original. De hecho, la prueba
`registrar un correo existente no revela que ya existe` **encontró una fuga real** en la primera
implementación: los dos caminos devolvían mensajes distintos. Se corrigió en ambos proveedores.

**Coste.** Código que sólo corre en desarrollo. Está aislado en un fichero, con una cabecera de
advertencia de veinte líneas y un guardia en tiempo de ejecución.

---

## 5. La puntuación se deriva, nunca se almacena

**Contexto.** La v1 guardaba `score_total` en el JSON *y* tenía una función `calculateScore()`.
Podían divergir, y de hecho divergían.

**Decisión.** `ToolRecord` (lo que se almacena) **no tiene** `scoreTotal`. `hydrateTool()` lo calcula
en cada lectura, junto con las etiquetas derivadas, la banda y la frescura.

**Consecuencia.** Es estructuralmente imposible que una ficha muestre una puntuación que contradiga
sus propios datos. Cambiar un dato cambia la puntuación en el mismo render.

**Coste.** Un cálculo por lectura. Son cinco multiplicaciones y una lista de reglas; irrelevante.

### Además: la fórmula se arregló

La v1 sumaba `const novelty = 10` a todas las herramientas —un +10 constante sin información— y
penalizaba dos veces el mismo hecho. La v2:

- pesos que **suman exactamente 1**, verificado por un test;
- 10 en todo → exactamente 100; 0 en todo → exactamente 0;
- cada penalización responde a una pregunta distinta y lleva etiqueta y motivo publicables;
- **lo no verificado no suma ni resta**.

---

## 6. Tri-estado en vez de booleano

**Contexto.** La v1 usaba `boolean | "no_confirmado"` en siete campos.

**Decisión.** Un tipo explícito: `'yes' | 'no' | 'partial' | 'unverified'`.

**La regla que importa:** un filtro duro sólo acepta el valor confirmado. Si pides «sin tarjeta», no
verás las herramientas cuya exigencia de tarjeta no hemos verificado. Un «no lo sé» **nunca** se
presenta como garantía.

Es la decisión de producto más importante del proyecto. Reduce el número de resultados y hace el
sitio menos impresionante en una demo. También es la única razón por la que alguien debería fiarse
de él.

---

## 7. Sin biblioteca de búsqueda

**Contexto.** Fuse.js pesa ~40 KB minificado.

**Decisión.** Índice invertido ponderado por campo + Levenshtein acotado, ~3 KB.

**Lo que se gana además del peso:** el motor devuelve `matchedOn`, así que el desplegable puede
decir «coincide en: caso de uso». Una biblioteca genérica devuelve una puntuación opaca.

**Presupuesto de erratas por longitud:** palabras ≤3 caracteres exigen coincidencia exacta;
≤6, una errata; más largas, dos. Evita que «ia» coincida con media base de datos.

**Coste.** Código propio que mantener. Está cubierto por 15 pruebas unitarias, incluida la que
verifica que la relevancia manda sobre la puntuación editorial.

---

## 8. Los filtros viven en la URL

**Contexto.** La v1 filtraba con `style.display` sin tocar la URL. No se podía compartir, ni volver
atrás, ni indexar. Y los filtros «sin tarjeta» y «para creadores» hacían `return` antes de aplicar
los demás, así que **descartaban** el resto en vez de combinarse.

**Decisión.** El estado canónico es la query string. `parseFilters` / `serializeFilters` son la única
fuente de verdad y corren igual en servidor y cliente.

**Indexación.** Cualquier vista filtrada es `noindex` con canónico al listado limpio. Miles de
permutaciones del mismo contenido compitiendo entre sí es exactamente cómo se destruye la autoridad
de un dominio. Las combinaciones con demanda real de búsqueda tienen su propia página editorial en
`/colecciones/*`, con texto propio: esas sí merecen indexarse.

---

## 9. CSP sin `unsafe-inline`

**Contexto.** Casi todo el mundo pone `script-src 'self' 'unsafe-inline'` y da la CSP por hecha. Con
`unsafe-inline`, la CSP no protege de XSS.

**Decisión.** `script-src 'self'`, sin excepciones ni nonces.

**Cómo se consigue:**

- `vite.build.assetsInlineLimit: 0` — ningún script se incrusta.
- Los tres scripts que deben correr antes de la hidratación viven en `public/` como ficheros.
- Cero atributos `onclick`.

**Por qué ficheros externos y no nonces.** Un nonce obliga a que cada página sea dinámica. Este sitio
es estático a propósito. Un fichero de 400 bytes cacheado un año es más barato que convertir el sitio
entero en SSR para satisfacer una directiva.

**Coste.** Una petición extra en la primera visita, cacheada después.

---

## 10. Rate limiting en memoria

**Decisión.** Ventana fija en memoria del proceso.

**Limitación honesta.** En Vercel el límite es **por instancia**, no global. Frena a un cliente
insistente; no frena un ataque distribuido.

**Por qué así igualmente.** La alternativa (Redis) añade un servicio, un coste fijo y un punto de
fallo, para un proyecto que todavía no tiene el volumen que lo justifique. La interfaz
(`checkRateLimit`) está aislada: migrar a Upstash es cambiar un fichero.

Está anotado como riesgo abierto en [`security-review.md`](./security-review.md), no escondido.

---

## 11. Sin `aggregateRating` en los datos estructurados

**Contexto.** Poner estrellas en los resultados de búsqueda sube el CTR. Casi todos los directorios
de IA lo hacen.

**Decisión.** **No emitimos `aggregateRating` ni `review`.**

**Motivo.** Las valoraciones enriquecidas de Google son para puntuaciones de usuarios reales o de un
crítico claramente identificado. Nuestra puntuación es un índice editorial interno sobre hechos
verificables. Publicarla como estrellas la tergiversaría y es el patrón exacto por el que Google
impone acciones manuales.

La puntuación se publica de forma prominente en la página, con su desglose completo. Simplemente no
como un dato legible por máquina que no podemos sostener honestamente.

Hay un test que lo verifica (`seo.test.ts`), para que nadie lo añada «para probar».

---

## 12. `placementBoost` tipado como `min(0).max(0)`

**Contexto.** «Los patrocinios no alteran la puntuación editorial» es fácil de escribir en una
política y fácil de incumplir seis meses después bajo presión comercial.

**Decisión.** El esquema Zod de `Sponsorship` declara `placementBoost: z.number().min(0).max(0)`.

Cualquier valor distinto de cero **falla la validación** y el build no pasa. La separación entre
negocio y criterio la impone el compilador, no la buena voluntad.

Es una línea de código. Es probablemente la más importante del repositorio.

---

## 13. El explorador funciona sin JavaScript

**Decisión.** El formulario de filtros es un `<form method="get">` real. Sin JavaScript, enviarlo
navega a la misma página con la query puesta y el servidor entrega el listado filtrado.

Con JavaScript, el mismo formulario se convierte en filtrado instantáneo sin recarga.

**Coste.** Algo más de código en el servidor. A cambio, el sitio funciona con la red a medias, con
JavaScript bloqueado y para cualquier crawler.

---

## 14. Los correos se simulan por defecto

**Decisión.** Sin `RESEND_API_KEY`, o con `EMAIL_DRY_RUN=1`, los correos se **renderizan, validan y
registran** (con el destinatario hasheado) pero no se envían.

Además, `assertCampaignAllowed()` bloquea los envíos masivos fuera de producción, y el panel de
administración **no tiene botón de envío**: la campaña se lanza desde la terminal con confirmación
explícita. Un clic accidental en producción es irreversible; el diseño lo hace imposible.

---

## 15. El tipo del mensaje decide si puede enviarse

**Decisión.** `MailMessage` lleva `kind: 'transactional' | 'marketing'`, y `sendMail()` **lanza una
excepción** si un mensaje comercial no incluye `listUnsubscribeUrl`.

Mezclar correo transaccional y comercial no es sólo mala práctica: en la UE es ilegal. Que sea el
tipo el que lo impida significa que no depende de que alguien se acuerde.

---

## 16. 404 en lugar de 403 para `/admin`

**Decisión.** Un visitante sin rol recibe 404.

Un 403 confirma que la ruta existe, que es exactamente la información que busca quien la está
sondeando. El 404 no dice nada.

---

## 17. Vitest para unidad e integración, Playwright para e2e

**Decisión.** Sin capa de mocks pesada. Las pruebas de integración corren contra el **dataset real
commiteado** y contra el almacén local real, en un directorio temporal.

**Consecuencia.** `tests/integration/catalog.test.ts` es un guardia de contenido: si alguien edita
una ficha y rompe una referencia, el test falla antes que el build. Y ya encontró un fallo real
(`getAlternativesFor` devolvía vacío para la única herramienta de su categoría).

`astro:env` se sustituye en `tests/setup.ts` para poder probar el código de librería exactamente como
se despliega, sin una capa de indirección que sólo existiría para hacer posibles las pruebas.
