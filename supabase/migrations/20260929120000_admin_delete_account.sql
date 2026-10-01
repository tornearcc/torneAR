-- ============================================================
-- Eliminar una cuenta desde el dashboard (P1-9)
-- 2026-09-29 · Registro P1-9 · Tanda 4
-- ------------------------------------------------------------
-- La app es sólo para mayores de 18 (D-32, declarado a Apple). Si aparece un
-- menor, hasta ahora un admin sólo podía suspenderlo (admin_suspend_user,
-- D-41): la suspensión bloquea el login pero deja el perfil con sus datos.
--
-- `admin_delete_account(perfil, motivo)` hace lo mismo que la baja voluntaria
-- sobre la cuenta de otra persona: anonimiza el perfil, encola el borrado de
-- sus archivos de avatars, borra la credencial de Apple y banea auth.users.
-- Exige is_admin y motivo, y deja `admin.delete_account` en app_logs.
--
-- ── Una sola implementación ─────────────────────────────────────────────────
-- El cuerpo de delete_own_account pasa a `anonymize_account`, interna, y las
-- dos RPC la llaman. Si mañana se suma un dato personal a `profiles`, se
-- limpia en un solo lugar y las dos bajas siguen dando el mismo resultado.
-- delete_own_account conserva su firma, sus errores y su comportamiento.
--
-- ── Qué no hace ─────────────────────────────────────────────────────────────
--   · Revocar el token de Apple contra Apple: eso necesita el .p8 y lo hace la
--     edge function apple-auth (action 'revoke' con `targetProfileId`), que el
--     dashboard llama ANTES de esta RPC. Acá sólo se borra la fila, igual que
--     en la baja voluntaria.
--   · Sacar a la persona de sus equipos: la baja voluntaria tampoco lo hace
--     (el historial deportivo es compartido con los rivales).
--   · Borrar la cuenta de otro admin: primero hay que quitarle el rol.
-- ============================================================


-- ── 1. Anonimización compartida ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anonymize_account(
  p_auth_user_id uuid,
  p_profile_id   uuid,
  p_scope        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_placeholder text := 'usuario_eliminado_' || replace(p_profile_id::text, '-', '');
BEGIN
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
  WHERE id = p_profile_id;

  -- Todos los archivos de la persona en avatars, también las fotos viejas y
  -- las que son evidencia de una denuncia: la baja manda (Privacidad §8). Se
  -- listan acá, dentro de la transacción, y se borran por la Storage API
  -- después del COMMIT. request_avatar_file_deletion nunca levanta.
  PERFORM public.request_avatar_file_deletion(
    ARRAY(
      SELECT o.name FROM storage.objects o
      WHERE o.bucket_id = 'avatars'
        AND (storage.foldername(o.name))[1] = p_auth_user_id::text
    ),
    jsonb_build_object('scope', p_scope, 'profile_id', p_profile_id)
  );

  -- Credencial de Apple. Va DESPUÉS del punto de no retorno del perfil y
  -- antes del baneo, y no es best-effort: si quedara la fila, tendríamos
  -- guardado un refresh token de una cuenta dada de baja.
  DELETE FROM public.apple_credentials WHERE auth_user_id = p_auth_user_id;

  UPDATE auth.users SET
    banned_until       = '2999-12-31 23:59:59+00'::timestamptz,
    email              = 'eliminado+' || p_profile_id::text || '@deleted.tornear.app',
    raw_user_meta_data = '{}'::jsonb
  WHERE id = p_auth_user_id;
END;
$function$;

COMMENT ON FUNCTION public.anonymize_account(uuid, uuid, text) IS
  'Interna. Anonimiza el perfil, encola el borrado de sus archivos de avatars, borra la credencial de Apple y banea auth.users. La llaman delete_own_account y admin_delete_account (20260929120000).';


-- ── 2. Baja voluntaria (mismo comportamiento) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id   uuid;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no hay sesión activa';
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = v_auth_user_id;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  PERFORM public.anonymize_account(v_auth_user_id, v_profile_id, 'delete_own_account');
END;
$function$;


-- ── 3. Baja por un admin ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_account(
  p_profile_id uuid,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_auth_user_id  uuid := auth.uid();
  v_target_auth_user_id uuid;
  v_target_username     text;
  v_target_is_admin     boolean;
  v_reason              text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = v_admin_auth_user_id AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: indicá el motivo de la baja';
  END IF;

  SELECT auth_user_id, username, is_admin
    INTO v_target_auth_user_id, v_target_username, v_target_is_admin
  FROM public.profiles
  WHERE id = p_profile_id;

  IF v_target_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil % no encontrado', p_profile_id;
  END IF;

  IF v_target_auth_user_id = v_admin_auth_user_id THEN
    RAISE EXCEPTION 'CANNOT_DELETE_SELF: para dar de baja tu propia cuenta usá la app';
  END IF;

  IF v_target_is_admin THEN
    RAISE EXCEPTION 'TARGET_IS_ADMIN: primero quitale el rol de administrador';
  END IF;

  IF v_target_username = 'usuario_eliminado_' || replace(p_profile_id::text, '-', '') THEN
    RAISE EXCEPTION 'ALREADY_DELETED: la cuenta ya estaba dada de baja';
  END IF;

  PERFORM public.anonymize_account(v_target_auth_user_id, p_profile_id, 'admin_delete_account');

  -- Sin el username: la baja existe para que no quede ese dato. El perfil
  -- sigue identificado por su id.
  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'warn',
    'admin.delete_account',
    jsonb_build_object('deleted_profile_id', p_profile_id, 'reason', v_reason),
    v_admin_auth_user_id
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_delete_account(uuid, text) IS
  'P1-9. Baja de la cuenta de otra persona (p. ej. un menor, D-32): mismo resultado que delete_own_account. Exige is_admin y motivo; rechaza la propia cuenta, la de un admin y una cuenta ya dada de baja. Deja admin.delete_account en app_logs (20260929120000).';


-- ── 4. Permisos ─────────────────────────────────────────────────────────────
-- Supabase da EXECUTE a anon y authenticated sobre toda función nueva de
-- `public`: la interna se cierra a mano. La de admin queda para authenticated
-- (chequea is_admin adentro, como las demás admin_*).
REVOKE ALL ON FUNCTION public.anonymize_account(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid, text) TO authenticated;
