-- ============================================================
-- Push de gestión de equipo: la app nueva deja el envío al servidor — 2026-09-28
-- ------------------------------------------------------------
-- Contexto (20260927121000): la app 1.1.0 manda por su cuenta a Expo el push
-- de SOLICITUD_UNION_ACEPTADA, ROL_ACTUALIZADO y EXPULSADO_EQUIPO, y además
-- inserta la notificación, que dispara push-dispatch. Para no duplicar, el
-- trigger `mark_client_pushed_notification` sella `pushed_at` de esos tipos
-- cuando los inserta un usuario, y push-dispatch los saltea.
--
-- La versión siguiente de la app deja de mandar esos pushes (todo push sale
-- por push-dispatch, D-27) y marca sus notificaciones con
-- `data.server_push = true`. Con el trigger como estaba, esas notificaciones
-- quedarían selladas y SIN push. Con el trigger borrado, las apps que todavía
-- no se actualizaron recibirían DOS.
--
-- Qué cambia: el trigger no sella las filas que traen la marca. Las dos
-- versiones de la app conviven sin push duplicado ni perdido. El trigger se
-- borra cuando no queden apps viejas (mínima de iOS y Android por encima de
-- la versión que sale con este cambio).
--
-- ⚠️ Orden: esta migración va ANTES del OTA/build que manda la marca. Al
-- revés, las notificaciones marcadas se sellarían y no saldrían.
--
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_client_pushed_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER a propósito: current_user es el rol de quien inserta.
  -- Las RPC SECURITY DEFINER y los crons insertan como postgres y no entran.
  -- Las apps nuevas marcan `data.server_push`: su push lo manda push-dispatch.
  IF current_user = 'authenticated'
     AND NEW.type IN ('SOLICITUD_UNION_ACEPTADA', 'ROL_ACTUALIZADO', 'EXPULSADO_EQUIPO')
     AND coalesce(NEW.data->>'server_push', 'false') <> 'true' THEN
    NEW.pushed_at := coalesce(NEW.pushed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_client_pushed_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_client_pushed_notification() FROM anon, authenticated;
