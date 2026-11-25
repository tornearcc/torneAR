-- ============================================================
-- SEED DEL REDISEÑO — casos que faltaban para probar Inicio por estado,
-- Sumarme a un equipo, Buscar › Rival y Tu equipo (rediseño P3-27).
-- ------------------------------------------------------------
-- ⚠️ SOLO para la base LOCAL. Nunca contra producción.
-- Se carga a mano DESPUÉS de `npx supabase start` (que ya cargó
-- seed_testing.sql y seed_showcase.sql). NO está en `sql_paths`
-- de config.toml a propósito: los tests pgTAP del CI cuentan filas.
--
--   docker exec -i supabase_db_tornear psql -U postgres -d postgres < supabase/seed_rediseno.sql
--
-- Contraseña de todas las cuentas: 123456
--
-- Cuentas nuevas (los demás casos ya vienen en los otros seeds):
--   nuevo@test.local     sin perfil → onboarding y «¿Qué venís a hacer?»
--   solo@test.local      capitán de «Los Solitarios» (F5, 1 de 5)
--   tres@test.local      capitán de «Tres Amigos FC» (F5, 3 de 5)
--   siete@test.local     capitán de «Siete de Oro» (F7, 2 de 7)
--   pedidos@test.local   capitán de «Con Pedidos FC» (F5, 2 de 5) con una
--                        solicitud de ingreso pendiente (de free_agent)
--   jugador@test.local   JUGADOR de «Tres Amigos FC» (no es capitán)
--   (amigo1/amigo2/amigo3@test.local completan planteles)
-- Además: «Buscan rival» publicado por los equipos de cap_alfa y cap_gamma.
-- ============================================================

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a1', 'authenticated', 'authenticated', 'nuevo@test.local',   crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a2', 'authenticated', 'authenticated', 'solo@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a3', 'authenticated', 'authenticated', 'tres@test.local',    crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a4', 'authenticated', 'authenticated', 'siete@test.local',   crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a5', 'authenticated', 'authenticated', 'pedidos@test.local', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a6', 'authenticated', 'authenticated', 'jugador@test.local', crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a7', 'authenticated', 'authenticated', 'amigo1@test.local',  crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a8', 'authenticated', 'authenticated', 'amigo2@test.local',  crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-0000000001a9', 'authenticated', 'authenticated', 'amigo3@test.local',  crypt('123456', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- nuevo@test.local queda SIN perfil a propósito: entra por el onboarding.
insert into profiles (id, auth_user_id, username, full_name, zone, preferred_position, is_admin, strong_foot, favorite_team) values
  ('0b000000-0000-0000-0000-0000000001a2', '0a000000-0000-0000-0000-0000000001a2', 'solo_cap',    'Capitán Solo',     'Palermo', 'DELANTERO',     false, 'RIGHT', 'Boca Juniors'),
  ('0b000000-0000-0000-0000-0000000001a3', '0a000000-0000-0000-0000-0000000001a3', 'tres_cap',    'Capitán Tres',     'Palermo', 'MEDIOCAMPISTA', false, 'RIGHT', 'River Plate'),
  ('0b000000-0000-0000-0000-0000000001a4', '0a000000-0000-0000-0000-0000000001a4', 'siete_cap',   'Capitán Siete',    'Palermo', 'DEFENSOR',      false, 'LEFT',  'Racing Club'),
  ('0b000000-0000-0000-0000-0000000001a5', '0a000000-0000-0000-0000-0000000001a5', 'pedidos_cap', 'Capitán Pedidos',  'Palermo', 'ARQUERO',       false, 'RIGHT', 'Independiente'),
  ('0b000000-0000-0000-0000-0000000001a6', '0a000000-0000-0000-0000-0000000001a6', 'jugador_tres','Jugador de Tres',  'Palermo', 'DELANTERO',     false, 'RIGHT', 'San Lorenzo'),
  ('0b000000-0000-0000-0000-0000000001a7', '0a000000-0000-0000-0000-0000000001a7', 'amigo_1',     'Amigo Uno',        'Palermo', 'DEFENSOR',      false, 'RIGHT', 'Boca Juniors'),
  ('0b000000-0000-0000-0000-0000000001a8', '0a000000-0000-0000-0000-0000000001a8', 'amigo_2',     'Amigo Dos',        'Palermo', 'ARQUERO',       false, 'RIGHT', 'River Plate'),
  ('0b000000-0000-0000-0000-0000000001a9', '0a000000-0000-0000-0000-0000000001a9', 'amigo_3',     'Amigo Tres',       'Palermo', 'MEDIOCAMPISTA', false, 'LEFT',  'Huracán');

insert into teams (id, name, category, zone, preferred_format) values
  ('0c000000-0000-0000-0000-0000000001a2', 'Los Solitarios', 'HOMBRES', 'Palermo', 'FUTBOL_5'),
  ('0c000000-0000-0000-0000-0000000001a3', 'Tres Amigos FC', 'HOMBRES', 'Palermo', 'FUTBOL_5'),
  ('0c000000-0000-0000-0000-0000000001a4', 'Siete de Oro',   'HOMBRES', 'Palermo', 'FUTBOL_7'),
  ('0c000000-0000-0000-0000-0000000001a5', 'Con Pedidos FC', 'HOMBRES', 'Palermo', 'FUTBOL_5');

insert into team_members (team_id, profile_id, role) values
  ('0c000000-0000-0000-0000-0000000001a2', '0b000000-0000-0000-0000-0000000001a2', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000001a3', '0b000000-0000-0000-0000-0000000001a3', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000001a3', '0b000000-0000-0000-0000-0000000001a6', 'JUGADOR'),
  ('0c000000-0000-0000-0000-0000000001a3', '0b000000-0000-0000-0000-0000000001a7', 'JUGADOR'),
  ('0c000000-0000-0000-0000-0000000001a4', '0b000000-0000-0000-0000-0000000001a4', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000001a4', '0b000000-0000-0000-0000-0000000001a8', 'JUGADOR'),
  ('0c000000-0000-0000-0000-0000000001a5', '0b000000-0000-0000-0000-0000000001a5', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000001a5', '0b000000-0000-0000-0000-0000000001a9', 'JUGADOR');

-- Alguien quiere entrar a «Con Pedidos FC» (free_agent, del seed de testing).
insert into team_join_requests (team_id, profile_id, status) values
  ('0c000000-0000-0000-0000-0000000001a5', '0b000000-0000-0000-0000-000000000010', 'PENDIENTE');

-- Perfiles completos (lib/auth-utils.ts › isProfileComplete pide fecha de nacimiento y género).
update profiles set date_of_birth = '1996-04-12', gender = 'M'
where id::text like '0b000000-0000-0000-0000-0000000001a_';

-- Términos aceptados (lib/auth-data.ts › needsLegalAcceptance): si no, cada cuenta abre con el aviso
-- «Actualizamos los Términos». Versiones de components/legal/termsContent.ts y la de privacidad.
update auth.users set raw_user_meta_data = '{"accepted_tyc":true,"accepted_privacy":true,"legal_acceptance_date":"2026-11-25T00:00:00Z","tyc_version":"11 de Septiembre, 2026","privacy_version":"21 de Octubre, 2026"}'::jsonb
where email like '%@test.local';

-- «Buscan rival»: los equipos que capitanean cap_alfa y cap_gamma.
insert into rival_posts (team_id, created_by, format, days, time_slots, zone, expires_at, note)
select t.id, tm.profile_id, t.preferred_format, '{6}'::smallint[], '{TARDE}'::text[], t.zone, now() + interval '7 days', 'Sábado a la tarde, buscamos partido'
from teams t
join team_members tm on tm.team_id = t.id and tm.role = 'CAPITAN'
where tm.profile_id in ('0b000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000008')
  and t.is_active
on conflict (team_id) do nothing;

commit;
