import { describe, expect, it } from 'vitest';
import {
  AMAZON_DISCLOSURE_EN,
  AMAZON_MARKETS,
  AmazonAssociateTag,
  amazonReadiness,
  checkAmazonLink,
  requireDisclosure,
} from '@lib/domain/amazon';

/**
 * Amazon's rules, tested before Amazon is connected.
 *
 * The point of writing these now is that the day AutoCraw produces its first
 * Amazon offer, the checks already exist and have already failed on purpose.
 */

const TAG = 'freeairadar-21';

describe('el enlace debe llevar la etiqueta de afiliado', () => {
  it('acepta un enlace correcto', () => {
    expect(
      checkAmazonLink(`https://www.amazon.es/dp/B0TEST?tag=${TAG}`, 'ES', TAG)
    ).toEqual([]);
  });

  it('rechaza un enlace sin tag', () => {
    const problems = checkAmazonLink('https://www.amazon.es/dp/B0TEST', 'ES', TAG);
    expect(problems.map((p) => p.problem).join(' ')).toContain('no lleva el parámetro tag');
  });

  it('rechaza un enlace con la etiqueta de otro', () => {
    const problems = checkAmazonLink('https://www.amazon.es/dp/B0TEST?tag=otro-21', 'ES', TAG);
    expect(problems.map((p) => p.problem).join(' ')).toContain('en vez de la configurada');
  });
});

describe('el anfitrión debe corresponder al mercado', () => {
  it('rechaza un enlace .com para el mercado español', () => {
    const problems = checkAmazonLink(`https://www.amazon.com/dp/B0TEST?tag=${TAG}`, 'ES', TAG);
    expect(problems.map((p) => p.problem).join(' ')).toContain('amazon.es');
  });

  it('acepta el mercado que corresponde a cada anfitrión', () => {
    for (const [market, host] of Object.entries(AMAZON_MARKETS)) {
      const problems = checkAmazonLink(
        `https://www.${host}/dp/B0TEST?tag=${TAG}`,
        market as keyof typeof AMAZON_MARKETS,
        TAG
      );
      expect(problems, `${market} → ${host}`).toEqual([]);
    }
  });

  it('Portugal compra a través de amazon.es, y eso está declarado', () => {
    expect(AMAZON_MARKETS.PT).toBe('amazon.es');
  });

  it('exige https', () => {
    const problems = checkAmazonLink(`http://www.amazon.es/dp/B0TEST?tag=${TAG}`, 'ES', TAG);
    expect(problems.map((p) => p.problem).join(' ')).toContain('https');
  });

  it('informa de todos los problemas a la vez, no sólo del primero', () => {
    const problems = checkAmazonLink('http://www.amazon.com/dp/B0TEST', 'ES', TAG);
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  it('una URL ilegible se rechaza sin lanzar', () => {
    expect(checkAmazonLink('esto no es una url', 'ES', TAG)).toHaveLength(1);
  });
});

describe('la etiqueta de afiliado', () => {
  it('acepta las formas que emite Amazon', () => {
    for (const tag of ['freeairadar-21', 'mi-sitio-20', 'abc123-21']) {
      expect(AmazonAssociateTag.safeParse(tag).success, tag).toBe(true);
    }
  });

  it('rechaza algo que no lo es', () => {
    for (const tag of ['sin-sufijo', 'a', 'tag_con_guion_bajo-21']) {
      expect(AmazonAssociateTag.safeParse(tag).success, tag).toBe(false);
    }
  });
});

describe('la declaración de afiliación', () => {
  it('la redacción verificada es la del Operating Agreement', () => {
    expect(AMAZON_DISCLOSURE_EN).toBe('As an Amazon Associate I earn from qualifying purchases.');
  });

  it('rechaza que falte', () => {
    expect(() => requireDisclosure('')).toThrow(/exige mostrar/);
    expect(() => requireDisclosure(undefined)).toThrow();
    expect(() => requireDisclosure('   ')).toThrow();
  });

  it('rechaza un marcador de posición', () => {
    expect(() => requireDisclosure('[PONER AQUÍ EL TEXTO]')).toThrow(/marcador de posición/);
    expect(() => requireDisclosure('TODO: copiar del panel')).toThrow(/marcador de posición/);
  });

  it('acepta un texto real', () => {
    expect(requireDisclosure(AMAZON_DISCLOSURE_EN)).toBe(AMAZON_DISCLOSURE_EN);
  });
});

describe('qué falta para conectar', () => {
  it('sin configuración, no está listo y lo enumera', () => {
    const readiness = amazonReadiness({});
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain('AMAZON_ASSOCIATE_TAG');
    expect(readiness.missing).toContain('AMAZON_DISCLOSURE_TEXT');
    expect(readiness.present).toEqual([]);
  });

  it('con todo puesto, está listo', () => {
    const readiness = amazonReadiness({
      AMAZON_ASSOCIATE_TAG: TAG,
      AMAZON_MARKET: 'ES',
      AMAZON_DISCLOSURE_TEXT: AMAZON_DISCLOSURE_EN,
      AMAZON_PAAPI_ACCESS_KEY: 'x',
      AMAZON_PAAPI_SECRET_KEY: 'y',
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  it('a medias sigue sin estar listo', () => {
    const readiness = amazonReadiness({ AMAZON_ASSOCIATE_TAG: TAG, AMAZON_MARKET: 'ES' });
    expect(readiness.ready).toBe(false);
    expect(readiness.present).toHaveLength(2);
  });

  it('una variable con sólo espacios cuenta como ausente', () => {
    expect(amazonReadiness({ AMAZON_ASSOCIATE_TAG: '   ' }).present).toEqual([]);
  });
});

describe('hoy Amazon no está conectado', () => {
  it('el entorno real no trae ninguna variable de Amazon', () => {
    // If this ever fails, someone connected Amazon without saying so.
    const readiness = amazonReadiness(process.env as Record<string, string | undefined>);
    expect(readiness.present, `presentes: ${readiness.present.join(', ')}`).toEqual([]);
  });
});
