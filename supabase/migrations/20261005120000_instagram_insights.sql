-- ============================================================
-- ESTADÍSTICAS DE INSTAGRAM POR DÍA Y POR PUBLICACIÓN
-- 2026-10-05 · Registro P2-8
-- ------------------------------------------------------------
-- 20261004120000 dejó a instagram-sync guardando las estadísticas en
-- social_metrics_daily, pero esa fila es del día de la corrida (seguidores al
-- momento) y las estadísticas son del día anterior: en un gráfico quedarían
-- corridas un día. Y el upsert de esa tabla pisa todas las columnas, así que
-- no sirve para escribir en la fila de ayer sin borrarle los seguidores.
--
-- Dos tablas nuevas, con su fecha real:
--   social_insights_daily   una fila por cuenta y día (hora argentina):
--                           alcance, vistas, visitas al perfil, toques en el
--                           link, e interacciones del día.
--   social_media_snapshots  una fila por publicación y día de corrida: las
--                           métricas acumuladas de cada post a esa fecha.
--
-- Escritura: sólo service_role (instagram-sync), vía RPC con jsonb.
-- Lectura: sólo admin, vía las RPC dashboard_instagram_* de /dashboard/social.
-- Ninguna de las dos tablas se lee ni se escribe directo desde la API.
--
-- social_metrics_daily sigue con los seguidores; se limpian las columnas de
-- estadísticas de la única fila que alcanzó a escribirse con el formato
-- anterior (05/10), para que el Resumen no sume datos fuera de su día.
-- ============================================================

CREATE TABLE public.social_insights_daily (
  account_id          uuid    NOT NULL REFERENCES public.social_accounts (id) ON DELETE CASCADE,
  day                 date    NOT NULL,
  reach               integer,
  views               integer,
  profile_views       integer,
  website_clicks      integer,
  accounts_engaged    integer,
  total_interactions  integer,
  likes               integer,
  comments            integer,
  shares              integer,
  saves               integer,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, day)
);

COMMENT ON TABLE public.social_insights_daily IS
  'Estadísticas diarias de una cuenta social (día en hora argentina). Las escribe instagram-sync vía service_instagram_insights_upsert; las lee /dashboard/social vía dashboard_instagram_insights..';

CREATE TABLE public.social_media_snapshots (
  account_id          uuid    NOT NULL REFERENCES public.social_accounts (id) ON DELETE CASCADE,
  media_id            text    NOT NULL,
  captured_at         date    NOT NULL,
  media_type          text,
  posted_at           timestamptz,
  permalink           text,
  caption             text,
  views               integer,
  reach               integer,
  likes               integer,
  comments            integer,
  shares              integer,
  saved               integer,
  total_interactions  integer,
  avg_watch_ms        integer,
  PRIMARY KEY (account_id, media_id, captured_at)
);

COMMENT ON TABLE public.social_media_snapshots IS
  'Métricas acumuladas de cada publicación a la fecha de la corrida (instagram-sync, últimos 30 días de publicaciones). avg_watch_ms sólo en reels.';

ALTER TABLE public.social_insights_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_media_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_insights_daily FROM anon, authenticated;
REVOKE ALL ON public.social_media_snapshots FROM anon, authenticated;

-- ── Escritura (service_role) ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.service_instagram_insights_upsert(
  p_account_id uuid,
  p_day        date,
  p_metrics    jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  IF p_account_id IS NULL OR p_day IS NULL OR p_metrics IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_account_id, p_day y p_metrics son obligatorios';
  END IF;

  -- Una métrica que no vino en esta corrida no borra la que ya estaba.
  INSERT INTO public.social_insights_daily AS s (
    account_id, day, reach, views, profile_views, website_clicks,
    accounts_engaged, total_interactions, likes, comments, shares, saves
  )
  VALUES (
    p_account_id, p_day,
    (p_metrics->>'reach')::int,
    (p_metrics->>'views')::int,
    (p_metrics->>'profile_views')::int,
    (p_metrics->>'website_clicks')::int,
    (p_metrics->>'accounts_engaged')::int,
    (p_metrics->>'total_interactions')::int,
    (p_metrics->>'likes')::int,
    (p_metrics->>'comments')::int,
    (p_metrics->>'shares')::int,
    (p_metrics->>'saves')::int
  )
  ON CONFLICT (account_id, day) DO UPDATE SET
    reach              = COALESCE(EXCLUDED.reach, s.reach),
    views              = COALESCE(EXCLUDED.views, s.views),
    profile_views      = COALESCE(EXCLUDED.profile_views, s.profile_views),
    website_clicks     = COALESCE(EXCLUDED.website_clicks, s.website_clicks),
    accounts_engaged   = COALESCE(EXCLUDED.accounts_engaged, s.accounts_engaged),
    total_interactions = COALESCE(EXCLUDED.total_interactions, s.total_interactions),
    likes              = COALESCE(EXCLUDED.likes, s.likes),
    comments           = COALESCE(EXCLUDED.comments, s.comments),
    shares             = COALESCE(EXCLUDED.shares, s.shares),
    saves              = COALESCE(EXCLUDED.saves, s.saves),
    updated_at         = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.service_instagram_media_upsert(
  p_account_id  uuid,
  p_captured_at date,
  p_items       jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: solo service_role';
  END IF;

  IF p_account_id IS NULL OR p_captured_at IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_account_id, p_captured_at y p_items (array) son obligatorios';
  END IF;

  INSERT INTO public.social_media_snapshots (
    account_id, media_id, captured_at, media_type, posted_at, permalink, caption,
    views, reach, likes, comments, shares, saved, total_interactions, avg_watch_ms
  )
  SELECT
    p_account_id,
    i->>'id',
    p_captured_at,
    i->>'type',
    (i->>'posted_at')::timestamptz,
    i->>'permalink',
    left(i->>'caption', 280),
    (i->>'views')::int,
    (i->>'reach')::int,
    (i->>'likes')::int,
    (i->>'comments')::int,
    (i->>'shares')::int,
    (i->>'saved')::int,
    (i->>'total_interactions')::int,
    (i->>'ig_reels_avg_watch_time')::int
  FROM jsonb_array_elements(p_items) AS i
  WHERE i->>'id' IS NOT NULL
  ON CONFLICT (account_id, media_id, captured_at) DO UPDATE SET
    media_type         = EXCLUDED.media_type,
    posted_at          = EXCLUDED.posted_at,
    permalink          = EXCLUDED.permalink,
    caption            = EXCLUDED.caption,
    views              = EXCLUDED.views,
    reach              = EXCLUDED.reach,
    likes              = EXCLUDED.likes,
    comments           = EXCLUDED.comments,
    shares             = EXCLUDED.shares,
    saved              = EXCLUDED.saved,
    total_interactions = EXCLUDED.total_interactions,
    avg_watch_ms       = EXCLUDED.avg_watch_ms;
END;
$function$;

-- ── Lectura (admin) ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dashboard_instagram_insights(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  day                date,
  reach              integer,
  views              integer,
  profile_views      integer,
  website_clicks     integer,
  accounts_engaged   integer,
  total_interactions integer,
  likes              integer,
  comments           integer,
  shares             integer,
  saves              integer
)
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

  -- Todos los días del rango; los que no tienen dato llegan en NULL, no en 0.
  RETURN QUERY
  SELECT
    d::date,
    s.reach, s.views, s.profile_views, s.website_clicks, s.accounts_engaged,
    s.total_interactions, s.likes, s.comments, s.shares, s.saves
  FROM generate_series(v_from, v_to, interval '1 day') AS d
  LEFT JOIN public.social_accounts a
    ON a.platform = 'instagram'
  LEFT JOIN public.social_insights_daily s
    ON s.account_id = a.id AND s.day = d::date
  ORDER BY d;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_instagram_posts(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  media_id           text,
  media_type         text,
  posted_at          timestamptz,
  permalink          text,
  caption            text,
  captured_at        date,
  views              integer,
  reach              integer,
  likes              integer,
  comments           integer,
  shares             integer,
  saved              integer,
  total_interactions integer,
  avg_watch_ms       integer
)
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

  -- Publicaciones hechas en el rango (hora argentina), con su último snapshot.
  RETURN QUERY
  SELECT DISTINCT ON (m.media_id)
    m.media_id, m.media_type, m.posted_at, m.permalink, m.caption, m.captured_at,
    m.views, m.reach, m.likes, m.comments, m.shares, m.saved,
    m.total_interactions, m.avg_watch_ms
  FROM public.social_media_snapshots m
  JOIN public.social_accounts a
    ON a.id = m.account_id AND a.platform = 'instagram'
  WHERE (m.posted_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN v_from AND v_to
  ORDER BY m.media_id, m.captured_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_instagram_insights_upsert(uuid, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_instagram_insights_upsert(uuid, date, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.service_instagram_media_upsert(uuid, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_instagram_media_upsert(uuid, date, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.dashboard_instagram_insights(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_instagram_insights(date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.dashboard_instagram_posts(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_instagram_posts(date, date) TO authenticated;

-- La fila del 05/10 traía las estadísticas del 03/10 en columnas del día de
-- la corrida. Los seguidores se quedan; las estadísticas pasan a la tabla
-- nueva con su día real cuando instagram-sync haga la carga inicial.
UPDATE public.social_metrics_daily m
SET reach = NULL, views = NULL, profile_views = NULL, engagements = NULL
FROM public.social_accounts a
WHERE a.id = m.account_id
  AND a.platform = 'instagram'
  AND m.source = 'api';
