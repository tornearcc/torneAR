-- ============================================================
-- 570-dt-match-chat — quién escribe en el chat del partido (pgTAP)
-- ============================================================
-- Cubre 20260929130000 (P1-5). Partido entre los equipos del seed …221
-- (capitán auth …0001) y …222 (capitán auth …0004). El perfil …0007 se suma
-- a …221 y va cambiando de rol.
--
--   C-1  el capitán escribe (sin cambios).
--   C-2  el director técnico escribe.
--   C-3  un jugador no escribe.
--   C-4  el DT no escribe en el chat del Mercado de su equipo (MARKET_DM
--        sigue siendo de capitán y subcapitán).
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(4);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into matches (id, team_a_id, team_b_id, status, match_type, scheduled_at) values
  ('57000000-0000-0000-0000-0000000000a1',
   '22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222',
   'PENDIENTE', 'AMISTOSO', now() + interval '1 day');

insert into conversations (id, type, match_id) values
  ('57000000-0000-0000-0000-0000000000c1', 'MATCH_CHAT', '57000000-0000-0000-0000-0000000000a1');
insert into conversations (id, type, player_id, team_id) values
  ('57000000-0000-0000-0000-0000000000c2', 'MARKET_DM',
   '33333333-3333-3333-3333-000000000004', '22222222-2222-2222-2222-222222222221');

insert into team_members (team_id, profile_id, role) values
  ('22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-000000000007', 'DIRECTOR_TECNICO');

-- ── C-1..C-2 ────────────────────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into messages (conversation_id, sender_profile_id, sender_team_id, content)
     values ('57000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-000000000001',
             '22222222-2222-2222-2222-222222222221', 'Nos vemos 21 h') $$,
  'C-1: el capitán escribe en el chat del partido');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select lives_ok(
  $$ insert into messages (conversation_id, sender_profile_id, sender_team_id, content)
     values ('57000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-000000000007',
             '22222222-2222-2222-2222-222222222221', 'Llegamos 20:45') $$,
  'C-2: el director técnico escribe en el chat del partido');

-- ── C-4 (con el mismo DT) ───────────────────────────────────────────────────
select throws_ok(
  $$ insert into messages (conversation_id, sender_profile_id, sender_team_id, content)
     values ('57000000-0000-0000-0000-0000000000c2', '33333333-3333-3333-3333-000000000007',
             '22222222-2222-2222-2222-222222222221', 'Hola') $$,
  '42501', null,
  'C-4: el DT no escribe en el chat del Mercado de su equipo');
select tests.clear_auth();

-- ── C-3 ─────────────────────────────────────────────────────────────────────
update team_members set role = 'JUGADOR'
 where team_id = '22222222-2222-2222-2222-222222222221'
   and profile_id = '33333333-3333-3333-3333-000000000007';

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select throws_ok(
  $$ insert into messages (conversation_id, sender_profile_id, sender_team_id, content)
     values ('57000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-000000000007',
             '22222222-2222-2222-2222-222222222221', 'Yo también quiero') $$,
  '42501', null,
  'C-3: un jugador no escribe en el chat del partido');
select tests.clear_auth();

select * from finish();
rollback;
