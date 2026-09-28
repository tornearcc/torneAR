-- ============================================================
-- Push: timeout de 30 s y reintento automático — 2026-09-27
-- ------------------------------------------------------------
-- Qué pasó: el aviso general del 25/09 insertó 61 notificaciones en el mismo
-- instante. Cada INSERT dispara `dispatch_push_notification`, que llama a la
-- edge function `push-dispatch` por pg_net SIN `timeout_milliseconds`: el
-- default de pg_net es 5000 ms. Con 61 pedidos simultáneos varios pasaron los
-- 5 s, pg_net los cortó y esas notificaciones quedaron con `pushed_at` NULL.
-- Hubo que reintentar 3 a mano; una quedó sin procesar.
--
-- Qué cambia:
--   1. `send_push_dispatch(record)`: un solo lugar arma el pedido a
--      push-dispatch, ahora con timeout de 30 s. Lo usan el trigger y el
--      reintento.
--   2. `dispatch_push_notification()` (trigger AFTER INSERT) usa el helper y
--      no llama a la edge function si la fila ya viene con `pushed_at`.
--   3. `retry_pending_pushes()` + cron cada 5 minutos: vuelve a mandar las
--      notificaciones de las últimas 2 horas que siguen con `pushed_at` NULL
--      y tienen al menos 2 minutos. Los 2 minutos dejan terminar al pedido
--      original (30 s de timeout) antes de reintentar.
--
-- Por qué el reintento no duplica pushes: push-dispatch sella `pushed_at`
-- ANTES de hablar con Expo y saltea las filas que ya lo tienen. Una fila con
-- `pushed_at` NULL es una que la edge function nunca llegó a procesar.
--
-- Se saca además el atajo de MENSAJE_NUEVO que tenía el trigger original: ya
-- no existía en producción (la versión vigente del trigger no lo tiene desde
-- g1_b3_market_to_sql_trigger).
--
-- Idempotente: CREATE OR REPLACE y cron.schedule por nombre.
-- ============================================================

-- ─── 1. Helper: el pedido a push-dispatch ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_push_dispatch(p_record jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'push_dispatch_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret';

  -- Config incompleta (base local, CI): el push es best-effort, nunca rompe
  -- el INSERT que lo disparó.
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url                  := v_url,
    body                 := jsonb_build_object('record', p_record),
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'x-push-secret', v_secret
                            ),
    timeout_milliseconds := 30000
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_push_dispatch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_push_dispatch(jsonb) FROM anon, authenticated;

-- ─── 2. Trigger de dispatch ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ya empujada (la app 1.1.0 manda algunos pushes directo, ver
  -- 20260927121000): no gastar un pedido que push-dispatch va a saltear.
  IF NEW.pushed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.send_push_dispatch(to_jsonb(NEW));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_push_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_push_notification() FROM anon, authenticated;

-- ─── 3. Reintento de las pendientes ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retry_pending_pushes(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   notifications%ROWTYPE;
  v_sent  integer := 0;
  v_ids   uuid[]  := '{}';
BEGIN
  FOR v_row IN
    SELECT *
      FROM notifications
     WHERE pushed_at IS NULL
       AND created_at <  now() - interval '2 minutes'
       AND created_at >= now() - interval '2 hours'
     ORDER BY created_at
     LIMIT greatest(coalesce(p_limit, 50), 0)
  LOOP
    IF public.send_push_dispatch(to_jsonb(v_row)) IS NOT NULL THEN
      v_sent := v_sent + 1;
      v_ids  := v_ids || v_row.id;
    END IF;
  END LOOP;

  -- Sólo deja rastro cuando reintentó algo: una corrida vacía cada 5 minutos
  -- llenaría app_logs de ruido.
  IF v_sent > 0 THEN
    INSERT INTO app_logs (level, message, details)
    VALUES ('warn', 'push-dispatch: reintento de notificaciones sin procesar',
            jsonb_build_object('scope', 'retry_pending_pushes',
                               'count', v_sent,
                               'notificationIds', to_jsonb(v_ids)));
  END IF;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_pending_pushes(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_pending_pushes(integer) FROM anon, authenticated;

-- ─── 4. Job ──────────────────────────────────────────────────────────────────
-- Cada 5 minutos. Una fila perdida sale, como mucho, ~7 minutos tarde.
SELECT cron.schedule(
  'retry-pending-pushes', '*/5 * * * *',
  $$select public.retry_pending_pushes();$$
);
