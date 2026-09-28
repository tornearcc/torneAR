-- ============================================================
-- 010-schema — Canario estructural de las tablas core (pgTAP)
-- ============================================================
-- Red de seguridad de los CIMIENTOS: congela existencia, RLS y la matriz de
-- privilegios de `authenticated` sobre las 6 tablas core. A diferencia de
-- las suites de comportamiento (100/110/120/200), acá no se ejercita lógica:
-- se afirma el estado del schema. Si alguien borra una tabla, deshabilita
-- RLS o cambia un GRANT/REVOKE, esta suite se pone roja ANTES de que un bug
-- de comportamiento lo pise por casualidad.
--
-- Nace del incidente del 19-jul: un `GRANT UPDATE` a nivel tabla reabrió la
-- escalada de privilegios de profiles.is_admin (hallazgo ROJO #2). Los
-- privilegios de columna de profiles/teams NO son RLS — son grants de
-- columna, y sólo un canario como éste los vigila declarativamente.
--
-- ── Sobre los privilegios afirmados (medidos post `supabase db reset`,
--    es decir, contra migraciones puras = lo que construye CI) ──
--   challenges / matches : los 6 (incluye REFERENCES y TRIGGER, que
--     Supabase otorga por default a authenticated en toda tabla de public;
--     TRUNCATE se revoca en todo public desde 20260929020000, P2-7) +
--     INSERT/UPDATE/DELETE de nuestros grants.
--   team_members : los mismos MENOS DELETE — revocado por 20260723123000
--     para que las salidas pasen por las RPCs que fijan tornear.leave_reason.
--   teams : los mismos MENOS UPDATE — el lockdown por columna de
--     20260714022651 (restaurado en 20260719130000) revoca UPDATE a nivel
--     tabla y lo re-otorga sólo sobre columnas editables. Que UPDATE NO
--     aparezca en ese array ES la aserción de seguridad central.
--   profiles : los mismos MENOS UPDATE **Y MENOS SELECT**. Al lockdown de
--     UPDATE de arriba se le sumó el de SELECT en
--     20260819100000_privacy_and_age_compliance, que cerró la lectura masiva
--     de `date_of_birth` y `expo_push_token`. El bloque 4 de esta suite
--     verifica el detalle columna por columna: sin ese bloque, el array de
--     tabla pasaría igual si alguien revocara TODO el acceso a profiles.
--   team_stints : sólo lectura + defaults; SIN INSERT/UPDATE/DELETE. El
--     ledger de trayectoria lo escriben exclusivamente los triggers
--     SECURITY DEFINER open/close_team_stint, así que el rol de la app no
--     puede manipular la historia de fichajes. Propiedad deseable, congelada.
--
-- ⚠️ table_privs_are es EXACT-MATCH. Esta suite se midió con Supabase CLI
-- v2.83.0; si CI corre una versión cuyo baseline de default privileges
-- difiere (p.ej. sin TRIGGER/TRUNCATE para authenticated), los arrays acá
-- deberán ajustarse a lo que reporte CI. El job db-tests-pgtap es el árbitro.
-- ============================================================

begin;
select plan(21);

-- ── 1. Existencia de las 6 tablas core ──────────────────────────────────────
select has_table('public', 'profiles',     'tabla core profiles existe');
select has_table('public', 'teams',        'tabla core teams existe');
select has_table('public', 'team_members', 'tabla core team_members existe');
select has_table('public', 'matches',      'tabla core matches existe');
select has_table('public', 'challenges',   'tabla core challenges existe');
select has_table('public', 'team_stints',  'ledger team_stints existe');

-- ── 2. RLS habilitado (relrowsecurity del catálogo) ─────────────────────────
-- Se consulta por OID (public.X::regclass) en vez de relname para no
-- confundir una tabla homónima de otro schema.
select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
          true, 'RLS habilitado en profiles');
select is((select relrowsecurity from pg_class where oid = 'public.teams'::regclass),
          true, 'RLS habilitado en teams');
select is((select relrowsecurity from pg_class where oid = 'public.team_members'::regclass),
          true, 'RLS habilitado en team_members');
select is((select relrowsecurity from pg_class where oid = 'public.matches'::regclass),
          true, 'RLS habilitado en matches');
select is((select relrowsecurity from pg_class where oid = 'public.challenges'::regclass),
          true, 'RLS habilitado en challenges');
select is((select relrowsecurity from pg_class where oid = 'public.team_stints'::regclass),
          true, 'RLS habilitado en team_stints');

-- ── 3. Matriz de privilegios de `authenticated` (exact-match) ───────────────
-- Tablas con DML completo (los 7 privilegios reales).
select table_privs_are('public', 'challenges', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','UPDATE'],
  'challenges: authenticated conserva DML completo');
select table_privs_are('public', 'matches', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','UPDATE'],
  'matches: authenticated conserva DML completo');
-- team_members: SIN DELETE a nivel tabla desde 20260723123000. El borrado
-- directo del cliente dejaba el GUC tornear.leave_reason sin setear y TODA
-- salida se registraba como ABANDONO en team_stints (expulsiones y
-- transferencias incluidas). Las salidas entran ahora sólo por las RPCs
-- SECURITY DEFINER (leave_team_as_member / remove_team_member /
-- transfer_to_team / transfer_captaincy_and_leave), que fijan el motivo.
-- Que DELETE NO aparezca acá es la aserción que protege la integridad del
-- ledger de trayectoria.
select table_privs_are('public', 'team_members', 'authenticated',
  array['INSERT','REFERENCES','SELECT','TRIGGER','UPDATE'],
  'team_members: authenticated NO tiene DELETE (las salidas pasan por RPC con motivo)');

-- profiles: SIN UPDATE **y SIN SELECT** a nivel tabla. Los dos están por
-- columna ahora, por dos lockdowns distintos y con motivos distintos:
--   · UPDATE  — 20260714022651 / 20260719130000, anti-escalada de is_admin.
--   · SELECT  — 20260819100000_privacy_and_age_compliance, para que
--     `date_of_birth` (fecha exacta) y `expo_push_token` dejen de ser
--     legibles por cualquier autenticado sobre cualquier perfil.
-- El REVOKE de SELECT de tabla es obligatorio, no cosmético: Postgres evalúa
-- el acceso a una columna como "lo permite el ACL de tabla O el de columna",
-- así que mientras el SELECT de tabla siguiera vivo, ningún REVOKE de columna
-- podía angostar nada. Que SELECT tampoco aparezca acá es parte de la
-- aserción.
select table_privs_are('public', 'profiles', 'authenticated',
  array['DELETE','INSERT','REFERENCES','TRIGGER'],
  'profiles: authenticated NO tiene UPDATE ni SELECT a nivel tabla (ambos por columna)');
select table_privs_are('public', 'teams', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER'],
  'teams: authenticated NO tiene UPDATE a nivel tabla (anti-manipulación de elo_rating)');

-- team_stints: sólo lectura + defaults; SIN INSERT/UPDATE/DELETE (lo escriben
-- los triggers SECURITY DEFINER). La app no puede tocar la trayectoria.
select table_privs_are('public', 'team_stints', 'authenticated',
  array['REFERENCES','SELECT','TRIGGER'],
  'team_stints: authenticated es sólo-lectura (el ledger lo escriben triggers)');

-- ── 4. El lockdown por COLUMNA de profiles ──────────────────────────────────
-- Sacar SELECT del array de arriba deja un agujero en el canario: pasaría
-- igual si alguien revocara TODO el acceso a profiles, o si re-otorgara
-- SELECT de tabla completa a mano. Estas tres aserciones fijan lo que el
-- lockdown de verdad promete, columna por columna.
--
-- ⚠️ INSERT aparece en los tres arrays porque el GRANT de INSERT sí es de
-- tabla, e information_schema lo expande a todas las columnas. Lo que estos
-- tests vigilan es la presencia/ausencia de SELECT y UPDATE.
select column_privs_are('public', 'profiles', 'date_of_birth', 'authenticated',
  array['INSERT','REFERENCES','UPDATE'],
  'profiles.date_of_birth: SIN SELECT — la fecha exacta no se lee por SELECT directo (sólo age derivada, vía profiles_public)');

select column_privs_are('public', 'profiles', 'expo_push_token', 'authenticated',
  array['INSERT','REFERENCES','UPDATE'],
  'profiles.expo_push_token: SIN SELECT — no se pueden cosechar tokens ajenos (sólo las RPCs acotadas de 20260819100000)');

-- La contracara del array de tabla: is_admin se puede LEER (lo necesita el
-- gate del dashboard, 20260819140000) pero no ESCRIBIR. Si algún día vuelve
-- a aparecer UPDATE acá, la escalada de privilegios del 19-jul está de vuelta.
select column_privs_are('public', 'profiles', 'is_admin', 'authenticated',
  array['INSERT','REFERENCES','SELECT'],
  'profiles.is_admin: legible pero SIN UPDATE (anti-escalada de privilegios)');

select * from finish();
rollback;
