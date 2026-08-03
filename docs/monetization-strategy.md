# Estrategia de monetización

---

## 1. La regla que lo condiciona todo

**La puntuación editorial no está en venta.** Ni un punto, ni una posición, ni la retirada de una
crítica cierta.

No es una declaración de intenciones: está impuesta por el compilador.

```ts
// src/lib/domain/tool.ts
placementBoost: z.number().min(0).max(0).default(0)
```

Cualquier valor distinto de cero falla la validación y el build no pasa. Un patrocinio puede comprar
visibilidad etiquetada; no puede mover nada.

Es una línea de código y probablemente la más importante del repositorio. Sin ella, el sitio es otro
directorio de afiliación más y no tiene ninguna razón para existir.

---

## 2. Las cuatro fuentes

| Fuente | Cuándo activarla | Techo realista |
| --- | --- | --- |
| **Afiliación** | Desde el principio | Medio, escala con el tráfico |
| **Radar Pro** | Con base de usuarios recurrentes | Alto, ingreso recurrente |
| **Patrocinios** | Con audiencia demostrable | Medio, esfuerzo comercial |
| **Publicidad** | Último recurso | Bajo, coste de credibilidad |

El orden es deliberado: de menos a más intrusivo.

---

## 3. Afiliación

**Cómo se implementa:**

- `Tool.affiliation` con `isAffiliate`, `programName` y `affiliateUrl`.
- Cuando está activa, `outboundUrl` usa el enlace de afiliado.
- El enlace lleva `rel="sponsored noopener noreferrer"`.
- **La divulgación aparece junto al botón, antes del clic**, no en un pie.
- `/transparencia-afiliados` lista todos los programas activos, **generado desde los mismos datos**
  que alimentan las fichas: no se puede olvidar actualizarlo.

**Estado actual:** cero enlaces de afiliación. Se implementó la infraestructura, no la relación
comercial.

**Por qué es la primera fuente:** el lector ya iba a contratar. Cobrar una comisión de quien iba a
cobrarle de todos modos, diciéndolo claramente, es el intercambio menos malo.

---

## 4. Radar Pro

### El planteamiento

Pro **no bloquea contenido**. Un muro de pago en una web sobre lo que es gratis sería una
contradicción, y además destruiría el SEO que sostiene el proyecto.

Pro vende **inmediatez, volumen y seguimiento**:

| Gratis | Pro |
| --- | --- |
| Catálogo completo y todas las fichas | Igual |
| Búsqueda y filtros combinables | Igual + avanzados y exportación CSV |
| Comparador 2–4 | Igual + comparaciones guardadas |
| 3 listas, 5 alertas | Ilimitadas |
| Avisos en el resumen semanal | **Avisos en el momento de detectarlo** |
| Historial reciente | Historial completo por herramienta |
| Con publicidad | Sin publicidad |

### Precio

5 €/mes o 50 €/año (dos meses gratis). Definido en `src/lib/billing/plans.ts` y con los `price_id`
en variables de entorno. **Ningún componente lleva un precio escrito a mano.**

### Por qué alguien pagaría

El comprador no es un curioso: es alguien que **depende profesionalmente** de que un plan gratuito
siga siéndolo. Un freelance cuyo flujo de trabajo se rompe si su herramienta de vídeo empieza a
pedir tarjeta. Para esa persona, enterarse el mismo día en vez de la semana siguiente vale más de
5 € al mes.

### Estado

Implementado y **sin activar**:

- Checkout con clave de idempotencia derivada de usuario + plan + minuto (un doble clic reutiliza la
  sesión en vez de crear dos).
- Webhooks con firma verificada sobre el cuerpo crudo e idempotencia por `event.id`.
- Customer Portal para cambios de plan, cancelación y facturas.
- Gestión de pagos fallidos: se registra, Stripe reintenta, el acceso decae con el estado.
- IVA automático y recogida de NIF.
- **Guardia contra claves live fuera de producción.**

Sin credenciales, el flujo termina en `/pro/simulacion`, que explica exactamente qué habría pasado.

---

## 5. Patrocinios

### Qué se vende

- Posición destacada etiquetada como «Patrocinado».
- Espacio en el boletín, identificado como publicidad.
- Contenido patrocinado, marcado de principio a fin.

### Qué no

- La puntuación ni sus componentes.
- El veredicto, las ventajas o los inconvenientes.
- El orden de un listado o una comparativa.
- Eliminar una crítica cierta o excluir a un competidor.
- Revisar un texto antes de publicarse.

### Cómo se identifica

Etiqueta visible en el mismo bloque, sin hover, sin desplegar nada. `rel="sponsored"` en los enlaces.
Documentado en `/publicidad`.

---

## 6. Publicidad

**Última opción, y con condiciones.**

Formatos rechazados aunque paguen bien:

- interstitials y cualquier cosa que tape el contenido;
- autoplay con sonido;
- anuncios que se desplazan y provocan clics accidentales;
- publicidad que imite el diseño editorial sin etiqueta;
- cualquier formato que empeore de forma medible LCP, INP o CLS;
- **seguimiento antes del consentimiento** — no es preferencia, es la ley.

Nunca en la ficha de herramienta: es justo la página que sostiene la credibilidad.

Requisito previo: CMP certificada por Google, integrada con el TCF, operativa y probada.

---

## 7. Ideas descartadas por ahora

| Idea | Por qué no |
| --- | --- |
| Servicios de lanzamiento para fabricantes | Conflicto de interés directo con la función editorial |
| Informes sectoriales de pago | Requiere volumen de datos que aún no existe |
| API de pago | Sin demanda demostrada |
| Colecciones de equipo | Necesita modelo de organizaciones |
| Listado destacado permanente | Indistinguible de vender el orden |

---

## 8. Nada de dark patterns

Lo que **no** se hace, aunque suba las métricas:

- Ni casillas premarcadas de correo comercial.
- Ni baja escondida tras un login.
- Ni «¿seguro que quieres irte?» al cancelar.
- Ni consentimiento sesgado.
- Ni comparar precios con tachados falsos.
- Ni renovación silenciosa sin aviso.
- Ni puntuaciones infladas para aumentar clics.

Un usuario que cancela y se va con buena impresión vuelve. Uno retenido con fricción no vuelve, y lo
cuenta.

---

## 9. Eventos de negocio a medir

Definidos en el modelo (`product_events`), pendientes de instrumentar tras el consentimiento:

**Descubrimiento:** `search`, `filter_applied`, `tool_viewed`, `outbound_click`, `comparison_created`

**Activación:** `signup`, `first_favorite`, `first_list`, `first_alert`, `week_2_return`

**Monetización:** `pricing_viewed`, `checkout_started`, `subscription_created`,
`subscription_canceled`, `affiliate_click`

**Editorial:** `correction_submitted`, `tool_submitted`, `accuracy_vote`

Ninguno se recoge sin consentimiento de analítica. Los identificadores anónimos usan un hash con sal
diaria rotatoria, no un identificador persistente.

---

## 10. Orden de activación sugerido

1. **Ahora:** publicar la v2 sin monetización. Construir tráfico y catálogo.
2. **Cuando haya tráfico constante:** afiliación en las herramientas que ya tengan programa, siempre
   declarada.
3. **Cuando haya usuarios recurrentes:** abrir Radar Pro. El indicador de que ha llegado el momento
   es la proporción de usuarios que crean alertas.
4. **Cuando haya audiencia demostrable:** patrocinios del boletín.
5. **Sólo si hace falta:** publicidad, con CMP certificada.

Activar Pro antes de tener un bucle de retorno sólido es la forma más rápida de quemar la
oportunidad: nadie paga por alertas de un sitio que no visita.
