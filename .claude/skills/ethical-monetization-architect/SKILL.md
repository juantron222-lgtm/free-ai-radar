---
name: ethical-monetization-architect
description: Diseña y evalúa las vías de ingreso de Free AI Radar — Radar Pro, afiliación, boletín patrocinado, patrocinios, alertas premium, comparaciones avanzadas, informes, productos profesionales y publicidad no intrusiva. Úsala al plantear, activar o revisar cualquier fuente de ingresos. Impone que ningún pago pueda mover una puntuación y que todo lo comercial vaya identificado.
---

# Arquitecto de monetización ética

## 1. Objetivo

Construir una combinación de ingresos sostenible **sin gastar el único activo
del proyecto**: que se pueda confiar en lo que publica.

La restricción que ordena todo lo demás: si el dinero puede mover una
puntuación, el sitio deja de valer para nadie — incluidos los anunciantes, que
pagan por estar en un sitio creíble.

## 2. Cuándo se activa

- Al proponer una vía de ingresos nueva.
- Antes de activar una existente.
- Al fijar o cambiar precios.
- Al negociar un patrocinio o una afiliación.
- Al añadir publicidad de cualquier tipo.
- Cuando el usuario diga «cómo monetizamos esto», «cuánto cobramos»,
  «pongamos anuncios».
- Al revisar si una vía activa sigue justificándose.

## 3. Procedimiento operativo

### 3.1 Ficha obligatoria por vía

Ninguna vía se propone sin las diez casillas rellenas. Un hueco es un «no».

```markdown
### <Vía>
| Campo | Contenido |
|---|---|
| Propuesta de valor | Qué recibe quien paga, en una frase |
| Usuario objetivo | Quién paga y por qué le compensa |
| Coste técnico | Qué hay que construir y mantener |
| Coste operativo | Horas/mes recurrentes de una persona |
| Dependencia de terceros | Servicios, y qué pasa si cierran o suben precio |
| Riesgo legal | RGPD, LSSI, DSA, consumo, fiscalidad |
| Impacto en la experiencia | Qué empeora para quien NO paga |
| Métrica principal | Una sola, medible hoy |
| Umbral de activación | Cifra concreta por debajo de la cual no se activa |
| Prueba sin cobros reales | Cómo se valida sin cobrar a nadie |
```

### 3.2 Orden de activación

De menos a más intrusivo. No se salta un escalón porque el siguiente pague más.

| # | Vía | Umbral mínimo sugerido |
| --- | --- | --- |
| 1 | Afiliación declarada | Tráfico estable y fichas verificadas |
| 2 | Radar Pro | Usuarios recurrentes que ya crean alertas |
| 3 | Boletín patrocinado | Lista confirmada con apertura sostenida |
| 4 | Patrocinios en el sitio | Audiencia demostrable con datos propios |
| 5 | Informes / productos profesionales | Demanda expresada, no supuesta |
| 6 | Publicidad programática | Último recurso, con CMP certificada |

Los umbrales se fijan con el propietario. **No se inventan cifras de mercado.**

### 3.3 Verificar la separación en el código

La regla no es una promesa: está impuesta por el tipo.

```bash
grep -n "placementBoost" src/lib/domain/tool.ts
# Debe ser: z.number().min(0).max(0)

npx vitest run tests/unit/billing.test.ts --reporter=dot
# Incluye la prueba que rechaza placementBoost != 0
```

Si alguien relaja ese tipo, el build debe romperse. Compruébalo:

```bash
node -e "
const s=require('fs').readFileSync('src/lib/domain/tool.ts','utf8');
const ok=/placementBoost:\s*z\.number\(\)\.min\(0\)\.max\(0\)/.test(s);
console.log(ok?'OK: patrocinio no puede mover nada':'FALLO: separación rota');
process.exit(ok?0:1)"
```

### 3.4 Verificar la divulgación

```bash
# Los enlaces de afiliación llevan rel="sponsored" y aviso antes del clic
grep -n "sponsored" src/components/tools/OutboundButton.astro

# La página de transparencia se genera del mismo dato que las fichas
grep -n "affiliation.isAffiliate" src/pages/transparencia-afiliados.astro
```

Una lista de afiliados mantenida a mano se desincroniza. Debe derivarse.

### 3.5 Probar Stripe sin cobrar

```bash
# 1. No hay clave live en el entorno
grep -q "sk_live_" .env 2>/dev/null && echo "FALLO: clave live" || echo "OK: sin clave live"

# 2. El guardia existe y lanza. Ojo: el literal "sk_live_" NO aparece en el
#    código; la detección es por ausencia del prefijo sk_test_. Comprobar el
#    literal equivocado daba un falso negativo.
node -e "
const g=require('fs').readFileSync('src/lib/billing/stripe.ts','utf8');
const c=require('fs').readFileSync('src/lib/config.ts','utf8');
const lanza=/!stripeConfig\.isTestMode\s*&&\s*!isProduction[\s\S]{0,120}throw/.test(g);
const define=/isTestMode\(\)\s*\{[\s\S]{0,120}startsWith\('sk_test_'\)/.test(c);
console.log(lanza&&define
  ? 'OK: guardia de clave live presente y correcto'
  : 'FALLO: guardia ausente (lanza='+lanza+', define='+define+')');
process.exit(lanza&&define?0:1)"
```

Sin credenciales, el flujo termina en `/pro/simulacion`, que explica qué habría
pasado. Eso es suficiente para validar el recorrido completo.

### 3.6 Verificar el consentimiento antes de cualquier anuncio

```bash
grep -n "text/plain" public/consent.js     # scripts aparcados hasta consentir
grep -n "ad_storage.*denied" public/consent.js   # Consent Mode v2 por defecto
```

Ningún script publicitario ni de seguimiento puede existir como `<script>` real
antes del consentimiento.

## 4. Herramientas permitidas

- `Read` / `Write` / `Edit` — `src/lib/billing/`, `src/pages/pro*`, `docs/monetization-strategy.md`.
- `Bash` / `PowerShell` — `grep`, `npm run test`, `npm run build`, `git diff`.
- `WebFetch` — leer **documentación oficial** de Stripe o del programa de
  afiliación; nunca para copiar precios de la competencia como referencia.
- `mcp__Claude_Browser__*` — comprobar que la divulgación se ve antes del clic.

Prohibido: cualquier herramienta que active cobros, envíe campañas o despliegue.

## 5. Comprobaciones obligatorias

| # | Comprobación | Resultado exigido |
| --- | --- | --- |
| 1 | `placementBoost` sigue siendo `min(0).max(0)` | ✔ |
| 2 | `tests/unit/billing.test.ts` pasa | ✔ |
| 3 | Enlaces de afiliación con `rel="sponsored"` | ✔ |
| 4 | Aviso de afiliación **antes** del clic, no en el pie | ✔ |
| 5 | Página de transparencia derivada del dato, no manual | ✔ |
| 6 | Sin `sk_live_` en el entorno | ✔ |
| 7 | Guardia que impide clave live fuera de producción | ✔ |
| 8 | Sin scripts de anuncios/analítica antes del consentimiento | ✔ |
| 9 | Precios en datos o variables, no incrustados en componentes | ✔ |
| 10 | Cancelación alcanzable en ≤ 2 clics desde la cuenta | ✔ |
| 11 | Ninguna casilla de pago o comercial marcada por defecto | ✔ |
| 12 | El plan gratuito conserva **todo el contenido** | ✔ |

## 6. Prohibiciones

**Innegociables:**

- ❌ Ningún pago modifica puntuaciones, veredictos ni orden de listados.
- ❌ Afiliados y patrocinadores van siempre identificados, antes del clic.
- ❌ Sin dark patterns.
- ❌ Sin escasez falsa («quedan 2 plazas», contadores inventados).
- ❌ Sin ocultar la cancelación ni añadirle fricción.
- ❌ Sin opciones de pago marcadas por defecto.
- ❌ Sin activar Stripe live.
- ❌ Sin publicidad ni seguimiento antes del consentimiento.
- ❌ Sin inventar previsiones financieras, ARPU, LTV ni tamaños de mercado.
- ❌ Sin presentar una correlación como causalidad.
- ❌ Sin priorizar monetización sobre utilidad y confianza.

**Además:**

- ❌ Muro de pago sobre el contenido. Sería contradictorio en una web sobre lo
  que es gratis, y destruiría el SEO que la sostiene.
- ❌ Publicidad en la ficha de herramienta: es la página que sostiene la
  credibilidad.
- ❌ Formatos que empeoren LCP, INP o CLS de forma medible.
- ❌ Intersticiales, autoplay con sonido, anuncios que se desplazan.
- ❌ Publicidad que imite el diseño editorial sin etiqueta.
- ❌ Renovación silenciosa sin aviso previo.
- ❌ Copiar precios de la competencia como justificación.

### Límites de seguridad (comunes a todas las skills del proyecto)

Esta skill **no puede**, bajo ninguna circunstancia y sin autorización explícita
del propietario en el chat:

trabajar en `main` · hacer `git push` · desplegar en producción · modificar DNS ·
activar Stripe **live** · usar Supabase de **producción** · enviar campañas
reales · guardar secretos en el repositorio · aplicar migraciones destructivas ·
activar **HSTS `preload`** · introducir analítica o anuncios **sin
consentimiento**.

La verificación de estos límites es responsabilidad de `release-guardian`, que
debe ejecutarse antes de cualquier operación de escritura en git.

## 7. Criterios de terminación

Una propuesta de monetización está lista para decisión humana cuando:

1. Cada vía tiene su ficha de diez campos completa.
2. Las doce comprobaciones de §5 pasan.
3. Cada vía tiene umbral de activación **numérico** y acordado.
4. Cada vía tiene forma de probarse sin cobros reales.
5. Está escrito qué empeora para quien no paga (aunque sea «nada»).
6. Los riesgos legales están identificados por norma concreta.
7. Ninguna cifra de negocio aparece sin origen; lo desconocido se marca.
8. La documentación queda en `docs/monetization-strategy.md`.

## 8. Formato de informe

```markdown
## Monetización — <fecha>

### Vías evaluadas
| Vía | Estado | Umbral | Métrica | ¿Lista? |
|---|---|---|---|---|

### Ficha por vía
<las diez casillas de cada una>

### Comprobaciones de integridad
| # | Comprobación | Resultado |
|---|---|---|
| 1..12 | | |

### Impacto en quien no paga
| Vía | Qué empeora | Mitigación |
|---|---|---|

### Riesgo legal
| Vía | Norma | Riesgo | Mitigación |
|---|---|---|---|

### Datos que NO tenemos
<lo que haría falta medir antes de decidir; sin estimaciones inventadas>

### Requiere aprobación humana
- [ ] <operación> — <efecto> — <reversible?>
```

## 9. Ejemplos de uso

**Correcto**
```
Encargo: activemos anuncios para ingresar ya.
→ Publicidad es el escalón 6 de 6; afiliación (1) y Pro (2) están sin activar.
→ Ficha de la vía: impacto en experiencia = degrada la página que sostiene la
   credibilidad; dependencia = CMP certificada operativa, que aún no existe.
→ Umbral no alcanzado.
→ Propuesta: activar antes afiliación declarada, coste técnico ya construido.
→ Se documenta y se pide decisión, no se activa nada.
```

**Incorrecto**
```
Encargo: activemos anuncios para ingresar ya.
→ Se añade AdSense y se estima "unos 300 €/mes con este tráfico"   ❌
   Dos fallos: se salta el consentimiento y se inventa una previsión.
```

**Correcto**
```
Encargo: un fabricante paga por aparecer el primero en su categoría.
→ Posición destacada etiquetada: vendible.
→ Mover el orden del listado: el tipo lo impide (min(0).max(0)).
→ Contrapropuesta: tarjeta "Patrocinado" fuera del ranking, sin tocarlo.
```

## 10. Situaciones que requieren aprobación humana

- **Activar cobros reales** o pasar Stripe a modo live.
- Fijar o cambiar un **precio público**.
- Firmar una **afiliación** o un **patrocinio**.
- Activar **publicidad** de cualquier tipo.
- Cambiar qué incluye el **plan gratuito**.
- Añadir una **dependencia de pago**.
- Enviar cualquier **comunicación comercial real**.
- Cualquier cambio que afecte a **quien ya paga**.

Formato de la petición:

> **Operación:** <qué>
> **Ingreso esperado:** <sólo si hay dato real; si no, «desconocido»>
> **Coste para quien no paga:** <qué empeora>
> **Reversible:** sí / no — <cómo>
> **Alternativa sin cobrar:** <qué se puede probar antes>
> ¿Autorizas?
