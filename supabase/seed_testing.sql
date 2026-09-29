-- ============================================================
-- SEED DEL STACK LOCAL Y DE TESTING — torneAR
-- ------------------------------------------------------------
-- ⚠️ NUNCA correr esto contra producción. Es el seed que carga
--    `supabase db reset` / `supabase start` (ver `sql_paths` en config.toml).
--    El seed de producción es `supabase/seed.sql`.
--
-- Estructura en dos capas:
--   · BLOQUE 0 — Contrato intocable de los 160 tests pgTAP (UUIDs históricos
--     33333333/22222222/aaaaaaaa/44444444/00861a5e/ef88b757/8e7bd5df).
--   · BLOQUES 1..4 — Extensión para el frontend React Native, con UUIDs
--     limpios y deterministas (familia 0a/0b/0c/0d/0e/0f) que NO colisionan
--     con el Bloque 0 ni con ningún fixture de las suites de tests.
--
-- Sólo lo aplica `supabase db reset` — nunca se ejecuta en producción.
-- Contraseña de todos los usuarios nuevos: 123456
-- ============================================================


-- ============================================================
-- PUSHES: que el stack local y el CI no llamen a producción
-- ============================================================
-- La migración 20260711032948 guarda en Vault la URL de push-dispatch de
-- PRODUCCIÓN (con un secreto de mentira). Sin esto, cada notificación que
-- insertan el seed o los tests sale por pg_net hacia producción: el 28-29/09
-- fueron ~12.000 llamadas rechazadas (401) en 24 h desde el CI y desde local.
-- Puerto 9 (discard): la conexión falla enseguida, igual que en el test 520.
-- Va antes de cualquier INSERT en notifications.
select vault.update_secret(id, 'http://127.0.0.1:9/push-dispatch')
  from vault.secrets
 where name = 'push_dispatch_url';


-- ============================================================
-- BLOQUE 0: CONTRATO DE TESTS PGTAP (NO TOCAR)
-- ============================================================
-- Mismos UUIDs que el seed histórico: las suites de supabase/tests/ los
-- hardcodean. Cualquier cambio acá rompe el job db-tests-pgtap.

-- ─── Usuarios de auth ────────────────────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'cap.leones@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'cap.tigres@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007',
   'authenticated', 'authenticated', 'cap.rayos@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '8e7bd5df-5201-4622-8f6b-b94725c18da8',
   'authenticated', 'authenticated', 'player.market@test.local', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- ─── Perfiles ────────────────────────────────────────────────────────────────
insert into profiles (id, auth_user_id, username, full_name, zone) values
  ('33333333-3333-3333-3333-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'cap_leones', 'Capitán Leones', 'Palermo'),
  ('33333333-3333-3333-3333-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004',
   'cap_tigres', 'Capitán Tigres', 'Palermo'),
  ('33333333-3333-3333-3333-000000000007', 'aaaaaaaa-0000-0000-0000-000000000007',
   'cap_rayos', 'Capitán Rayos', 'Belgrano'),
  ('ef88b757-4d4e-48b1-b300-51da1cb2e678', '8e7bd5df-5201-4622-8f6b-b94725c18da8',
   'player_market', 'Jugador Mercado', 'Palermo');

-- ─── Equipos y membresías ────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('22222222-2222-2222-2222-222222222221', 'Los Leones FC',   'HOMBRES', 'Palermo',  'FUTBOL_5'),
  ('22222222-2222-2222-2222-222222222222', 'Tigres Palermo',  'HOMBRES', 'Palermo',  'FUTBOL_5'),
  ('22222222-2222-2222-2222-222222222223', 'Rayos del Norte', 'HOMBRES', 'Belgrano', 'FUTBOL_5');

insert into team_members (team_id, profile_id, role) values
  ('22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-000000000001', 'CAPITAN'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-000000000004', 'CAPITAN'),
  ('22222222-2222-2222-2222-222222222223', '33333333-3333-3333-3333-000000000007', 'CAPITAN');

-- ─── Temporada activa (espejo del estado de producción) ─────────────────────
insert into seasons (name, slug, starts_at, ends_at, is_active) values
  ('Clausura 2026', 'clausura-2026', '2026-07-01', '2026-12-31', true);

-- ─── Partido terminal de referencia ─────────────────────────────────────────
-- Usado por hotfix_security_rls (H3/H5) y season_lifecycle (T1/T4). El INSERT
-- directo en estado FINALIZADO no dispara stats: el motor sólo actúa en la
-- transición vía UPDATE.
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values (
  '44444444-4444-4444-4444-000000000003',
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222223',
  'RANKING', 'FINALIZADO', now() - interval '7 days',
  (select id from seasons where is_active = true)
);

-- ─── Conversación de mercado ─────────────────────────────────────────────────
-- Usada por rls_performance_regression (P5): el player es participante; el
-- lado equipo es Leones (el capitán de Tigres queda como "extraño").
insert into conversations (id, type, player_id, team_id) values (
  '00861a5e-e9f1-4e20-8a9f-9bd1341c5d2a', 'MARKET_DM',
  'ef88b757-4d4e-48b1-b300-51da1cb2e678',
  '22222222-2222-2222-2222-222222222221'
);


-- ============================================================
-- BLOQUE 1: IDENTIDADES Y ROLES (frontend)
-- ============================================================
-- Leyenda de UUIDs deterministas (hardcodeables en las pruebas de UI):
--   auth.users : 0a000000-0000-0000-0000-0000000000NN
--   profiles   : 0b000000-0000-0000-0000-0000000000NN   (NN = mismo nº que su auth)
--   teams      : 0c000000-0000-0000-0000-0000000000TT   (A0/B0/C0 activos · P1/P2 pasados)
--   matches    : 0d000000-0000-0000-0000-0000000000NN
--   convos     : 0e000000-...   ·  mensajes 0f000000-...
--
-- Roster:
--   01 admin_global (is_admin)   02 cap_alfa      03 cap_beta
--   04 alfa_jug1   05 alfa_jug2  06 alfa_jug3     07 beta_jug1
--   08 cap_gamma   09 beta_nuevo (solicitud aceptada)
--   10 free_agent (sin equipo)   11 trotamundos (2 ciclos cerrados + 1 activo)

-- ─── Catálogo de zonas (lo consume el picker de onboarding y de búsqueda) ───
insert into zones (name, slug) values
  ('Palermo', 'palermo'), ('Caballito', 'caballito'), ('Belgrano', 'belgrano'),
  ('Recoleta', 'recoleta'), ('Núñez', 'nunez'), ('Villa Crespo', 'villa-crespo'),
  ('Almagro', 'almagro'), ('Flores', 'flores');

-- ─── Usuarios de auth (login con contraseña 123456) ─────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@test.local',       crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cap.alfa@test.local',     crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cap.beta@test.local',     crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'alfa.jug1@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'alfa.jug2@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'alfa.jug3@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'beta.jug1@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'cap.gamma@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'beta.nuevo@test.local',   crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'free.agent@test.local',   crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'trotamundos@test.local',  crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- ─── Perfiles ────────────────────────────────────────────────────────────────
insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position, is_admin, strong_foot, favorite_team) values
  ('0b000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'admin_global', 'Admin Global',      'Palermo',  'CUALQUIERA',    true,  'RIGHT',   'River Plate'),
  ('0b000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000002', 'cap_alfa',     'Capitán Alfa',      'Palermo',  'MEDIOCAMPISTA', false, 'RIGHT',   'Boca Juniors'),
  ('0b000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-000000000003', 'cap_beta',     'Capitán Beta',      'Caballito','DEFENSOR',      false, 'LEFT', 'San Lorenzo'),
  ('0b000000-0000-0000-0000-000000000004', '0a000000-0000-0000-0000-000000000004', 'alfa_jug1',    'Jugador Alfa 1',    'Palermo',  'DELANTERO',     false, 'RIGHT',   'Boca Juniors'),
  ('0b000000-0000-0000-0000-000000000005', '0a000000-0000-0000-0000-000000000005', 'alfa_jug2',    'Jugador Alfa 2',    'Palermo',  'ARQUERO',       false, 'RIGHT',   'Racing Club'),
  ('0b000000-0000-0000-0000-000000000006', '0a000000-0000-0000-0000-000000000006', 'alfa_jug3',    'Jugador Alfa 3',    'Palermo',  'DEFENSOR',      false, 'LEFT', 'River Plate'),
  ('0b000000-0000-0000-0000-000000000007', '0a000000-0000-0000-0000-000000000007', 'beta_jug1',    'Jugador Beta 1',    'Caballito','MEDIOCAMPISTA', false, 'RIGHT',   'Independiente'),
  ('0b000000-0000-0000-0000-000000000008', '0a000000-0000-0000-0000-000000000008', 'cap_gamma',    'Capitán Gamma',     'Belgrano', 'DELANTERO',     false, 'RIGHT',   'Vélez Sarsfield'),
  ('0b000000-0000-0000-0000-000000000009', '0a000000-0000-0000-0000-000000000009', 'beta_nuevo',   'Refuerzo Beta',     'Caballito','DELANTERO',     false, 'RIGHT',   'Huracán'),
  ('0b000000-0000-0000-0000-000000000010', '0a000000-0000-0000-0000-000000000010', 'free_agent',   'Agente Libre',      'Palermo',  'MEDIOCAMPISTA', false, 'BOTH','River Plate'),
  ('0b000000-0000-0000-0000-000000000011', '0a000000-0000-0000-0000-000000000011', 'trotamundos',  'El Trotamundos',    'Recoleta', 'DELANTERO',     false, 'RIGHT',   'Boca Juniors');

-- Onboarding: isProfileComplete() (lib/auth-utils.ts) exige también
-- date_of_birth y gender (M/F/X). Se completan acá para que estos usuarios
-- entren directo a la app sin pasar por /onboarding.
update profiles set date_of_birth = v.dob, gender = 'M'
from (values
  ('0b000000-0000-0000-0000-000000000001'::uuid, '1988-05-20'::date),
  ('0b000000-0000-0000-0000-000000000002'::uuid, '1992-03-14'::date),
  ('0b000000-0000-0000-0000-000000000003'::uuid, '1990-11-02'::date),
  ('0b000000-0000-0000-0000-000000000004'::uuid, '1996-07-08'::date),
  ('0b000000-0000-0000-0000-000000000005'::uuid, '1995-01-25'::date),
  ('0b000000-0000-0000-0000-000000000006'::uuid, '1998-09-30'::date),
  ('0b000000-0000-0000-0000-000000000007'::uuid, '1993-12-11'::date),
  ('0b000000-0000-0000-0000-000000000008'::uuid, '1991-06-18'::date),
  ('0b000000-0000-0000-0000-000000000009'::uuid, '1999-02-05'::date),
  ('0b000000-0000-0000-0000-000000000010'::uuid, '1997-04-22'::date),
  ('0b000000-0000-0000-0000-000000000011'::uuid, '1989-08-15'::date)
) as v(id, dob)
where profiles.id = v.id;


-- ============================================================
-- BLOQUE 2: ENTIDADES CORE (Equipos)
-- ============================================================
-- Los INSERT de team_members disparan el trigger open_team_stint → abren el
-- ciclo vigente en team_stints automáticamente (no hay que insertarlo a mano).

-- ─── Equipos ─────────────────────────────────────────────────────────────────
-- Alfa: consolidado (ELO 1020 > 1000, 1 partido ganado — ver Bloque 3 P3).
-- Beta: buscando jugadores (1 derrota, con market post + solicitudes).
-- Gamma: recién fundado (todo por default).
-- P1/P2: clubes pasados del trotamundos (sólo existen para el FK de sus ciclos).
insert into teams (id, name, category, zone, preferred_format, shield_url,
                   elo_rating, matches_played, in_ranking,
                   season_wins, season_draws, season_losses, season_goals_for, season_goals_against) values
  ('0c000000-0000-0000-0000-0000000000a0', 'Alfa FC',        'HOMBRES', 'Palermo',   'FUTBOL_5', 'https://cdn.test/alfa.png', 1020, 1, true,  1, 0, 0, 4, 2),
  ('0c000000-0000-0000-0000-0000000000b0', 'Beta United',    'HOMBRES', 'Caballito', 'FUTBOL_5', 'https://cdn.test/beta.png',  980, 1, true,  0, 0, 1, 2, 4),
  ('0c000000-0000-0000-0000-0000000000c0', 'Gamma Nuevo',    'MIXTO',   'Belgrano',  'FUTBOL_7', null,                        1000, 0, true,  0, 0, 0, 0, 0),
  ('0c000000-0000-0000-0000-0000000000e1', 'Viejo Club P1',  'HOMBRES', 'Recoleta',  'FUTBOL_5', null,                        1000, 0, false, 0, 0, 0, 0, 0),
  ('0c000000-0000-0000-0000-0000000000e2', 'Ex Equipo P2',   'HOMBRES', 'Nuñez',     'FUTBOL_5', null,                        1000, 0, false, 0, 0, 0, 0, 0);

-- ─── Membresías (abren ciclo vigente vía trigger) ───────────────────────────
insert into team_members (team_id, profile_id, role, joined_at) values
  -- Alfa (5 miembros, incluye al trotamundos como ciclo ACTIVO)
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000002', 'CAPITAN',   now() - interval '120 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000004', 'JUGADOR',   now() - interval '100 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000005', 'JUGADOR',   now() - interval '100 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000006', 'SUBCAPITAN',now() - interval '90 days'),
  ('0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000011', 'JUGADOR',   now() - interval '15 days'),
  -- Beta (capitán + jugador base + refuerzo con solicitud aceptada)
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000003', 'CAPITAN',   now() - interval '80 days'),
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000007', 'JUGADOR',   now() - interval '60 days'),
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000009', 'JUGADOR',   now() - interval '2 days'),
  -- Gamma (recién fundado: sólo su capitán)
  ('0c000000-0000-0000-0000-0000000000c0', '0b000000-0000-0000-0000-000000000008', 'CAPITAN',   now() - interval '3 days');

-- ─── Trotamundos: 2 ciclos CERRADOS (snapshot congelado para get_player_career) ─
-- El ciclo ACTIVO (en Alfa) ya lo abrió el trigger arriba. Estos dos son
-- históricos: se insertan directo con ended_at + stats congeladas.
insert into team_stints (profile_id, team_id, team_name, shield_url, started_at, ended_at,
                         leave_reason, last_role, stats, stats_computed_at, is_reconstructed) values
  ('0b000000-0000-0000-0000-000000000011', '0c000000-0000-0000-0000-0000000000e1', 'Viejo Club P1', null,
   now() - interval '3 years', now() - interval '18 months', 'TRANSFERENCIA', 'JUGADOR',
   jsonb_build_object(
     'total', jsonb_build_object('pj_ranking', 20, 'pj_amistoso', 5, 'goals', 12, 'mvps', 3, 'clean_sheets', 4, 'wins', 12, 'draws', 3, 'losses', 5),
     'by_season', jsonb_build_array(jsonb_build_object('season_id', null, 'season_name', 'Temporada 2023', 'pj_ranking', 20, 'pj_amistoso', 5, 'goals', 12, 'mvps', 3, 'clean_sheets', 4, 'wins', 12, 'draws', 3, 'losses', 5)),
     'computed_at', (now() - interval '18 months')::text),
   now() - interval '18 months', false),
  ('0b000000-0000-0000-0000-000000000011', '0c000000-0000-0000-0000-0000000000e2', 'Ex Equipo P2', null,
   now() - interval '17 months', now() - interval '4 months', 'ABANDONO', 'SUBCAPITAN',
   jsonb_build_object(
     'total', jsonb_build_object('pj_ranking', 10, 'pj_amistoso', 2, 'goals', 6, 'mvps', 1, 'clean_sheets', 2, 'wins', 5, 'draws', 2, 'losses', 3),
     'by_season', jsonb_build_array(jsonb_build_object('season_id', null, 'season_name', 'Temporada 2024', 'pj_ranking', 10, 'pj_amistoso', 2, 'goals', 6, 'mvps', 1, 'clean_sheets', 2, 'wins', 5, 'draws', 2, 'losses', 3)),
     'computed_at', (now() - interval '4 months')::text),
   now() - interval '4 months', false);

-- ─── Beta: mercado + solicitudes de unión (1 pendiente, 1 aceptada, 1 rechazada) ─
insert into market_team_posts (team_id, created_by, position_wanted, description, zone, complex) values
  ('0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000003', 'ARQUERO',
   'Beta United busca arquero para el Clausura. Entrenamos martes y jueves.', 'Caballito', 'Complejo Central');

insert into market_player_posts (profile_id, post_type, position, description) values
  ('0b000000-0000-0000-0000-000000000010', 'BUSCA_EQUIPO', 'MEDIOCAMPISTA',
   'Mediocampista libre, disponible fines de semana. Zona Palermo/Caballito.');

insert into team_join_requests (id, team_id, profile_id, status) values
  ('0e000000-0000-0000-0000-0000000000f1', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000010', 'PENDIENTE'),
  ('0e000000-0000-0000-0000-0000000000f2', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000009', 'ACEPTADA'),
  ('0e000000-0000-0000-0000-0000000000f3', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000011', 'RECHAZADA');


-- ============================================================
-- BLOQUE 3: MÁQUINA DE ESTADOS (Partidos)
-- ============================================================
-- Estados directos (el INSERT no dispara el motor de ELO; las stats de Alfa/
-- Beta y las filas de elo_history del partido FINALIZADO se cargan a mano).
-- Nota: no existe el estado "WO_RECLAMADO" en match_status; un WO reclamado es
-- un wo_claims PENDIENTE_REVISION sobre un partido CONFIRMADO (Partido 4).
-- Nota: el check-in exige status CONFIRMADO (un PENDIENTE no se puede checkear),
-- por eso el "Partido 1 listo para check-in" está en CONFIRMADO.

-- ─── Partido 0 (PENDIENTE): recién propuesto, aún sin formato ────────────────
insert into matches (id, team_a_id, team_b_id, match_type, status, scheduled_at, season_id)
values ('0d000000-0000-0000-0000-000000000000', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000c0',
        'AMISTOSO', 'PENDIENTE', now() + interval '5 days', (select id from seasons where is_active = true));

-- ─── Partido 1 (CONFIRMADO): convocatorias listas para hacer check-in ────────
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('0d000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000b0',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now() + interval '2 days', (select id from seasons where is_active = true));
-- Convocatoria de Alfa: 5 jugadores, sin check-in aún (did_checkin = false).
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin) values
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000006', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR',  false),
  ('0d000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000011', '0c000000-0000-0000-0000-0000000000a0', 'SUPLENTE', false);

-- ─── Partido 2 (EN_VIVO): ambos equipos presentes, para cargar resultado ─────
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id,
                     checkin_team_a_at, checkin_team_b_at, started_at)
values ('0d000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000b0',
        'RANKING', 'EN_VIVO', 'FUTBOL_5', now() - interval '20 minutes', (select id from seasons where is_active = true),
        now() - interval '30 minutes', now() - interval '25 minutes', now() - interval '20 minutes');
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin, is_result_loader) values
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true, true),
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true, false),
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true, true),
  ('0d000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000007', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true, false);

-- ─── Partido 3 (FINALIZADO): stats completas + elo_history ───────────────────
-- Alfa 4-2 Beta. Coherente con teams.elo_rating (Alfa 1020, Beta 980).
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id,
                     checkin_team_a_at, checkin_team_b_at, started_at, finished_at, duration_minutes)
values ('0d000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000a0', '0c000000-0000-0000-0000-0000000000b0',
        'RANKING', 'FINALIZADO', 'FUTBOL_5', now() - interval '10 days', (select id from seasons where is_active = true),
        now() - interval '10 days', now() - interval '10 days', now() - interval '10 days', now() - interval '9 days', 50);
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin) values
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-0000000000a0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000007', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id, status) values
  ('0d000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000002', 4, 2,
   jsonb_build_array(
     jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000002', 'goals', 2),
     jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000004', 'goals', 2)),
   '0b000000-0000-0000-0000-000000000002', 'CONFIRMADO'),
  ('0d000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', '0b000000-0000-0000-0000-000000000003', 2, 4,
   jsonb_build_array(jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000007', 'goals', 2)),
   null, 'CONFIRMADO');
insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta) values
  ('0c000000-0000-0000-0000-0000000000a0', (select id from seasons where is_active = true), '0d000000-0000-0000-0000-000000000003', 1000, 1020,  20),
  ('0c000000-0000-0000-0000-0000000000b0', (select id from seasons where is_active = true), '0d000000-0000-0000-0000-000000000003', 1000,  980, -20);

-- ─── Partido 4 (WO reclamado): CONFIRMADO + wo_claims esperando al admin ─────
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id)
values ('0d000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-0000000000b0', '0c000000-0000-0000-0000-0000000000c0',
        'RANKING', 'CONFIRMADO', 'FUTBOL_5', now() - interval '1 day', (select id from seasons where is_active = true));
-- Beta se presentó (check-in) y reclama el WO porque Gamma no apareció.
insert into match_participants (match_id, profile_id, team_id, lineup_role, did_checkin) values
  ('0d000000-0000-0000-0000-000000000004', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true),
  ('0d000000-0000-0000-0000-000000000004', '0b000000-0000-0000-0000-000000000007', '0c000000-0000-0000-0000-0000000000b0', 'TITULAR', true);
insert into wo_claims (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id) values
  ('0e000000-0000-0000-0000-0000000000a1', '0d000000-0000-0000-0000-000000000004',
   '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0',
   'https://cdn.test/evidencia-wo.jpg', 'El rival no se presentó a horario', 'PENDIENTE_REVISION',
   jsonb_build_array(jsonb_build_object('profile_id', '0b000000-0000-0000-0000-000000000007', 'goals', 3)),
   '0b000000-0000-0000-0000-000000000007');


-- ============================================================
-- BLOQUE 4: INTERACCIONES SOCIALES
-- ============================================================

-- ─── Chat de partido (MATCH_CHAT del Partido 2 EN_VIVO) ─────────────────────
insert into conversations (id, type, match_id) values
  ('0e000000-0000-0000-0000-0000000000c1', 'MATCH_CHAT', '0d000000-0000-0000-0000-000000000002');
insert into messages (id, conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at) values
  ('0f000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-0000000000c1', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0', 'Listos, entramos a la cancha 3.', true,  now() - interval '35 minutes'),
  ('0f000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-0000000000c1', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'Perfecto, ya hicimos el check-in.',   false, now() - interval '33 minutes');

-- ─── DM de mercado (free_agent ↔ Beta United) ───────────────────────────────
insert into conversations (id, type, player_id, team_id) values
  ('0e000000-0000-0000-0000-0000000000c2', 'MARKET_DM', '0b000000-0000-0000-0000-000000000010', '0c000000-0000-0000-0000-0000000000b0');
insert into messages (id, conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at) values
  ('0f000000-0000-0000-0000-000000000003', '0e000000-0000-0000-0000-0000000000c2', '0b000000-0000-0000-0000-000000000010', null,                                    'Hola, vi que buscan arquero. Yo juego de medio pero conozco uno.', true,  now() - interval '2 hours'),
  ('0f000000-0000-0000-0000-000000000004', '0e000000-0000-0000-0000-0000000000c2', '0b000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-0000000000b0', 'Buenísimo, pasame el contacto y coordinamos una prueba.',           false, now() - interval '1 hour');

-- ─── Notificaciones (bandeja del admin y de los capitanes) ──────────────────
insert into notifications (profile_id, type, title, body, data, is_read) values
  ('0b000000-0000-0000-0000-000000000001', 'WO_RECLAMADO',          'Nuevo reclamo de WO',       'Beta United reclamó un WO contra Gamma Nuevo.', jsonb_build_object('match_id', '0d000000-0000-0000-0000-000000000004', 'claim_id', '0e000000-0000-0000-0000-0000000000a1'), false),
  ('0b000000-0000-0000-0000-000000000003', 'SOLICITUD_UNION_EQUIPO','Nueva solicitud de unión',  'Agente Libre quiere unirse a Beta United.',      jsonb_build_object('request_id', '0e000000-0000-0000-0000-0000000000f1'), false),
  ('0b000000-0000-0000-0000-000000000002', 'PARTIDO_FINALIZADO',    'Partido finalizado',        'Alfa FC 4 - 2 Beta United.',                     jsonb_build_object('match_id', '0d000000-0000-0000-0000-000000000003'), true);


-- ============================================================
-- BLOQUE 5: PREDIOS (VENUES)
-- ============================================================
-- Complejos reales de CABA con coordenadas aproximadas. `formats` es un array
-- de team_format. zone_id linkea al catálogo de zonas (o queda NULL si la zona
-- no está sembrada). UUIDs: 0e000000-...-00000000d0NN.
insert into venues (id, name, address, zone_id, lat, lng, phone, formats, is_active) values
  ('0e000000-0000-0000-0000-0000000000d1', 'Parque Sarmiento — Fútbol', 'Av. Ricardo Balbín 4750',   (select id from zones where slug='nunez'),    -34.54450, -58.47390, '+54 11 4701-0000', array['FUTBOL_5','FUTBOL_7','FUTBOL_11']::team_format[], true),
  ('0e000000-0000-0000-0000-0000000000d2', 'Club GEBA',                 'Av. Figueroa Alcorta 5575', (select id from zones where slug='palermo'),  -34.57600, -58.42100, '+54 11 4772-0000', array['FUTBOL_7','FUTBOL_8','FUTBOL_11']::team_format[], true),
  ('0e000000-0000-0000-0000-0000000000d3', 'Racing Fútbol 5 Palermo',   'Guatemala 4700',            (select id from zones where slug='palermo'),  -34.58200, -58.43000, '+54 11 4831-0000', array['FUTBOL_5','FUTBOL_6']::team_format[],           true),
  ('0e000000-0000-0000-0000-0000000000d4', 'Complejo Belgrano F7',      'Av. Cabildo 2200',          (select id from zones where slug='belgrano'), -34.56200, -58.45600, '+54 11 4788-0000', array['FUTBOL_5','FUTBOL_7']::team_format[],           true),
  ('0e000000-0000-0000-0000-0000000000d5', 'Almagro Indoor',            'Av. Corrientes 4200',       (select id from zones where slug='almagro'),  -34.60300, -58.42000, '+54 11 4864-0000', array['FUTBOL_5']::team_format[],                      true),
  ('0e000000-0000-0000-0000-0000000000d6', 'Caballito Sport Center',    'Av. Rivadavia 5100',        (select id from zones where slug='caballito'),-34.61900, -58.43800, '+54 11 4903-0000', array['FUTBOL_5','FUTBOL_6','FUTBOL_7']::team_format[], true);

-- ─── 👇 PREDIO LIBRE PARA VOS ────────────────────────────────────────────────
-- Completá este predio con TU CASA para probar la creación de un partido:
--   · address : tu dirección real
--   · lat / lng: tus coordenadas (buscalas en Google Maps → clic derecho →
--                "¿Qué hay aquí?" copia lat,lng). Hoy tiene las del Obelisco.
--   · formats : dejá el/los formatos que quieras testear.
insert into venues (id, name, address, zone_id, lat, lng, phone, formats, is_active) values
  ('0e000000-0000-0000-0000-0000000000df', '🏠 MI CASA (COMPLETAR)', 'Nazar 249', null, -34.60370, -58.38160, null, array['FUTBOL_5']::team_format[], true);


-- ============================================================
-- BLOQUE 6: LIGA SUPER-EXPANDIDA (16 equipos + 160 jugadores, con fotos reales)
-- ============================================================
-- Fotos que cargan de verdad: escudos vía ui-avatars.com (initials + hex
-- variado), avatares vía i.pravatar.cc. UUIDs deterministas por fórmula:
--   equipos  : 0c000000-...-0000010 + lpad(t,5)   (t = 1..16)
--   auth     : 0a000000-...-0000010 + lpad(g,5)   (g = 1..160, jugador global)
--   perfiles : 0b000000-...-0000010 + lpad(g,5)
--   Equipo del jugador g = ((g-1)/10)+1  ·  Capitán = primer de cada 10, sub el 2º.
-- ELO repartido 800→1500 (líderes y colistas para la tabla de posiciones).

insert into teams (id, name, category, zone, preferred_format, shield_url,
                   elo_rating, matches_played, in_ranking, season_wins, season_draws, season_losses)
select ('0c000000-0000-0000-0000-0000010' || lpad(t::text, 5, '0'))::uuid,
       nm,
       (array['HOMBRES','MIXTO','MUJERES']::team_category[])[1 + (t % 3)],
       (array['Palermo','Caballito','Belgrano','Recoleta','Almagro','Flores','Núñez','Villa Crespo'])[1 + (t % 8)],
       (array['FUTBOL_5','FUTBOL_7','FUTBOL_8']::team_format[])[1 + (t % 3)],
       'https://ui-avatars.com/api/?name=' || replace(nm, ' ', '+') || '&background=' || hx || '&color=fff&size=256&bold=true',
       800 + ((t - 1) * 700 / 15),            -- 800 (t=1) … 1500 (t=16)
       (t % 9) + (t % 4) + ((17 - t) % 7),    -- matches_played = w+d+l
       true, (t % 9), (t % 4), ((17 - t) % 7)
from (
  select t,
         (array['Deportivo Central','Atlético Norte','Racing Amateur','San Martín F5',
                'Villa United','Estrella Roja','Los Halcones','Real Sur',
                'Unión Palermo','Belgrano FC','Sportivo Oeste','Ciudad FC',
                'Defensores Flores','Barrio Norte','Riverside FC','Nueva Estrella'])[t] as nm,
         (array['1e3a8a','b91c1c','0e7490','15803d','7c3aed','be185d','c2410c','334155',
                '0f766e','a16207','4d7c0f','9333ea','0369a1','db2777','65a30d','dc2626'])[t] as hx
  from generate_series(1, 16) t
) x;

-- Usuarios de auth (login 123456) — 160 jugadores de la liga.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('0a000000-0000-0000-0000-0000010' || lpad(g::text, 5, '0'))::uuid,
       'authenticated', 'authenticated', 'jugador' || g || '@liga.local',
       crypt('123456', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 160) g;

-- Perfiles (completos: date_of_birth + gender + avatar real, variado).
insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position, gender, date_of_birth, avatar_url)
select ('0b000000-0000-0000-0000-0000010' || lpad(g::text, 5, '0'))::uuid,
       ('0a000000-0000-0000-0000-0000010' || lpad(g::text, 5, '0'))::uuid,
       'jugador_' || g,
       (array['Juan','Diego','Lucas','Nico','Fede','Mateo','Tomás','Santi','Bruno','Iván'])[1 + (g % 10)]
         || ' ' || (array['Gómez','Pérez','López','Díaz','Sosa','Romero','Ruiz','Torres','Silva','Vega'])[1 + ((g / 10) % 10)],
       (array['Palermo','Caballito','Belgrano','Recoleta','Almagro','Flores','Núñez','Villa Crespo'])[1 + (g % 8)],
       (array['ARQUERO','DEFENSOR','MEDIOCAMPISTA','DELANTERO','CUALQUIERA']::player_position[])[1 + (g % 5)],
       (array['M','M','M','F','X'])[1 + (g % 5)],
       ('1985-01-01'::date + (g * 37 || ' days')::interval)::date,
       'https://i.pravatar.cc/300?img=' || (1 + (g % 70))
from generate_series(1, 160) g;

-- Membresías (el trigger open_team_stint abre el ciclo vigente de cada uno).
insert into team_members (team_id, profile_id, role, joined_at)
select ('0c000000-0000-0000-0000-0000010' || lpad((((g - 1) / 10) + 1)::text, 5, '0'))::uuid,
       ('0b000000-0000-0000-0000-0000010' || lpad(g::text, 5, '0'))::uuid,
       case when (g - 1) % 10 = 0 then 'CAPITAN'::team_role
            when (g - 1) % 10 = 1 then 'SUBCAPITAN'::team_role
            else 'JUGADOR'::team_role end,
       now() - (g || ' days')::interval
from generate_series(1, 160) g;


-- ============================================================
-- BLOQUE 7: FOTOS EN LAS IDENTIDADES EXISTENTES (Bloques 1-2)
-- ============================================================
update profiles set avatar_url = 'https://i.pravatar.cc/300?u=' || username
 where id in (
   '0b000000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000002','0b000000-0000-0000-0000-000000000003',
   '0b000000-0000-0000-0000-000000000004','0b000000-0000-0000-0000-000000000005','0b000000-0000-0000-0000-000000000006',
   '0b000000-0000-0000-0000-000000000007','0b000000-0000-0000-0000-000000000008','0b000000-0000-0000-0000-000000000009',
   '0b000000-0000-0000-0000-000000000010','0b000000-0000-0000-0000-000000000011');

update teams set shield_url = 'https://ui-avatars.com/api/?name=AL&background=16a34a&color=fff&size=256&bold=true' where id = '0c000000-0000-0000-0000-0000000000a0';
update teams set shield_url = 'https://ui-avatars.com/api/?name=BU&background=2563eb&color=fff&size=256&bold=true' where id = '0c000000-0000-0000-0000-0000000000b0';
update teams set shield_url = 'https://ui-avatars.com/api/?name=GN&background=ea580c&color=fff&size=256&bold=true' where id = '0c000000-0000-0000-0000-0000000000c0';


-- ============================================================
-- BLOQUE 8: FLUJOS Y CATÁLOGOS RESTANTES (datos en todas las tablas)
-- ============================================================

-- ─── Insignias otorgadas ─────────────────────────────────────────────────────
-- El catálogo `badges` lo siembra una migración con ids random (uuid_generate_v4),
-- así que se referencia por `slug` (estable entre resets).
insert into profile_badges (profile_id, badge_id)
select p.pid, b.id
from (values
  ('0b000000-0000-0000-0000-000000000002'::uuid, 'artillero'),       -- cap_alfa
  ('0b000000-0000-0000-0000-000000000002'::uuid, 'mvp_recurrente'),  -- cap_alfa
  ('0b000000-0000-0000-0000-000000000004'::uuid, 'canonero'),        -- alfa_jug1
  ('0b000000-0000-0000-0000-000000000011'::uuid, 'veterano'),        -- trotamundos
  ('0b000000-0000-0000-0000-000000000011'::uuid, 'debut'),           -- trotamundos
  ('0b000000-0000-0000-0000-000000000010'::uuid, 'debut')            -- free_agent
) as p(pid, slug)
join badges b on b.slug = p.slug;

-- ─── Propuesta de partido (sobre el Partido 0 PENDIENTE Alfa vs Gamma) ───────
insert into match_proposals (match_id, proposed_by, from_team_id, format, match_type, scheduled_at, duration_minutes, venue_id, status) values
  ('0d000000-0000-0000-0000-000000000000', '0b000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-0000000000a0',
   'FUTBOL_5', 'AMISTOSO', now() + interval '5 days', 60, '0e000000-0000-0000-0000-0000000000d3', 'PENDIENTE');

-- ─── Desafíos entre equipos de la liga (ENVIADA — respeta el índice de par activo) ─
insert into challenges (from_team_id, to_team_id, created_by, status, match_type) values
  ('0c000000-0000-0000-0000-000001000003', '0c000000-0000-0000-0000-000001000004', '0b000000-0000-0000-0000-000001000021', 'ENVIADA', 'RANKING'),
  ('0c000000-0000-0000-0000-000001000005', '0c000000-0000-0000-0000-000001000006', '0b000000-0000-0000-0000-000001000041', 'ENVIADA', 'AMISTOSO');

-- ─── Aplicaciones de mercado ─────────────────────────────────────────────────
-- Un jugador se postula al aviso de Beta (busca arquero).
insert into market_team_post_applications (post_id, profile_id, status)
select id, '0b000000-0000-0000-0000-000000000005', 'PENDIENTE'
from market_team_posts where team_id = '0c000000-0000-0000-0000-0000000000b0';
-- Un equipo se postula al aviso del free_agent (busca equipo).
insert into market_player_post_applications (post_id, team_id, applicant_profile_id, status)
select id, '0c000000-0000-0000-0000-0000000000a0', '0b000000-0000-0000-0000-000000000002', 'PENDIENTE'
from market_player_posts where profile_id = '0b000000-0000-0000-0000-000000000010';

-- ─── Solicitud de cancelación (sobre el Partido 1 CONFIRMADO) ────────────────
insert into cancellation_requests (match_id, requested_by_team_id, reason, notes, status, is_late) values
  ('0d000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-0000000000b0', 'LLUVIA', 'Se suspende por pronóstico de tormenta.', 'PENDIENTE', false);

-- ─── Partido EN DISPUTA + votaciones (result_dispute_votes / match_dispute_votes) ─
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, season_id, finished_at)
values ('0d000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-000001000001', '0c000000-0000-0000-0000-000001000002',
        'RANKING', 'EN_DISPUTA', 'FUTBOL_5', now() - interval '2 days', (select id from seasons where is_active = true), now() - interval '2 days');
insert into match_participants (match_id, profile_id, team_id, did_checkin) values
  ('0d000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000001000001', '0c000000-0000-0000-0000-000001000001', true),
  ('0d000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000001000002', '0c000000-0000-0000-0000-000001000001', true),
  ('0d000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000001000011', '0c000000-0000-0000-0000-000001000002', true),
  ('0d000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000001000012', '0c000000-0000-0000-0000-000001000002', true);
-- Resultados en conflicto: ambos equipos se adjudican el 3-2.
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, status) values
  ('0d000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-000001000001', '0b000000-0000-0000-0000-000001000001', 3, 2, 'EN_DISPUTA'),
  ('0d000000-0000-0000-0000-000000000005', '0c000000-0000-0000-0000-000001000002', '0b000000-0000-0000-0000-000001000011', 3, 2, 'EN_DISPUTA');
insert into result_dispute_votes (match_id, voter_id, voted_for_team) values
  ('0d000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000001000002', '0c000000-0000-0000-0000-000001000001'),
  ('0d000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000001000012', '0c000000-0000-0000-0000-000001000002');
-- Votación dividida 50/50: los 160 jugadores de la liga votan (par → team_a,
-- impar → team_b) para forzar barras de progreso al límite en la UI.
insert into match_dispute_votes (match_id, profile_id, voted_team_id)
select '0d000000-0000-0000-0000-000000000005',
       ('0b000000-0000-0000-0000-0000010' || lpad(g::text, 5, '0'))::uuid,
       case when g % 2 = 0 then '0c000000-0000-0000-0000-000001000001'::uuid
                           else '0c000000-0000-0000-0000-000001000002'::uuid end
from generate_series(1, 160) g;

-- ─── Lecturas de conversación (conversation_reads) ──────────────────────────
insert into conversation_reads (profile_id, conversation_id, last_read_at) values
  ('0b000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-0000000000c1', now() - interval '30 minutes'),
  ('0b000000-0000-0000-0000-000000000003', '0e000000-0000-0000-0000-0000000000c1', now() - interval '10 minutes'),
  ('0b000000-0000-0000-0000-000000000010', '0e000000-0000-0000-0000-0000000000c2', now() - interval '90 minutes');

-- ─── Notificaciones extra (bandeja variada) ─────────────────────────────────
insert into notifications (profile_id, type, title, body, data, is_read) values
  ('0b000000-0000-0000-0000-000000000008', 'DESAFIO_RECIBIDO',       'Nuevo desafío',            'Racing Amateur desafió a San Martín F5.', jsonb_build_object('from_team', '0c000000-0000-0000-0000-000001000003'), false),
  ('0b000000-0000-0000-0000-000000000010', 'POSTULACION_RESPONDIDA', 'Respondieron tu aviso',    'Alfa FC se interesó en tu perfil.',       jsonb_build_object('team_id', '0c000000-0000-0000-0000-0000000000a0'), false),
  ('0b000000-0000-0000-0000-000000000002', 'RESULTADO_EN_DISPUTA',   'Resultado en disputa',     'El partido contra Atlético Norte está en disputa.', jsonb_build_object('match_id', '0d000000-0000-0000-0000-000000000005'), false);


-- ============================================================
-- BLOQUE 9: EXPANSIÓN MASIVA (stress-test de UI/UX — paginación, gráficos, listas)
-- ============================================================

-- ─── 1. Historial ELO de Alfa FC: 30 partidos FINALIZADO (curva de rendimiento) ─
-- Cada 3 días durante los últimos ~3 meses, vs equipos rotativos de la liga.
-- Sin match_results (evita disparar el motor); la curva vive en elo_history.
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, finished_at, season_id)
select ('0d000000-0000-0000-0000-0000030' || lpad(m::text, 5, '0'))::uuid,
       '0c000000-0000-0000-0000-0000000000a0',
       ('0c000000-0000-0000-0000-0000010' || lpad((1 + ((m - 1) % 16))::text, 5, '0'))::uuid,
       'RANKING', 'FINALIZADO', 'FUTBOL_5',
       (now() - ((90 - (m - 1) * 3) || ' days')::interval),
       (now() - ((90 - (m - 1) * 3) || ' days')::interval),
       (select id from seasons where is_active = true)
from generate_series(1, 30) m;

insert into elo_history (team_id, season_id, match_id, elo_before, elo_after, delta, created_at)
select '0c000000-0000-0000-0000-0000000000a0',
       (select id from seasons where is_active = true),
       ('0d000000-0000-0000-0000-0000030' || lpad(m::text, 5, '0'))::uuid,
       eb, eb + d, d,
       (now() - ((90 - (m - 1) * 3) || ' days')::interval)
from (
  select m, d,
         1000 + coalesce(sum(d) over (order by m rows between unbounded preceding and 1 preceding), 0)::int as eb
  from (
    select m, (array[20,20,-20,0,15,-15,25,20,-10,0, 15,-20,20,15,0,-25,30,20,-15,10,
                     0,20,-20,25,15,-10,20,-5,-20,20])[m] as d
    from generate_series(1, 30) m
  ) a
) b;
-- Alfa cierra la curva en 1150 (coherente con el elo_history de arriba).
update teams set elo_rating = 1150, matches_played = 31, season_wins = 18, season_draws = 5, season_losses = 8
 where id = '0c000000-0000-0000-0000-0000000000a0';

-- ─── 2a. Bandeja saturada: 90 notificaciones (45 admin + 45 cap_alfa) ────────
insert into notifications (profile_id, type, title, body, data, is_read, created_at)
select (array['0b000000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000002'])[1 + (n % 2)]::uuid,
       (array['DESAFIO_RECIBIDO','WO_RECLAMADO','PARTIDO_FINALIZADO','RESULTADO_EN_DISPUTA',
              'SOLICITUD_UNION_EQUIPO','MENSAJE_NUEVO','PARTIDO_CONFIRMADO','POSTULACION_RECIBIDA']::notification_type[])[1 + (n % 8)],
       'Notificación de prueba #' || n,
       'Cuerpo de la notificación número ' || n || ' para el stress-test de la bandeja.',
       jsonb_build_object('idx', n),
       (n % 3 = 0),
       now() - (n || ' hours')::interval
from generate_series(1, 90) n;

-- ─── 2b. Hilo activo: 30 mensajes cruzados en el chat del Partido 2 ──────────
insert into messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at)
select '0e000000-0000-0000-0000-0000000000c1',
       (array['0b000000-0000-0000-0000-000000000002','0b000000-0000-0000-0000-000000000003'])[1 + (k % 2)]::uuid,
       (array['0c000000-0000-0000-0000-0000000000a0','0c000000-0000-0000-0000-0000000000b0'])[1 + (k % 2)]::uuid,
       (array['Dale que ganamos esto','Buena jugada','Esa falta no fue','jaja','Vamos arriba',
              'Penal clarísimo','Che revisen','Golazo','Se pudrió todo','Tranquilos','Cambien al 9','Último minuto'])[1 + (k % 12)]
         || ' [' || k || ']',
       (k % 2 = 0),
       now() - interval '40 minutes' + (k || ' minutes')::interval
from generate_series(1, 30) k;

-- ─── 3. Mercado complejo: jugador "trotamundos extremo" con 10 ciclos cerrados ─
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated',
        'transferido@test.local', crypt('123456', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position, gender, date_of_birth, avatar_url)
values ('0b000000-0000-0000-0000-0000000000c1', '0a000000-0000-0000-0000-0000000000c1', 'el_transferido',
        'Juan "Colectivo" Ramírez', 'Palermo', 'DELANTERO', 'M', '1994-06-06', 'https://i.pravatar.cc/300?img=12');
-- 10 ciclos CERRADOS y cortos (~20 días c/u) en equipos de la liga → get_player_career largo.
insert into team_stints (profile_id, team_id, team_name, started_at, ended_at, leave_reason, last_role, stats, stats_computed_at)
select '0b000000-0000-0000-0000-0000000000c1',
       ('0c000000-0000-0000-0000-0000010' || lpad(s::text, 5, '0'))::uuid,
       (select name from teams where id = ('0c000000-0000-0000-0000-0000010' || lpad(s::text, 5, '0'))::uuid),
       now() - ((400 - s * 35) || ' days')::interval,
       now() - ((400 - s * 35 - 20) || ' days')::interval,
       (array['TRANSFERENCIA','TRANSFERENCIA','ABANDONO','EXPULSADO','EQUIPO_DISUELTO']::stint_leave_reason[])[1 + (s % 5)],
       'JUGADOR'::team_role,
       jsonb_build_object(
         'total', jsonb_build_object('pj_ranking', 3 + s, 'pj_amistoso', s % 3, 'goals', s * 2,
                                     'mvps', s % 3, 'clean_sheets', s % 2, 'wins', s, 'draws', 1, 'losses', 2),
         'by_season', '[]'::jsonb, 'computed_at', now()::text),
       now()
from generate_series(1, 10) s;

-- ─── 3b. Avisos de mercado de 8 equipos de la liga + 5 candidatos a Beta ─────
insert into market_team_posts (team_id, created_by, position_wanted, description, zone)
select ('0c000000-0000-0000-0000-0000010' || lpad(t::text, 5, '0'))::uuid,
       ('0b000000-0000-0000-0000-0000010' || lpad(((t - 1) * 10 + 1)::text, 5, '0'))::uuid,
       (array['ARQUERO','DEFENSOR','MEDIOCAMPISTA','DELANTERO','CUALQUIERA']::player_position[])[1 + (t % 5)],
       'Buscamos refuerzo de nivel para el torneo (equipo ' || t || ').',
       (array['Palermo','Caballito','Belgrano','Recoleta'])[1 + (t % 4)]
from generate_series(1, 8) t;

insert into market_team_post_applications (post_id, profile_id, status)
select (select id from market_team_posts where team_id = '0c000000-0000-0000-0000-0000000000b0' order by created_at limit 1),
       ('0b000000-0000-0000-0000-0000010' || lpad(a::text, 5, '0'))::uuid,
       (array['PENDIENTE','PENDIENTE','ACEPTADA','RECHAZADA','PENDIENTE'])[a]
from generate_series(1, 5) a;

-- ─── 4. Disputa tóxica: chat de partido con cruces agresivos ─────────────────
insert into conversations (id, type, match_id) values
  ('0e000000-0000-0000-0000-0000000000ca', 'MATCH_CHAT', '0d000000-0000-0000-0000-000000000005');
insert into messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at)
select '0e000000-0000-0000-0000-0000000000ca',
       (array['0b000000-0000-0000-0000-000001000001','0b000000-0000-0000-0000-000001000011'])[1 + (k % 2)]::uuid,
       (array['0c000000-0000-0000-0000-000001000001','0c000000-0000-0000-0000-000001000002'])[1 + (k % 2)]::uuid,
       (array['Ese gol fue offside, no vale','Mentira, entró limpio','Son unos tramposos','El árbitro los ayudó',
              'Suban la foto del resultado','Nos robaron el partido','Vamos a reclamar al admin','Esto no queda así',
              'Dejen de mentir','Nos vemos en la cancha'])[1 + (k % 10)] || ' (' || k || ')',
       false,
       now() - interval '2 days' + (k * 4 || ' minutes')::interval
from generate_series(1, 14) k;

-- ─── 4b. Evidencias de WO con fotos reales (Unsplash) ────────────────────────
update wo_claims set photo_url = 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=800&q=60';


-- ============================================================
-- BLOQUE 10: CAOS, EXTREMOS Y STRESS TEST (edge cases / UI breaking points)
-- ============================================================
-- UUIDs de la familia 0f... (no colisionan con bloques anteriores).
-- TODOS los perfiles llevan date_of_birth + gender (login desbloqueado).
-- Password de todos: 123456.

-- ─── 1. Rompe-UIs: usuarios especiales (auth) ────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '0f000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'emoji@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0f000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'textazo@test.local',  crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0f000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'roto@test.local',     crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0f000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'goleador@test.local', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0f000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'fantasma@test.local', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position, gender, date_of_birth, avatar_url) values
  -- Nombre extremo con acentos + emojis (renderizado de fuentes/emojis)
  ('0f000000-0000-0000-0000-0000000000e2', '0f000000-0000-0000-0000-0000000000e1', 'emoji_player', 'Jõsé ⚽️🔥 Løpëz-Smyth 🦅', 'Palermo', 'DELANTERO', 'X', '1993-03-03', 'https://i.pravatar.cc/300?img=15'),
  -- Jugador con aviso de mercado gigante (ver market_player_posts abajo)
  ('0f000000-0000-0000-0000-0000000000a2', '0f000000-0000-0000-0000-0000000000a1', 'textazo', 'Pedro Textos Largos', 'Caballito', 'MEDIOCAMPISTA', 'M', '1990-10-10', 'https://i.pravatar.cc/300?img=25'),
  -- Avatar ROTO a propósito (fallback visual)
  ('0f000000-0000-0000-0000-0000000000b2', '0f000000-0000-0000-0000-0000000000b1', 'avatar_roto', 'Carlos Sin Foto', 'Belgrano', 'DEFENSOR', 'M', '1988-08-08', 'https://este-dominio-no-existe-123.com/foto.jpg'),
  -- Goleador absurdo (150 goles en un stint — ver team_stints abajo)
  ('0f000000-0000-0000-0000-0000000000c2', '0f000000-0000-0000-0000-0000000000c1', 'el_goleador', 'Martín "Cañón" Batigol', 'Núñez', 'DELANTERO', 'M', '1991-01-01', 'https://i.pravatar.cc/300?img=33'),
  -- Capitán del equipo Fantasma (empty states)
  ('0f000000-0000-0000-0000-0000000000f2', '0f000000-0000-0000-0000-0000000000f1', 'cap_fantasma', 'Solitario Capitán', 'Flores', 'ARQUERO', 'M', '1995-05-05', 'https://i.pravatar.cc/300?img=40');

-- ─── 1a. Equipo con nombre ridículamente largo (text overflow) ───────────────
insert into teams (id, name, category, zone, preferred_format, shield_url) values
  ('0f000000-0000-0000-0000-00000000a0a0',
   'Asociación Atlética de Fútbol Amateur Los Pibes del Barrio de la Esquina de la Vuelta Fútbol Club Sportivo Unidos Jamás Serán Vencidos',
   'HOMBRES', 'Palermo', 'FUTBOL_5', 'https://ui-avatars.com/api/?name=AA&background=striped&color=fff&size=256&bold=true');
insert into team_members (team_id, profile_id, role) values
  ('0f000000-0000-0000-0000-00000000a0a0', '0f000000-0000-0000-0000-0000000000e2', 'CAPITAN'),
  ('0f000000-0000-0000-0000-00000000a0a0', '0f000000-0000-0000-0000-0000000000a2', 'JUGADOR');

-- ─── 1b. Aviso de mercado de 1000+ caracteres continuos (sin saltos) ─────────
insert into market_player_posts (profile_id, post_type, position, description) values
  ('0f000000-0000-0000-0000-0000000000a2', 'BUSCA_EQUIPO', 'MEDIOCAMPISTA',
   substr(repeat('BuscoEquipoDeFutbol5OFutbol7EnZonaPalermoOCaballitoDisponibilidadTotalFinesDeSemanaYtambienEntreSemanaMuchaGanasDeJugarYCompetirAlMaximoNivel', 20), 1, 1000));

-- ─── 4b. Equipo con ESCUDO roto (fallback visual) ────────────────────────────
insert into teams (id, name, category, zone, preferred_format, shield_url) values
  ('0f000000-0000-0000-0000-00000000b0b0', 'Rotos FC', 'HOMBRES', 'Belgrano', 'FUTBOL_5',
   'https://este-dominio-no-existe-123.com/escudo.jpg');
insert into team_members (team_id, profile_id, role) values
  ('0f000000-0000-0000-0000-00000000b0b0', '0f000000-0000-0000-0000-0000000000b2', 'CAPITAN');

-- ─── 2a. Paginación: 300 mensajes en el chat del Partido 2 ───────────────────
insert into messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at)
select '0e000000-0000-0000-0000-0000000000c1',
       (array['0b000000-0000-0000-0000-000000000002','0b000000-0000-0000-0000-000000000003'])[1 + (k % 2)]::uuid,
       (array['0c000000-0000-0000-0000-0000000000a0','0c000000-0000-0000-0000-0000000000b0'])[1 + (k % 2)]::uuid,
       'Mensaje de stress #' || k || ' — ' || (array['dale','vamos','ojo','jaja','uh','tremendo','no puede ser','otra vez','arriba','tranqui'])[1 + (k % 10)],
       (k % 2 = 0),
       now() - interval '10 hours' + (k || ' minutes')::interval
from generate_series(1, 300) k;

-- ─── 2b. Paginación: 200 notificaciones para admin_global ────────────────────
insert into notifications (profile_id, type, title, body, data, is_read, created_at)
select '0b000000-0000-0000-0000-000000000001',
       (array['DESAFIO_RECIBIDO','WO_RECLAMADO','PARTIDO_FINALIZADO','RESULTADO_EN_DISPUTA',
              'SOLICITUD_UNION_EQUIPO','MENSAJE_NUEVO','PARTIDO_CONFIRMADO','POSTULACION_RECIBIDA',
              'CANCELACION_SOLICITADA','TEMPORADA_INICIADA']::notification_type[])[1 + (n % 10)],
       'Notif masiva admin #' || n,
       'Cuerpo de prueba de paginación número ' || n || '.',
       jsonb_build_object('idx', n),
       (n % 2 = 0),
       now() - (n || ' minutes')::interval
from generate_series(1, 200) n;

-- ─── 3a. Goleada absurda 25-24 con 49 registros de goles en scorers ──────────
-- Entre dos equipos de la liga (3 y 4). Se distribuyen 25 goles entre los
-- jugadores del equipo 3 (g=21..30) y 24 entre los del equipo 4 (g=31..40).
insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at, finished_at, season_id)
values ('0f000000-0000-0000-0000-00000000d5d5', '0c000000-0000-0000-0000-000001000003', '0c000000-0000-0000-0000-000001000004',
        'RANKING', 'FINALIZADO', 'FUTBOL_7', now() - interval '5 days', now() - interval '5 days',
        (select id from seasons where is_active = true));
insert into match_participants (match_id, profile_id, team_id, did_checkin) values
  ('0f000000-0000-0000-0000-00000000d5d5', '0b000000-0000-0000-0000-000001000021', '0c000000-0000-0000-0000-000001000003', true),
  ('0f000000-0000-0000-0000-00000000d5d5', '0b000000-0000-0000-0000-000001000022', '0c000000-0000-0000-0000-000001000003', true),
  ('0f000000-0000-0000-0000-00000000d5d5', '0b000000-0000-0000-0000-000001000031', '0c000000-0000-0000-0000-000001000004', true),
  ('0f000000-0000-0000-0000-00000000d5d5', '0b000000-0000-0000-0000-000001000032', '0c000000-0000-0000-0000-000001000004', true);
insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id, status) values
  ('0f000000-0000-0000-0000-00000000d5d5', '0c000000-0000-0000-0000-000001000003', '0b000000-0000-0000-0000-000001000021', 25, 24,
   (select jsonb_agg(jsonb_build_object('profile_id', '0b000000-0000-0000-0000-0000010' || lpad((21 + (i % 10))::text, 5, '0'), 'goals', 1))
      from generate_series(0, 24) i),
   '0b000000-0000-0000-0000-000001000021', 'CONFIRMADO'),
  ('0f000000-0000-0000-0000-00000000d5d5', '0c000000-0000-0000-0000-000001000004', '0b000000-0000-0000-0000-000001000031', 24, 25,
   (select jsonb_agg(jsonb_build_object('profile_id', '0b000000-0000-0000-0000-0000010' || lpad((31 + (i % 10))::text, 5, '0'), 'goals', 1))
      from generate_series(0, 23) i),
   null, 'CONFIRMADO');

-- ─── 3b. Jugador con 150 goles en un solo stint (números de 3 cifras) ────────
insert into team_stints (profile_id, team_id, team_name, started_at, ended_at, leave_reason, last_role, stats, stats_computed_at)
values ('0f000000-0000-0000-0000-0000000000c2', '0c000000-0000-0000-0000-000001000005',
        (select name from teams where id = '0c000000-0000-0000-0000-000001000005'),
        now() - interval '400 days', now() - interval '40 days', 'TRANSFERENCIA', 'JUGADOR',
        jsonb_build_object(
          'total', jsonb_build_object('pj_ranking', 38, 'pj_amistoso', 12, 'goals', 150, 'mvps', 40,
                                      'clean_sheets', 5, 'wins', 45, 'draws', 3, 'losses', 2),
          'by_season', jsonb_build_array(jsonb_build_object('season_id', null, 'season_name', 'Temporada Récord',
                       'pj_ranking', 38, 'pj_amistoso', 12, 'goals', 150, 'mvps', 40, 'clean_sheets', 5,
                       'wins', 45, 'draws', 3, 'losses', 2)),
          'computed_at', now()::text),
        now());

-- ─── 4a. Predio con foto de MUY alta resolución (Unsplash) ───────────────────
-- ⚠️ La tabla `venues` NO tiene columna de imagen (id,name,address,zone_id,lat,
--    lng,phone,formats,is_active). La URL de alta resolución queda documentada
--    acá; para mostrarla en la UI hace falta agregar una columna photo_url +
--    su migración. URL sugerida:
--    https://images.unsplash.com/photo-1518605368461-1ee125239922?q=80&w=2000
insert into venues (id, name, address, zone_id, lat, lng, phone, formats, is_active) values
  ('0f000000-0000-0000-0000-00000000d0d0', 'Mega Estadio 4K (foto HD pendiente de columna)', 'Av. Del Libertador 7000',
   (select id from zones where slug = 'nunez'), -34.54000, -58.44500, '+54 11 4000-0000',
   array['FUTBOL_7','FUTBOL_8','FUTBOL_11']::team_format[], true);

-- ─── 5a. "Ejército FC": 25 jugadores activos (scroll máximo de roster) ───────
insert into teams (id, name, category, zone, preferred_format, shield_url, elo_rating) values
  ('0f000000-0000-0000-0000-00000000e0e0', 'Ejército FC', 'HOMBRES', 'Almagro', 'FUTBOL_11',
   'https://ui-avatars.com/api/?name=EJ&background=166534&color=fff&size=256&bold=true', 1100);
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('0f000000-0000-0000-0000-00000ea0' || lpad(g::text, 4, '0'))::uuid,
       'authenticated', 'authenticated', 'ejercito' || g || '@test.local',
       crypt('123456', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 25) g;
insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position, gender, date_of_birth, avatar_url)
select ('0f000000-0000-0000-0000-00000eb0' || lpad(g::text, 4, '0'))::uuid,
       ('0f000000-0000-0000-0000-00000ea0' || lpad(g::text, 4, '0'))::uuid,
       'soldado_' || g, 'Soldado ' || g || ' del Ejército', 'Almagro',
       (array['ARQUERO','DEFENSOR','MEDIOCAMPISTA','DELANTERO','CUALQUIERA']::player_position[])[1 + (g % 5)],
       (array['M','M','M','F','X'])[1 + (g % 5)],
       ('1990-01-01'::date + (g * 60 || ' days')::interval)::date,
       'https://i.pravatar.cc/300?img=' || (1 + (g % 70))
from generate_series(1, 25) g;
insert into team_members (team_id, profile_id, role, joined_at)
select '0f000000-0000-0000-0000-00000000e0e0',
       ('0f000000-0000-0000-0000-00000eb0' || lpad(g::text, 4, '0'))::uuid,
       case when g = 1 then 'CAPITAN'::team_role when g = 2 then 'SUBCAPITAN'::team_role else 'JUGADOR'::team_role end,
       now() - (g || ' days')::interval
from generate_series(1, 25) g;

-- ─── 5b. "Fantasma FC": solo el capitán, sin escudo, sin zona, sin partidos ──
insert into teams (id, name, category, zone, preferred_format, shield_url) values
  ('0f000000-0000-0000-0000-00000000f0f0', 'Fantasma FC', 'MIXTO', '', 'FUTBOL_5', null);
insert into team_members (team_id, profile_id, role) values
  ('0f000000-0000-0000-0000-00000000f0f0', '0f000000-0000-0000-0000-0000000000f2', 'CAPITAN');
