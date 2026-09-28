-- ============================================================
-- dashboard_share_summary() — Compartidos en /dashboard/viral
-- 2026-09-14
-- ------------------------------------------------------------
-- La app registra cada intento de compartir en `app_logs`
-- (lib/share-analytics.ts), con `message` = 'share.instagram' | 'share.generic'
-- y en `details`:
--   · content_type  — 'match' | 'team_invite' | 'referral'
--   · activity_type — destino real que informa iOS en Share.share
--                     (p. ej. 'net.whatsapp.WhatsApp.ShareExtension').
--                     Ausente en Android, al cancelar la hoja y en la tarjeta
--                     de partido.
--
-- Esta RPC los agrega por tipo y destino para las ventanas de 7 y 28 días.
--
-- ── Filas anteriores al OTA ─────────────────────────────────────────────────
-- La 1.0.0 ya registraba la tarjeta de partido, pero SIN `content_type`. Esas
-- filas se reconocen por traer `matchId` y cuentan como 'match'. Cualquier otra
-- fila sin `content_type` sale como 'desconocido' en vez de desaparecer: un
-- literal nuevo en la app que no se sumó acá tiene que verse en el panel.
--
-- ── Destino cuando no hay activity_type ─────────────────────────────────────
--   · 'instagram_stories' — message 'share.instagram' (siempre es la tarjeta).
--   · 'menu_sistema'      — tarjeta de partido por el menú genérico: ahí la
--                           plataforma nunca informa el destino.
--   · 'sin_destino'       — Share.share sin activity_type: Android, o iOS con
--                           la hoja cancelada. No se puede separar uno de otro
--                           sin gastar otra fila del presupuesto del Logger.
--
-- Nombres de columnas internas con prefijo `ev_`: las columnas de RETURNS
-- TABLE son variables dentro de plpgsql, y un CTE con `content_type` a secas
-- daría "column reference is ambiguous".
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_share_summary()
RETURNS TABLE (
  window_days  int,
  content_type text,
  destination  text,
  share_count  bigint,
  sharer_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  RETURN QUERY
  WITH events AS (
    SELECT
      l.created_at AS ev_at,
      l.user_id    AS ev_user,
      COALESCE(
        l.details->>'content_type',
        CASE WHEN l.details ? 'matchId' THEN 'match' END,
        'desconocido'
      ) AS ev_type,
      l.message AS ev_message,
      NULLIF(btrim(l.details->>'activity_type'), '') AS ev_activity
    FROM public.app_logs l
    WHERE l.message IN ('share.instagram', 'share.generic')
      AND l.created_at >= now() - interval '28 days'
  )
  SELECT
    w.days,
    e.ev_type,
    COALESCE(
      e.ev_activity,
      CASE
        WHEN e.ev_message = 'share.instagram' THEN 'instagram_stories'
        WHEN e.ev_type = 'match' THEN 'menu_sistema'
        ELSE 'sin_destino'
      END
    ) AS ev_destination,
    COUNT(*)::bigint,
    -- Personas distintas por `user_id` de auth. Un compartido sin sesión
    -- (user_id NULL) cuenta en `share_count` pero no suma personas.
    COUNT(DISTINCT e.ev_user)::bigint
  FROM (VALUES (7), (28)) AS w(days)
  JOIN events e ON e.ev_at >= now() - make_interval(days => w.days)
  GROUP BY w.days, e.ev_type, ev_destination
  ORDER BY w.days, COUNT(*) DESC, e.ev_type, ev_destination;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_share_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_share_summary() TO authenticated;

COMMENT ON FUNCTION public.dashboard_share_summary() IS
  'Compartidos para /dashboard/viral (is_admin): conteo por content_type y destino en ventanas de 7 y 28 días, sobre app_logs share.*. Ver lib/share-analytics.ts de la app.';
