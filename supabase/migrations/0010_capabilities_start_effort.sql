-- =====================================================================
-- Free AI Radar — capacidades y esfuerzo de arranque
--
-- Dos columnas que el espejo necesita porque forman parte del registro de la
-- herramienta, no de su documentación editorial. `evidence` y `auditNotes`
-- siguen fuera a propósito: son la trazabilidad de por qué un campo dice lo que
-- dice, y viven en el repositorio, donde se revisan en un diff.
--
-- `capabilities` separa qué sabe hacer algo de en qué categoría vive. Sin ella,
-- "Imagen" contenía a la vez una comunidad de modelos, dos interfaces locales,
-- un grafo de nodos y dos generadores web.
--
-- `start_effort` sustituye a `skill_level` como criterio de comparación: mide
-- el trabajo que exige la herramienta, no la pericia de quien la usa. Con
-- `skill_level` se podía llamar "principiante" a la vez a Fooocus —Python y
-- GPU— y a una web donde escribes y generas.
-- =====================================================================

alter table public.tools
  add column if not exists capabilities jsonb not null default '[]'::jsonb;

alter table public.tools
  add column if not exists start_effort text not null default 'signup';

alter table public.tools
  drop constraint if exists tools_start_effort_known;

alter table public.tools
  add constraint tools_start_effort_known
  check (start_effort in ('instant', 'signup', 'install', 'technical'));

comment on column public.tools.capabilities is
  'Qué sabe hacer, separado de la categoría. Sólo se rellena con lo que una página oficial nombra.';

comment on column public.tools.start_effort is
  'Cuánto hay entre abrir la página y obtener un resultado: instant, signup, install, technical.';
