-- ============================================================
-- Archivos de avatars: borrar la foto anterior y todas al dar de baja
-- 2026-09-25
-- ------------------------------------------------------------
-- Dos agujeros en el bucket `avatars`, los dos por el mismo motivo: Storage
-- no deja borrar objetos desde SQL (el trigger `storage.protect_delete`
-- rechaza el DELETE sobre storage.objects: "Use the Storage API instead").
--
--   1. Fotos viejas. Cada subida crea un archivo nuevo (`avatar-<timestamp>`)
--      y el anterior quedaba público por URL para siempre: los usuarios no
--      tienen policy de DELETE y nadie lo borraba.
--   2. Baja de cuenta. `delete_own_account` intentaba un DELETE directo sobre
--      storage.objects dentro de un EXCEPTION WHEN OTHERS: el trigger lo
--      rechazaba, quedaba un WARNING y no se borraba nada. La Política de
--      Privacidad (§8) dice que el avatar se borra de los servidores. Al
--      25/09/2026 la única cuenta dada de baja en producción conserva su
--      archivo.
--
-- ── Cómo se borra ───────────────────────────────────────────────────────────
-- Por la Storage API desde Postgres, con pg_net y el secreto
-- `storage_service_role_key` de Vault: el mismo mecanismo que ya usa
-- `sweep_orphan_wo_evidences` (20260915211044). pg_net encola la request y la
-- manda después del COMMIT, así que:
--   · nunca rompe la transacción que la pide (si algo falla al encolarla, se
--     registra un warn y se sigue);
--   · si la transacción se revierte, la request tampoco sale.
-- Si falta el secreto, no se borra nada y queda un warn en app_logs.
--
-- ── Por qué en el servidor y no en la app ───────────────────────────────────
--   · Cubre la app instalada (1.0.0 y 1.1.0), que sigue subiendo fotos igual:
--     un cambio en el cliente sólo llegaría con el OTA.
--   · Tiene que saltear las fotos que son evidencia de una denuncia abierta
--     (content_reports.reported_avatar_path, 20260925120000), y el usuario no
--     puede ver las denuncias sobre él. Hacerlo en el cliente habría
--     requerido darle DELETE sobre el bucket y un "oráculo" que le revelara
--     si su foto está denunciada.
--
-- ── Qué se borra ────────────────────────────────────────────────────────────
--   · Trigger `profiles_cleanup_previous_avatar`: cuando cambia avatar_url, la
--     foto ANTERIOR, si es un archivo de nuestro bucket, está en la carpeta de
--     esa persona y no es evidencia de una denuncia USER PENDING. Esas quedan
--     hasta que se resuelva la denuncia ("Quitar foto" las borra; si se
--     desestima, quedan huérfanas y las levanta el listado de huérfanos).
--   · `delete_own_account`: TODOS los archivos de la carpeta de la persona,
--     también los que son evidencia: la baja manda (Privacidad §8).
--
-- La URL del proyecto va fija en `storage_avatars_object_url()`, como en el
-- barrido de evidencias: un solo lugar para cambiarla.
-- ============================================================

-- ─── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.storage_avatars_object_url()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'https://yusfykqimalghmmhlfdn.supabase.co/storage/v1/object/avatars/'::text;
$$;

COMMENT ON FUNCTION public.storage_avatars_object_url() IS
  'Endpoint de la Storage API para objetos del bucket avatars (DELETE <url><path>). Fijo, como en sweep_orphan_wo_evidences.';

-- Path del objeto a partir de lo que guarda profiles.avatar_url: normalmente
-- ya es el path; los registros viejos tienen la URL pública completa y los
-- seeds URLs externas (NULL: no hay archivo nuestro que borrar).
CREATE OR REPLACE FUNCTION public.avatar_object_path(p_stored text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_stored IS NULL OR btrim(p_stored) = '' THEN NULL
    WHEN p_stored !~* '^https?://' THEN ltrim(p_stored, '/')
    WHEN position('/storage/v1/object/public/avatars/' IN p_stored) > 0 THEN
      nullif(split_part(split_part(p_stored, '/storage/v1/object/public/avatars/', 2), '?', 1), '')
    ELSE NULL
  END;
$$;

-- La foto es evidencia de una denuncia USER abierta.
CREATE OR REPLACE FUNCTION public.avatar_file_in_open_report(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.content_reports r
    WHERE r.reported_entity_type = 'USER'
      AND r.status = 'PENDING'
      AND public.avatar_object_path(r.reported_avatar_path) = p_path
  );
$$;

-- Encola el borrado de objetos del bucket avatars. Nunca levanta: el que la
-- llama (un cambio de foto, una baja) tiene que terminar igual.
CREATE OR REPLACE FUNCTION public.request_avatar_file_deletion(p_paths text[], p_context jsonb DEFAULT '{}'::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_key   text;
  v_path  text;
  v_count integer := 0;
  v_paths text[];
BEGIN
  SELECT array_agg(DISTINCT p) INTO v_paths
  FROM unnest(coalesce(p_paths, '{}'::text[])) AS p
  WHERE p IS NOT NULL AND btrim(p) <> '';

  IF v_paths IS NULL THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'storage_service_role_key';

  IF v_key IS NULL THEN
    INSERT INTO public.app_logs (level, message, details)
    VALUES ('warn', 'avatar.file_deletion_skipped',
            p_context || jsonb_build_object('reason', 'falta el secreto storage_service_role_key en Vault', 'paths', to_jsonb(v_paths)));
    RETURN 0;
  END IF;

  FOREACH v_path IN ARRAY v_paths LOOP
    PERFORM net.http_delete(
      url     := public.storage_avatars_object_url() || v_path,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key)
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.app_logs (level, message, details)
  VALUES ('info', 'avatar.file_deletion_requested', p_context || jsonb_build_object('paths', to_jsonb(v_paths)));

  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  -- Ni siquiera el log puede cortar al que llama: si el INSERT también
  -- fallara, queda el WARNING en el log de Postgres.
  BEGIN
    INSERT INTO public.app_logs (level, message, details)
    VALUES ('warn', 'avatar.file_deletion_failed', p_context || jsonb_build_object('error', SQLERRM, 'paths', to_jsonb(v_paths)));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_avatar_file_deletion: %', SQLERRM;
  END;
  RETURN 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.storage_avatars_object_url() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.avatar_file_in_open_report(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_avatar_file_deletion(text[], jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.request_avatar_file_deletion(text[], jsonb) IS
  'Encola por pg_net el DELETE de objetos del bucket avatars (Storage API, secreto storage_service_role_key de Vault). Nunca levanta: sin secreto o ante un error deja un warn en app_logs y devuelve 0. La request sale después del COMMIT (20260925130000).';

-- ─── 1. Foto anterior al cambiar la foto ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_cleanup_previous_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old text := public.avatar_object_path(OLD.avatar_url);
BEGIN
  IF v_old IS NULL
     OR v_old IS NOT DISTINCT FROM public.avatar_object_path(NEW.avatar_url)
     -- Sólo archivos de la carpeta de esta persona: un avatar_url que apunte a
     -- otra carpeta (datos viejos, seeds) no es suyo para borrar.
     OR split_part(v_old, '/', 1) IS DISTINCT FROM NEW.auth_user_id::text
     OR public.avatar_file_in_open_report(v_old)
  THEN
    RETURN NULL;
  END IF;

  PERFORM public.request_avatar_file_deletion(
    ARRAY[v_old],
    jsonb_build_object('scope', 'profiles_cleanup_previous_avatar', 'profile_id', NEW.id)
  );
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_cleanup_previous_avatar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_cleanup_previous_avatar ON public.profiles;
CREATE TRIGGER profiles_cleanup_previous_avatar
  AFTER UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW
  WHEN (OLD.avatar_url IS DISTINCT FROM NEW.avatar_url)
  EXECUTE FUNCTION public.profiles_cleanup_previous_avatar();

-- ─── 2. Baja de cuenta: todos los archivos de la persona ────────────────────
-- Cuerpo de 20260911120000 (la última versión) con un solo cambio: el DELETE
-- directo sobre storage.objects, que el trigger protect_delete rechazaba, se
-- reemplaza por request_avatar_file_deletion sobre toda la carpeta.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id   uuid;
  v_placeholder  text;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no hay sesión activa';
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_auth_user_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  v_placeholder := 'usuario_eliminado_' || replace(v_profile_id::text, '-', '');

  UPDATE public.profiles SET
    username        = v_placeholder,
    full_name       = 'Usuario eliminado',
    avatar_url      = NULL,
    zone            = NULL,
    date_of_birth   = NULL,
    gender          = NULL,
    favorite_team   = NULL,
    strong_foot     = NULL,
    expo_push_token = NULL,
    is_admin        = false,
    updated_at      = now()
  WHERE id = v_profile_id;

  -- Todos los archivos de la persona en avatars, también las fotos viejas y
  -- las que son evidencia de una denuncia: la baja manda (Privacidad §8). Se
  -- listan acá, dentro de la transacción, y se borran por la Storage API
  -- después del COMMIT. request_avatar_file_deletion nunca levanta.
  PERFORM public.request_avatar_file_deletion(
    ARRAY(
      SELECT o.name FROM storage.objects o
      WHERE o.bucket_id = 'avatars'
        AND (storage.foldername(o.name))[1] = v_auth_user_id::text
    ),
    jsonb_build_object('scope', 'delete_own_account', 'profile_id', v_profile_id)
  );

  -- Credencial de Apple. Va DESPUÉS del punto de no retorno del perfil y
  -- antes del baneo, y no es best-effort: si quedara la fila, tendríamos
  -- guardado un refresh token de una cuenta que el usuario dio de baja.
  DELETE FROM public.apple_credentials WHERE auth_user_id = v_auth_user_id;

  UPDATE auth.users SET
    banned_until       = '2999-12-31 23:59:59+00'::timestamptz,
    email              = 'eliminado+' || v_profile_id::text || '@deleted.tornear.app',
    raw_user_meta_data = '{}'::jsonb
  WHERE id = v_auth_user_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

COMMENT ON FUNCTION public.delete_own_account() IS
  'Autoservicio de baja de cuenta (Apple 5.1.1). Anonimiza profiles, borra la credencial de Apple y banea auth.users — NO hace DELETE físico del perfil: el historial deportivo compartido con rivales lo impide. Pide el borrado de TODOS los archivos de la persona en avatars por la Storage API (request_avatar_file_deletion, 20260925130000). La revocación del token contra Apple la hace la edge function apple-auth antes de llamar a esta RPC.';
