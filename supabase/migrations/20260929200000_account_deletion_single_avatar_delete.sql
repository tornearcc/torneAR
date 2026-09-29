-- ============================================================
-- Baja de cuenta: cada archivo de avatars se pide borrar una sola vez
-- 2026-09-29 · Tarjeta «Prolijidad técnica menor»
-- ------------------------------------------------------------
-- La baja (anonymize_account) pone avatar_url en NULL, eso dispara el trigger
-- profiles_cleanup_previous_avatar (pide borrar la foto anterior) y después
-- la baja pide borrar TODA la carpeta de la persona, incluida esa foto. El
-- segundo pedido volvía con 400 (el archivo ya no estaba): sin efecto, pero
-- ensuciaba los registros.
--
-- Ahora la baja marca la transacción (tornear.account_deletion = on, local a
-- la transacción) mientras anonimiza el perfil, y el trigger no hace nada con
-- esa marca: la carpeta entera ya se pide más abajo. Fuera de una baja, el
-- trigger sigue igual (tests 470).
-- ============================================================

CREATE OR REPLACE FUNCTION public.profiles_cleanup_previous_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old text := public.avatar_object_path(OLD.avatar_url);
BEGIN
  -- Durante una baja la carpeta entera se borra aparte (anonymize_account).
  IF current_setting('tornear.account_deletion', true) = 'on' THEN
    RETURN NULL;
  END IF;

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
$function$;

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
  -- La foto se borra con el resto de la carpeta, más abajo: el trigger de
  -- cambio de foto no tiene que pedirlo otra vez (20260929200000).
  PERFORM set_config('tornear.account_deletion', 'on', true);

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

  PERFORM set_config('tornear.account_deletion', '', true);

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
