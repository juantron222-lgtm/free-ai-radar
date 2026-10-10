-- Contadores de uso: cuántas veces al día, nunca quién.
--
-- La web no sabía si servía. Vercel cuenta páginas vistas, pero no si alguien
-- encontró una herramienta y fue a su web, qué buscó o qué búsqueda no dio
-- nada. Esta tabla guarda sólo totales por día: no hay IP, cookie, sesión ni
-- usuario, y una fila no puede atribuirse a nadie.
--
-- Eventos:
--   salida          clic al sitio oficial (clave: slug de la herramienta)
--   precios         clic a su página de precios (clave: slug)
--   busqueda        búsqueda con resultados (clave: el texto, normalizado)
--   busqueda_vacia  búsqueda sin resultados (clave: el texto, normalizado)
--   filtro          filtro aplicado en el catálogo (clave: parámetro=valor)
--   comparar        comparación vista (clave: slugs ordenados, separados por |)
--
-- `salida` y `precios` se cuentan en el servidor al pasar por /ir/<slug>; los
-- demás, sólo de quien aceptó «Analítica» en el aviso de cookies, que es lo
-- que ese aviso promete.

create table if not exists public.uso_diario (
  dia     date not null,
  evento  text not null check (evento in ('salida', 'precios', 'busqueda', 'busqueda_vacia', 'filtro', 'comparar')),
  clave   text not null check (char_length(clave) between 1 and 80),
  cuenta  integer not null default 0 check (cuenta >= 0),
  primary key (dia, evento, clave)
);

alter table public.uso_diario enable row level security;
revoke all on public.uso_diario from anon, authenticated;
grant select, insert, update, delete on public.uso_diario to service_role;

-- Suma uno, de forma atómica, y de paso borra lo que pasa de 14 meses: el
-- plazo que la política de privacidad da para estas métricas se cumple solo.
create or replace function public.contar_uso(p_evento text, p_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.uso_diario (dia, evento, clave, cuenta)
  values ((now() at time zone 'Europe/Madrid')::date, p_evento, p_clave, 1)
  on conflict (dia, evento, clave) do update set cuenta = public.uso_diario.cuenta + 1;

  delete from public.uso_diario where dia < (now() at time zone 'Europe/Madrid')::date - interval '14 months';
end;
$$;

revoke all on function public.contar_uso(text, text) from public, anon, authenticated;
grant execute on function public.contar_uso(text, text) to service_role;
