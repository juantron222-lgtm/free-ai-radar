# El workflow antiguo de noticias: auditoría y retirada

`update-ai-news.yml` es el automatismo diario del radar de noticias **anterior a
Newsroom**. Esta nota deja escrito qué hace, qué escribe, quién lo lee y por qué
se retira en `web-v2`. Newsroom V2 no se toca.

Auditado el 11 de septiembre de 2026.

## Qué hace

Cada día a las 07:17 UTC, en `main`:

1. `node scripts/fetch-ai-news.mjs`
2. `node scripts/generate-sitemap.js`
3. `npm run build`
4. `git add src/data/news.json public/sitemap.xml`, y si hay cambios, commit y
   push a `main` como «Free AI Radar Bot».

## Lo que se ha comprobado

| Pregunta | Respuesta | Cómo |
| --- | --- | --- |
| ¿Se ejecuta? | Sí, a diario | API pública de GitHub: 31 ejecuciones |
| ¿Funciona? | **No.** Las 8 últimas, del 3 al 10 de septiembre, terminan en `failure` | Misma API, evento `schedule`, rama `main` |
| ¿Existen los scripts que llama? | **No.** Ni `scripts/fetch-ai-news.mjs` ni `scripts/generate-sitemap.js` | Borrados en `f34a3f8` (3 ago) y `eb32b2d` (11 ago) |
| ¿Ha escrito algo alguna vez en `main`? | **No.** Cero commits de «Free AI Radar Bot» | `git log origin/main --author="Free AI Radar Bot"` |
| ¿Quién lee `src/data/news.json`? | **Nadie.** El fichero no existe | La web lee `src/data/generated/news.json`; la semilla de Newsroom es `src/data/news/news.json` |
| ¿Y `public/sitemap.xml`? | No existe desde el 3 de agosto | `git log -- public/sitemap.xml` |

## Por qué se retira

- **Está muerto:** falla antes de escribir nada, todos los días.
- **Si volviera a funcionar, haría daño:** escribiría `public/sitemap.xml`, un
  fichero estático que taparía el sitemap dinámico de
  `src/pages/sitemap.xml.ts`, que es el que lista las URLs correctas y excluye
  las `noindex`. Y escribiría noticias en un fichero que ya no lee nadie, fuera
  de la puerta editorial de Newsroom.
- **No es Newsroom V2:** no toca `newsroom_*`, ni Supabase, ni la publicación, ni
  `src/data/news/news.json`, ni `src/data/generated/news.json`.

## Cómo se retira

El fichero se mueve, no se borra:

```
.github/workflows/update-ai-news.yml  →  .github/workflows-retirados/update-ai-news.yml
```

GitHub sólo ejecuta lo que está en `.github/workflows/`, así que en su nueva
ubicación queda inerte y con todo su historial.

**Cuándo tiene efecto.** Los workflows programados se ejecutan desde la rama por
defecto. Mientras `web-v2` no se fusione en `main`, el fallo diario sigue
ocurriendo en `main`. Para pararlo antes hay dos opciones, las dos del titular:
desactivar el workflow desde la pestaña Actions de GitHub, o aplicar este mismo
movimiento directamente en `main`.

## Rollback

```bash
git mv .github/workflows-retirados/update-ai-news.yml .github/workflows/update-ai-news.yml
```

Pendiente aparte, no incluido: el script `news:fetch` de `package.json` también
apunta a `scripts/fetch-ai-news.mjs`, que no existe.
