-- ============================================================
-- 015-schema-interactions — Matriz de privilegios de tablas de interacción
-- ============================================================
-- Epílogo estructural (hermano de 010-schema): congela la matriz de
-- privilegios de `authenticated` sobre las tablas de interacción cuyo grant
-- faltaba en las migraciones puras y que fuimos cerrando durante la campaña
-- de migración a pgTAP. Si un cambio futuro otorga o revoca un privilegio de
-- estas tablas, esta suite se pone roja ANTES de que un bug de permisos
-- silencioso llegue a runtime.
--
-- ── Verdad medida contra migraciones puras (supabase db reset), pineadas a
--    Supabase CLI 2.109.1 en CI ──
--   team_join_requests / messages / conversations : DML COMPLETO. Son tablas
--     de escritura directa del DAL (solicitudes de unión, mensajes, aperturas
--     de conversación de mercado). SELECT/INSERT/UPDATE/DELETE otorgados
--     explícitamente en 20260722123000; REFERENCES/TRIGGER son el
--     baseline de Supabase para authenticated en public (TRUNCATE se revoca
--     en todo public desde 20260929020000, P2-7).
--   match_participants : SÓLO LECTURA a nivel tabla. Sus escrituras van por
--     grants POR COLUMNA (INSERT de identidad de invitado, UPDATE de check-in)
--     y por la RPC submit_team_checkin (SECURITY DEFINER) — nada de eso figura
--     en table_privs_are, que sólo ve privilegios de TABLA. La ausencia de
--     INSERT/UPDATE/DELETE de tabla ES la aserción de seguridad: el DELETE
--     inerte heredado del schema inicial se revocó en 20260722130000.
--
-- ⚠️ table_privs_are es EXACT-MATCH. Si un cambio de versión del CLI altera
-- el baseline de default privileges (REFERENCES/TRIGGER/TRUNCATE), re-medir
-- estos arrays. El job db-tests-pgtap (pineado a 2.109.1) es el árbitro.
-- ============================================================

begin;
select plan(4);

-- ── Tablas de comunicación: DML completo (7 privilegios) ────────────────────
select table_privs_are('public', 'team_join_requests', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','UPDATE'],
  'team_join_requests: authenticated tiene DML completo (SELECT/INSERT/UPDATE/DELETE)');
select table_privs_are('public', 'messages', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','UPDATE'],
  'messages: authenticated tiene DML completo (SELECT/INSERT/UPDATE/DELETE)');
select table_privs_are('public', 'conversations', 'authenticated',
  array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','UPDATE'],
  'conversations: authenticated tiene DML completo (SELECT/INSERT/UPDATE/DELETE)');

-- ── match_participants: SÓLO LECTURA a nivel tabla (DML por columna/RPC) ─────
-- La ausencia de INSERT/UPDATE/DELETE de tabla es el invariante de seguridad:
-- la lista masiva sólo entra por submit_team_checkin.
select table_privs_are('public', 'match_participants', 'authenticated',
  array['REFERENCES','SELECT','TRIGGER'],
  'match_participants: authenticated es sólo-lectura a nivel tabla (sin INSERT/UPDATE/DELETE de tabla)');

select * from finish();
rollback;
