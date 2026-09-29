-- ============================================================
-- anon sin permisos de escritura en public (P2-11)
-- 2026-09-29 · Tanda 5 · Sale de P2-7 (PR #93)
-- ------------------------------------------------------------
-- En producción, `anon` (sin sesión) conservaba INSERT/UPDATE/DELETE en 29
-- tablas de public y en la vista v_venues, por los permisos por defecto de
-- Supabase. Lo único que lo frenaba era la RLS: una política mal escrita
-- bastaba para dejar escribir a cualquiera sin sesión.
--
-- La app sólo escribe una tabla sin sesión: `app_logs` (el Logger registra
-- errores antes del login, p. ej. «Autenticación rechazada»). Lo demás que
-- hace sin sesión va por RPC con su propio GRANT (log_link_click) o por la
-- API de Auth. Las políticas de escritura que alcanzan a anon (TO public)
-- exigen auth.uid(), que sin sesión es NULL: sacar los permisos no cambia
-- nada de lo que hoy funciona.
--
--   · Se revoca INSERT, UPDATE y DELETE a anon en todas las tablas y vistas
--     de public, salvo INSERT en app_logs.
--   · Default privileges: las tablas nuevas nacen sin escritura para anon.
--     Si alguna vez una tabla nueva tiene que recibir datos sin sesión, el
--     GRANT va explícito en su migración (como app_logs).
--   · La lectura (SELECT) no se toca: la usan la landing, /i/<usuario> y la
--     pantalla de login.
-- El test 610-anon-dml fija el resultado.
-- ============================================================

DO $$
DECLARE
  v_rel record;
BEGIN
  FOR v_rel IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', v_rel.relname);
  END LOOP;
END $$;

GRANT INSERT ON public.app_logs TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;
