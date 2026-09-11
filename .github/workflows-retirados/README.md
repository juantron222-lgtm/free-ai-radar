# Workflows retirados

GitHub sólo ejecuta lo que hay en `.github/workflows/`. Lo que está aquí queda
inerte, con su historial intacto.

| Workflow | Retirado | Motivo | Volver a activarlo |
| --- | --- | --- | --- |
| `update-ai-news.yml` | 11 sep 2026, rama `web-v2` | Fallaba a diario: llama a dos scripts borrados en agosto, nunca llegó a escribir nada y, si funcionase, taparía el sitemap dinámico. Detalle en `docs/web-v2/workflow-noticias-antiguo.md` | `git mv .github/workflows-retirados/update-ai-news.yml .github/workflows/` |
