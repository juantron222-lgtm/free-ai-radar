/**
 * Los datos del titular del sitio, que sólo puede aportar él.
 *
 * Términos y Privacidad se publicaban con un aviso de «borrador pendiente de
 * revisión jurídica» encima de todo el texto, y ninguna página identificaba a
 * quien presta el servicio. Lo segundo no se arregla redactando: nombre, NIF y
 * domicilio son hechos, y un sitio cuya regla es no inventar hechos no puede
 * empezar por los suyos.
 *
 * Así que aquí van vacíos. Cada campo sin valor se pinta en la página como un
 * hueco marcado —«Pendiente · lo aporta el titular»— y una prueba lista los que
 * faltan. Rellenarlos es cambiar `null` por el dato: las páginas no se tocan.
 *
 * Esto no sustituye la revisión jurídica de los textos; sólo evita que el
 * primer dato de cada página sea inventado o esté ausente sin decirlo.
 */
export interface CampoTitular {
  etiqueta: string;
  valor: string | null;
  /** Por qué hace falta, para quien lo rellene. */
  porQue: string;
  /** Si la página no puede darse por terminada sin él. */
  obligatorio: boolean;
}

export const TITULAR: Record<'nombre' | 'nif' | 'domicilio' | 'registro' | 'dpo', CampoTitular> = {
  nombre: {
    etiqueta: 'Nombre y apellidos o razón social',
    valor: null,
    porQue:
      'Identifica a quien presta el servicio (LSSI-CE, art. 10) y a quien responde del tratamiento de datos (RGPD, art. 13).',
    obligatorio: true,
  },
  nif: {
    etiqueta: 'NIF',
    valor: null,
    porQue: 'LSSI-CE, art. 10.',
    obligatorio: true,
  },
  domicilio: {
    etiqueta: 'Domicilio',
    valor: null,
    porQue: 'LSSI-CE, art. 10, y RGPD, art. 13.',
    obligatorio: true,
  },
  registro: {
    etiqueta: 'Datos de inscripción registral',
    valor: null,
    porQue: 'Sólo si el titular es una sociedad inscrita en un registro público.',
    obligatorio: false,
  },
  dpo: {
    etiqueta: 'Contacto del delegado de protección de datos',
    valor: null,
    porQue: 'Sólo si el tratamiento obliga a designarlo (RGPD, art. 37).',
    obligatorio: false,
  },
};

export type ClaveTitular = keyof typeof TITULAR;

/** Los campos que todavía no tienen dato, para listarlos donde haga falta. */
export function camposPendientes(soloObligatorios = false): ClaveTitular[] {
  return (Object.keys(TITULAR) as ClaveTitular[]).filter((clave) => {
    const campo = TITULAR[clave];
    return !campo.valor && (!soloObligatorios || campo.obligatorio);
  });
}
