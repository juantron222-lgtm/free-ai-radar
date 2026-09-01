import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Seguridad del disparador diario y del hook de despliegue.
 *
 * El endpoint del cron es público: está en internet y cualquiera puede pedirlo.
 * Lo único que separa a Vercel de un desconocido es un secreto en una cabecera,
 * así que las formas de equivocarse aquí son caras — un endpoint abierto que
 * hace peticiones de red en nombre del sitio, o una comparación que filtra el
 * secreto por el tiempo que tarda en fallar.
 *
 * Las variables llegan por `astro:env/server`, que en pruebas no existe, así
 * que se sustituye el módulo. Es la única forma de ejercitar las tres
 * situaciones que importan: secreto correcto, secreto incorrecto y secreto sin
 * configurar.
 */

const env = { CRON_SECRET: '', NEWSROOM_DEPLOY_HOOK: '' };

vi.mock('astro:env/server', () => ({
  get CRON_SECRET() {
    return env.CRON_SECRET;
  },
  get NEWSROOM_DEPLOY_HOOK() {
    return env.NEWSROOM_DEPLOY_HOOK;
  },
}));

async function trigger() {
  return import('@lib/newsroom/trigger');
}

function peticion(cabecera?: string, agente?: string): Request {
  const headers = new Headers();
  if (cabecera) headers.set('authorization', cabecera);
  if (agente) headers.set('user-agent', agente);
  return new Request('https://www.freeairadar.com/api/cron/newsroom', { headers });
}

beforeEach(() => {
  env.CRON_SECRET = 'un-secreto-suficientemente-largo-1234567890';
  env.NEWSROOM_DEPLOY_HOOK = '';
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nadie dispara el newsroom sin el secreto', () => {
  it('rechaza una petición sin cabecera', async () => {
    const { authorizeTrigger } = await trigger();
    const veredicto = authorizeTrigger(peticion());
    expect(veredicto.ok).toBe(false);
  });

  it('rechaza un secreto equivocado', async () => {
    const { authorizeTrigger } = await trigger();
    const veredicto = authorizeTrigger(peticion('Bearer otra-cosa'));
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.reason).toContain('incorrecto');
  });

  it('rechaza un secreto que sólo comparte el prefijo', async () => {
    /*
     * El caso que rompe una comparación ingenua: si `===` cortocircuitara y el
     * tiempo se midiera, este sería el escalón desde el que se reconstruye el
     * resto del secreto carácter a carácter.
     */
    const { authorizeTrigger } = await trigger();
    expect(authorizeTrigger(peticion('Bearer un-secreto-suficientemente')).ok).toBe(false);
  });

  it('rechaza el esquema equivocado aunque el secreto sea correcto', async () => {
    const { authorizeTrigger } = await trigger();
    expect(authorizeTrigger(peticion(`Basic ${env.CRON_SECRET}`)).ok).toBe(false);
  });

  it('acepta el secreto correcto', async () => {
    const { authorizeTrigger } = await trigger();
    expect(authorizeTrigger(peticion(`Bearer ${env.CRON_SECRET}`)).ok).toBe(true);
  });

  it('sin CRON_SECRET configurado no autoriza a nadie, ni con cabecera vacía', async () => {
    /*
     * La alternativa —abrir el endpoint cuando falta el secreto— convierte un
     * despiste de configuración en un endpoint público que hace peticiones de
     * red en nombre del sitio. Cerrado por defecto.
     */
    env.CRON_SECRET = '';
    const { authorizeTrigger } = await trigger();
    expect(authorizeTrigger(peticion('Bearer ')).ok).toBe(false);
    expect(authorizeTrigger(peticion()).ok).toBe(false);
  });

  it('distingue el cron de Vercel de un disparo a mano, sin fiarse de ello', async () => {
    const { authorizeTrigger } = await trigger();

    const cron = authorizeTrigger(peticion(`Bearer ${env.CRON_SECRET}`, 'vercel-cron/1.0'));
    const mano = authorizeTrigger(peticion(`Bearer ${env.CRON_SECRET}`, 'curl/8.0'));

    expect(cron.ok && cron.trigger).toBe('cron');
    expect(mano.ok && mano.trigger).toBe('manual');

    /* La etiqueta sólo alimenta el informe: sin secreto no entra ninguna. */
    const falsa = authorizeTrigger(peticion('Bearer no', 'vercel-cron/1.0'));
    expect(falsa.ok).toBe(false);
  });
});

describe('el hook de despliegue', () => {
  it('sin configurar, lo dice en lugar de fingir que ha desplegado', async () => {
    const { requestRebuild, deployHookConfigured } = await trigger();
    expect(deployHookConfigured()).toBe(false);

    const resultado = await requestRebuild();
    expect(resultado.ok).toBe(false);
    expect(resultado.detail).toContain('no está configurado');
  });

  it('lanza el build cuando está configurado', async () => {
    env.NEWSROOM_DEPLOY_HOOK = 'https://api.vercel.com/v1/integrations/deploy/abc';
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { requestRebuild } = await trigger();
    const resultado = await requestRebuild();

    expect(resultado.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('un hook caído no deshace la aprobación: informa y sigue', async () => {
    /*
     * La noticia ya está en la base cuando esto se llama. Que el despliegue
     * falle retrasa cuándo se ve, no si existe, así que devuelve el fallo en
     * lugar de lanzarlo hacia arriba.
     */
    env.NEWSROOM_DEPLOY_HOOK = 'https://api.vercel.com/v1/integrations/deploy/abc';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })));

    const { requestRebuild } = await trigger();
    const resultado = await requestRebuild();

    expect(resultado.ok).toBe(false);
    expect(resultado.detail).toContain('500');
  });

  it('un error de red tampoco lanza', async () => {
    env.NEWSROOM_DEPLOY_HOOK = 'https://api.vercel.com/v1/integrations/deploy/abc';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ENOTFOUND');
      })
    );

    const { requestRebuild } = await trigger();
    await expect(requestRebuild()).resolves.toMatchObject({ ok: false });
  });
});
