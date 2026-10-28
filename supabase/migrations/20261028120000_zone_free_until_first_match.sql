-- ============================================================
-- Zona libre hasta el primer partido (cambia D-55)
-- 2026-10-28 · Auditoría de app_logs del 27/10
-- ------------------------------------------------------------
-- El candado de 20260928240000 contaba cualquier mudanza de la temporada, aunque
-- el equipo nunca hubiera jugado. Un capitán nuevo que eligió mal la zona al
-- crear el equipo, la corrigió una vez y quedó bloqueado hasta la temporada
-- siguiente (4 intentos con ZONE_LOCKED el 27/10).
--
-- Ahora, mientras el equipo no tenga ningún partido FINALIZADO, cambia de zona
-- libremente; y esas mudanzas no gastan el cambio de la temporada: el candado
-- solo cuenta las que se hicieron desde el primer partido finalizado. Las
-- mudanzas se siguen registrando todas (team_zone_changes no cambia). Lo que
-- busca D-55 —que un equipo con ranking no se mude a la zona que va ganando—
-- sigue igual, porque sin partidos no hay ranking que aprovechar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assert_team_zone_change_allowed(
  p_team_id   uuid,
  p_zone      text,
  p_is_update boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_season_id      uuid;
  v_season_name    text;
  v_first_finished timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zones z WHERE z.name = p_zone) THEN
    RAISE EXCEPTION 'ZONE_UNKNOWN: la zona «%» no está en el catálogo', p_zone;
  END IF;

  IF NOT p_is_update THEN
    RETURN;
  END IF;

  -- Sin partidos finalizados no hay candado.
  SELECT min(coalesce(m.finished_at, m.scheduled_at, m.created_at)) INTO v_first_finished
    FROM public.matches m
   WHERE m.status = 'FINALIZADO'
     AND (m.team_a_id = p_team_id OR m.team_b_id = p_team_id);

  IF v_first_finished IS NULL THEN
    RETURN;
  END IF;

  SELECT s.id, s.name INTO v_season_id, v_season_name
    FROM public.seasons s WHERE s.is_active
   ORDER BY s.starts_at DESC LIMIT 1;

  IF v_season_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_zone_changes c
     WHERE c.team_id = p_team_id
       AND c.season_id = v_season_id
       AND NOT c.is_admin_override
       AND c.created_at >= v_first_finished
  ) THEN
    RAISE EXCEPTION 'ZONE_LOCKED: el equipo ya cambió de zona en %. Vas a poder cambiarla de nuevo cuando empiece la próxima temporada', v_season_name;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_team_zone_change_allowed(uuid, text, boolean) IS
  'D-55. Levanta ZONE_UNKNOWN si la zona no está en el catálogo y ZONE_LOCKED si el equipo ya se mudó en la temporada activa desde su primer partido finalizado (sin contar excepciones de admin). Antes del primer partido la zona es libre (20261028120000). La llama el trigger teams_zone_rules.';
