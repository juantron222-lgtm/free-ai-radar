# Contrato de integración con AutoCraw

**Estado: diseñado, no conectado.**
No hay credencial emitida, ni programa de afiliación activo, ni un solo producto
en el sistema. Este documento describe la forma del acceso; concederlo es un
acto posterior y deliberado.

| | |
| --- | --- |
| Versión del contrato | 1 |
| Migración | [`supabase/migrations/0003_autocraw_affiliate.sql`](../supabase/migrations/0003_autocraw_affiliate.sql) |
| Dominio | [`src/lib/domain/affiliate.ts`](../src/lib/domain/affiliate.ts) |
| Lectura | [`src/lib/data/affiliate.ts`](../src/lib/data/affiliate.ts) |
| Pruebas | [`tests/unit/affiliate.test.ts`](../tests/unit/affiliate.test.ts) — 24 |
| Panel | `/admin/autocraw` |

---

## 1. Qué es AutoCraw y qué no es

AutoCraw es un agente independiente que se encargará de la monetización
comercial: Amazon Afiliados y, potencialmente, otros programas.

**No es un editor.** No selecciona herramientas, no escribe fichas, no puntúa,
no ordena listados y no decide qué entra en el catálogo. Propone material
comercial; una persona lo aprueba o no.

La distinción no se sostiene sobre buena voluntad. Se sostiene sobre permisos
de base de datos, restricciones de esquema y pruebas que fallan si alguien la
rompe. El resto del documento explica dónde está cada tornillo.

---

## 2. El modelo de datos

Siete entidades. La separación entre ellas no es normalización por deporte:
cada frontera existe para que un dato no pueda contaminar a otro.

```
affiliate_merchants      quién cobra          (Amazon ES, tienda del fabricante)
      │
      ├── affiliate_offers ─── affiliate_products     qué se vende y a qué precio
      │         │
      │         └── affiliate_links                   la URL rastreable
      │
tool_product_relations   qué producto va con qué herramienta, y por qué
      │
      └── placement_slots  dónde puede aparecer y en qué orden comercial

affiliate_click_events_daily   clics agregados por día. Sin usuario, sin sesión.
```

### Por qué producto y oferta están separados

Un producto existe en el mundo; una oferta es alguien vendiéndolo a un precio,
en un mercado, un día concreto. Mezclarlos obliga a duplicar el producto por
cada mercado y hace imposible responder «¿de cuándo es este precio?».

### Por qué el enlace está separado de la oferta

Porque la URL rastreable caduca, cambia de etiqueta y depende del programa,
mientras que la oferta no. Y porque así el enlace puede llevar su propia
obligación de divulgación sin que dependa de nada más.

### Campos que el enunciado pide, y dónde están

| Requisito | Dónde vive |
| --- | --- |
| Fecha de última comprobación | `last_checked_at` en las seis tablas |
| Estado activo/inactivo | `status`: `pending_review` · `active` · `inactive` · `rejected` |
| Fuente | `source`: `autocraw` · `manual` · `import` |
| Divulgación obligatoria | `affiliate_links.disclosure_required` + `affiliate_merchants.disclosure_text` |
| Precio observado | `affiliate_offers.observed_price_cents` (enteros) |
| Fecha del precio observado | `affiliate_offers.observed_price_at` |
| País / mercado | `market`, ISO 3166-1 alfa-2, en comerciante y oferta |
| Prioridad comercial | `commercial_priority` en relación y emplazamiento |
| Prioridad editorial | **No está aquí.** Es `scores` en `tools`, y AutoCraw no la alcanza |

---

## 3. Los invariantes, y qué los sostiene

Cada línea de esta tabla tiene una prueba con el mismo nombre en
`tests/unit/affiliate.test.ts`. Si la prueba cae, la promesa ha dejado de ser
cierta y este documento está mintiendo hasta que alguien lo arregle.

| Invariante | Qué lo impone |
| --- | --- |
| **Los afiliados nunca modifican la puntuación** | `autocraw_ingest` no tiene ningún permiso sobre `public.tools`. Además, no existe ningún campo comercial en `ToolRecord` — una prueba recorre las 24 fichas comprobando que no aparezca ninguno. |
| **Los afiliados nunca modifican el veredicto** | Mismo permiso ausente. `verdict` es una columna de `tools`. |
| **Los afiliados nunca modifican el ranking editorial** | `commercial_priority` sólo existe dentro de un emplazamiento y ninguna función de orden lee esas tablas. Una prueba compara el orden completo del catálogo antes y después de cargar y consultar toda la capa comercial: debe ser idéntico. |
| **Una herramienta sin afiliación no puede ser penalizada** | La puntuación se calcula a partir de `scores`, `freeModel`, `freePlan` y `openSource`. No hay término de afiliación en la fórmula, ni positivo ni negativo. Hoy ninguna ficha tiene afiliación y la puntuación cubre todo el rango. |
| **Todo enlace afiliado se puede identificar** | `disclosure_required boolean check (= true)` en SQL; `z.literal(true)` en TypeScript — el tipo tiene un solo habitante, así que `false` ni compila ni valida. El `rel` es siempre `sponsored nofollow noopener` y no es un parámetro. |
| **La web sigue funcionando si AutoCraw calla** | Los datos comerciales se leen de una instantánea versionada que hoy está vacía. `src/lib/data/affiliate.ts` **nunca lanza**: ante datos ausentes, corruptos o incoherentes devuelve lista vacía y registra el problema. Los registros caducan solos a los 60 días. |
| **AutoCraw no modifica fichas editoriales** | Sin permisos de escritura sobre ninguna tabla editorial. Sobre `tools` sólo tiene `select` de cinco columnas, porque necesita el slug para relacionar un producto. |
| **AutoCraw no tiene acceso administrativo** | Rol propio `autocraw_ingest`, no `service_role`. Sin permisos sobre `profiles`, `user_*`, `alerts`, `audit_logs`, suscripciones ni ninguna tabla de usuario. |
| **Mínimo privilegio** | Los permisos son una lista de concesiones, no de revocaciones. Añadir una tabla al esquema no amplía el rol en silencio, porque nunca hubo un `grant all` del que recortar. |

### Lo que no está impuesto por código

Merece decirse en voz alta: **nada impide que una persona con sesión de staff
apruebe un producto malo.** El sistema garantiza que lo comercial no pueda
mover lo editorial y que todo enlace vaya identificado. No garantiza buen
criterio al aprobar. Para eso está la revisión humana, y por eso es humana.

---

## 4. Permisos concretos

```sql
create role autocraw_ingest nologin;

grant usage on schema public to autocraw_ingest;

-- Lectura mínima del catálogo: lo justo para relacionar un producto.
grant select (id, slug, name, category_slug, status) on public.tools to autocraw_ingest;
grant select on public.categories to autocraw_ingest;

-- Escritura sólo sobre lo comercial.
grant select, insert, update on
  affiliate_merchants, affiliate_products, affiliate_offers,
  affiliate_links, tool_product_relations, placement_slots
to autocraw_ingest;

grant select on public.affiliate_click_events_daily to autocraw_ingest;
```

Tres ausencias deliberadas:

- **`nologin`.** El rol existe; la credencial no. Emitirla es un acto humano
  separado, el día que AutoCraw se conecte de verdad. No hay ningún secreto en
  este repositorio.
- **Sin `delete` en ninguna tabla.** Retirar algo es `status = 'inactive'`. La
  historia queda auditable y un fallo destructivo deja de ser posible.
- **Sin permisos sobre nada de usuarios.** Ni lectura.

---

## 5. Lo que AutoCraw envía

Una instantánea completa, no un flujo de cambios. Una instantánea se valida
entera, se compara con lo que hay publicado y se rechaza sin dejar el catálogo
a medio actualizar.

```jsonc
{
  "contractVersion": 1,          // distinto ⇒ se rechaza, nunca se adapta
  "generatedAt": "2026-08-07T00:00:00.000Z",
  "merchants": [], "products": [], "offers": [],
  "links": [], "relations": [], "placements": []
}
```

Validación en dos capas:

1. **Esquema** (`AutoCrawPayload`): tipos, rangos, formatos. Un precio en coma
   flotante se rechaza. Un precio sin fecha se rechaza. Un slot que el código
   no declara se rechaza.
2. **Referencial y de política** (`validatePayload`): que la oferta apunte a un
   producto y a un comerciante que existen; que el mercado de la oferta
   coincida con el del comerciante; que **el anfitrión del enlace sea el del
   comerciante declarado**; que la herramienta referida exista; y que ninguna
   fila con `source: 'autocraw'` llegue como `active`.

La comprobación del anfitrión es la que impide que un registro con aspecto
válido mande al lector a cualquier parte.

**Se ejecuta dos veces**: al ingerir y al leer. Deliberado. La ruta de
renderizado no da por hecho que la ingesta ocurrió bajo las mismas reglas que
ella aplica.

---

## 6. Ciclo de vida

```
AutoCraw escribe                    →  pending_review   (forzado por disparador)
Persona revisa en /admin/autocraw   →  active | rejected
Deja de interesar                   →  inactive
Nadie lo comprueba en 60 días       →  desaparece solo de la vista pública
Precio con más de 30 días           →  se retira el precio, no se muestra con aviso
```

El disparador `force_pending_for_agent` reescribe el estado de cualquier fila
con `source = 'autocraw'` escrita sin sesión de staff. Una política `with check`
habría bastado, pero un disparador enuncia la regla una sola vez para todo
escritor presente y futuro, y sobrevive a que alguien añada una política que se
olvide de repetirla.

Sobre la caducidad: nadie nos envía un aviso de que el tiempo ha pasado, así
que se comprueba al leer. Es lo que convierte «la web sigue funcionando si
AutoCraw deja de enviar» en algo cierto y no en una frase: lo viejo se retira
solo y las páginas que lo usaban siguen enteras.

---

## 7. Dónde puede aparecer

Las superficies son una **lista cerrada en código**
(`PLACEMENT_SLOTS`), no filas de una tabla. Añadir una superficie comercial al
sitio es un cambio de código que pasa por revisión, no algo que AutoCraw pueda
hacer insertando.

| Slot | Dónde | Máximo |
| --- | --- | ---: |
| `tool_detail_sidebar` | Ficha, lateral | 2 |
| `tool_detail_footer` | Ficha, pie | 3 |
| `guide_inline` | Guía, dentro del texto | 2 |
| `collection_footer` | Colección, pie | 3 |

Ninguna está en la portada, ni en el buscador, ni en un listado, ni en un
ranking. Hay una prueba que lo comprueba por nombre. Lo comercial aparece en
una página que alguien ha elegido abrir; nunca donde se decide qué mirar.

---

## 8. Cómo se ve

- La etiqueta **«Enlaces de afiliación» va antes de los productos**, no
  después. Alguien debe saber qué está mirando antes de mirarlo, no cuando ya
  lo ha leído como recomendación.
- Cada producto muestra **nuestra razón** para estar ahí (`rationale`, mínimo
  diez caracteres y obligatorio), no la copia publicitaria del comerciante.
- El precio va con la fecha en que se vio y con «puede haber cambiado». Si
  tiene más de 30 días **no se muestra con advertencia: se retira**. «39 € (hace
  tres meses)» no es un precio, es un recuerdo.
- El texto de divulgación es el del comerciante, palabra por palabra. No se
  genera.
- Cuando no hay nada que mostrar no se renderiza nada: ni encabezado, ni caja
  vacía, ni «aún no hay recomendaciones». Hoy eso es todas las páginas.

---

## 9. Clics: sólo agregados

`affiliate_click_events_daily` guarda `(día, enlace, slot, mercado) → nº de
clics`. No hay identificador de usuario ni de sesión, y no es un descuido
pendiente de revisar: un agregado no puede filtrar la navegación de una
persona, así que la pregunta de privacidad se responde una vez aquí en lugar de
en cada consumidor. También significa que esta tabla no necesita RLS por
usuario: no hay usuario que aislar.

---

## 10. Lo que falta para conectar

Por orden, y ninguno de estos pasos lo puede dar un agente por su cuenta:

1. Dar de alta el programa de afiliación (Amazon Associates u otro) y aceptar
   sus términos. **Acto humano.**
2. Emitir la credencial de `autocraw_ingest` con `alter role ... login password`
   contra la instancia correspondiente. **Nunca en este repositorio.**
3. Escribir el `disclosure_text` de cada comerciante conforme a lo que ese
   programa exige decir. Amazon impone una redacción concreta.
4. Publicar el endpoint de ingesta con autenticación por rol. Hoy sólo existe
   el esquema del cuerpo, a propósito: un endpoint de escritura sin nada al
   otro lado es superficie de ataque sin contrapartida.
5. Revisar la primera tanda a mano, entera.

Hasta que los cinco estén hechos, el sitio se comporta exactamente igual que si
AutoCraw no existiera. Que es, precisamente, la prueba de que la separación
funciona.
