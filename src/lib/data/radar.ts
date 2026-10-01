import type { Tool } from '@lib/domain/tool';
import { VERTICALES } from './home';
import { DEFAULT_SORT, nivelDeAcceso, sortTools } from '@lib/search/filters';

/**
 * El radar de la portada: el catálogo entero, colocado por lo que cuesta usarlo.
 *
 * La marca se llama Radar y la portada no enseñaba ninguno. Esto no es un
 * adorno con forma de radar: cada punto es una ficha, su sector es su clase de
 * IA y su distancia al centro es lo que hay que hacer para usarla sin pagar.
 * Quien lo mira ve de un vistazo lo que ningún listado le dice —que en Imagen
 * casi todo se usa gratis desde el navegador y que en Modelos casi todo hay
 * que instalarlo— sin leer una sola fila.
 *
 * No añade ningún dato. El sector sale de la categoría de la ficha, con la
 * misma pertenencia que usa el resto de la portada (`VERTICALES`), y el anillo
 * de dos campos que ya decide el orden del catálogo: `nivelDeAcceso` y
 * `startEffort`. Lo que no cae en ninguna de las seis clases va a «Otras» en
 * vez de desaparecer, para que el recuento cierre con el catálogo.
 */

export type AnilloId = 'web' | 'instalar' | 'prueba' | 'pago';

export interface Anillo {
  id: AnilloId;
  /** Cómo se dice en la leyenda, en plural y sin cifra. */
  etiqueta: string;
  /** Radio interior y exterior, en unidades del dibujo (el borde está en `RADIO`). */
  desde: number;
  hasta: number;
}

/** Radio del círculo exterior, en unidades del `viewBox`. */
export const RADIO = 200;
/** Margen alrededor del círculo, donde van los nombres de los sectores. */
export const MARGEN = 30;
/** Hueco del centro: ahí no cabe un punto sin pisar a los de al lado. */
const HUECO = 24;

/**
 * Del centro hacia fuera, en el orden en que sube la cuesta.
 *
 * Los dos anillos gratuitos se llevan casi todo el radio porque llevan casi
 * todo el catálogo; los de fuera son estrechos porque son pocos. Un anillo con
 * el mismo ancho para 5 fichas que para 53 dibujaría aire.
 */
export const ANILLOS: readonly Anillo[] = [
  { id: 'web', etiqueta: 'Gratis, desde el navegador', desde: HUECO, hasta: 108 },
  { id: 'instalar', etiqueta: 'Gratis, instalándolas o con conocimientos técnicos', desde: 108, hasta: 162 },
  { id: 'prueba', etiqueta: 'Sólo prueba, créditos que no se renuevan o sin comprobar', desde: 162, hasta: 181 },
  { id: 'pago', etiqueta: 'De pago', desde: 181, hasta: RADIO },
];

/**
 * Los sectores, en el orden de las puertas de la primera pantalla.
 *
 * Así el radar y las seis puertas que tiene al lado se leen en el mismo orden,
 * y señalar una puerta ilumina el sector que le corresponde.
 */
export const SECTORES = [
  { id: 'imagen', etiqueta: 'Imagen' },
  { id: 'video', etiqueta: 'Vídeo' },
  { id: 'audio', etiqueta: 'Audio' },
  { id: 'agentes', etiqueta: 'Agentes' },
  { id: 'modelos', etiqueta: 'Modelos' },
  { id: 'codigo', etiqueta: 'Código' },
  { id: 'otras', etiqueta: 'Otras' },
] as const;

export type SectorId = (typeof SECTORES)[number]['id'];

/**
 * La clase de una ficha: su categoría principal manda.
 *
 * Canva es «Diseño» y también imagen; n8n es «Automatización» y también
 * agentes. Si la principal no es de ninguna de las seis, decide la primera
 * secundaria que sí lo sea. Si ninguna lo es —ChatGPT, Ollama—, «Otras».
 */
export function sectorDe(tool: Tool): SectorId {
  const de = (categoria: string) => VERTICALES.find((v) => (v.slugs as readonly string[]).includes(categoria))?.id;
  return de(tool.categorySlug) ?? tool.secondaryCategories.map(de).find(Boolean) ?? 'otras';
}

/**
 * Lo que cuesta usarla, en cuatro escalones. `null` si está retirada.
 *
 * Una retirada no está en el radar: no se puede usar ni pagando.
 */
export function anilloDe(tool: Tool): AnilloId | null {
  const nivel = nivelDeAcceso(tool);
  if (nivel === 4) return null;
  if (nivel === 3) return 'pago';
  if (nivel !== 0) return 'prueba';
  return tool.startEffort === 'instant' || tool.startEffort === 'signup' ? 'web' : 'instalar';
}

export interface Punto {
  slug: string;
  nombre: string;
  sector: SectorId;
  anillo: AnilloId;
  x: number;
  y: number;
  /** Ángulo desde las doce, en sentido horario, de 0 a 1: cuándo lo alcanza el barrido. */
  vuelta: number;
}

export interface Sector {
  id: SectorId;
  etiqueta: string;
  /** Ángulos del sector en grados, con 0 a las tres y sentido horario (el de SVG). */
  desde: number;
  hasta: number;
  puntos: Punto[];
  recuento: Record<AnilloId, number>;
}

export interface Radar {
  sectores: Sector[];
  recuento: Record<AnilloId, number>;
  /** Cuántas fichas hay en el radar. */
  total: number;
  /** Cuántas se quedan fuera por retiradas. */
  retiradas: number;
}

const rad = (grados: number) => (grados * Math.PI) / 180;
const redondea = (n: number) => Math.round(n * 10) / 10;
const vacio = (): Record<AnilloId, number> => ({ web: 0, instalar: 0, prueba: 0, pago: 0 });

/** Separación mínima, en unidades del dibujo, entre el borde de una celda y un punto. */
const RELLENO = 7;

/**
 * Coloca `n` puntos en una celda (un sector por un anillo) sin que se pisen.
 *
 * Capas concéntricas, tantas como pida la forma de la celda, y a cada capa
 * tantos puntos como le toquen por su longitud: la de fuera es más larga y
 * se lleva más. Los puntos llegan ya ordenados —lo más fácil primero— y se
 * reparten de dentro afuera, así que dentro de su anillo lo que antes se
 * puede usar también queda más cerca del centro.
 */
function colocar(n: number, a0: number, a1: number, r0: number, r1: number): Array<{ r: number; a: number }> {
  if (n === 0) return [];
  const margenAngular = (RELLENO / ((r0 + r1) / 2)) * (180 / Math.PI);
  const desde = a0 + margenAngular;
  const hasta = a1 - margenAngular;
  const fondo = Math.max(0, r1 - r0 - 2 * RELLENO);
  const largoMedio = rad(hasta - desde) * ((r0 + r1) / 2);

  const capasMax = Math.max(1, Math.floor(fondo / 13) + 1);
  const capas = Math.min(capasMax, Math.max(1, Math.round(Math.sqrt((n * fondo) / Math.max(largoMedio, 1)))));
  const radios = Array.from({ length: capas }, (_, j) =>
    capas === 1 ? (r0 + r1) / 2 : r0 + RELLENO + (fondo * j) / (capas - 1)
  );

  // Cuántos por capa, proporcional al largo de cada una, y que sumen n.
  const suma = radios.reduce((s, r) => s + r, 0);
  const cuantos = radios.map((r) => Math.floor((n * r) / suma));
  let faltan = n - cuantos.reduce((s, c) => s + c, 0);
  for (let j = capas - 1; faltan > 0; j = (j - 1 + capas) % capas) {
    cuantos[j]!++;
    faltan--;
  }

  const out: Array<{ r: number; a: number }> = [];
  radios.forEach((r, j) => {
    const k = cuantos[j]!;
    for (let i = 0; i < k; i++) {
      out.push({ r, a: desde + ((i + 0.5) * (hasta - desde)) / k });
    }
  });
  return out;
}

export function radarDe(tools: readonly Tool[]): Radar {
  const paso = 360 / SECTORES.length;
  // El primer sector queda centrado a las doce.
  const inicio = -90 - paso / 2;
  const ordenadas = sortTools([...tools], DEFAULT_SORT);

  const recuento = vacio();
  let retiradas = 0;

  const sectores: Sector[] = SECTORES.map((s, i) => ({
    id: s.id,
    etiqueta: s.etiqueta,
    desde: inicio + i * paso,
    hasta: inicio + (i + 1) * paso,
    puntos: [],
    recuento: vacio(),
  }));

  const celdas = new Map<string, Tool[]>();
  for (const tool of ordenadas) {
    const anillo = anilloDe(tool);
    if (!anillo) {
      retiradas++;
      continue;
    }
    const sector = sectorDe(tool);
    const clave = `${sector}|${anillo}`;
    celdas.set(clave, [...(celdas.get(clave) ?? []), tool]);
  }

  for (const sector of sectores) {
    for (const anillo of ANILLOS) {
      const lista = celdas.get(`${sector.id}|${anillo.id}`) ?? [];
      const sitios = colocar(lista.length, sector.desde, sector.hasta, anillo.desde, anillo.hasta);
      lista.forEach((tool, i) => {
        const { r, a } = sitios[i]!;
        sector.puntos.push({
          slug: tool.slug,
          nombre: tool.name,
          sector: sector.id,
          anillo: anillo.id,
          x: redondea(r * Math.cos(rad(a))),
          y: redondea(r * Math.sin(rad(a))),
          vuelta: Math.round((((a + 90 + 360) % 360) / 360) * 1000) / 1000,
        });
      });
      sector.recuento[anillo.id] = lista.length;
      recuento[anillo.id] += lista.length;
    }
  }

  const total = Object.values(recuento).reduce((s, n) => s + n, 0);
  return { sectores, recuento, total, retiradas };
}

/** Un arco de circunferencia como trazado SVG, para escribir encima. */
export function arco(radio: number, desde: number, hasta: number, alReves = false): string {
  const p = (a: number) => `${redondea(radio * Math.cos(rad(a)))} ${redondea(radio * Math.sin(rad(a)))}`;
  return alReves
    ? `M ${p(hasta)} A ${radio} ${radio} 0 0 0 ${p(desde)}`
    : `M ${p(desde)} A ${radio} ${radio} 0 0 1 ${p(hasta)}`;
}

/** Un sector entero, del centro al borde, como trazado SVG. */
export function cuna(radio: number, desde: number, hasta: number): string {
  const p = (a: number) => `${redondea(radio * Math.cos(rad(a)))} ${redondea(radio * Math.sin(rad(a)))}`;
  return `M 0 0 L ${p(desde)} A ${radio} ${radio} 0 0 1 ${p(hasta)} Z`;
}

/** Un radio (la línea que separa dos sectores). */
export function radioEn(angulo: number, desde: number, hasta: number): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: redondea(desde * Math.cos(rad(angulo))),
    y1: redondea(desde * Math.sin(rad(angulo))),
    x2: redondea(hasta * Math.cos(rad(angulo))),
    y2: redondea(hasta * Math.sin(rad(angulo))),
  };
}
