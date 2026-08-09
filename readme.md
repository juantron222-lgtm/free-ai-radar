# Free AI Radar

Radar editorial independiente de herramientas de IA gratuitas. Verificamos qué es gratis de verdad,
con qué límites, si piden tarjeta, si dejan marca de agua y si permiten usar el resultado para
trabajar — y decimos «no lo sé» cuando no lo sabemos.

---

## Arrancar (sin credenciales)

```bash
npm install
npm run dev
```

http://localhost:4321

El proyecto **funciona entero con un `.env` vacío**. Sin configurar nada:

- catálogo, búsqueda, filtros y comparador: reales;
- registro, login y recuperación: almacén local de desarrollo en `.data/`;
- favoritos, listas y alertas: JSON local;
- correos: se renderizan y registran en consola, no se envían;
- pagos: flujo simulado que no cobra nada.

Para entrar al panel de administración:

```bash
echo 'ADMIN_EMAILS="tu@correo.com"' >> .env
```

Reinicia, regístrate con ese correo y ve a `/admin`.

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run verify` | lint + typecheck + test + build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `astro check` |
| `npm run test` | Vitest (unidad + integración) |
| `npm run test:e2e` | Playwright |
| `npm run data:migrate:dry` | Migración en seco, con informe |
| `npm run data:migrate` | Regenera el catálogo |
| `npm run data:seed-sql` | Además, genera semilla y rollback SQL |
| `npm run links:check` | Comprueba los enlaces salientes |

---

## Estado

```
lint       sin errores
typecheck  0 errores (141 ficheros)
test       175 pruebas, todas pasan
build      limpio
```

---

## Cómo funciona

**El contenido editorial es estático.** Vive en `src/data/generated/tools.json`, un fichero
commiteado y determinista, validado con Zod en cada build. El sitio público no consulta la base de
datos: cada ficha es HTML servido desde el CDN.

**Los datos de usuario van a Postgres** con RLS, porque son dinámicos y necesitan aislamiento.

**La puntuación nunca se almacena.** Se deriva en cada lectura de sus cinco componentes, así que una
ficha no puede mostrar un número que contradiga sus propios datos.

**Lo no verificado no cuenta como un «no».** Un campo sin confirmar no suma ni resta puntos y nunca
satisface un filtro duro. Si pides «sin tarjeta», sólo verás las que hemos comprobado.

**Los patrocinios no pueden mover nada.** `placementBoost` está tipado como
`z.number().min(0).max(0)`: cualquier otro valor falla la validación y el build no pasa.

---

## Editar el catálogo

```bash
# 1. editar src/data/tools.json
npm run data:migrate:dry     # revisar el informe
npm run data:migrate         # regenerar
npm run test                 # los tests validan el dataset real
git add src/data && git commit
```

El build **falla** si una alternativa apunta a un slug inexistente o una categoría está fuera de la
taxonomía. Es imposible publicar un enlace roto.

---

## Documentación

| Documento | Contenido |
| --- | --- |
| [Auditoría del estado previo](docs/current-state-audit.md) | Qué había y qué fallaba |
| [Estrategia de producto](docs/product-strategy.md) | Problema, usuarios, bucle de retorno |
| [Arquitectura](docs/architecture.md) | Cómo está montado y qué se descartó |
| [Decisiones técnicas](docs/technical-decisions.md) | Cada decisión con su coste declarado |
| [Esquema de base de datos](docs/database-schema.md) | 28 tablas, RLS, migración |
| [Monetización](docs/monetization-strategy.md) | Las cuatro fuentes y sus límites |
| [Revisión de seguridad](docs/security-review.md) | Incluye lo que **no** se ha probado |
| [Privacidad y consentimiento](docs/privacy-and-consent.md) | RGPD, cookies, derechos |
| [Guía de despliegue](docs/deployment-guide.md) | Paso a paso, nada ejecutado |
| [Checklist de lanzamiento](docs/launch-checklist.md) | Qué falta antes de publicar |
| [Registro de cambios](docs/change-log.md) | Qué cambió en la v2 |

### Camino a producción

| Documento | Para qué |
| --- | --- |
| [Plan de Supabase producción](docs/supabase-production-plan.md) | Qué seleccionar en el panel, en qué orden, y cómo comprobarlo |
| [Hallazgos del Release Candidate](docs/release-candidate-findings.md) | Los tres fallos que encontró la batería, y uno que me inventé |
| [Hallazgos de la QA de cuentas](docs/preview-account-qa-findings.md) | Por qué ningún favorito se podía guardar |

La batería completa se ejecuta con un solo comando:

```bash
npm run rc
```

Doce pasos en orden —lint, tipos, unitarias, build, migración desde cero,
sincronización, RLS, HTTP/Auth, AutoCraw, cuentas reales y regresión pública—
con el espejo del catálogo comprobado entre suite y suite. Se detiene en el
primer fallo, porque los pasos siguientes correrían sobre el estado que dejó el
anterior.

---

## Variables de entorno

Todas opcionales. Ver [`.env.example`](.env.example), comentado campo por campo.

Sin ellas, cada integración degrada a un modo local claramente etiquetado. Ninguna falla.

---

## Licencia

Todos los derechos reservados. El contenido editorial (análisis, puntuaciones, veredictos) es
propiedad del proyecto. Las marcas y nombres de las herramientas analizadas pertenecen a sus
titulares.
