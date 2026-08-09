# Release Candidate — lo que encontró la batería

Cinco fallos, ninguno en el producto. Los cinco estaban en el andamiaje que
existe para dar garantías, que es un sitio peor: una prueba rota no rompe el
sitio, rompe la confianza en todo lo que esa prueba decía.

---

## 1. Una suite borraba el catálogo

**Síntoma:** la QA de cuentas fallaba con `23503`, clave foránea. `public.tools`
tenía 23 filas donde debía tener 24, y la que faltaba era `tool_ollama`.

**Causa:** las suites HTTP y AutoCraw sembraban `tool_ollama` como *fixture*
—con `on conflict do nothing`— y lo borraban al terminar:

```js
await sql`delete from public.tools where id = 'tool_ollama'`;
```

Mientras el espejo estuvo vacío, eso era limpieza correcta: la fila existía
porque la suite la había creado. En cuanto el catálogo se sincronizó con
Postgres dejó de serlo. La suite encontraba el Ollama real, lo respetaba por el
`on conflict`, y lo borraba al salir.

**Una limpieza que borra por id sin saber si ella creó la fila es una limpieza
esperando a que la tabla tenga datos de verdad.**

**Corrección:** el *fixture* pasa a ser `tool_sonda-qa` en la categoría
`sonda-qa`, una identidad que el catálogo no puede producir. La suite SQL
adversarial no necesitaba cambio: va envuelta en `begin`/`rollback` y nunca
persiste nada.

**Lo que faltaba de verdad** no era el *fixture*, sino que nadie comprobara el
espejo. `npm run db:check:staging` lo verifica sin escribir, y la batería lo
ejecuta **entre cada suite**. El daño aparecía dos pasos después de causarse;
ahora sale con nombre en el paso siguiente.

---

## 2. Cinco copias de los parámetros de conexión, y sólo una completa

**Síntoma:** la batería se quedó colgada nueve minutos en `http:staging`, un
paso de treinta segundos. Al matarlo apareció la causa:

```
✗ write CONNECTION_CLOSED aws-1-eu-west-1.pooler.supabase.com:5432
```

**Causa:** el runner abría así:

```js
postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 30, ssl: 'require' })
```

y las suites HTTP, AutoCraw y el emisor de credenciales, así:

```js
postgres(url, { max: 1, ssl: 'require' })
```

Sin `idle_timeout`. La suite HTTP abre la conexión al empezar y luego pasa
minutos hablando con GoTrue y PostgREST, tocando la base sólo de vez en cuando.
El pooler de Supabase cierra las conexiones de cliente que se quedan ociosas, y
postgres.js seguía creyendo viva una conexión que ya no lo estaba. La siguiente
escritura falló y, sin `connect_timeout`, el proceso se quedó esperando en vez
de fallar.

**Primera corrección, equivocada.** Añadí `idle_timeout: 20` a una definición
única, razonando que si el pooler cierra las conexiones ociosas, mejor que las
cierre postgres.js primero y reconecte en la siguiente consulta.

Eso pasó por alto que **las dos suites ejecutan sus sondas dentro de
`sql.begin()`**. Una transacción retiene una conexión durante toda su vida, y no
hay nada a lo que reconectar de forma transparente: una reconexión perdería la
transacción, el rol de sesión y cada `set local` que hubiera dentro. Cuando el
temporizador salta ahí, postgres.js destruye la conexión y las sondas fallan con
`CONNECTION_DESTROYED`.

Medido, no argumentado. AutoCraw, misma suite, tres valores:

| `idle_timeout` | Resultado |
|---|---|
| `0` | 12/12 capacidades · 30/30 ataques bloqueados |
| `20` | falla |
| `120` | falla — `CONNECTION_DESTROYED` en CAP-07 y CAP-08 |

Cualquier valor distinto de cero la rompe.

**Corrección definitiva:** `scripts/db-connect.mjs`, una única definición, **sin
`idle_timeout`** —que además es el valor por defecto de postgres.js y lo que
estas suites tenían— y **con `connect_timeout`**, que es lo que de verdad
faltaba. Es el ajuste que convierte «se queda colgado hasta que alguien se da
cuenta» en «falla diciendo por qué». Una suite que falla se puede leer.

En el guardián la importación es dinámica a propósito: sus pruebas unitarias
cargan `evaluateEnvironment` sin red ni credenciales, y una importación estática
arrastraría el driver a cada una.

**Lo que sigue sin resolver:** una conexión ociosa el tiempo suficiente para que
el pooler la cierre todavía puede fallar en la siguiente escritura. El arreglo
real es abrir la conexión junto al código que la usa, no al principio de
`main()`. La suite HTTP la abre y luego hace treinta y siete llamadas HTTP antes
de tocar la base.

> Es la **tercera** vez que este proyecto tropieza con la misma forma: dos
> copias de una regla, una de ellas vieja. Antes fueron la lectura del entorno
> —que hizo que el runner se conectara a localhost después de que el guardián
> aprobara staging— y el arranque de esquema en PGlite.

---

## 3. El reinicio dejaba a AutoCraw sin poder autenticarse

**Síntoma:** `autocraw:staging` fallando con `EAUTHQUERY: user not found in the
database`, un error que no nombra ni el rol ni la causa.

**Causa:** `db:reset:staging` hace `drop role if exists autocraw_ingest`. La
migración `0003` lo recrea, pero **NOLOGIN y sin contraseña**: la credencial se
fue con el rol viejo.

**Corrección:** el reinicio lo dice donde ocurre, y la batería reemite la
credencial como paso propio justo después de migrar.

---

## 4. El emisor de credenciales decía «hecho» antes de que la credencial sirviera

**Síntoma:** la batería fallaba en `autocraw` con `password authentication
failed for user "autocraw_ingest"`, tres pasos después de emitir la credencial
con éxito. Ejecutada a mano, la misma secuencia funcionaba.

**Causa:** `alter role ... password` devuelve en cuanto Postgres ha guardado la
contraseña. **El pooler todavía no la conoce.** Supavisor autentica contra su
propia copia en caché, y durante unos segundos sigue rechazando la credencial
nueva.

Medido en staging, emitiendo y reintentando cada 3 segundos:

```
intento 1 (7.6s): contraseña rechazada
intento 2 (12.4s): AUTENTICA
```

**Corrección:** el emisor ya no informa de éxito hasta que la credencial **abre
una conexión**. Reintenta mientras el error sea exactamente «contraseña
rechazada» —cualquier otro fallo se reporta de inmediato en vez de gastar un
minuto redescubriéndolo— y sale con código distinto de cero si nunca llega a
autenticar. La batería espera ahora `Comprobada: autentica`, no `LOGIN:`.

Una credencial que no abre una conexión no es una credencial emitida.

---

## 5. La QA de cuentas medía el tiempo, no el resultado

**Síntoma:** cuatro comprobaciones en rojo justo después de empujar el commit.
Una de ellas informaba de que el rechazo del registro había ocurrido **durante
el login**, lo cual era imposible.

**Causa:** `page.waitForTimeout(3500)` después de pulsar «Crear cuenta». El push
había disparado una reconstrucción, el despliegue respondió en frío, y la
respuesta del registro llegó cuando el script ya había cambiado de fase. De ahí
la etiqueta imposible: la variable `step` había avanzado antes que la respuesta.

Tres segundos y medio bastaron hasta que dejaron de bastar. **Una espera fija
codifica una suposición sobre la velocidad de una máquina ajena**, y el
diagnóstico que produce cuando falla describe una aplicación que se estaba
comportando bien.

**Corrección:** `settled(page, ruta)` espera la respuesta concreta que dispara
cada clic y luego a que la página termine de reaccionar. Las cuatro esperas por
duración han desaparecido.

---

## Lo que esto cambió en cómo se corre la batería

`npm run rc` ejecuta los pasos **en orden y se detiene en el primero que
falle**, porque los siguientes correrían sobre el estado que dejó el anterior y
sus resultados describirían una base de datos que nadie quiso construir.

Cada paso declara además un texto que su salida debe contener. Un paso que
termina con código 0 mientras imprime un fallo es un paso que miente, y varios
de estos informan su veredicto por su cuenta.

---

## Un error mío, para que conste

Lancé comprobaciones contra staging **mientras** la batería corría en segundo
plano y estaba haciendo `drop schema public cascade`. Un `drop schema` espera a
que las demás sesiones suelten sus bloqueos, así que mi comprobación pudo
contribuir a dejar la ejecución parada.

Diagnostiqué eso primero, y era plausible, pero **no era la causa**: la salida
real, cuando la vi entera, decía `CONNECTION_CLOSED` desde el pooler. La lección
no es sólo "no toques staging en paralelo" —que también—, sino que un proceso
detenido no explica por qué se detuvo hasta que se lee su salida completa.
