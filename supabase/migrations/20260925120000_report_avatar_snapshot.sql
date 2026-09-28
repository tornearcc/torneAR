-- ============================================================
-- Denuncias de perfil: guardar la foto denunciada
-- 2026-09-25
-- ------------------------------------------------------------
-- Hasta 20260924140000, "Quitar foto" sacaba la foto ACTUAL del perfil
-- denunciado: la denuncia no guardaba cuál se había denunciado. Si la persona
-- la cambiaba antes de que se moderara, se sacaba la nueva (que nadie
-- denunció) y la denunciada quedaba publicada en el bucket.
--
-- ── 1. content_reports.reported_avatar_path ─────────────────────────────────
-- El `avatar_url` del perfil al momento de la denuncia. Sólo para USER.
--
-- Lo completa un trigger BEFORE INSERT, no las funciones que crean denuncias,
-- por dos motivos:
--   · Hay dos caminos: `submit_content_report` (la denuncia de la app) y
--     `block_user` (cada bloqueo crea una denuncia USER con un INSERT propio).
--     Un trigger los cubre a los dos, y a cualquiera que venga después, sin
--     tocar sus firmas: la app instalada sigue llamando exactamente igual.
--   · La tabla admite INSERT directo del cliente (content_reports_insert_own).
--     Si el valor viniera del cliente, alguien podría denunciar a X con el
--     path de la foto de Y y conseguir que un admin la borre. Por eso el
--     trigger SIEMPRE lo pisa con el valor real, venga lo que venga.
--
-- ── 2. "Quitar foto" usa la foto denunciada ─────────────────────────────────
-- La rama USER de `admin_remove_reported_content` apunta a
-- `reported_avatar_path` (o a la foto actual en denuncias anteriores a esta
-- migración, que no la tienen):
--   · Si sigue siendo la foto actual → avatar_url = NULL, como antes.
--   · Si la persona ya la cambió → NO se toca el perfil; sólo se registra el
--     path para que el dashboard borre ese archivo viejo.
-- El registro en app_logs suma `removed_from_profile` (true/false) para que el
-- dashboard le diga al admin cuál de los dos casos fue.
--
-- Defensa extra: un path del bucket tiene que estar en la carpeta del
-- denunciado (`<auth_user_id>/...`). Si no, INVALID_AVATAR_PATH: nunca se
-- manda a borrar un archivo de otra persona.
--
-- Todo lo demás de la función queda igual a 20260924140000 (retry con
-- AVATAR_ALREADY_REMOVED, USER queda PENDING, resto de las ramas).
-- ============================================================

-- ─── 1. Columna ─────────────────────────────────────────────────────────────
ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS reported_avatar_path text;

COMMENT ON COLUMN public.content_reports.reported_avatar_path IS
  'Sólo USER: profiles.avatar_url del denunciado al momento de la denuncia (path del bucket avatars o URL). Lo escribe siempre el trigger content_reports_capture_avatar; un valor enviado por el cliente se descarta. Lo usa "Quitar foto" para borrar la foto denunciada aunque la persona ya la haya cambiado (20260925120000).';

-- ─── 2. Trigger que la captura ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.content_reports_capture_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.reported_entity_type = 'USER' THEN
    SELECT p.avatar_url INTO NEW.reported_avatar_path
    FROM public.profiles p
    WHERE p.id = NEW.reported_entity_id;
  ELSE
    NEW.reported_avatar_path := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.content_reports_capture_avatar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS content_reports_capture_avatar ON public.content_reports;
CREATE TRIGGER content_reports_capture_avatar
  BEFORE INSERT ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.content_reports_capture_avatar();

-- ─── 3. "Quitar foto" apunta a la foto denunciada ───────────────────────────
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
  v_current_avatar     text;
  v_owner_auth_id      uuid;
  v_removed_from_profile boolean;
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
      -- Reintento: la foto de esta denuncia ya se quitó y falta (o falló) el
      -- borrado del archivo. No se toca el perfil: la foto actual puede ser
      -- una nueva que nadie denunció.
      IF EXISTS (
        SELECT 1 FROM public.app_logs
        WHERE message = 'admin.remove_reported_content'
          AND details->>'report_id' = p_report_id::text
          AND details->>'action' = 'avatar_removed'
      ) THEN
        RAISE EXCEPTION
          'AVATAR_ALREADY_REMOVED: la foto de esta denuncia ya se quitó del perfil; falta borrar el archivo';
      END IF;

      -- FOR UPDATE: entre comparar y actualizar, la persona podría subir otra
      -- foto; así la decisión de tocar o no el perfil es sobre la foto real.
      SELECT avatar_url, auth_user_id INTO v_current_avatar, v_owner_auth_id
      FROM public.profiles
      WHERE id = v_report.reported_entity_id
      FOR UPDATE;

      -- La foto denunciada; en denuncias anteriores a 20260925120000 no se
      -- guardaba y se cae a la actual (el comportamiento de antes).
      v_avatar_path := coalesce(v_report.reported_avatar_path, v_current_avatar);

      IF v_avatar_path IS NULL THEN
        RAISE EXCEPTION
          'NO_CONTENT_TO_REMOVE: el perfil denunciado no tiene foto; si la denuncia es por otra cosa, usá la suspensión de la cuenta';
      END IF;

      -- Un path del bucket tiene que estar en la carpeta del denunciado. Las
      -- URLs (registros viejos o externas) las resuelve el dashboard.
      IF v_avatar_path !~* '^https?://'
         AND split_part(v_avatar_path, '/', 1) IS DISTINCT FROM v_owner_auth_id::text THEN
        RAISE EXCEPTION
          'INVALID_AVATAR_PATH: la foto denunciada no está en la carpeta del perfil denunciado';
      END IF;

      v_removed_from_profile := v_current_avatar IS NOT DISTINCT FROM v_avatar_path;
      IF v_removed_from_profile THEN
        UPDATE public.profiles
        SET avatar_url = NULL
        WHERE id = v_report.reported_entity_id;
      END IF;

      v_action := 'avatar_removed';

    ELSE
      RAISE EXCEPTION
        'NO_CONTENT_TO_REMOVE: una denuncia de tipo % no tiene contenido que eliminar; usá la suspensión de la cuenta',
        v_report.reported_entity_type;
  END CASE;

  -- USER queda PENDING: la marca el dashboard después de borrar el archivo
  -- (ver 20260924140000). Las demás ramas ya terminaron todo acá.
  IF v_report.reported_entity_type <> 'USER' THEN
    UPDATE public.content_reports
    SET status = 'ACTIONED'
    WHERE id = p_report_id;
  END IF;

  -- Auditoría, con el mismo formato que `admin.suspend_user`: quién actuó, qué
  -- hizo y sobre qué. `warn` para que salte en /dashboard/health sin contar
  -- como error. En TEAM se suma cuántas copias históricas se corrigieron; en
  -- USER, el path de la foto a borrar y si además se sacó del perfil.
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
      WHEN 'USER' THEN jsonb_build_object(
        'removed_avatar_path', v_avatar_path,
        'removed_from_profile', v_removed_from_profile
      )
      ELSE '{}'::jsonb
    END,
    v_admin_auth_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_remove_reported_content(uuid) IS
  'Elimina el contenido de una denuncia y la marca ACTIONED (App Store 1.2). El significado de «eliminar» depende del tipo — ver el comentario de la migración 20260911170000. En TEAM neutraliza también las copias históricas de season_standings y team_stints (*_season_standings_snapshot). En USER apunta a la foto DENUNCIADA (content_reports.reported_avatar_path, o la actual en denuncias viejas): si sigue siendo la actual la saca del perfil, y si la persona ya la cambió no toca el perfil; en los dos casos registra el path en app_logs (removed_avatar_path, removed_from_profile) y deja la denuncia PENDING hasta que el dashboard borra el archivo. Rechaza con NO_CONTENT_TO_REMOVE si no hay foto, con AVATAR_ALREADY_REMOVED en el reintento y con INVALID_AVATAR_PATH si el path no es de la carpeta del denunciado (20260924140000, 20260925120000). Para MATCH no aplica: ahí la medida es admin_suspend_user.';
