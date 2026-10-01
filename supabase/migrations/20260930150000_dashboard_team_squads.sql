-- ============================================================
-- dashboard_team_squads() — ¿los equipos dejan de ser de una persona?
-- ============================================================
-- La métrica que hoy dice si la liga crece de verdad (plan de diseño del
-- dashboard, knowledge/diseno-dashboard-plan.md): cuántos equipos tienen 2 o
-- más integrantes ahora y cuántos tenían hace 7 días. Un equipo de una sola
-- persona es un capitán que todavía no invitó a nadie; no juega.
--
-- Las dos fotos salen de team_stints, el ledger de ciclos jugador–equipo, y
-- no de team_members: team_members sólo sabe el presente, y comparar un
-- presente de una tabla contra un pasado de otra mezclaría dos fuentes que
-- pueden no coincidir. Un ciclo está abierto en el instante T si empezó antes
-- (o en) T y no terminó, o terminó después de T.
--
-- Sin join a teams a propósito: team_stints no tiene FK (la trayectoria
-- sobrevive a la disolución del club) y un equipo disuelto ya tiene sus
-- ciclos cerrados, así que deja de contar solo.
--
-- Función aparte y no columnas nuevas en dashboard_overview_kpis(): cambiar
-- el RETURNS TABLE de una función existente obliga a DROP + CREATE, y entre
-- los dos el Resumen en producción se quedaría sin datos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_team_squads()
RETURNS TABLE (
  teams_2plus_now     bigint,
  teams_2plus_7d_ago  bigint,
  teams_solo_now      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_now  timestamptz := now();
  v_then timestamptz := now() - interval '7 days';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  RETURN QUERY
  WITH squads AS (
    SELECT
      s.team_id,
      COUNT(DISTINCT s.profile_id) FILTER (
        WHERE s.started_at <= v_now AND (s.ended_at IS NULL OR s.ended_at > v_now)
      ) AS members_now,
      COUNT(DISTINCT s.profile_id) FILTER (
        WHERE s.started_at <= v_then AND (s.ended_at IS NULL OR s.ended_at > v_then)
      ) AS members_then
    FROM public.team_stints s
    GROUP BY s.team_id
  )
  SELECT
    COUNT(*) FILTER (WHERE members_now >= 2)::bigint,
    COUNT(*) FILTER (WHERE members_then >= 2)::bigint,
    COUNT(*) FILTER (WHERE members_now = 1)::bigint
  FROM squads;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_team_squads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_team_squads() TO authenticated;

COMMENT ON FUNCTION public.dashboard_team_squads() IS
  'Resumen de /dashboard (is_admin): equipos con 2+ integrantes ahora y hace 7 días, y equipos de una sola persona ahora. Sale de team_stints para que las dos fotos usen la misma fuente.';
