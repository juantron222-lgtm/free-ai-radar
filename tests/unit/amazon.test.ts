import { describe, expect, it } from 'vitest';
import {
  AMAZON_CACHE_MAX_HOURS,
  AMAZON_DISCLOSURE_EN,
  AMAZON_DISCLOSURE_ES,
  AMAZON_LINK_DISCLOSURES,
  AMAZON_PRICE_NOTICE,
  AmazonLinkDisclosure,
  assertAmazonPublishable,
  checkAmazonCache,
  isAmazonContentFresh,
  needsPriceTimestamp,
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

describe('caché de 24 horas de Amazon', () => {
  const NOW = new Date('2026-08-08T12:00:00Z');
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

  it('acepta contenido publicitario de hace 23 horas', () => {
    expect(checkAmazonCache('ad_content', hoursAgo(23), NOW)).toEqual([]);
  });

  it('RECHAZA contenido publicitario de hace 25 horas', () => {
    const problems = checkAmazonCache('ad_content', hoursAgo(25), NOW);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.problem).toContain('el máximo es 24 h');
  });

  it('rechaza justo por encima del límite', () => {
    expect(checkAmazonCache('ad_content', hoursAgo(24.1), NOW)).toHaveLength(1);
    expect(checkAmazonCache('ad_content', hoursAgo(23.9), NOW)).toEqual([]);
  });

  it('la URL de imagen caduca igual, a las 24 horas', () => {
    expect(checkAmazonCache('image_url', hoursAgo(23), NOW)).toEqual([]);
    expect(checkAmazonCache('image_url', hoursAgo(25), NOW)).toHaveLength(1);
  });

  it('la imagen en sí no se puede almacenar nunca, ni recién obtenida', () => {
    const problems = checkAmazonCache('image_binary', hoursAgo(0.1), NOW);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.problem).toContain('no permite almacenar la imagen');
  });

  it('el ASIN no caduca por reloj', () => {
    expect(checkAmazonCache('asin', hoursAgo(24 * 400), NOW)).toEqual([]);
  });

  it('sin instante de obtención no se puede afirmar que sea fresco', () => {
    expect(checkAmazonCache('ad_content', undefined, NOW)).toHaveLength(1);
    expect(isAmazonContentFresh('ad_content', undefined, NOW)).toBe(false);
  });

  it('un instante en el futuro se rechaza', () => {
    const future = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect(checkAmazonCache('ad_content', future, NOW)).toHaveLength(1);
  });

  it('el máximo declarado es el de la licencia, no una preferencia nuestra', () => {
    expect(AMAZON_CACHE_MAX_HOURS.ad_content).toBe(24);
    expect(AMAZON_CACHE_MAX_HOURS.image_url).toBe(24);
    expect(AMAZON_CACHE_MAX_HOURS.image_binary).toBe(0);
    expect(AMAZON_CACHE_MAX_HOURS.asin).toBeNull();
  });
});

describe('sello de fecha y hora, y aviso', () => {
  it('con refresco menos frecuente que cada hora, el sello es obligatorio', () => {
    expect(needsPriceTimestamp(61)).toBe(true);
    expect(needsPriceTimestamp(24 * 60)).toBe(true);
  });

  it('con refresco horario o mejor, no lo es', () => {
    expect(needsPriceTimestamp(60)).toBe(false);
    expect(needsPriceTimestamp(15)).toBe(false);
  });

  it('el aviso de precio y disponibilidad existe como constante', () => {
    expect(AMAZON_PRICE_NOTICE).toContain('pueden cambiar');
  });
});

describe('la declaración española', () => {
  it('es la redacción oficial de Amazon España', () => {
    expect(AMAZON_DISCLOSURE_ES).toBe(
      'En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables'
    );
  });

  it('la acepta como declaración de un comerciante de Amazon', () => {
    expect(requireDisclosure(AMAZON_DISCLOSURE_ES, true)).toBe(AMAZON_DISCLOSURE_ES);
  });

  it('RECHAZA una paráfrasis, por razonable que parezca', () => {
    expect(() =>
      requireDisclosure('Como afiliado de Amazon gano dinero con las compras que cumplan requisitos', true)
    ).toThrow(/redacción oficial/);
  });

  it('los marcadores por enlace son exactamente los cuatro que Amazon nombra', () => {
    expect(AMAZON_LINK_DISCLOSURES).toEqual([
      '(enlace pagado)',
      '#publicidad',
      '#publi',
      '#ColaboraciónPagada',
    ]);
  });

  it('rechaza un marcador inventado que suena equivalente', () => {
    expect(AmazonLinkDisclosure.safeParse('enlace patrocinado').success).toBe(false);
    expect(AmazonLinkDisclosure.safeParse('#ad').success).toBe(false);
    expect(AmazonLinkDisclosure.safeParse('#publicidad').success).toBe(true);
  });
});

describe('publicación bloqueada sin cuenta autorizada', () => {
  it('lanza si falta cualquier credencial', () => {
    expect(() => assertAmazonPublishable({})).toThrow(/incumple su licencia/);
    expect(() =>
      assertAmazonPublishable({ AMAZON_ASSOCIATE_TAG: TAG, AMAZON_MARKET: 'ES' })
    ).toThrow();
  });

  it('no lanza con todo configurado', () => {
    expect(() =>
      assertAmazonPublishable({
        AMAZON_ASSOCIATE_TAG: TAG,
        AMAZON_MARKET: 'ES',
        AMAZON_DISCLOSURE_TEXT: AMAZON_DISCLOSURE_ES,
        AMAZON_PAAPI_ACCESS_KEY: 'x',
        AMAZON_PAAPI_SECRET_KEY: 'y',
      })
    ).not.toThrow();
  });

  it('hoy el entorno real lanza, porque Amazon no está conectado', () => {
    expect(() =>
      assertAmazonPublishable(process.env as Record<string, string | undefined>)
    ).toThrow();
  });
});
