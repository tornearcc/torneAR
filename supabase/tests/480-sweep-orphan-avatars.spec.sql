-- ============================================================
-- 480-sweep-orphan-avatars — barrido de huérfanos de avatars (pgTAP)
-- ============================================================
-- Cubre 20260925140000. Escenario en la carpeta de P1 (auth …0001), con
-- objetos de storage insertados a mano y fechas controladas:
--   huerfano-viejo      sin referencia, 48 h     → candidato
--   huerfano-reciente   sin referencia, 1 h      → NO (margen de 24 h)
--   en-perfil           es el avatar de P1, 48 h → NO
--   url-publica         referenciado como URL pública por P7, 48 h → NO
--   evidencia           de una denuncia USER PENDING, 48 h → NO
--   evidencia-cerrada   de una denuncia ya DISMISSED, 48 h → candidato
--
--   W-1      El dry-run lista exactamente los candidatos.
--   W-2      El dry-run no encola nada ni registra nada.
--   W-3      El umbral sale de app_settings (con 1000 h no hay candidatos).
--   W-4..W-6 La corrida real encola el DELETE de los candidatos (y de nada
--            más) y registra avatar.orphan_sweep con los números.
--   W-7      Sin candidatos, igual registra la corrida (con 0).
--   W-8      anon y authenticated no pueden ejecutarla.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(9);

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/en-perfil.jpg'
where id = '33333333-3333-3333-3333-000000000001';
update profiles
set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/aaaaaaaa-0000-0000-0000-000000000001/url-publica.jpg'
where id = '33333333-3333-3333-3333-000000000007';

insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/huerfano-viejo.jpg',    now() - interval '48 hours', '{"size": 1000}'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/huerfano-reciente.jpg', now() - interval '1 hour',   '{"size": 1000}'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/en-perfil.jpg',         now() - interval '48 hours', '{"size": 1000}'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/url-publica.jpg',       now() - interval '48 hours', '{"size": 1000}'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/evidencia.jpg',         now() - interval '48 hours', '{"size": 1000}'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/evidencia-cerrada.jpg', now() - interval '48 hours', '{"size": 500}');

-- Denuncias: el trigger de captura toma el avatar del momento, así que se
-- ajusta después para simular que la foto denunciada era otra.
insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason, status) values
  ('a8a8a8a8-0000-0000-0000-00000000dd01', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada', 'PENDING'),
  ('a8a8a8a8-0000-0000-0000-00000000dd02', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada', 'DISMISSED');
update content_reports set reported_avatar_path = 'aaaaaaaa-0000-0000-0000-000000000001/evidencia.jpg'
where id = 'a8a8a8a8-0000-0000-0000-00000000dd01';
update content_reports set reported_avatar_path = 'aaaaaaaa-0000-0000-0000-000000000001/evidencia-cerrada.jpg'
where id = 'a8a8a8a8-0000-0000-0000-00000000dd02';

-- Sólo los objetos de este escenario (el seed no tiene otros en avatars).
select results_eq(
  $$ select replace(objeto, 'aaaaaaaa-0000-0000-0000-000000000001/', '') from sweep_orphan_avatars(true) order by 1 $$,
  $$ values ('evidencia-cerrada.jpg'), ('huerfano-viejo.jpg') $$,
  'W-1: el dry-run lista sólo los huérfanos viejos (también la evidencia de una denuncia cerrada)');

select is(
  (select count(*)::int from net.http_request_queue where url like '%/aaaaaaaa-0000-0000-0000-000000000001/%')
  + (select count(*)::int from app_logs where message = 'avatar.orphan_sweep'),
  0,
  'W-2: el dry-run no encola ni registra nada');

update app_settings set value = 1000 where key = 'sweep_orphan_avatars_min_age_hours';
select is(
  (select count(*)::int from sweep_orphan_avatars(true)),
  0,
  'W-3: el umbral sale de app_settings');
update app_settings set value = 24 where key = 'sweep_orphan_avatars_min_age_hours';

-- ── Corrida real, con secreto ───────────────────────────────────────────────
select vault.create_secret('clave-de-prueba', 'storage_service_role_key');
select count(*) from sweep_orphan_avatars();

select results_eq(
  $$ select replace(url, public.storage_avatars_object_url(), '') from net.http_request_queue
      where method = 'DELETE' and url like '%/aaaaaaaa-0000-0000-0000-000000000001/%' order by 1 $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001/evidencia-cerrada.jpg'),
            ('aaaaaaaa-0000-0000-0000-000000000001/huerfano-viejo.jpg') $$,
  'W-4: encola el DELETE de los candidatos y de nada más');

select results_eq(
  $$ select (details->>'candidatos')::int, (details->>'pedidos_de_borrado')::int, (details->>'bytes')::bigint, (details->>'min_age_hours')::numeric
       from app_logs where message = 'avatar.orphan_sweep' $$,
  $$ values (2, 2, 1500::bigint, 24::numeric) $$,
  'W-5: registra la corrida con candidatos, pedidos, bytes y umbral');

select is(
  (select count(*)::int from app_logs where message = 'avatar.file_deletion_requested'
    and details->>'scope' = 'sweep_orphan_avatars'),
  1,
  'W-6: y el detalle de paths queda en avatar.file_deletion_requested');

-- ── Sin candidatos ──────────────────────────────────────────────────────────
update app_settings set value = 100000 where key = 'sweep_orphan_avatars_min_age_hours';
select count(*) from sweep_orphan_avatars();
select is(
  (select count(*)::int from app_logs where message = 'avatar.orphan_sweep'
    and details->>'candidatos' = '0' and details->>'pedidos_de_borrado' = '0'),
  1,
  'W-7: sin candidatos, la corrida igual queda registrada (con 0)');

-- ── Permisos ────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.sweep_orphan_avatars(boolean, integer)', 'EXECUTE'),
  'W-8: anon no puede ejecutarla');
select ok(
  not has_function_privilege('authenticated', 'public.sweep_orphan_avatars(boolean, integer)', 'EXECUTE'),
  'W-8: authenticated no puede ejecutarla');

select * from finish();
rollback;
