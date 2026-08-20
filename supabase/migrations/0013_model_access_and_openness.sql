-- Dos cosas que los modelos obligaron a distinguir.
--
-- 1. «Pesos abiertos» no es «open source». Llama 4 se descarga y se ejecuta,
--    pero su licencia exige pedir permiso a Meta por encima de 700 millones de
--    usuarios mensuales y poner «Built with Llama» a la vista. Kimi K3 pide lo
--    mismo a partir de 100 millones. Eso no es una licencia OSI, y decir `yes`
--    en la misma casilla que Apache 2.0 sería contar lo mismo de dos cosas
--    distintas. La columna necesitaba un valor propio, y `tri_state` no podía
--    dárselo sin permitir `requires_credit_card = 'weights'`.
--
-- 2. Un modelo tiene varias formas de acceso y son independientes. Que ChatGPT
--    tenga plan gratuito no hace gratis la API de GPT; que la API de Gemini
--    tenga capa gratuita no la tienen todos sus modelos; que los pesos sean
--    abiertos no hace gratis el endpoint alojado. Son cinco preguntas y se
--    responden por separado.

do $$ begin
  create type public.openness as enum ('yes','no','partial','weights','unverified');
exception when duplicate_object then null; end $$;

alter table public.tools
  alter column open_source drop default;

alter table public.tools
  alter column open_source type public.openness
  using open_source::text::public.openness;

alter table public.tools
  alter column open_source set default 'unverified'::public.openness;

alter table public.tools
  add column if not exists access jsonb not null default '{}'::jsonb;

comment on column public.tools.open_source is
  'yes = licencia OSI; weights = pesos descargables con licencia propia no OSI; partial = mezcla; no; unverified.';

comment on column public.tools.access is
  'Formas de acceso de un modelo, cada una por separado: chat, chat_free, api, api_free, weights.';
