-- Mensajes del formulario de contacto.
--
-- El formulario contestaba «Mensaje recibido» y el mensaje no se guardaba en
-- ninguna parte: en producción el código lo convertía en un correo a hola@, y
-- ese correo no salía (no hay clave de envío) ni habría llegado (el dominio no
-- tenía registros MX). Desde aquí el mensaje se guarda y un administrador lo
-- lee en /admin/contacto.
--
-- Nadie lo lee ni lo escribe desde el navegador: sólo el servidor, con el
-- service role. Por eso no hay ninguna política: con RLS activo y sin
-- políticas, anon y authenticated no ven ni insertan nada, y el `revoke` lo
-- deja dicho también en la capa de privilegios.

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  email       text not null check (char_length(email) between 3 and 254),
  subject     text not null check (char_length(subject) between 1 and 40),
  message     text not null check (char_length(message) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

revoke all on public.contact_messages from anon, authenticated;
grant select, insert, delete on public.contact_messages to service_role;
