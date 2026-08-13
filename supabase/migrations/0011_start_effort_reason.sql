-- =====================================================================
-- Free AI Radar — por qué cada herramienta tiene el esfuerzo que tiene
--
-- `start_effort` es el único campo del catálogo que no exige cita: describe lo
-- que cuesta empezar, que es una lectura nuestra y no una promesa del
-- fabricante. Esa exención lo vuelve el campo más fácil de rellenar a ojo, y el
-- más difícil de discutir después, porque no deja rastro de en qué se basó.
--
-- Esta columna es ese rastro. Una línea, en castellano, que dice qué se
-- observó: «hay que crear cuenta antes de generar», «requiere descargar modelos
-- y disponer de GPU». Quien audite la ficha dentro de seis meses puede
-- contradecirla sin tener que reconstruir el razonamiento desde cero.
--
-- No es evidencia —para eso está `evidence`, que vive en el repositorio— sino
-- el criterio. Por eso sí entra en el espejo: acompaña siempre al valor que
-- explica, y un valor sin su criterio es la mitad del dato.
-- =====================================================================

alter table public.tools
  add column if not exists start_effort_reason text not null default '';

comment on column public.tools.start_effort_reason is
  'Por qué esta ficha tiene ese start_effort. Criterio editorial, no cita externa.';
