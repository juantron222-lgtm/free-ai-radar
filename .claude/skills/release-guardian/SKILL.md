---
name: release-guardian
description: Barrera de seguridad de Free AI Radar. Bloquea trabajo en main, git push, despliegues, cambios de DNS, claves live de Stripe, Supabase de producción, secretos en el repositorio y operaciones destructivas. Úsala antes de cualquier operación git que escriba, antes de tocar configuración de despliegue o credenciales, y siempre antes de cerrar una fase.
---

# Guardián de publicación

## 1. Objetivo

Impedir que una operación irreversible o que afecte a producción ocurra sin
aprobación humana explícita, y garantizar que ningún secreto entre en el
repositorio.

El propietario revisa antes de autorizar. Esta skill hace que eso no dependa de
recordarlo.

## 2. Cuándo se activa

- Antes de `git commit`, `git push`, `git merge`, `git rebase`, `git reset`.
- Antes de tocar `vercel.json`, `astro.config.mjs`, `.env*` o `supabase/`.
- Antes de cualquier comando con `vercel`, `supabase`, `stripe`, `npx wrangler`.
- Antes de instalar o eliminar dependencias.
- Siempre al cerrar una fase de trabajo.
- Cuando el usuario pida «despliega», «publica», «súbelo», «hazlo en producción».

### Operaciones BLOQUEADAS

Estas **nunca** se ejecutan sin un «sí» explícito del propietario en el chat:

| Categoría | Bloqueado |
| --- | --- |
| Rama | Commit o escritura en `main` / `master` / `develop` |
| Remoto | `git push` (cualquier rama, cualquier remoto) |
| Historia | `git reset --hard`, `push --force`, `rebase` de commits publicados, `git filter-branch` |
| Despliegue | `vercel deploy`, `vercel --prod`, `vercel alias`, cualquier CI de release |
| DNS / dominio | Alta de dominios, registros DNS, HSTS `preload` |
| Pagos | Clave `sk_live_`, paso a modo live, webhooks de producción, cobros reales |
| Base de datos | Migraciones contra Supabase de producción, `drop`, `truncate`, `delete from` sin `where` |
| Correo | Envío de campañas reales, verificación de dominio en el proveedor |
| Secretos | Escribir credenciales reales en cualquier fichero versionado |
| Datos | Borrar contenido existente sin copia recuperable |
| Global | Modificar configuración fuera del directorio del proyecto |

## 3. Procedimiento operativo

Ejecuta las nueve comprobaciones **en orden** antes de dar el visto bueno. Cada
una es un comando concreto con un resultado esperado; ninguna es un juicio.

### 1. Rama correcta
```bash
git branch --show-current
```
Debe ser `opus5-premium-rebuild`. Si es `main`, `master` o `develop`: **para**.

### 2. Nada apunta a un push
```bash
git log --oneline origin/main -1
git log --oneline @{u} -1 2>/dev/null || echo "sin upstream (correcto)"
```
La rama de trabajo no debe tener upstream configurado.

### 3. Sin secretos en el árbol
```bash
grep -rInE "sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{20,}|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.vercel . \
  | grep -v "\.env\.example" | grep -v "docs/" || echo "OK: sin secretos"
```

> Las cadenas `sk_live_` / `sk_test_` **sin valor detrás** en documentación y en
> el guardia de `src/lib/billing/stripe.ts` son legítimas: son literales
> explicativos, no credenciales.

### 4. `.env` no versionado
```bash
git check-ignore -v .env .data 2>/dev/null || echo "AVISO: revisar .gitignore"
git ls-files | grep -E "^\.env$|^\.data/" && echo "FALLO: fichero sensible versionado" || echo "OK"
```

### 5. Stripe no está en modo live
```bash
grep -n "sk_live_" .env 2>/dev/null && echo "FALLO: clave live presente" || echo "OK: sin clave live"
```

### 6. Sin apuntar a Supabase de producción
```bash
grep -nE "^PUBLIC_SUPABASE_URL=" .env 2>/dev/null || echo "OK: sin Supabase configurado"
```
Si hay URL, confirma con el propietario que **no** es la de producción.

### 7. Pipeline verde
```bash
npm run lint && npm run typecheck && npm run test && npm run build
```
Los cuatro deben pasar antes de commitear.

### 8. Diff revisado
```bash
git status --short
git diff --stat
```
Ningún fichero inesperado. Ningún binario grande. Nada bajo `.data/`, `dist/`,
`.vercel/` ni `.astro/`.

### 9. Producción intacta
```bash
git log --oneline main -1
```
Debe seguir siendo el commit previo al trabajo. `main` no se toca.

## 4. Herramientas permitidas

- `Bash` / `PowerShell` — sólo lectura de git (`status`, `diff`, `log`,
  `branch`, `ls-files`, `check-ignore`), `grep` y los scripts de `npm run`.
- `Read` — cualquier fichero del proyecto, para revisar el diff.
- `git add` / `git commit` — **únicamente en la rama de trabajo** y sólo
  después de que las nueve comprobaciones den el resultado exigido.

Prohibido para esta skill: `git push`, `git merge`, `git rebase`,
`git reset --hard`, cualquier CLI de despliegue (`vercel`, `wrangler`), la CLI
de Stripe en modo live, y cualquier herramienta que escriba fuera del
directorio del proyecto.

## 5. Comprobaciones obligatorias

El commit en la rama de trabajo se autoriza **sólo** si las nueve comprobaciones
dan el resultado esperado:

| # | Comprobación | Resultado exigido |
| --- | --- | --- |
| 1 | Rama actual | `opus5-premium-rebuild` (nunca `main`/`master`/`develop`) |
| 2 | Upstream | ausente — nada preparado para push |
| 3 | Secretos | cero coincidencias fuera de `.env.example` y `docs/` |
| 4 | `.env` / `.data` | ignorados y no versionados |
| 5 | Stripe | sin `sk_live_` en el entorno |
| 6 | Supabase | sin URL de producción, o confirmada como no productiva |
| 7 | Pipeline | `lint`, `typecheck`, `test` y `build` en verde |
| 8 | Diff | sin ficheros inesperados, binarios ni artefactos de build |
| 9 | `main` | apunta al mismo commit que antes del trabajo |

Cualquier fallo → **BLOQUEADO**, se informa del motivo y no se commitea.

Que las nueve pasen autoriza **únicamente** un commit local en la rama de
trabajo. Nunca un push, un despliegue ni una operación de la tabla de
bloqueadas.

### Operaciones PERMITIDAS sin preguntar

- Leer cualquier fichero del proyecto.
- Escribir en `src/`, `tests/`, `docs/`, `public/`, `scripts/`, `supabase/migrations/`.
- `git add`, `git commit` **en la rama de trabajo**, `git diff`, `git log`.
- `npm run lint | typecheck | test | build | test:e2e`.
- Arrancar y parar el servidor de desarrollo local.
- Stripe en modo test con clave `sk_test_`.
- Correos en modo simulado (`EMAIL_DRY_RUN=1`).
- Migraciones contra una base local o de desarrollo.

## 6. Prohibiciones

- ❌ No interpretes un «adelante» genérico como permiso para desplegar.
- ❌ No trates una autorización previa como permanente: es por operación y por sesión.
- ❌ No ejecutes una operación bloqueada «porque parece obviamente lo que quiere».
- ❌ No escribas credenciales reales en `.env.example` ni en la documentación.
- ❌ No modifiques nada fuera de `C:\Users\juanl\.openclaw-autoclaw\workspace\free-ai-radar`.
- ❌ No instales dependencias sin autorización.
- ❌ No hagas commit con el pipeline en rojo.
- ❌ No uses `--no-verify` ni saltes hooks.

## 7. Criterios de terminación

La comprobación está cerrada cuando:

1. Las nueve de §5 tienen resultado explícito.
2. El veredicto es inequívoco: autorizado o bloqueado con motivo.
3. Toda operación de la tabla de bloqueadas que haga falta está listada como
   pendiente de aprobación, con su plantilla de petición.
4. No se ejecutó ninguna operación bloqueada.
5. `main` sigue apuntando al mismo commit que antes.

## 8. Formato de informe

```markdown
## Comprobación de seguridad — <fecha>

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Rama de trabajo | opus5-premium-rebuild ✔ |
| 2 | Sin upstream / sin push | ✔ |
| 3 | Sin secretos | ✔ |
| 4 | .env y .data no versionados | ✔ |
| 5 | Stripe sin clave live | ✔ |
| 6 | Supabase no productivo | ✔ |
| 7 | lint / typecheck / test / build | ✔ |
| 8 | Diff revisado | N ficheros |
| 9 | main intacta | <sha> ✔ |

### Veredicto
COMMIT AUTORIZADO EN LA RAMA DE TRABAJO / BLOQUEADO: <motivo>

### Requiere aprobación humana
- [ ] <operación> — <por qué>
```

## 9. Ejemplos de uso

**Correcto**
```
Usuario: ya está, súbelo
→ Comprobación 1: rama = opus5-premium-rebuild ✔
→ "Puedo commitear en la rama de trabajo. `git push` y el despliegue están
   bloqueados y necesitan tu autorización explícita. ¿Confirmas el push?"
```

**Incorrecto**
```
Usuario: ya está, súbelo
→ git push origin opus5-premium-rebuild   ❌
   «Súbelo» es ambiguo. El push sale del entorno local y requiere confirmación.
```

**Correcto**
```
Usuario: pon Stripe en producción
→ BLOQUEADO. Activar cobros reales es irreversible para quien pague.
→ Se documentan los pasos exactos en docs/deployment-guide.md
→ Se pide confirmación explícita e informada.
```

## 10. Situaciones que requieren aprobación humana

Siempre, para cualquiera de estas:

- `git push` a cualquier remoto.
- Fusionar con `main`.
- Desplegar en cualquier entorno.
- Cambiar DNS o dominio.
- Activar cobros reales o pasar Stripe a live.
- Aplicar migraciones a una base de datos real.
- Enviar cualquier correo real.
- Borrar datos o contenido existente.
- Conectar una cuenta externa con credenciales reales.
- Instalar o eliminar dependencias.
- Modificar algo fuera del directorio del proyecto.

Formula la petición así:

> **Operación:** <qué>
> **Efecto:** <qué cambia y para quién>
> **Reversible:** sí / no — <cómo se revierte>
> **Alternativa local:** <qué se puede hacer sin salir del entorno>
> ¿Autorizas?
