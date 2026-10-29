-- ============================================================
-- 650-new-profile-nudges — avisos a cuentas nuevas sin equipo (pgTAP)
-- ============================================================
-- Cubre 20261028130000. Perfiles propios (np_1..np_6), sin tocar el seed.
--
--   N-1..N-2  24 h sin equipo → aviso 1 (ANUNCIO a crear equipo), una sola vez.
--   N-3..N-5  no avisa a quien tiene equipo, a una cuenta de menos de 24 h ni a
--             una creada antes del 21/10.
--   N-6..N-7  48 h después del aviso 1, si sigue sin equipo → aviso 2 (programa
--             de embajadores), una sola vez.
--   N-8       el aviso 2 no le llega a quien ya es embajador.
--   N-9       con el programa apagado no sale el aviso 2.
--   N-10      ni anon ni authenticated ejecutan la función.
--   N-11      el cron corre a las 11 y 18 h de Argentina, en :00.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(11);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('0b650000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'np' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from generate_series(1, 6) g;

-- np_1: 25 h, sin equipo            → avisos 1 y 2
-- np_2: 25 h, con equipo            → nada
-- np_3: 2 h, sin equipo             → nada (todavía)
-- np_4: creado el 01/10, sin equipo → nada (anterior al programa)
-- np_5: 25 h, sin equipo, embajador → aviso 1, no el 2
-- np_6: 25 h, sin equipo            → aviso 1; el 2 con el programa apagado
insert into public.profiles (id, auth_user_id, username, full_name, zone, created_at)
select ('0c650000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       ('0b650000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'np_' || g, 'Nuevo ' || g, 'Palermo',
       case g when 3 then now() - interval '2 hours'
              when 4 then '2026-10-01 12:00-03'::timestamptz
              else now() - interval '25 hours' end
  from generate_series(1, 6) g;

insert into teams (id, name, category, zone, preferred_format) values
  ('0d650000-0000-0000-0000-000000000002', 'NP_TEAM', 'HOMBRES', 'Palermo', 'FUTBOL_5');
insert into team_members (team_id, profile_id, role) values
  ('0d650000-0000-0000-0000-000000000002', '0c650000-0000-0000-0000-000000000002', 'CAPITAN');

insert into public.ambassadors (profile_id, instagram, terms_version)
values ('0c650000-0000-0000-0000-000000000005', 'np.cinco', 1);

update public.app_settings set value = 1 where key = 'ambassador_program_enabled';

create or replace function pg_temp.np_notifs(p_n int, p_stage int)
returns setof text language sql as $$
  select n.data->>'url' from public.notifications n
   where n.profile_id = ('0c650000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
     and n.type = 'ANUNCIO' and n.data->>'kind' = 'new_profile_nudge'
     and (n.data->>'stage')::int = p_stage
$$;

-- Los perfiles del seed quedan fuera de la ventana: si la base local se cargó
-- hace más de 24 h, también serían «cuentas nuevas sin equipo».
update public.profiles set created_at = '2026-10-01 12:00-03'
 where id::text not like '0c650000-%';

-- ── N-1..N-5. Aviso 1 ───────────────────────────────────────────────────────
select is(public.nudge_new_profiles(), 3, 'N-1: aviso 1 a las tres cuentas de 25 h sin equipo');

select results_eq(
  $$ select * from pg_temp.np_notifs(1, 1) $$,
  $$ values ('tornear://team-create') $$,
  'N-2: el aviso 1 lleva a crear equipo');

select is(
  (select count(*)::int from public.notifications
    where profile_id = '0c650000-0000-0000-0000-000000000002' and data->>'kind' = 'new_profile_nudge'),
  0, 'N-3: no le avisa a quien ya tiene equipo');

select is(
  (select count(*)::int from public.notifications
    where profile_id = '0c650000-0000-0000-0000-000000000003' and data->>'kind' = 'new_profile_nudge'),
  0, 'N-4: no le avisa a una cuenta de menos de 24 h');

select is(
  (select count(*)::int from public.notifications
    where profile_id = '0c650000-0000-0000-0000-000000000004' and data->>'kind' = 'new_profile_nudge'),
  0, 'N-5: no le avisa a una cuenta anterior al programa (21/10)');

-- ── N-6..N-9. Aviso 2 ───────────────────────────────────────────────────────
-- Sin pasar 48 h no sale nada nuevo.
select is(public.nudge_new_profiles(), 0, 'N-6: correr de nuevo enseguida no repite ni adelanta avisos');

update public.profile_nudges set sent_at = now() - interval '49 hours' where stage = 1;
-- np_6 prueba el programa apagado: se lo deja para el final.
update public.profile_nudges set sent_at = now() where profile_id = '0c650000-0000-0000-0000-000000000006';

select is(
  (select public.nudge_new_profiles()),
  1,
  'N-7: a las 48 h del aviso 1, aviso 2 solo a np_1');

select results_eq(
  $$ select (select count(*)::int from pg_temp.np_notifs(1, 2)),
            (select count(*)::int from pg_temp.np_notifs(5, 2)) $$,
  $$ values (1, 0) $$,
  'N-8: el aviso 2 (embajadores) no le llega a quien ya es embajador');

update public.app_settings set value = 0 where key = 'ambassador_program_enabled';
update public.profile_nudges set sent_at = now() - interval '49 hours'
 where profile_id = '0c650000-0000-0000-0000-000000000006';
select is(public.nudge_new_profiles(), 0, 'N-9: con el programa apagado no sale el aviso 2');

-- ── N-10..N-11. Permisos y cron ─────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.nudge_new_profiles()', 'execute')
  and not has_function_privilege('authenticated', 'public.nudge_new_profiles()', 'execute'),
  'N-10: ni anon ni authenticated ejecutan la función');

select results_eq(
  $$ select schedule from cron.job where jobname = 'nudge-new-profiles' $$,
  $$ values ('0 14,21 * * *') $$,
  'N-11: el cron corre a las 11 y 18 h de Argentina');

select * from finish();
rollback;
