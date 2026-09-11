-- ============================================================
-- admin_remove_reported_content — cerrar el circuito de las 24 horas
-- 2026-09-11
-- ------------------------------------------------------------
-- Guideline 1.2: «the developer must act on objectionable content reports
-- within 24 hours by removing the content and ejecting the user who provided
-- the offending content». La segunda mitad ya existía —`admin_suspend_user`
-- (20260818190000)— pero la primera no: desde el dashboard se podía suspender
-- a la persona y marcar la denuncia como revisada, y el contenido denunciado
-- quedaba publicado.
--
-- ── Qué significa «eliminar» en cada caso ───────────────────────────────────
-- No es lo mismo para todos los tipos, y borrar todo por igual rompería cosas:
--
--   MESSAGE             DELETE de la fila. Un mensaje no tiene nada colgando y
--                       dejarlo en blanco sería peor: la burbuja vacía queda en
--                       la conversación como un recordatorio de lo que decía.
--   MARKET_*_POST       `is_active = false`, el mismo mecanismo que usa el
--                       propio autor al dar de baja su publicación. Un DELETE
--                       arrastraría las postulaciones asociadas.
--   TEAM                Se neutraliza el NOMBRE y el ESCUDO, que es lo
--                       denunciable, y el equipo sigue existiendo. Un equipo
--                       tiene historial deportivo compartido con sus rivales
--                       —el mismo motivo por el que `delete_own_account` no
--                       borra el perfil— así que desactivarlo entero castigaría
--                       a terceros por el nombre que eligió un capitán.
--   USER / MATCH        No hay «contenido» que sacar. Se rechaza con un
--                       mensaje que apunta a `admin_suspend_user`, en vez de
--                       fingir que hizo algo.
--
-- ── Por qué marca ACTIONED y no REVIEWED ────────────────────────────────────
-- El enum ya tenía ACTIONED declarado desde 20260818140000 y nunca se había
-- usado. Es exactamente esto: la diferencia entre «un humano lo miró» y «se
-- tomó una medida», que es la que hay que poder demostrar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_remove_reported_content(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_auth_user_id uuid := auth.uid();
  v_report             public.content_reports%ROWTYPE;
  v_action             text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = v_admin_auth_user_id AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  SELECT * INTO v_report FROM public.content_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND: denuncia % no encontrada', p_report_id;
  END IF;

  CASE v_report.reported_entity_type
    WHEN 'MESSAGE' THEN
      DELETE FROM public.messages WHERE id = v_report.reported_entity_id;
      v_action := 'message_deleted';

    WHEN 'MARKET_TEAM_POST' THEN
      UPDATE public.market_team_posts SET is_active = false
      WHERE id = v_report.reported_entity_id;
      v_action := 'team_post_deactivated';

    WHEN 'MARKET_PLAYER_POST' THEN
      UPDATE public.market_player_posts SET is_active = false
      WHERE id = v_report.reported_entity_id;
      v_action := 'player_post_deactivated';

    WHEN 'TEAM' THEN
      -- El nombre nuevo lleva los primeros 8 caracteres del id para que dos
      -- equipos neutralizados no queden indistinguibles en el ranking.
      UPDATE public.teams
      SET name = 'Equipo ' || left(replace(id::text, '-', ''), 8),
          shield_url = NULL
      WHERE id = v_report.reported_entity_id;
      v_action := 'team_name_and_shield_reset';

    ELSE
      RAISE EXCEPTION
        'NO_CONTENT_TO_REMOVE: una denuncia de tipo % no tiene contenido que eliminar; usá la suspensión de la cuenta',
        v_report.reported_entity_type;
  END CASE;

  UPDATE public.content_reports
  SET status = 'ACTIONED'
  WHERE id = p_report_id;

  -- Auditoría, con el mismo formato que `admin.suspend_user`: quién actuó, qué
  -- hizo y sobre qué. `warn` para que salte en /dashboard/health sin contar
  -- como error.
  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'warn',
    'admin.remove_reported_content',
    jsonb_build_object(
      'report_id', p_report_id,
      'entity_type', v_report.reported_entity_type,
      'entity_id', v_report.reported_entity_id,
      'reported_profile_id', v_report.reported_profile_id,
      'action', v_action
    ),
    v_admin_auth_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_remove_reported_content(uuid) IS
  'Elimina el contenido de una denuncia y la marca ACTIONED (App Store 1.2). El significado de «eliminar» depende del tipo — ver el comentario de la migración 20260911170000. Para USER y MATCH no aplica: ahí la medida es admin_suspend_user.';
