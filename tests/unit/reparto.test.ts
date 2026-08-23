import { describe, expect, it } from 'vitest';
import type { Tool } from '@lib/domain/tool';
import { getAllTools } from '@lib/data/catalog';
import { MAX_COMPLETAS, repartirBloques, type BloqueDeclarado } from '@lib/data/category-page';

/**
 * Una tarjeta completa por herramienta y vertical.
 *
 * El problema estaba medido: /modelos renderizaba 78 tarjetas para 19 modelos
 * y /agentes 69 para 24, porque la misma ficha responde a varias intenciones y
 * cada bloque volvía a pintar sus 280 px. En móvil eso eran 27.000 px de
 * página. Los bloques por intención son de lo mejor del producto —contestan
 * «cuál para qué»—; lo que sobraba era repetir la tarjeta entera.
 */

const tools = getAllTools().slice(0, 12);

function bloque(id: string, lista: readonly Tool[], motivo = () => 'porque sí'): BloqueDeclarado {
  return { id, titulo: id, lede: '', lista, motivo };
}

describe('el reparto de tarjetas', () => {
  it('la misma herramienta no lleva dos tarjetas completas', () => {
    const repartidos = repartirBloques([
      bloque('a', tools.slice(0, 4)),
      bloque('b', tools.slice(0, 4)),
      bloque('c', tools.slice(2, 6)),
    ]);

    const conTarjeta = repartidos.flatMap((b) => b.completas.map((t) => t.slug));
    expect(new Set(conTarjeta).size, conTarjeta.join(', ')).toBe(conTarjeta.length);
  });

  it('lo repetido baja a mención, no desaparece', () => {
    const repartidos = repartirBloques([bloque('a', tools.slice(0, 3)), bloque('b', tools.slice(0, 3))]);
    expect(repartidos[1]!.completas).toEqual([]);
    expect(repartidos[1]!.compactas.map((t) => t.slug)).toEqual(tools.slice(0, 3).map((t) => t.slug));
  });

  it('la mención sabe dónde está su tarjeta', () => {
    const repartidos = repartirBloques([bloque('primero', tools.slice(0, 2)), bloque('segundo', tools.slice(0, 2))]);
    for (const tool of repartidos[1]!.compactas) {
      expect(repartidos[1]!.anclas.get(tool.slug), tool.slug).toBe('primero');
    }
  });

  it('el primer bloque que la reclama se la queda', () => {
    const repartidos = repartirBloques([bloque('a', [tools[0]!]), bloque('b', [tools[0]!])]);
    expect(repartidos[0]!.completas.map((t) => t.slug)).toEqual([tools[0]!.slug]);
    expect(repartidos[1]!.completas).toEqual([]);
  });

  it('ningún bloque pinta más tarjetas de las que caben de un vistazo', () => {
    const repartidos = repartirBloques([bloque('a', tools)]);
    expect(repartidos[0]!.completas.length).toBe(MAX_COMPLETAS);
    expect(repartidos[0]!.compactas.length).toBe(tools.length - MAX_COMPLETAS);
  });

  it('respeta lo que ya venía con tarjeta de fuera del reparto', () => {
    const repartidos = repartirBloques([bloque('a', tools.slice(0, 3))], [tools[0]!.slug]);
    expect(repartidos[0]!.completas.map((t) => t.slug)).not.toContain(tools[0]!.slug);
    expect(repartidos[0]!.compactas.map((t) => t.slug)).toContain(tools[0]!.slug);
  });

  it('nada se pierde: cada ficha del bloque sale entera o mencionada', () => {
    const repartidos = repartirBloques([bloque('a', tools.slice(0, 4)), bloque('b', tools.slice(2, 8))]);
    for (const b of repartidos) {
      const salen = [...b.completas, ...b.compactas].map((t) => t.slug).sort();
      expect(salen).toEqual(b.lista.map((t) => t.slug).sort());
    }
  });

  it('la mención conserva el motivo de SU bloque, no el del anterior', () => {
    /*
     * Es lo que separa comprimir de amputar. Una lista de nombres contesta
     * «cuáles»; el motivo contesta «por qué ésa para esto», que es la razón de
     * ser de los bloques por intención.
     */
    const repartidos = repartirBloques([
      bloque('a', tools.slice(0, 2), () => 'motivo de A'),
      bloque('b', tools.slice(0, 2), () => 'motivo de B'),
    ]);
    for (const tool of repartidos[1]!.compactas) {
      expect(repartidos[1]!.motivo(tool)).toBe('motivo de B');
    }
  });
});

describe('los bloques dicen cosas distintas', () => {
  it('ningún bloque queda vacío después de repartir', () => {
    /*
     * Si un bloque acaba sin tarjetas *y* sin menciones es que estaba contenido
     * entero en otro y no aportaba nada: hay que rehacer su criterio o
     * retirarlo, no dejarlo como un titular hueco.
     */
    const repartidos = repartirBloques([
      bloque('a', tools.slice(0, 4)),
      bloque('b', tools.slice(0, 4)),
    ]);
    for (const b of repartidos) {
      expect(b.completas.length + b.compactas.length, `«${b.id}» no enseña nada`).toBeGreaterThan(0);
    }
  });

  it('un bloque idéntico a otro se queda sin una sola tarjeta', () => {
    /*
     * La señal que delata dos bloques que son el mismo conjunto con dos
     * títulos: el segundo no tiene nada propio que enseñar entero.
     */
    const identico = repartirBloques([bloque('a', tools.slice(0, 3)), bloque('clon', tools.slice(0, 3))]);
    expect(identico[1]!.completas.length).toBe(0);
    expect(identico[1]!.compactas.length).toBe(3);
  });
});
