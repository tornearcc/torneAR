-- ============================================================
-- Link de descarga con medición (#37)
-- 2026-09-29 · Tanda 4
-- ------------------------------------------------------------
-- `tornear.vercel.app/d/<canal>` redirige a la ficha de la App Store con
-- `pt` (provider token) y `ct` (canal): App Store Connect → Analytics →
-- Campañas muestra impresiones de la ficha, descargas y primeras aperturas por
-- canal, sin SDK. Esto guarda además cada click, para verlo al día en el
-- dashboard (Crecimiento) sin esperar a Apple.
--
--   · `link_clicks`: canal, plataforma y fecha. Sin IP ni user-agent: no hace
--     falta para contar y no se guarda lo que no se usa.
--   · `log_link_click(canal, plataforma)`: la llama la route /d/[canal] con la
--     clave anon. Un canal fuera de la lista no se registra (no-op).
--   · `dashboard_link_clicks(desde, hasta)`: clicks por canal y plataforma
--     para el dashboard; exige is_admin, como las demás dashboard_*.
--
-- Los canales son los de la campaña: dm, wpp, story, cancha. La misma lista
-- vive en la route del dashboard (dashboard/app/d/[canal]/route.ts).
-- ============================================================


-- ── 1. Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_clicks (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel    text NOT NULL CHECK (channel IN ('dm', 'wpp', 'story', 'cancha')),
  platform   text NOT NULL CHECK (platform IN ('ios', 'android', 'otro')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS link_clicks_created_at_idx ON public.link_clicks (created_at);

-- Sin policies: nadie lee ni escribe directo. Se escribe por log_link_click y
-- se lee por dashboard_link_clicks.
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.link_clicks FROM anon, authenticated;

COMMENT ON TABLE public.link_clicks IS
  'Clicks en los links de descarga /d/<canal> (#37). Sin IP ni user-agent. Se escribe con log_link_click y se lee con dashboard_link_clicks (20260929150000).';


-- ── 2. Registro de un click ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_link_click(p_channel text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('dm', 'wpp', 'story', 'cancha') THEN
    RETURN;
  END IF;

  INSERT INTO public.link_clicks (channel, platform)
  VALUES (p_channel, CASE WHEN p_platform IN ('ios', 'android') THEN p_platform ELSE 'otro' END);
END;
$function$;

COMMENT ON FUNCTION public.log_link_click(text, text) IS
  '#37. Registra un click en /d/<canal>. Canal fuera de dm/wpp/story/cancha: no hace nada. Plataforma fuera de ios/android: otro. La llama la route del dashboard con la clave anon (20260929150000).';


-- ── 3. Resumen para el dashboard ────────────────────────────────────────────
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

  -- Los cuatro canales siempre, aunque tengan 0: "nadie tocó el link de la
  -- cancha" también es un dato.
  RETURN QUERY
  SELECT
    c.channel,
    COUNT(lc.id)::bigint,
    COUNT(lc.id) FILTER (WHERE lc.platform = 'ios')::bigint,
    COUNT(lc.id) FILTER (WHERE lc.platform = 'android')::bigint,
    COUNT(lc.id) FILTER (WHERE lc.platform = 'otro')::bigint
  FROM (VALUES ('dm', 1), ('wpp', 2), ('story', 3), ('cancha', 4)) AS c(channel, ord)
  LEFT JOIN public.link_clicks lc
    ON lc.channel = c.channel
   AND lc.created_at::date BETWEEN v_from AND v_to
  GROUP BY c.channel, c.ord
  ORDER BY c.ord;
END;
$function$;

COMMENT ON FUNCTION public.dashboard_link_clicks(date, date) IS
  '#37. Clicks por canal y plataforma en /d/<canal> para el rango (30 días por defecto, máximo 366). Exige is_admin (20260929150000).';


-- ── 4. Permisos ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.log_link_click(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_link_click(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_link_clicks(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_link_clicks(date, date) TO authenticated;
