-- =====================================================================
-- Free AI Radar — "no lo sabemos" como valor del modelo de gratuidad
--
-- La auditoría del catálogo encontró seis fichas cuyo plan gratuito no se puede
-- comprobar: sus webs devuelven 403 a lectura automatizada. Antes de esto, el
-- enum obligaba a elegir uno de los ocho valores existentes, y elegir cualquiera
-- convierte «no hemos podido comprobarlo» en una afirmación.
--
-- Midjourney estaba almacenada como `trial` exactamente por eso. Un trial que
-- nadie ha visto es una invitación a que alguien intente registrarse gratis y no
-- pueda.
--
-- `creditReset` no necesita migración: vive dentro de `free_plan`, que es jsonb.
-- =====================================================================

-- `if not exists` porque la migración debe poder reaplicarse sobre una base que
-- ya la tenga, igual que el resto del conjunto.
alter type public.free_model add value if not exists 'unknown';
