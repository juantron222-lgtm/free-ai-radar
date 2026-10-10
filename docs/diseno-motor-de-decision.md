# Motor de decisión — diseño mínimo

Estado: propuesta, 10 de octubre de 2026. Nada de esto está programado.

Prioridades acordadas con Juan: **4** (producto: encontrar la IA que mejor se
adapta) → **1** (adquisición: páginas por tarea, sólo con demanda medida) → **3**
(Índice de recortes, más adelante) · **5** sólo preparada (estructura numérica
de los límites, abajo) · extensión de navegador: no.

## 1. Qué contesta y qué no

Contesta: *«Quiero hacer X, con estas condiciones: ¿qué herramienta uso?»*, con
recomendaciones que se justifican **sólo** con hechos comprobados de las fichas,
cada uno con su fuente y su fecha.

No contesta, y lo dice: cuál es *mejor* (no medimos calidad), nada que la ficha
no tenga comprobado (un dato `unverified` nunca se convierte en sí ni en no), ni
preguntas fuera de las tareas que el catálogo sabe reconocer.

**¿Hace falta un LLM?** No para decidir. Todo lo que decide ya existe como dato:
tareas → capacidades (`search/intents.ts`, 13 tareas), qué incluye el plan
gratuito (`capabilities` − `freePlan.excludedCapabilities`), condiciones
(tarjeta, registro, uso comercial, marca de agua, privacidad), dónde se usa
(`hosting`, `platforms`, `startEffort`), nivel de acceso (`nivelDeAcceso`) y
evidencias por campo. Un LLM sólo tendría sentido *más tarde* y sólo como
traductor de texto libre a una consulta del motor (tarea + condiciones), nunca
para producir un hecho ni una recomendación.

## 2. Entrada: una consulta pequeña

```ts
interface Consulta {
  tarea: IdDeTarea;                 // una de las intenciones de intents.ts
  exigencias: {                     // todas opcionales
    sinTarjeta?: true;
    sinRegistro?: true;
    usoComercial?: true;
    sinMarcaDeAgua?: true;
    noEntrenaConMisDatos?: true;
    enMiEquipo?: true;              // hosting local o híbrido
    codigoAbierto?: true;
  };
  dondeLoUso?: 'navegador' | 'instalar' | Plataforma;   // preferencia, no filtro
}
```

En la página: tres pasos con botones, sin escribir —«¿Qué quieres hacer?»,
«¿Qué no estás dispuesto a dar?», «¿Dónde lo vas a usar?»—. La consulta va en la
URL (`/elegir?tarea=transcribir&sin-tarjeta=1&comercial=1`), así que se puede
compartir y, más adelante, convertir en página de tarea (§6).

## 3. El algoritmo (determinista, sin puntuación)

1. **Hace la tarea, y gratis.** Candidatas = fichas no retiradas cuyas
   `capabilities` cubren la tarea **y** cuyo plan gratuito no la excluye
   (`excludedCapabilities`). Las de pago que la hacen van aparte («Si pagas»).
2. **Cada exigencia, con tres resultados posibles**, nunca dos:
   - *cumple* — el hecho está comprobado y es el pedido;
   - *no cumple* — está comprobado y es el contrario → **descartada, con el motivo**;
   - *no sabemos* — `unverified` o «el fabricante no lo publica» → **no se
     descarta ni se da por bueno**: baja a «Posibles, sin confirmar» y dice
     exactamente qué no sabemos.
3. **Orden**, lexicográfico y explicable, como el orden «útil» del catálogo:
   a. menos «no sabemos» en las exigencias pedidas;
   b. `nivelDeAcceso` (gratis continuo → créditos que vuelven → prueba);
   c. esfuerzo para empezar (`instant` → `signup` → `install` → `technical`),
      ajustado a `dondeLoUso` si se indicó;
   d. cuota publicada antes que «no publican cuánto» (es un hecho, no un juicio);
   e. estado de verificación y fecha de la última comprobación;
   f. nombre, para que el empate sea estable.
   No se usan las puntuaciones antiguas (`score`), que el sitio dejó de publicar.
4. **Salida**:
   - **Recomendadas** (hasta 3): cada una con «Por qué» = las exigencias que
     cumple + qué da gratis (`creditsAmount` literal) + 1–2 límites literales de
     `freePlan.limits`, cada hecho enlazado a su evidencia (fuente y fecha).
   - **Posibles, sin confirmar**: las que sólo fallan por «no sabemos».
   - **Descartadas y por qué**: cuántas y el motivo agregado
     («4 piden tarjeta», «2 no permiten uso comercial»).
   - **Si pagas**: las que lo hacen sólo pagando.
   - **Vacío honesto**: si nada cumple, qué exigencia lo vacía y cuántas
     aparecen sin ella (la lógica ya existe: `findBlockingFilter`).

## 4. Dónde vive

- `src/lib/decision/motor.ts`: una función pura,
  `decidir(fichas, consulta) → { recomendadas, posibles, descartadas, siPagas, vaciaPor }`,
  y `explicar(ficha, consulta) → Razon[]` (cada razón con su evidencia).
  Corre igual en el servidor (páginas prerenderizadas, §6) y en el navegador
  (sobre el índice comprimido que ya usa el catálogo).
- Página `/elegir`, prerenderizada, con el motor en el cliente. Sin cuenta, sin
  LLM, sin coste por consulta.
- Medición con el contador ya hecho: consultas hechas (tarea + exigencias, con
  «Analítica») y clic de salida desde una recomendación (`/ir/`, siempre).

**Pruebas que lo fijan**: nunca recomienda algo con un hecho contrario
comprobado; nunca afirma un hecho `unverified`; toda razón tiene evidencia; una
de pago nunca sale en «Recomendadas»; misma consulta → misma respuesta.

## 5. Lo que hay que completar antes (datos, no código)

Recuento del 10 de octubre sobre 116 fichas activas:

| Hecho | Comprobado | Por qué importa al motor |
|---|---|---|
| Pide tarjeta | 43 (37 %) | exigencia más pedida |
| Uso comercial | 37 (32 %) | decide «para trabajar» |
| Marca de agua | 23 (20 %) | imagen y vídeo |
| Entrena con tus datos | 3 (3 %) | privacidad |
| Registro | 88 (76 %) | — |
| `excludedCapabilities` | **1 ficha** | sin esto recomienda lo que el plan gratuito no incluye |

El último es el riesgo grave: ElevenLabs dice en sus límites que la clonación de
voz **no** está en el plan gratuito, pero no está en `excludedCapabilities`, así
que el motor la recomendaría para «clonar una voz gratis». Paso previo: una
revisión de las 432 líneas de `freePlan.limits` que pase a
`excludedCapabilities` lo que el fabricante declara excluido, con su cita.

Orden de la campaña de verificación: las tareas que más se busquen (contador) y,
dentro de cada una, las exigencias más marcadas.

## 6. Páginas por tarea (prioridad de adquisición), sin generar todavía

Una página de tarea **es la respuesta del motor a una consulta fija**, más una
entrada editorial corta. Mismo código, cero hechos nuevos.

- **Demanda**, de dos fuentes: el contador (búsquedas y búsquedas sin resultado,
  normalizadas y asignadas a una tarea) y Search Console (consultas con
  impresiones). Un informe semanal (script) suma demanda por *tarea × exigencia*.
- **Umbral para proponer una página**: demanda medida en 28 días por encima de
  un mínimo **y** el motor devuelve al menos 3 recomendadas sin «no sabemos» en
  las exigencias de la página. Sin las dos cosas, no hay página (nada de
  páginas finas).
- **Registro** `src/data/paginas-de-tarea.json`: `{ slug, tarea, exigencias,
  demanda: { busquedas, impresiones, periodo }, aprobada: { por, fecha } }`.
  Sólo las aprobadas se prerenderizan en `/hacer/<tarea>[/<exigencia>]` y
  entran en el sitemap.
- Primero, pocas: las 3–5 combinaciones con más demanda cuando haya 4 semanas
  de datos.

## 7. Cuotas numéricas (para la calculadora, 5), sólo la estructura

Hoy la cantidad es texto (`creditsAmount`, 35 fichas) y unidades del
fabricante muy distintas: «100 unidades/día» (Krea: ≈ 1 imagen de un modelo
concreto), «20.000 créditos/mes (≈27 min)», «10 imágenes cada 3 horas», «5 $/mes
en créditos». Propuesta, junto a `creditsAmount` (que se queda como cita literal):

```ts
cuotas: Array<{
  cantidad: number;                         // 100
  unidad: 'credito' | 'imagen' | 'video' | 'minuto-audio' | 'minuto-video'
        | 'transcripcion' | 'peticion' | 'mensaje' | 'token' | 'tarea' | 'usd';
  unidadDelFabricante: string;              // «unidades de cómputo», literal
  periodo: 'hora' | 'dia' | 'mes' | 'ventana' | 'una-vez';
  ventanaHoras?: number;                    // «cada 3 horas» → 3
  tope?: { cantidad: number; periodo: 'dia' | 'mes' };  // Lovable: 5/día, tope 30/mes
  alcance?: 'por-herramienta' | 'compartida';           // Clipdrop / ElevenLabs
  capacidades?: Capability[];               // a qué tareas se aplica
  equivalencias?: Array<{                    // SÓLO si el fabricante la publica
    cantidad: number; unidad: string; cita: string;
  }>;
  evidencia: FieldEvidence;                  // cita, URL, fecha
}>;
cuotaNoPublicada?: true;                     // ChatGPT: «existe y no publica cuánto»
```

Reglas: una equivalencia (créditos → imágenes o minutos) sólo existe si el
fabricante la publica; sin ella, la calculadora dice «no sabemos cuántas
imágenes son». «Una vez» nunca cuenta como mensual. Las ventanas de horas se
enseñan como «máximo teórico», no como lo que uno sacará. Migración: a mano,
ficha por ficha, desde las citas ya guardadas; ninguna conversión automática
por expresión regular.

## 8. Índice de recortes (3), más adelante

Se apoyará en `changelog[]` (28 cambios fechados hoy) y en las cuotas numéricas
de §7: con ellas, «el plan gratuito de X bajó de 50 a 30 al día» se calcula en
vez de redactarse. Por eso va después de §7.
