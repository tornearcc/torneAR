-- ============================================================
-- Link de descarga: canal de la invitación a un equipo (#37)
-- 2026-09-30 · Tanda 7 «llenar los equipos» · P1-11
-- ------------------------------------------------------------
-- Suma `equipo` a los canales de /d/<canal>: es el botón del App Store de la
-- landing de invitación a un equipo (/i/<username>?e=<código>). Así se ve en
-- Crecimiento cuántos invitados llegan a la tienda. Cambia la restricción de
-- link_clicks, log_link_click y dashboard_link_clicks (20260929160000); la
-- misma lista vive en dashboard/app/d/[canal]/route.ts.
-- ============================================================

ALTER TABLE public.link_clicks DROP CONSTRAINT IF EXISTS link_clicks_channel_check;
ALTER TABLE public.link_clicks ADD CONSTRAINT link_clicks_channel_check
  CHECK (channel IN ('dm', 'wpp', 'story', 'cancha', 'fb', 'equipo'));

CREATE OR REPLACE FUNCTION public.log_link_click(p_channel text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('dm', 'wpp', 'story', 'cancha', 'fb', 'equipo') THEN
    RETURN;
  END IF;

  INSERT INTO public.link_clicks (channel, platform)
  VALUES (p_channel, CASE WHEN p_platform IN ('ios', 'android') THEN p_platform ELSE 'otro' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_link_clicks(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
RETURNS TABLE(channel text, clicks bigint, ios bigint, android bigint, otro bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from date;
  v_to   date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  v_to   := COALESCE(p_to, current_date);
  v_from := COALESCE(p_from, v_to - 29);

  IF v_from > v_to THEN
    RAISE EXCEPTION 'INVALID_RANGE: p_from debe ser anterior o igual a p_to';
  END IF;

  IF v_to - v_from > 366 THEN
    v_from := v_to - 366;
  END IF;

  -- Todos los canales siempre, aunque tengan 0: "nadie tocó el link de la
  -- cancha" también es un dato.
  RETURN QUERY
  SELECT
    c.channel,
    COUNT(lc.id)::bigint,
    COUNT(lc.id) FILTER (WHERE lc.platform = 'ios')::bigint,
    COUNT(lc.id) FILTER (WHERE lc.platform = 'android')::bigint,
    COUNT(lc.id) FILTER (WHERE lc.platform = 'otro')::bigint
  FROM (VALUES ('dm', 1), ('wpp', 2), ('story', 3), ('fb', 4), ('cancha', 5), ('equipo', 6)) AS c(channel, ord)
  LEFT JOIN public.link_clicks lc
    ON lc.channel = c.channel
   AND lc.created_at::date BETWEEN v_from AND v_to
  GROUP BY c.channel, c.ord
  ORDER BY c.ord;
END;
$function$;
