# Cómo actualizar el Preview de `web-v2`

El Preview de la rama `web-v2` se despliega a mano. La integración de Git ya no
crea Previews por rama al hacer push, así que cada iteración se sube con la CLI
de Vercel. Nada de esto toca Production ni `main`.

## Requisitos

- Sesión iniciada en la CLI: `npx vercel whoami`. Si caducó, `npx vercel login`.
- Proyecto enlazado: existe `.vercel/project.json` (está en `.gitignore`).

## Desplegar

```bash
git switch web-v2
git pull --ff-only
npx vercel deploy --yes
```

La salida termina con la URL del Preview (`https://free-ai-radar-XXXX-nada-de-pro.vercel.app`)
y un bloque JSON con `"target": null`. Ese `null` es lo que confirma que es un
Preview y no Production.

`.vercelignore` deja fuera `docs/`, `tests/` y los resultados de pruebas, así que
la subida pasa de unos 84 MB a unos 11 MB.

## Lo que nunca se usa en esta rama

| Comando | Por qué no |
| --- | --- |
| `vercel deploy --prod` | Despliega en Production |
| `vercel promote` | Convierte un Preview en Production |
| `vercel alias` | Puede apuntar el dominio real a un Preview |
| `vercel remove` | Borra despliegues; sólo con autorización del titular |

## Comprobar

```bash
npx vercel inspect <url-del-preview>
```

Debe decir `target preview` y `status ● Ready`, y **no** debe listar
`www.freeairadar.com` entre sus alias.

El Preview está protegido por el SSO de Vercel: abrirlo en el navegador pide la
sesión de Vercel. Para comprobarlo desde la terminal sin cambiar ninguna
configuración:

```bash
npx vercel curl /herramientas --deployment <url-del-preview>
```

## Diferencias conocidas con Production

- **`/noticias`**: el entorno Preview no tiene las variables de Supabase, así
  que el prebuild sólo usa la semilla (`src/data/news/news.json`). Enseña las
  noticias de la semilla, no todas las publicadas en Production. Es lo esperado:
  Newsroom está congelado y sus secretos no se copian a Preview.
- **Analítica y cookies**: se comportan igual, pero los datos no cuentan como
  tráfico real.

## Antes de promover `web-v2`

Traer el último `main` a `web-v2` justo antes, para que ninguna noticia
publicada durante el rediseño se pierda. La promoción es un merge de `web-v2`
sobre ese `main`, nunca una sustitución. El punto de retorno de Production
antes de Web V2 es el tag `produccion-pre-web-v2-20260910` (`092a7cf`).
