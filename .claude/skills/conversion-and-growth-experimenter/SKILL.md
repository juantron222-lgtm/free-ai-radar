---
name: conversion-and-growth-experimenter
description: Define, instrumenta y evalúa los eventos de producto y los experimentos de conversión de Free AI Radar — búsquedas, filtros, fichas vistas, comparaciones, favoritos, registros, activación, boletín, alertas, retorno semanal, conversión a Pro, cancelación y clics de afiliación. Úsala al proponer un cambio para mejorar métricas o al interpretar resultados. Prohíbe declarar una mejora sin muestra suficiente.
---

# Experimentador de conversión y crecimiento

## 1. Objetivo

Medir lo que de verdad indica que el producto sirve, y cambiar el producto a
partir de evidencia — no de intuición ni de un número que subió por casualidad.

La regla que gobierna: **sin muestra suficiente no hay resultado**. «Parece que
va mejor» no es un resultado, es una impresión.

## 2. Cuándo se activa

- Al proponer un cambio justificado por «mejorará la conversión».
- Al instrumentar un evento nuevo.
- Al interpretar datos de producto.
- Al revisar si un experimento puede pararse.
- Cuando el usuario diga «cómo hacemos que se registren más»,
  «esto no convierte», «probemos otra versión».
- Antes de dar por buena cualquier variante.

## 3. Procedimiento operativo

### 3.1 Catálogo de eventos

Estos son los eventos del producto. No se inventan otros sin añadirlos aquí.

| Grupo | Evento | Qué indica |
| --- | --- | --- |
| Descubrimiento | `search` | El buscador se usa y con qué términos |
| | `filter_applied` | Qué condiciones importan de verdad |
| | `tool_viewed` | Qué fichas se leen |
| | `comparison_created` | Intención alta de decisión |
| | `outbound_click` | El lector actúa (y base de la afiliación) |
| Activación | `signup` | Registro completado |
| | `first_favorite` | Primer valor guardado |
| | `first_list` | Organización propia |
| | `first_alert` | **Señal fuerte de retención** |
| | `week_2_return` | Vuelve sin que se lo recuerden |
| Correo | `newsletter_subscribe` | Intención |
| | `newsletter_confirm` | Consentimiento real (doble opt-in) |
| Monetización | `pricing_viewed` | Considera pagar |
| | `checkout_started` | Intención de pago |
| | `subscription_created` | Conversión a Pro |
| | `subscription_canceled` | Pérdida |
| | `affiliate_click` | Ingreso por afiliación |
| Editorial | `correction_submitted` | Confianza suficiente para corregirnos |
| | `tool_submitted` | Participación |
| | `accuracy_vote` | Validación del catálogo |

### 3.2 Instrumentación — reglas duras

- **Nada se registra sin consentimiento de analítica.** Comprobación:
  ```bash
  grep -n "analytics" src/lib/consent.ts
  grep -n "text/plain" public/consent.js
  ```
- Tráfico anónimo: hash con **sal diaria rotatoria**, nunca identificador
  persistente.
- Sin PII en `props`. Ni correos, ni nombres, ni texto libre del usuario.
- El evento describe **lo ocurrido**, no la interpretación:
  `filter_applied { filter: 'nocard' }`, no `user_wants_free_tools`.

### 3.3 Definir el experimento

Ninguna variante se implementa sin las doce casillas:

```markdown
### EXP-<n>: <título>
| Campo | Contenido |
|---|---|
| Problema observado | Dato concreto, con su fuente y fecha |
| Hipótesis | Si <cambio>, entonces <métrica> porque <mecanismo> |
| Cambio propuesto | Qué se modifica exactamente |
| Métrica primaria | Una sola |
| Métricas de protección | Las que no deben empeorar |
| Control | Versión actual, medida en el mismo periodo |
| Duración | Mínimo 2 semanas completas (cubre el ciclo semanal) |
| Muestra mínima | Calculada, ver §3.4 |
| Criterio de éxito | Umbral numérico decidido ANTES de mirar |
| Criterio de retirada | Qué obliga a revertir de inmediato |
| Riesgos | Qué puede empeorar, incluida la confianza |
| Resultado real | Se rellena al final, incluso si es «sin efecto» |
```

### 3.4 Muestra mínima — calculada, no supuesta

```js
// Tamaño por variante para una prueba de proporciones, dos colas.
// alpha 0.05, potencia 0.80  ->  (1.96 + 0.84)^2 = 7.849
function sampleSize(baseline, mde) {
  const p1 = baseline, p2 = baseline + mde;
  const p = (p1 + p2) / 2;
  return Math.ceil((7.849 * 2 * p * (1 - p)) / Math.pow(p2 - p1, 2));
}
// Ejemplo: 2% de conversión, detectar +0.5 pp
sampleSize(0.02, 0.005);   // ≈ 13.000 por variante
```

Si el tráfico no alcanza esa cifra en un plazo razonable, **el experimento A/B
no es viable**. Alternativas honestas:

- cambio cualitativo razonado, medido como antes/después y declarado como tal;
- entrevistas o pruebas de usabilidad con 5 personas;
- corregir un defecto evidente sin pedirle permiso a la estadística.

Un defecto obvio se arregla. No hace falta un test para saber que un botón roto
debe funcionar.

### 3.5 Ejecutar

1. Definir el experimento **por escrito antes** de tocar código.
2. Fijar el criterio de éxito **antes** de ver ningún dato.
3. Implementar tras un flag; el control sigue disponible.
4. Dejarlo correr el periodo completo. **Sin mirar a mitad para decidir.**
5. Analizar una sola vez, al final.
6. Registrar el resultado, incluido «sin efecto».

### 3.6 Interpretar sin engañarse

Antes de escribir una conclusión:

- [ ] ¿Se alcanzó la muestra mínima calculada? Si no → «no concluyente».
- [ ] ¿Se completó el periodo? Parar al ver un pico es *peeking*.
- [ ] ¿Empeoró alguna métrica de protección?
- [ ] ¿Hay una explicación externa? (una noticia, un enlace viral, estacionalidad)
- [ ] ¿Se está confundiendo correlación con causalidad?
- [ ] ¿El efecto es relevante, no sólo «significativo»?

Frases prohibidas en un informe: «parece que», «tiende a», «los usuarios
prefieren» — sin cifra, sin muestra y sin intervalo.

## 4. Herramientas permitidas

- `Read` / `Write` / `Edit` — `src/lib/analytics/`, `docs/`, componentes con flag.
- `Bash` / `PowerShell` — consultas sobre `product_events`, `npm run test`.
- `mcp__Claude_Browser__*` — verificar que el evento se dispara y que **no** se
  dispara sin consentimiento.
- `Grep` — auditar dónde se emite cada evento.

Prohibido: herramientas que envíen datos a terceros sin consentimiento.

## 5. Comprobaciones obligatorias

| # | Comprobación | Cómo |
| --- | --- | --- |
| 1 | Ningún evento sin consentimiento | Rechazar cookies → actuar → `product_events` no crece |
| 2 | Sin PII en `props` | `grep -rn "email\|password\|token" src/lib/analytics/` vacío |
| 3 | Anónimos con hash de sal diaria | Revisar la implementación |
| 4 | Evento definido antes de emitirse | Está en el catálogo de §3.1 |
| 5 | Muestra mínima calculada | Con la fórmula de §3.4, no a ojo |
| 6 | Criterio de éxito fijado antes | Consta con fecha anterior al análisis |
| 7 | Métricas de protección declaradas | Al menos una |
| 8 | Periodo completo | ≥ 2 semanas, sin parar antes |
| 9 | Un solo análisis final | Sin *peeking* |
| 10 | Sin dark patterns en la variante | Revisado contra la skill de monetización |

Comprobación 1, ejecutable:
```
mcp__Claude_Browser__navigate  → /herramientas
→ rechazar cookies
→ usar el buscador y aplicar filtros
mcp__Claude_Browser__read_network_requests
→ no debe existir ninguna petición de analítica
```

## 6. Prohibiciones

- ❌ Declarar que una variante mejora la conversión **sin muestra suficiente**.
- ❌ Parar un experimento al ver un resultado favorable.
- ❌ Cambiar la métrica primaria después de ver los datos.
- ❌ Presentar correlación como causalidad.
- ❌ Inventar cifras, tasas o previsiones.
- ❌ Registrar eventos sin consentimiento de analítica.
- ❌ Guardar PII en propiedades de evento.
- ❌ Usar identificadores persistentes para tráfico anónimo.
- ❌ Dark patterns para subir una métrica: casillas premarcadas, escasez falsa,
  cancelación escondida, confirmshaming.
- ❌ Optimizar una métrica degradando la utilidad o la confianza.
- ❌ Medir clics de afiliación como si fueran una señal de calidad editorial.
- ❌ Probar variantes que impliquen publicar algo no verificado.

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

Un experimento está cerrado cuando:

1. Las doce casillas de §3.3 están completas, **incluido el resultado real**.
2. Se alcanzó la muestra mínima — o consta explícitamente que no.
3. Se cumplió el periodo completo.
4. Las métricas de protección se revisaron y constan.
5. La conclusión dice una de tres cosas: **mejora**, **empeora**, o
   **no concluyente**. Nunca «parece prometedor».
6. Si no fue concluyente, se retira la variante o se declara que sigue por
   decisión cualitativa, dicho abiertamente.
7. El aprendizaje queda registrado, aunque el resultado sea nulo.
8. Las diez comprobaciones de §5 pasan.

## 8. Formato de informe

```markdown
## EXP-<n>: <título> — <fecha de cierre>

### Problema observado
<dato, fuente, fecha>

### Hipótesis
Si <cambio>, entonces <métrica> porque <mecanismo>

### Diseño
| Campo | Valor |
|---|---|
| Métrica primaria | |
| Métricas de protección | |
| Control | |
| Duración prevista / real | |
| Muestra mínima calculada | |
| Muestra obtenida | |
| Criterio de éxito (fijado el <fecha>) | |
| Criterio de retirada | |

### Resultado
| Métrica | Control | Variante | Δ | ¿Muestra suficiente? |
|---|---|---|---|---|

### Conclusión
MEJORA / EMPEORA / NO CONCLUYENTE — <por qué>

### Métricas de protección
| Métrica | Antes | Después | ¿Aceptable? |
|---|---|---|---|

### Explicaciones alternativas consideradas
<estacionalidad, tráfico externo, cambios simultáneos>

### Decisión
ADOPTAR / REVERTIR / REPETIR CON MÁS MUESTRA

### Aprendizaje
<qué sabemos ahora que no sabíamos, aunque sea "este cambio no importa">
```

## 9. Ejemplos de uso

**Correcto**
```
Observación: 8 de cada 10 sesiones usan un filtro pero sólo 1 de cada 50 se registra.
Hipótesis: quien filtra mucho quiere conservar el resultado; si ofrecemos guardar
la búsqueda en el momento en que aplica el tercer filtro, subirán los registros.
Métrica primaria: signup por sesión con ≥3 filtros.
Protección: outbound_click por sesión (no queremos estorbar la acción útil).
Muestra mínima: sampleSize(0.02, 0.005) ≈ 13.000 por variante.
Tráfico actual: ~400/semana → 32 semanas. NO VIABLE como A/B.
→ Se implementa como mejora cualitativa razonada, medida antes/después,
   y se declara explícitamente que no es un experimento controlado.
```

**Incorrecto**
```
Se cambia el botón de registro a verde. En 3 días los registros suben de 4 a 7.
→ "El verde convierte un 75% más"   ❌
   n=7, tres días, sin control, sin muestra mínima. Es ruido con forma de dato.
```

**Correcto — resultado nulo**
```
EXP-004: mover la newsletter arriba en la ficha.
Muestra alcanzada, periodo completo.
Suscripciones: 1,9% → 2,0%. Intervalo incluye el cero.
Conclusión: NO CONCLUYENTE. Se revierte por no aportar.
Aprendizaje: la posición no es el cuello de botella; probablemente lo es
la propuesta de valor del boletín.
```

## 10. Situaciones que requieren aprobación humana

- Activar **analítica** en producción por primera vez.
- Añadir un **proveedor de analítica** de terceros.
- Recoger cualquier **dato personal** nuevo.
- Un experimento que cambie **precios** o el contenido del plan gratuito.
- Un experimento que afecte a **quien ya paga**.
- Cambiar el **flujo de consentimiento**.
- Cualquier variante cuya métrica de protección haya **empeorado**.
- Retirar una función que alguien esté usando.
- Enviar **correo real** como parte de un experimento.

Nunca, sin excepción: registrar eventos antes del consentimiento, guardar PII en
eventos, ni desplegar una variante directamente en producción.
