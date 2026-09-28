-- ============================================================
-- 540-confirm-guest-allowance — lugar de invitado al confirmar (pgTAP)
-- ============================================================
-- Cubre 20260929010000 (D-56 / D-60, P1-4). Los invitados sólo pueden sumarse
-- a un partido ya confirmado, así que al confirmar se le deja a cada plantel
-- `confirm_guest_slots` lugares para completar con ellos:
--   miembros necesarios = min_players_to_start − confirm_guest_slots (mín. 1)
--
-- FUTBOL_5 se fija en 4 titulares mínimos SÓLO dentro de esta transacción.
-- GA (propone) tiene 3 miembros; GB (confirma) arranca con 2.
--
--   G-1      la migración deja un lugar de invitado.
--   G-2      con 2 miembros, GB no llega (necesita 3 = 4 − 1).
--   G-3..G-4 con 3 miembros confirma: el cuarto puede ser un invitado.
--   G-5      con 0 lugares vuelve la regla vieja (4 miembros).
--   G-6      nunca se exige menos de 1 miembro, aunque el cupo sea enorme.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(6);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('d6a00000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'authenticated', 'authenticated', 'd60.g' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 6) g;

insert into profiles (id, auth_user_id, username, full_name, zone)
select ('d6b00000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       ('d6a00000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       '__d60_g' || g, 'D60 G ' || g, 'Palermo'
from generate_series(1, 6) g;

insert into teams (id, name, category, zone, preferred_format) values
  ('d6c00000-0000-0000-0000-00000000000a', 'GA', 'HOMBRES', 'ZD60', 'FUTBOL_5'),
  ('d6c00000-0000-0000-0000-00000000000b', 'GB', 'HOMBRES', 'ZD60', 'FUTBOL_5');

insert into team_members (team_id, profile_id, role) values
  ('d6c00000-0000-0000-0000-00000000000a', 'd6b00000-0000-0000-0000-000000000001', 'CAPITAN'),
  ('d6c00000-0000-0000-0000-00000000000a', 'd6b00000-0000-0000-0000-000000000002', 'JUGADOR'),
  ('d6c00000-0000-0000-0000-00000000000a', 'd6b00000-0000-0000-0000-000000000003', 'JUGADOR'),
  ('d6c00000-0000-0000-0000-00000000000b', 'd6b00000-0000-0000-0000-000000000004', 'CAPITAN'),
  ('d6c00000-0000-0000-0000-00000000000b', 'd6b00000-0000-0000-0000-000000000005', 'JUGADOR');

update format_rules set min_players_to_start = 4 where format = 'FUTBOL_5';

-- Tres partidos PENDIENTE entre GA y GB, cada uno con su propuesta de GA en
-- días distintos (así no chocan entre sí al confirmarse).
insert into matches (id, team_a_id, team_b_id, status, match_type, scheduled_at)
select ('d6d00000-0000-0000-0000-00000000000' || g)::uuid,
       'd6c00000-0000-0000-0000-00000000000a', 'd6c00000-0000-0000-0000-00000000000b',
       'PENDIENTE', 'AMISTOSO', now() + make_interval(days => g + 1)
from generate_series(1, 3) g;

insert into match_proposals (id, match_id, proposed_by, from_team_id, format, match_type,
                             scheduled_at, duration_minutes)
select ('d6e00000-0000-0000-0000-00000000000' || g)::uuid,
       ('d6d00000-0000-0000-0000-00000000000' || g)::uuid,
       'd6b00000-0000-0000-0000-000000000001', 'd6c00000-0000-0000-0000-00000000000a',
       'FUTBOL_5', 'AMISTOSO', now() + make_interval(days => g + 1), 60
from generate_series(1, 3) g;

select is(
  (select value from app_settings where key = 'confirm_guest_slots'),
  1::numeric,
  'G-1: la migración deja un lugar de invitado por plantel');

-- ── G-2..G-4 ────────────────────────────────────────────────────────────────
select tests.authenticate_as_profile('d6a00000-0000-0000-0000-000000000004');
select throws_matching(
  $$ select public.confirm_match_proposal('d6e00000-0000-0000-0000-000000000001',
                                         'd6d00000-0000-0000-0000-000000000001') $$,
  '^SQUAD_TOO_SMALL: GB tiene 2 jugador\(es\) y para FUTBOL_5 necesita al menos 3 en el plantel \(más 1 invitado',
  'G-2: con 2 miembros GB no llega: necesita 3 más el invitado');
select tests.clear_auth();

insert into team_members (team_id, profile_id, role) values
  ('d6c00000-0000-0000-0000-00000000000b', 'd6b00000-0000-0000-0000-000000000006', 'JUGADOR');

select tests.authenticate_as_profile('d6a00000-0000-0000-0000-000000000004');
select lives_ok(
  $$ select public.confirm_match_proposal('d6e00000-0000-0000-0000-000000000001',
                                         'd6d00000-0000-0000-0000-000000000001') $$,
  'G-3: con 3 miembros confirma; el cuarto puede ser un invitado');
select tests.clear_auth();

select is(
  (select status::text from matches where id = 'd6d00000-0000-0000-0000-000000000001'),
  'CONFIRMADO',
  'G-4: el partido queda confirmado');

-- ── G-5..G-6. El cupo sale de app_settings ──────────────────────────────────
update app_settings set value = 0 where key = 'confirm_guest_slots';
select tests.authenticate_as_profile('d6a00000-0000-0000-0000-000000000004');
select throws_matching(
  $$ select public.confirm_match_proposal('d6e00000-0000-0000-0000-000000000002',
                                         'd6d00000-0000-0000-0000-000000000002') $$,
  '^SQUAD_TOO_SMALL: GA tiene 3 jugador\(es\) y para FUTBOL_5 necesita al menos 4',
  'G-5: sin lugares de invitado vuelve la regla anterior (4 miembros)');
select tests.clear_auth();

update app_settings set value = 10 where key = 'confirm_guest_slots';
delete from team_members
 where team_id = 'd6c00000-0000-0000-0000-00000000000b'
   and profile_id in ('d6b00000-0000-0000-0000-000000000005', 'd6b00000-0000-0000-0000-000000000006');
select tests.authenticate_as_profile('d6a00000-0000-0000-0000-000000000004');
select lives_ok(
  $$ select public.confirm_match_proposal('d6e00000-0000-0000-0000-000000000003',
                                         'd6d00000-0000-0000-0000-000000000003') $$,
  'G-6: con un cupo enorme alcanza con 1 miembro, nunca con 0');
select tests.clear_auth();

select * from finish();
rollback;
