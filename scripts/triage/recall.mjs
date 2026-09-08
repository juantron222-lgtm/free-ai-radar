/**
 * Qué merece leerse, que no es lo mismo que qué merece publicarse.
 *
 * El triaje puntúa titulares sin haber abierto la página. Hasta ahora sólo se
 * leían los que pasaban de 80, y esa línea hacía dos trabajos a la vez: decidir
 * qué se investiga y, de hecho, decidir qué podía llegar a publicarse — porque
 * lo que no se lee no se verifica, y lo que no se verifica no se publica nunca.
 *
 * Se auditaron 38 candidatas leyendo su fuente primaria, y el corte resultó no
 * predecir nada:
 *
 *   banda    leídas   verificadas y redactadas
 *   80+           5   2   (40 %)
 *   75-79        11   2   (18 %)
 *   70-74        22  12   (55 %)
 *
 * La banda que el corte descartaba entera era la mejor de las tres. El motivo
 * es que la puntuación premia titulares de fabricantes grandes, y los grandes
 * son justo los que peor se dejan leer: OpenAI devuelve 403 y sólo queda su
 * feed, y los posts de comunidad de Hugging Face puntúan alto sin sostener
 * ninguna afirmación citable. Un 70 de Runway se lee entero; un 100 de OpenAI
 * no se lee.
 *
 * Lo que este módulo hace es sustituir la línea rígida por un presupuesto:
 * primero todo lo que el triaje promociona, después lo mejor de la banda de
 * recall hasta agotar lo que una pasada puede permitirse. Lo que **no** hace es
 * tocar la puerta de publicación: de los 16 borradores de aquella auditoría,
 * `canAutoPublish` dejó pasar exactamente uno. Ampliar lo que se lee no amplía
 * lo que se publica — amplía lo que llega a la mesa con evidencia detrás.
 */

/** Desde dónde merece la pena abrir la página. Por debajo, el titular no da. */
export const UMBRAL_INVESTIGACION = 70;

/**
 * Cuántas historias lee una pasada como mucho.
 *
 * No es una cuota que haya que llenar: es el techo de un presupuesto. Verificar
 * cuesta una mediana de 4,3 segundos y un p90 de 15 —el tope de la descarga—,
 * así que el límite real lo pone el reloj de la función y esto sólo evita que
 * un día con mucho material intente leerlo todo.
 */
export const PRESUPUESTO_POR_PASADA = 24;

/**
 * Cuántas de un mismo fabricante entran en la banda de recall.
 *
 * En la auditoría, Together publicó seis comparativas «X vs Y en DeepSWE» el
 * mismo día. Las seis se verificaban y las seis se redactaban; ninguna se
 * publicaba, porque son de modelos ajenos y el alcance las degrada. Sin este
 * tope se habrían comido la cuarta parte del presupuesto para no publicar nada.
 *
 * No se aplica a lo que el triaje promociona: si un fabricante saca cinco cosas
 * de 80 el mismo día, eso es un día grande de ese fabricante, no ruido.
 */
export const MAX_POR_FABRICANTE = 3;

/** Clases de evento que suelen sostener una noticia, y cuánto pesan. */
const IMPACTO = {
  lanzamiento: 12,
  'disponibilidad-general': 12,
  disponibilidad: 12,
  retirada: 10,
  precio: 8,
  'preview-beta': 6,
  actualizacion: 2,
};

/**
 * Cuánto merece la pena leer esta historia hoy.
 *
 * Los cuatro criterios, y por qué cada uno:
 *
 *   frescura   `canAutoPublish` exige 21 días o menos, así que leer algo de
 *              hace dos meses puede llenar la mesa pero no puede publicar nada
 *              sin que una persona lo mire. Se prefiere lo reciente, con un
 *              salto claro dentro de esa ventana.
 *   impacto    un lanzamiento o una disponibilidad general cambian lo que un
 *              lector puede usar; una actualización menor casi nunca.
 *   novedad    un producto que no ha aparecido ya en esta misma selección.
 *              Cinco notas sobre el mismo modelo no son cinco noticias.
 *   fabricante entra por el tope de arriba, no por preferir a unos sobre
 *              otros: ordenar fabricantes por prestigio sería exactamente el
 *              sesgo que la auditoría desmiente.
 */
export function prioridad(registro, { hoy, productosVistos = new Set() } = {}) {
  let puntos = 0;

  const dia = registro.publishedAt;
  if (dia) {
    const edad = Math.floor((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / 86_400_000);
    puntos += Math.max(0, 30 - Math.max(0, edad));
    /* Dentro de la ventana en la que la puerta automática aún puede decir sí. */
    if (edad >= 0 && edad <= 21) puntos += 15;
  }

  puntos += IMPACTO[registro.eventClass] ?? 0;

  if (registro.product && productosVistos.has(registro.product)) puntos -= 12;

  /* La puntuación del triaje desempata, pero no manda: eso es lo que se corrige. */
  puntos += (Number(registro.triageScore) || 0) / 20;

  return puntos;
}

/**
 * Reordena para que dos historias seguidas no sean del mismo fabricante.
 *
 * La verificación se ejecuta en paralelo, y sin esto varias peticiones
 * simultáneas caerían sobre el mismo servidor. Repartirlas es la diferencia
 * entre leer a un fabricante y castigarlo.
 */
export function intercalarPorFabricante(lista) {
  const grupos = new Map();
  for (const x of lista) {
    const clave = x.publisher ?? '';
    grupos.set(clave, [...(grupos.get(clave) ?? []), x]);
  }

  const salida = [];
  let quedan = true;
  while (quedan) {
    quedan = false;
    for (const cola of grupos.values()) {
      const siguiente = cola.shift();
      if (siguiente) {
        salida.push(siguiente);
        quedan = quedan || cola.length > 0;
      }
    }
  }
  return salida;
}

/**
 * Qué se lee en esta pasada.
 *
 * Dos tramos y en este orden. Primero **todo** lo que el triaje promociona: eso
 * no se recorta ni aunque llene el presupuesto, porque es la decisión editorial
 * que ya estaba tomada. Después la banda de recall, ordenada por lo de arriba,
 * hasta llenar lo que quede.
 */
export function seleccionarParaInvestigar(
  triaje,
  {
    hoy,
    yaVerificados = new Set(),
    presupuesto = PRESUPUESTO_POR_PASADA,
    maxPorFabricante = MAX_POR_FABRICANTE,
    umbral = UMBRAL_INVESTIGACION,
  } = {}
) {
  const pendiente = (r) => !yaVerificados.has(r.id);

  const promovidas = triaje.filter((r) => r.triageDecision === 'promote' && pendiente(r));

  const candidatasRecall = triaje
    .filter((r) => r.triageDecision !== 'promote' && pendiente(r) && Number(r.triageScore) >= umbral)
    .map((r) => ({ r, p: 0 }));

  /*
   * La novedad se calcula mientras se elige, no antes: si dos historias hablan
   * del mismo producto, la segunda vale menos *porque* ya se eligió la primera.
   */
  const productosVistos = new Set(promovidas.map((r) => r.product).filter(Boolean));
  const porFabricante = new Map();
  const recall = [];

  const hueco = Math.max(0, presupuesto - promovidas.length);

  while (recall.length < hueco) {
    let mejor = null;
    let mejorPuntos = -Infinity;

    for (const entrada of candidatasRecall) {
      if (entrada.elegida) continue;
      const fabricante = entrada.r.publisher ?? '';
      if ((porFabricante.get(fabricante) ?? 0) >= maxPorFabricante) continue;

      const puntos = prioridad(entrada.r, { hoy, productosVistos });
      if (puntos > mejorPuntos) {
        mejorPuntos = puntos;
        mejor = entrada;
      }
    }

    if (!mejor) break;

    mejor.elegida = true;
    recall.push(mejor.r);
    if (mejor.r.product) productosVistos.add(mejor.r.product);
    const fabricante = mejor.r.publisher ?? '';
    porFabricante.set(fabricante, (porFabricante.get(fabricante) ?? 0) + 1);
  }

  return {
    /* Las promocionadas primero, siempre: el presupuesto recorta el recall. */
    seleccionadas: [...promovidas, ...intercalarPorFabricante(recall)],
    promovidas,
    recall,
    /* Cuántas quedaron en la banda sin sitio: el coste de este presupuesto. */
    sinSitio: candidatasRecall.filter((e) => !e.elegida).length,
  };
}

/**
 * En qué banda cae una puntuación. Sólo para el informe.
 *
 * Sirve para poder responder «¿de dónde salió lo que se publicó?» pasada a
 * pasada, que es lo único que dirá si esta política fue buena idea.
 */
export function banda(score) {
  const n = Number(score) || 0;
  if (n >= 80) return '80+';
  if (n >= 75) return '75-79';
  if (n >= 70) return '70-74';
  return '<70';
}
