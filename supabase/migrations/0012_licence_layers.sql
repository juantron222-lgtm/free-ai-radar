-- =====================================================================
-- Free AI Radar — la licencia no es una sola cosa
--
-- `licence` guardaba una cadena, y con ella el catálogo decía «Apache-2.0» de
-- proyectos cuyo código es Apache pero cuyos pesos son CC-BY-NC. Las dos
-- afirmaciones son ciertas por separado y juntas engañan: quien lee «open
-- source» y va a usarlo en un trabajo se lleva la sorpresa en el sitio
-- equivocado, que es después de haberlo integrado.
--
-- Tres capas, porque tres son las que pueden diferir y de hecho difieren:
--
--   code     el repositorio. Casi siempre permisiva.
--   weights  los pesos publicados. Es donde aparece CC-BY-NC.
--   outputs  lo que produces con ella. Rara vez se documenta, y por eso
--            merece existir como hueco explícito en vez de darse por hecho.
--
-- `licence` se conserva: sigue siendo el resumen legible de una sola línea
-- cuando las tres coinciden, y hay fichas que sólo tienen eso.
-- =====================================================================

alter table public.tools
  add column if not exists licences jsonb not null default '{}'::jsonb;

comment on column public.tools.licences is
  'Licencia por capa: code, weights, outputs. Sólo lo que una fuente oficial declare.';
