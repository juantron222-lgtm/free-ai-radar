-- Qué clase de producto es, cuando la vertical necesita distinguirlo.
--
-- En /codigo todo era `kind: 'agent'` y por eso la categoría era «agentes que
-- programan»: Cursor es un editor, GitHub Copilot un autocompletado, Bolt un
-- constructor de aplicaciones y Aider una herramienta de terminal. Las cuatro
-- se anuncian como «AI coding» y ninguna sirve para lo mismo.
--
-- No se puede inferir de las capacidades. Cursor y Cline editan repositorios y
-- usan la terminal exactamente igual; lo que las separa es qué son, y eso es
-- un juicio editorial. `kind` es demasiado grueso —los ocho valores que tiene
-- describen el catálogo entero— así que la distinción necesita su propia
-- columna, opcional y sólo rellena donde importa.

do $$ begin
  create type public.product_type as enum (
    'ide', 'copilot', 'agent', 'cli', 'review', 'app-builder', 'platform', 'library'
  );
exception when duplicate_object then null; end $$;

alter table public.tools
  add column if not exists product_type public.product_type;

comment on column public.tools.product_type is
  'Clase de producto dentro de su vertical: editor, copiloto, agente, terminal, revisión, constructor de apps, plataforma o biblioteca.';
