-- ============================================================
-- 510-checkin-window — P1-3, ventana horaria del check-in (pgTAP)
-- ============================================================
-- Cubre 20260928210000: `checkin_team` y `submit_team_checkin` rechazan el
-- check-in fuera de la ventana que ya aplicaba la app (`isWithin2Hours`):
-- abre justo 2 h antes del horario (incluido) y cierra justo 1 h después
-- (excluido).
--
-- `now()` es fijo dentro de la transacción, así que los bordes exactos
-- (`now() + 2 h`, `now() - 1 h`) se prueban sin carreras.
--
-- Aserciones:
--   W-1..W-3  antes de la ventana: las dos RPC dicen CHECKIN_NOT_OPEN y el
--             intento no deja ninguna fila en match_participants.
--   W-4..W-5  dentro: el borde de apertura (2 h antes justas) y 59 min después.
--   W-6..W-7  después: el borde de cierre (1 h después justa) dice
--             CHECKIN_CLOSED en las dos RPC.
--   W-8       la lista se presenta dentro de la ventana.
--   W-9       sin horario no hay check-in.
--   W-10      la función auxiliar no se expone a `authenticated`.
--
-- Equipos y partidos propios, aislados del seed. `format_rules` se baja a 1
-- titular SÓLO dentro de esta transacción, para presentar la lista con el
-- capitán solo.
-- ============================================================

begin;
select plan(10);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('51000000-0000-0000-0000-0000000000a1', 'VNT_A', 'HOMBRES', 'ZVNT', 'FUTBOL_5'),
  ('51000000-0000-0000-0000-0000000000a2', 'VNT_B', 'HOMBRES', 'ZVNT', 'FUTBOL_5');

insert into team_members (team_id, profile_id, role) values
  ('51000000-0000-0000-0000-0000000000a1', '33333333-3333-3333-3333-000000000001', 'CAPITAN');

update format_rules set min_players_to_start = 1 where format = 'FUTBOL_5';

insert into matches (id, team_a_id, team_b_id, status, match_type, format, scheduled_at) values
  -- w1: faltan 2 h y 1 min, todavía no abrió.
  ('5c000000-0000-0000-0000-0000000000a1', '51000000-0000-0000-0000-0000000000a1',
   '51000000-0000-0000-0000-0000000000a2', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '2 hours 1 minute'),
  -- w2: faltan 2 h justas, abre.
  ('5c000000-0000-0000-0000-0000000000a2', '51000000-0000-0000-0000-0000000000a1',
   '51000000-0000-0000-0000-0000000000a2', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() + interval '2 hours'),
  -- w3: empezó hace 59 min, sigue abierta.
  ('5c000000-0000-0000-0000-0000000000a3', '51000000-0000-0000-0000-0000000000a1',
   '51000000-0000-0000-0000-0000000000a2', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '59 minutes'),
  -- w4: empezó hace 1 h justa, cerró.
  ('5c000000-0000-0000-0000-0000000000a4', '51000000-0000-0000-0000-0000000000a1',
   '51000000-0000-0000-0000-0000000000a2', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now() - interval '1 hour'),
  -- w5: es ahora.
  ('5c000000-0000-0000-0000-0000000000a5', '51000000-0000-0000-0000-0000000000a1',
   '51000000-0000-0000-0000-0000000000a2', 'CONFIRMADO', 'AMISTOSO', 'FUTBOL_5',
   now());

create temp table w_list on commit drop as
  select '[{"profile_id":"33333333-3333-3333-3333-000000000001","lineup_role":"TITULAR"}]'::jsonb as players;
grant select on w_list to authenticated;

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

-- ── W-1..W-3. Antes de la ventana ───────────────────────────────────────────
select throws_matching(
  $$ select public.checkin_team('5c000000-0000-0000-0000-0000000000a1',
       '51000000-0000-0000-0000-0000000000a1', null, null) $$,
  '^CHECKIN_NOT_OPEN',
  'W-1: checkin_team rechaza el check-in 2 h y 1 min antes');

select throws_matching(
  $$ select public.submit_team_checkin('5c000000-0000-0000-0000-0000000000a1',
       '51000000-0000-0000-0000-0000000000a1', (select players from w_list)) $$,
  '^CHECKIN_NOT_OPEN',
  'W-2: submit_team_checkin rechaza la lista 2 h y 1 min antes');

select tests.clear_auth();
select is_empty(
  $$ select 1 from match_participants where match_id = '5c000000-0000-0000-0000-0000000000a1' $$,
  'W-3: el intento fuera de horario no deja ninguna fila');
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

-- ── W-4..W-5. Dentro de la ventana ──────────────────────────────────────────
select lives_ok(
  $$ select public.checkin_team('5c000000-0000-0000-0000-0000000000a2',
       '51000000-0000-0000-0000-0000000000a1', null, null) $$,
  'W-4: a 2 h justas del horario la ventana ya abrió');

select lives_ok(
  $$ select public.checkin_team('5c000000-0000-0000-0000-0000000000a3',
       '51000000-0000-0000-0000-0000000000a1', null, null) $$,
  'W-5: 59 min después del horario todavía se puede');

-- ── W-6..W-7. Después de la ventana ─────────────────────────────────────────
select throws_matching(
  $$ select public.checkin_team('5c000000-0000-0000-0000-0000000000a4',
       '51000000-0000-0000-0000-0000000000a1', null, null) $$,
  '^CHECKIN_CLOSED',
  'W-6: checkin_team rechaza el check-in 1 h justa después');

select throws_matching(
  $$ select public.submit_team_checkin('5c000000-0000-0000-0000-0000000000a4',
       '51000000-0000-0000-0000-0000000000a1', (select players from w_list)) $$,
  '^CHECKIN_CLOSED',
  'W-7: submit_team_checkin rechaza la lista 1 h justa después');

-- ── W-8. La lista dentro de la ventana ──────────────────────────────────────
select is(
  (select public.submit_team_checkin('5c000000-0000-0000-0000-0000000000a5',
     '51000000-0000-0000-0000-0000000000a1', (select players from w_list))->>'total'),
  '1',
  'W-8: la lista se presenta a la hora del partido');

select tests.clear_auth();

-- ── W-9..W-10. La función auxiliar ──────────────────────────────────────────
select throws_matching(
  $$ select public.assert_checkin_window(null) $$,
  '^CHECKIN_NOT_OPEN',
  'W-9: un partido sin horario no admite check-in');

select ok(
  not has_function_privilege('authenticated', 'public.assert_checkin_window(timestamptz)', 'execute'),
  'W-10: assert_checkin_window no se expone a authenticated');

select * from finish();
rollback;
