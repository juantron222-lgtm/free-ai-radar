import type { APIRoute } from 'astro';
import { SITE_URL } from '@lib/seo/site';

/**
 * robots.txt, generated so the sitemap URL can never again point at a stale
 * preview domain — the bug this rebuild inherited.
 */
export const GET: APIRoute = () => {
  const body = `# Free AI Radar
# El contenido editorial es público y se puede rastrear.
# Lo privado, lo transaccional y las permutaciones de filtros, no.

User-agent: *
Allow: /

# Áreas privadas o sin valor para el índice
Disallow: /admin
Disallow: /cuenta
Disallow: /api/
Disallow: /boletin/

# Parámetros que sólo generan duplicados del mismo listado
Disallow: /*?q=
Disallow: /*?cat=
Disallow: /*?free=
Disallow: /*?plat=
Disallow: /*?host=
Disallow: /*?skill=
Disallow: /*?sort=
Disallow: /*?min=
Disallow: /*?nocard=
Disallow: /*?nosignup=
Disallow: /*?nowm=
Disallow: /*?comm=
Disallow: /*?oss=
Disallow: /*?fresh=

# El comparador sí es indexable cuando lleva herramientas seleccionadas
Allow: /comparar?t=

Sitemap: ${SITE_URL}/sitemap.xml
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
