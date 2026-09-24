-- ============================================================
-- 450-admin-remove-reported-avatar — rama USER de la remoción (pgTAP)
-- ============================================================
-- Cubre la rama USER que agrega 20260924140000 a
-- `public.admin_remove_reported_content`: una foto de perfil denunciada se
-- puede quitar sin suspender la cuenta.
--
-- Aserciones:
--   U-1      Un no-admin no puede quitar la foto (la foto sigue).
--   U-2/U-3  El admin la quita: avatar_url queda NULL y el resto del perfil
--            no se toca.
--   U-4      La denuncia queda ACTIONED.
--   U-5      La auditoría registra la acción y el path quitado, que es lo que
--            el dashboard necesita para borrar el archivo del bucket.
--   U-6      Sobre un perfil que ya no tiene foto se rechaza, y la denuncia
--            NO se marca ACTIONED (no se hizo nada).
-- ============================================================

begin;
select plan(7);

-- ── Setup como postgres ─────────────────────────────────────────────────────
-- Admin: P4 (auth aaaaaaaa-…-0004). Denunciado con foto: P1. Sin foto: P7.
update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-denunciado.jpg'
where id = '33333333-3333-3333-3333-000000000001';
update profiles set avatar_url = null
where id = '33333333-3333-3333-3333-000000000007';

insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason) values
  ('e5e5e5e5-0000-0000-0000-00000000dd01', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada'),
  ('e5e5e5e5-0000-0000-0000-00000000dd02', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000007', 'Foto de perfil inapropiada');

-- ── U-1. No-admin ───────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
select throws_matching(
  $$ select admin_remove_reported_content('e5e5e5e5-0000-0000-0000-00000000dd01') $$,
  'NOT_AUTHORIZED',
  'U-1: un no-admin no puede quitar una foto denunciada');

-- ── Como admin ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);

select lives_ok(
  $$ select admin_remove_reported_content('e5e5e5e5-0000-0000-0000-00000000dd01') $$,
  'U-2: el admin quita la foto denunciada');

select results_eq(
  $$ select avatar_url is null, full_name is not null, username is not null
       from profiles where id = '33333333-3333-3333-3333-000000000001' $$,
  $$ values (true, true, true) $$,
  'U-3: avatar_url queda NULL y el resto del perfil sigue igual');

select is(
  (select status::text from content_reports where id = 'e5e5e5e5-0000-0000-0000-00000000dd01'),
  'ACTIONED',
  'U-4: la denuncia queda ACTIONED');

select results_eq(
  $$ select details->>'action', details->>'removed_avatar_path'
       from app_logs
      where message = 'admin.remove_reported_content'
        and details->>'report_id' = 'e5e5e5e5-0000-0000-0000-00000000dd01' $$,
  $$ values ('avatar_removed', 'aaaaaaaa-0000-0000-0000-000000000001/avatar-denunciado.jpg') $$,
  'U-5: la auditoría guarda la acción y el path a borrar del bucket');

select throws_matching(
  $$ select admin_remove_reported_content('e5e5e5e5-0000-0000-0000-00000000dd02') $$,
  'NO_CONTENT_TO_REMOVE',
  'U-6: sobre un perfil sin foto se rechaza');

select is(
  (select status::text from content_reports where id = 'e5e5e5e5-0000-0000-0000-00000000dd02'),
  'PENDING',
  'U-6: y la denuncia no se marca ACTIONED');

select * from finish();
rollback;
