import type { EvidenceField, Tool } from '@lib/domain/tool';
import { alcanceDe, cubreTodo, evidenciaDe, MOTIVO_LABEL, motivoDelHueco } from '@lib/domain/evidencia';
import { CAPABILITY_LABEL, FREE_MODELS, getCategory, START_EFFORT_LABEL } from '@lib/domain/taxonomy';
import { OPENNESS_LABEL } from '@lib/domain/primitives';
import { nivelDeAcceso } from '@lib/search/filters';
import { getAllTools } from '@lib/data/catalog';
import registroDeLogos from '@/data/logos.json';
import type { EstadoDeHecho, FichaMotor, Fuente, Hecho, IdDeExigencia } from './motor';

/**
 * De la ficha completa a lo que el motor necesita, con cada hecho ya traducido
 * a cumple / no cumple / con condiciones / no sabemos y con su fuente.
 *
 * Aquí, y sólo aquí, se decide de dónde sale cada afirmación. Si el campo
 * tiene su cita, se usa la cita. Si es un dato anterior a las citas por campo
 * —pasa con la mayoría de «dónde se ejecuta» y «código abierto»—, lo respaldan
 * las fuentes de la ficha y su fecha de comprobación, y se dice así: la ficha
 * enseña ese mismo dato con ese mismo respaldo, y el motor no puede ser más
 * generoso ni más tacaño que ella.
 */

/** El respaldo de la ficha entera: sus fuentes, y cuándo se comprobó su plan gratuito. */
function fuenteDeFicha(tool: Tool): Fuente {
  return { tipo: 'ficha', url: `/herramientas/${tool.slug}`, fecha: tool.freePlan.verifiedAt || tool.lastVerifiedAt };
}

function fuenteDe(tool: Tool, field: EvidenceField): Fuente {
  const ev = evidenciaDe(tool, field);
  if (ev?.outcome === 'stated') {
    return {
      tipo: 'cita',
      url: ev.sourceUrl,
      fecha: ev.checkedAt,
      cita: ev.quote,
      ...(cubreTodo(tool, ev) ? {} : { alcance: alcanceDe(ev) }),
    };
  }
  return fuenteDeFicha(tool);
}

/** El texto de un dato que no consta: de quién es el hueco, como en la ficha. */
function hueco(tool: Tool, field: EvidenceField, valor: string, dato: string): Hecho {
  const motivo = motivoDelHueco(tool, field, valor) ?? 'pendiente';
  const ev = evidenciaDe(tool, field);
  return {
    estado: 'no-sabemos',
    texto: `${dato}: ${MOTIVO_LABEL[motivo].toLowerCase()}`,
    ...(ev?.outcome === 'not_published' ? { fuente: { tipo: 'cita' as const, url: ev.sourceUrl, fecha: ev.checkedAt } } : {}),
  };
}

function hecho(tool: Tool, field: EvidenceField, estado: Exclude<EstadoDeHecho, 'no-sabemos'>, texto: string): Hecho {
  return { estado, texto, fuente: fuenteDe(tool, field) };
}

function hechosDe(tool: Tool): Record<IdDeExigencia, Hecho> {
  const { requiresCreditCard: tarjeta, requiresSignup: registro, commercialUse: comercial, hasWatermark: marca } = tool.freePlan;
  const F = {
    tarjeta: 'freePlan.requiresCreditCard',
    registro: 'freePlan.requiresSignup',
    comercial: 'freePlan.commercialUse',
    marca: 'freePlan.hasWatermark',
  } as const;

  return {
    'sin-tarjeta':
      tarjeta === 'no'
        ? hecho(tool, F.tarjeta, 'cumple', 'No pide tarjeta')
        : tarjeta === 'yes'
          ? hecho(tool, F.tarjeta, 'no-cumple', 'Pide tarjeta')
          : tarjeta === 'partial'
            ? hecho(tool, F.tarjeta, 'con-condiciones', 'La tarjeta depende de cómo lo uses')
            : hueco(tool, F.tarjeta, tarjeta, 'Tarjeta'),
    'sin-registro':
      registro === 'no'
        ? hecho(tool, F.registro, 'cumple', 'Se usa sin registrarse')
        : registro === 'yes'
          ? hecho(tool, F.registro, 'no-cumple', 'Pide registro')
          : registro === 'partial'
            ? hecho(tool, F.registro, 'con-condiciones', 'El registro depende de cómo lo uses')
            : hueco(tool, F.registro, registro, 'Registro'),
    comercial:
      comercial === 'yes'
        ? hecho(tool, F.comercial, 'cumple', 'Permite uso comercial')
        : comercial === 'no'
          ? hecho(tool, F.comercial, 'no-cumple', 'No permite uso comercial')
          : comercial === 'partial'
            ? hecho(tool, F.comercial, 'con-condiciones', 'Uso comercial con condiciones: mira la ficha')
            : hueco(tool, F.comercial, comercial, 'Uso comercial'),
    'sin-marca':
      marca === 'no'
        ? hecho(tool, F.marca, 'cumple', 'Sin marca de agua que se vea o se oiga')
        : marca === 'yes'
          ? hecho(tool, F.marca, 'no-cumple', 'Pone marca de agua')
          : marca === 'partial'
            ? hecho(tool, F.marca, 'con-condiciones', 'Marca de agua en parte de lo que genera')
            : hueco(tool, F.marca, marca, 'Marca de agua'),
    'en-local':
      tool.hosting === 'local'
        ? hecho(tool, 'hosting', 'cumple', 'Funciona en tu equipo')
        : tool.hosting === 'hybrid'
          ? hecho(tool, 'hosting', 'cumple', 'Funciona en tu equipo o en la nube')
          : hecho(tool, 'hosting', 'no-cumple', 'Sólo en la nube'),
    abierto:
      tool.openSource === 'yes'
        ? hecho(tool, 'openSource', 'cumple', 'Código abierto')
        : tool.openSource === 'no'
          ? hecho(tool, 'openSource', 'no-cumple', 'Código cerrado')
          : tool.openSource === 'partial' || tool.openSource === 'weights'
            ? hecho(tool, 'openSource', 'con-condiciones', `${OPENNESS_LABEL[tool.openSource]}: mira la licencia en la ficha`)
            : hueco(tool, 'openSource', tool.openSource, 'Código abierto'),
  };
}

function accesoDe(tool: Tool): string {
  if (tool.freeModel === 'credits' && tool.freePlan.creditReset === 'one_off') return 'Créditos gratis de una sola vez';
  return FREE_MODELS.find((m) => m.id === tool.freeModel)?.label ?? 'Sin comprobar';
}

const LOGOS = registroDeLogos as Record<string, { ruta: string }>;

let catalogo: FichaMotor[] | null = null;

/** Las del catálogo, construidas una vez por proceso: el catálogo no cambia sin desplegar. */
export function fichasDelCatalogo(): FichaMotor[] {
  catalogo ??= construirFichasMotor(getAllTools());
  return catalogo;
}

export function construirFichasMotor(tools: readonly Tool[]): FichaMotor[] {
  return tools.map((tool) => {
    const logo = LOGOS[tool.slug]?.ruta ?? tool.logo;
    return {
      slug: tool.slug,
      nombre: tool.name,
      vertical: getCategory(tool.categorySlug)?.name ?? tool.categorySlug,
      ...(logo ? { logo } : {}),
      nivel: nivelDeAcceso(tool),
      acceso: accesoDe(tool),
      esfuerzo: tool.startEffort,
      esfuerzoTexto: START_EFFORT_LABEL[tool.startEffort],
      plataformas: tool.platforms,
      verificacion: tool.verification,
      revisada: tool.lastVerifiedAt,
      capacidades: tool.capabilities,
      incluye: tool.freePlan.includedCapabilities.map((i) => ({
        capacidad: i.capability,
        etiqueta: CAPABILITY_LABEL[i.capability] ?? i.capability,
        ...(i.condition ? { condicion: i.condition } : {}),
        fuente: {
          tipo: 'cita' as const,
          url: i.evidence.sourceUrl,
          fecha: i.evidence.checkedAt,
          cita: i.evidence.quote,
          ...(cubreTodo(tool, { ...i.evidence, field: 'capabilities' }) ? {} : { alcance: alcanceDe({ ...i.evidence, field: 'capabilities' }) }),
        },
      })),
      excluye: tool.freePlan.excludedCapabilities,
      ...(tool.freePlan.creditsAmount ? { cuota: tool.freePlan.creditsAmount } : {}),
      limites: tool.freePlan.limits.slice(0, 2),
      fuenteLimites: fuenteDe(tool, 'freePlan.limits'),
      hechos: hechosDe(tool),
    };
  });
}
