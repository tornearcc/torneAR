-- ============================================================
-- 460-report-avatar-snapshot — la foto denunciada (pgTAP)
-- ============================================================
-- Cubre 20260925120000:
--   S-1/S-2  El trigger guarda el avatar del denunciado en las denuncias USER
--            y NULL en las demás.
--   S-3      Un path enviado por el cliente se descarta (no se puede apuntar
--            a la foto de otra persona).
--   S-4      submit_content_report (la denuncia de la app) lo guarda.
--   S-5      block_user (la denuncia automática del bloqueo) lo guarda.
--   R-1..R-3 "Quitar foto" con la foto sin cambios: la saca del perfil y
--            registra removed_from_profile = true.
--   R-4..R-6 La persona cambió la foto después de la denuncia: NO se toca el
--            perfil y se registra el path de la foto denunciada.
--   R-7      Denuncia vieja (sin reported_avatar_path): apunta a la actual.
--   R-8      Un path de otra carpeta se rechaza con INVALID_AVATAR_PATH.
--
-- Perfiles del seed: admin P4 (auth …0004), denunciado P1 (auth …0001),
-- denunciante P7 (auth …0007). Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(15);

update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-denunciada.jpg'
where id = '33333333-3333-3333-3333-000000000001';

-- ── S-1..S-3. El trigger ────────────────────────────────────────────────────
insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason, reported_avatar_path) values
  ('f6f6f6f6-0000-0000-0000-00000000dd01', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada', 'otra-carpeta/ajena.jpg'),
  ('f6f6f6f6-0000-0000-0000-00000000dd02', '33333333-3333-3333-3333-000000000004', 'MATCH',
   'f6f6f6f6-0000-0000-0000-00000000ee01', 'Resultado falso', 'lo-que-sea.jpg');

select is(
  (select reported_avatar_path from content_reports where id = 'f6f6f6f6-0000-0000-0000-00000000dd01'),
  'aaaaaaaa-0000-0000-0000-000000000001/avatar-denunciada.jpg',
  'S-1/S-3: guarda el avatar real del denunciado y descarta el que mandó el cliente');

select is(
  (select reported_avatar_path from content_reports where id = 'f6f6f6f6-0000-0000-0000-00000000dd02'),
  null,
  'S-2: en una denuncia que no es USER queda NULL');

-- ── S-4. submit_content_report ──────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000007"}', true);
-- En su propia sentencia: el SELECT que lee la denuncia tiene que ver la fila
-- que la función insertó.
select set_config('test.app_report_id',
  submit_content_report('USER', '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada')::text, true);
select is(
  (select reported_avatar_path from content_reports
    where id = current_setting('test.app_report_id')::uuid),
  'aaaaaaaa-0000-0000-0000-000000000001/avatar-denunciada.jpg',
  'S-4: la denuncia desde la app guarda la foto');

-- ── S-5. block_user ─────────────────────────────────────────────────────────
-- Otro perfil del seed como bloqueador: P7 ya tiene una denuncia PENDING sobre
-- P1, y block_user no crea una segunda.
do $$
declare
  v_blocker_auth uuid;
begin
  select auth_user_id into v_blocker_auth from profiles
  where auth_user_id is not null
    and id not in ('33333333-3333-3333-3333-000000000001', '33333333-3333-3333-3333-000000000004',
                   '33333333-3333-3333-3333-000000000007')
  order by id limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_blocker_auth)::text, true);
  perform block_user('33333333-3333-3333-3333-000000000001', 'test');
end $$;

select is(
  (select reported_avatar_path from content_reports
    where reported_entity_id = '33333333-3333-3333-3333-000000000001'
      and reason like 'Bloqueo de usuario%'
    order by created_at desc limit 1),
  'aaaaaaaa-0000-0000-0000-000000000001/avatar-denunciada.jpg',
  'S-5: la denuncia automática del bloqueo también guarda la foto');

-- ── R-1..R-3. Foto sin cambios ──────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);

select lives_ok(
  $$ select admin_remove_reported_content('f6f6f6f6-0000-0000-0000-00000000dd01') $$,
  'R-1: quita la foto denunciada');

select is(
  (select avatar_url from profiles where id = '33333333-3333-3333-3333-000000000001'),
  null,
  'R-2: como seguía siendo la actual, sale del perfil');

select results_eq(
  $$ select details->>'removed_avatar_path', details->>'removed_from_profile'
       from app_logs where message = 'admin.remove_reported_content'
        and details->>'report_id' = 'f6f6f6f6-0000-0000-0000-00000000dd01' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001/avatar-denunciada.jpg', 'true') $$,
  'R-3: registra el path y removed_from_profile = true');

-- ── R-4..R-6. La persona cambió la foto después de la denuncia ──────────────
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-vieja.jpg'
where id = '33333333-3333-3333-3333-000000000001';
insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason) values
  ('f6f6f6f6-0000-0000-0000-00000000dd03', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada');
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-nueva.jpg'
where id = '33333333-3333-3333-3333-000000000001';

select lives_ok(
  $$ select admin_remove_reported_content('f6f6f6f6-0000-0000-0000-00000000dd03') $$,
  'R-4: quita la foto denunciada aunque ya no sea la actual');

select is(
  (select avatar_url from profiles where id = '33333333-3333-3333-3333-000000000001'),
  'aaaaaaaa-0000-0000-0000-000000000001/avatar-nueva.jpg',
  'R-5: NO toca el perfil: la foto nueva nadie la denunció');

select results_eq(
  $$ select details->>'removed_avatar_path', details->>'removed_from_profile'
       from app_logs where message = 'admin.remove_reported_content'
        and details->>'report_id' = 'f6f6f6f6-0000-0000-0000-00000000dd03' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001/avatar-vieja.jpg', 'false') $$,
  'R-6: registra el path de la foto denunciada (la vieja) para borrar el archivo');

select is(
  (select status::text from content_reports where id = 'f6f6f6f6-0000-0000-0000-00000000dd03'),
  'PENDING',
  'R-6: y la denuncia sigue PENDING hasta que el dashboard borre el archivo');

-- ── R-7. Denuncia anterior a la migración ───────────────────────────────────
insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason) values
  ('f6f6f6f6-0000-0000-0000-00000000dd04', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Spam');
-- Como las viejas: sin foto guardada.
update content_reports set reported_avatar_path = null where id = 'f6f6f6f6-0000-0000-0000-00000000dd04';

select lives_ok(
  $$ select admin_remove_reported_content('f6f6f6f6-0000-0000-0000-00000000dd04') $$,
  'R-7: una denuncia vieja sin foto guardada se resuelve con la actual');

select is(
  (select details->>'removed_avatar_path' from app_logs where message = 'admin.remove_reported_content'
    and details->>'report_id' = 'f6f6f6f6-0000-0000-0000-00000000dd04'),
  'aaaaaaaa-0000-0000-0000-000000000001/avatar-nueva.jpg',
  'R-7: y apunta a la foto actual, como antes de esta migración');

-- ── R-8. Path de otra carpeta ───────────────────────────────────────────────
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-otra.jpg'
where id = '33333333-3333-3333-3333-000000000001';
insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason) values
  ('f6f6f6f6-0000-0000-0000-00000000dd05', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada');
-- Simula una fila alterada a mano (el trigger no lo permitiría en el INSERT).
update content_reports set reported_avatar_path = 'aaaaaaaa-0000-0000-0000-000000000007/de-otro.jpg'
where id = 'f6f6f6f6-0000-0000-0000-00000000dd05';

select throws_matching(
  $$ select admin_remove_reported_content('f6f6f6f6-0000-0000-0000-00000000dd05') $$,
  'INVALID_AVATAR_PATH',
  'R-8: nunca manda a borrar un archivo que no es de la carpeta del denunciado');

select is(
  (select avatar_url from profiles where id = '33333333-3333-3333-3333-000000000001'),
  'aaaaaaaa-0000-0000-0000-000000000001/avatar-otra.jpg',
  'R-8: y no toca el perfil');

select * from finish();
rollback;
