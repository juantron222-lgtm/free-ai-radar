# Estrategia de producto

**Fecha:** 3 de agosto de 2026

---

## 1. El problema

Busca «mejores herramientas de IA gratis» y salen cientos de listas. Comparten los mismos defectos:

- copian la descripción del fabricante;
- llaman «gratis» a una prueba de siete días;
- no dicen que hace falta tarjeta;
- no mencionan la marca de agua;
- nunca aclaran si puedes usar el resultado para trabajar;
- muchas están ordenadas por quién paga más comisión.

El coste para el lector no es sólo tiempo. Es empezar un proyecto sobre una herramienta que a mitad
resulta no permitir uso comercial, o encontrarse un cargo de 39 € de una prueba autorrenovada.

**Free AI Radar existe para responder una pregunta concreta: «¿esto es gratis de verdad, y con qué
letra pequeña?»**

---

## 2. Usuarios

| Perfil | Qué necesita | Qué le hace volver |
| --- | --- | --- |
| **Creador / freelance** | Generar imagen, vídeo o voz sin marca de agua y con derecho comercial | Enterarse cuando su herramienta recorta el plan gratuito |
| **Desarrollador indie** | APIs con capa gratuita permanente, sin tarjeta | Cambios de límites y de precios |
| **Usuario con GPU** | Qué se puede ejecutar en local y con qué requisitos | Nuevos modelos y herramientas locales |
| **Pyme sin presupuesto** | Qué se puede hacer sin contratar nada | Comparativas y colecciones por caso de uso |

El denominador común no es «descubrir herramientas nuevas». Es **no llevarse un disgusto**.

---

## 3. La propuesta de valor, en una frase

> Verificamos herramienta por herramienta qué es gratis de verdad, con qué límites, si piden tarjeta,
> si dejan marca de agua y si puedes usar el resultado para trabajar. Y decimos «no lo sé» cuando no
> lo sabemos.

Lo último es lo que nadie más hace y lo que hace creíble a todo lo demás.

---

## 4. Qué se conserva de la v1

- El criterio editorial y el ángulo de honestidad.
- Los campos duros: tarjeta, marca de agua, uso comercial, open source, local.
- La puntuación con componentes explicados.
- Las 22 fichas y el contenido de ComfyUI.

## 5. Qué se cambió y por qué

| Problema v1 | Cambio |
| --- | --- |
| Nada da motivo para volver | Registro de cambios público, alertas, cuentas |
| Newsletter con `alert()` | Doble opt-in real con Resend, baja en un clic |
| Filtros que se pisan, sin URL | Filtros combinables con estado en la URL |
| Sin categorías como ruta | 17 categorías con página propia y FAQ generada de datos reales |
| Sin comparador | Comparador de 2–4 con URL compartible e indexable |
| Canónico al dominio de preview | Dominio real en una sola constante, verificado por test |
| Sin monetización | Radar Pro, afiliación transparente, patrocinios etiquetados |
| Sin cuentas | Auth, favoritos, listas, alertas, exportación, borrado |

---

## 6. El bucle de retorno

Este es el corazón del producto y lo que la v1 no tenía.

```
   Un plan gratuito cambia
            │
            ▼
   Lo detectamos o nos lo reportan
            │
            ▼
   Entra en /cambios (público)  ──▶ RSS ──▶ tráfico recurrente
            │
            ▼
   Alerta a quien sigue esa herramienta
            │
            ▼
   Vuelve al sitio ──▶ ve el cambio ──▶ compara alternativas
            │
            ▼
   Guarda la alternativa ──▶ activa otra alerta
```

Un directorio estático se visita una vez. Un sistema de seguimiento de cambios se visita cada vez
que algo cambia — y en este sector algo cambia todas las semanas.

---

## 7. Qué justifica crear una cuenta

Nada del **contenido** está detrás de la cuenta. Eso es deliberado: un muro de pago en una web sobre
lo que es gratis sería una contradicción, y además destruiría el SEO.

La cuenta sirve para lo que se guarda:

- favoritos y listas por proyecto o cliente;
- marcar «ya probada» y no volver a evaluar dos veces;
- alertas de cambio;
- comparaciones guardadas;
- selección semanal según intereses.

## 8. Qué justifica pagar

Radar Pro no bloquea contenido. Vende **inmediatez, volumen y seguimiento**:

| Gratis | Radar Pro |
| --- | --- |
| Todo el catálogo y las fichas | Igual |
| Búsqueda y filtros | Igual + filtros avanzados y exportación |
| Comparador | Igual + comparaciones guardadas |
| 3 listas, 5 alertas | Ilimitadas |
| Avisos en el resumen semanal | Avisos en el momento de detectarlo |
| Historial reciente | Historial completo por herramienta |
| Con publicidad | Sin publicidad |

El público de Pro es quien **depende profesionalmente** de que un plan gratuito siga siéndolo. Para
esa persona, enterarse el mismo día en vez de la semana siguiente vale más de 5 €/mes.

---

## 9. Prioridades de contenido para SEO

Ordenadas por relación entre demanda y esfuerzo:

1. **Colecciones por condición** (`/colecciones/sin-tarjeta`, `/uso-comercial`, `/en-local`). Alta
   intención, poca competencia bien hecha, y se mantienen solas porque son reglas sobre datos.
2. **Categorías** (`/categorias/*`). Volumen medio, 17 páginas con FAQ generada de datos verificados.
3. **Comparativas** (`/comparar?t=a,b`). Intención altísima («X vs Y»), indexables sólo cuando
   tienen contenido.
4. **Fichas** (`/herramientas/*`). Long tail de marca: «¿X es gratis?».
5. **Guías**. Mayor esfuerzo, mayor autoridad.
6. **Cambios**. Poco volumen de búsqueda, mucha retención y suscripciones.

---

## 10. Qué se decidió no hacer

| Idea | Por qué no, todavía |
| --- | --- |
| Versión en inglés | Multiplica el coste de verificación por dos. El `hreflang` está preparado; la decisión es de negocio. |
| Reseñas de usuarios | Sin volumen, se llenan de spam y de los propios fabricantes. Se sustituye por «¿sigue siendo correcta?». |
| API pública | No hay demanda demostrada. |
| Colecciones de equipo | Requiere modelo de organizaciones. Anotado para más adelante. |
| Anuncios en la ficha | Degradan justo la página que sostiene la credibilidad. |

---

## 11. Métricas que importan

**De salud editorial** (van primero a propósito):

- fichas fuera de plazo de verificación → objetivo: 0;
- correcciones sin resolver → objetivo: < 5 y ninguna con más de 7 días;
- campos `unverified` → tendencia a la baja.

**De producto:**

- visitantes recurrentes semanales;
- alertas creadas por usuario;
- comparaciones por sesión;
- clics salientes por ficha vista.

**De negocio:**

- conversión a cuenta y a Pro;
- confirmación del boletín;
- ingresos por afiliación, siempre declarados.

**Ninguna métrica se persigue con dark patterns.** Sin muros de consentimiento sesgados, sin
suscripción por defecto, sin baja escondida, sin puntuaciones infladas para aumentar clics.

---

## 12. Riesgo principal

**Que el catálogo envejezca.** 22 fichas bien verificadas valen más que 500 desactualizadas, pero
22 fichas desactualizadas no valen nada y destruyen la única ventaja del proyecto.

Por eso la caducidad de los datos es visible en la propia ficha, la lista de fichas atrasadas se
publica en `/cambios`, y el panel de administración pone esa cola por delante de todo lo demás.

Es incómodo a propósito.
