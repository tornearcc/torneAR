-- ============================================================
-- admin_remove_reported_content — rama USER: quitar la foto de perfil
-- 2026-09-24
-- ------------------------------------------------------------
-- La app suma un visor de fotos (tocar un avatar o un escudo lo abre a
-- pantalla completa) con "Denunciar". Un escudo denunciado ya tenía remedio
-- (rama TEAM: se neutralizan nombre y escudo), pero una foto de perfil no: la
-- rama USER se rechazaba con NO_CONTENT_TO_REMOVE y la única medida era
-- suspender la cuenta. Suspender por una foto es desproporcionado, y dejarla
-- publicada incumple la guideline 1.2 («removing the content»).
--
-- ── Qué hace la rama USER ───────────────────────────────────────────────────
-- Pone `profiles.avatar_url = NULL`. Es el único lugar donde vive la foto:
-- `profiles_public` y `v_player_stats` son vistas y leen de ahí, y ninguna
-- tabla guarda una copia (a diferencia del escudo, que sí se copia en
-- season_standings y team_stints).
--
-- El ARCHIVO queda en el bucket `avatars`: Storage no deja borrar objetos
-- desde SQL (el trigger `storage.protect_delete` rechaza el DELETE sobre
-- storage.objects con «Use the Storage API instead», porque borrar la fila no
-- borra el archivo del backend). El path que se quitó viaja en el registro
-- de auditoría (`removed_avatar_path`) para que el dashboard lo borre con la
-- Storage API.
--
-- Si el perfil ya no tiene foto, se rechaza con NO_CONTENT_TO_REMOVE en lugar
-- de marcar la denuncia ACTIONED sin haber hecho nada: una denuncia de perfil
-- puede ser por acoso o suplantación, y ahí la medida es la suspensión.
--
-- ── Qué NO cambia ───────────────────────────────────────────────────────────
-- Firma, grants y el resto de las ramas son los de 20260915125829 (la última
-- versión), copiados tal cual. MATCH sigue rechazándose.
--
-- El dashboard no ofrece el botón para USER (REMOVABLE_ENTITY_TYPES no lo
-- incluye), así que esta migración sola no habilita ninguna acción nueva:
-- hace falta el botón "Quitar foto" del repo web.
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
  v_neutral_name       text;
  v_standings_rows     integer;
  v_stints_rows        integer;
  v_avatar_path        text;
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
      v_neutral_name := 'Equipo ' || left(replace(v_report.reported_entity_id::text, '-', ''), 8);

      UPDATE public.teams
      SET name = v_neutral_name,
          shield_url = NULL
      WHERE id = v_report.reported_entity_id;

      -- Las copias desnormalizadas (*_season_standings_snapshot). Se filtra por el id de la
      -- denuncia y no por `teams`: si el club ya se disolvió, la historia es
      -- el único lugar donde el nombre sigue publicado. Sólo se toca la caché
      -- de presentación; los hechos competitivos no se reescriben.
      UPDATE public.season_standings
      SET team_name = v_neutral_name,
          shield_url = NULL
      WHERE team_id = v_report.reported_entity_id;
      GET DIAGNOSTICS v_standings_rows = ROW_COUNT;

      UPDATE public.team_stints
      SET team_name = v_neutral_name,
          shield_url = NULL
      WHERE team_id = v_report.reported_entity_id;
      GET DIAGNOSTICS v_stints_rows = ROW_COUNT;

      v_action := 'team_name_and_shield_reset';

    WHEN 'USER' THEN
      -- FOR UPDATE: entre leer el path y borrarlo, el usuario podría subir
      -- otra foto; así se registra exactamente la que se quitó.
      SELECT avatar_url INTO v_avatar_path
      FROM public.profiles
      WHERE id = v_report.reported_entity_id
      FOR UPDATE;

      IF v_avatar_path IS NULL THEN
        RAISE EXCEPTION
          'NO_CONTENT_TO_REMOVE: el perfil denunciado no tiene foto; si la denuncia es por otra cosa, usá la suspensión de la cuenta';
      END IF;

      UPDATE public.profiles
      SET avatar_url = NULL
      WHERE id = v_report.reported_entity_id;

      v_action := 'avatar_removed';

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
  -- como error. En TEAM se suma cuántas copias históricas se corrigieron; en
  -- USER, el path de la foto quitada, que el dashboard borra del bucket.
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
    ) || CASE v_report.reported_entity_type
      WHEN 'TEAM' THEN jsonb_build_object(
        'season_standings_rows', v_standings_rows,
        'team_stints_rows', v_stints_rows
      )
      WHEN 'USER' THEN jsonb_build_object('removed_avatar_path', v_avatar_path)
      ELSE '{}'::jsonb
    END,
    v_admin_auth_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_remove_reported_content(uuid) IS
  'Elimina el contenido de una denuncia y la marca ACTIONED (App Store 1.2). El significado de «eliminar» depende del tipo — ver el comentario de la migración 20260911170000. En TEAM neutraliza también las copias históricas de season_standings y team_stints (*_season_standings_snapshot). En USER quita la foto de perfil (avatar_url = NULL; el path queda en app_logs.details.removed_avatar_path para borrar el archivo del bucket) y rechaza si no hay foto (20260924140000). Para MATCH no aplica: ahí la medida es admin_suspend_user.';
