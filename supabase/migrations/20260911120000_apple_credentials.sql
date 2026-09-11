-- ============================================================
-- CREDENCIALES DE SIGN IN WITH APPLE
-- 2026-09-11
-- ------------------------------------------------------------
-- Apple exige que una app que ofrece Sign in with Apple **y** eliminación de
-- cuenta revoque los tokens contra su REST API al dar de baja (guideline
-- 5.1.1(v)). torneAR ya ofrecía la baja de cuenta
-- (`delete_own_account()`, 20260818140000); agregar el login de Apple crea esa
-- obligación nueva.
--
-- Para revocar hace falta un refresh_token de Apple, y ese token sólo se puede
-- obtener canjeando el `authorizationCode` que el dispositivo entrega en CADA
-- login, dentro de los 5 minutos. Es decir: hay que guardarlo cuando el usuario
-- entra, no cuando pide la baja — en ese momento ya no hay código que canjear.
--
-- ── Por qué la tabla no tiene NINGUNA policy ────────────────────────────────
-- `refresh_token` es una credencial viva: con ella se puede pedir un id_token
-- nuevo a Apple en nombre de esa persona. No hay ningún caso de uso en el que
-- el cliente deba leerla, ni siquiera su dueño. Con RLS habilitada y cero
-- policies, `authenticated` y `anon` no ven ni escriben nada; el único que
-- opera es el `service_role` de la Edge Function `apple-auth`, que bypasea RLS
-- por diseño. Los REVOKE de abajo son el cinturón además del tirante: aunque
-- alguien agregue una policy permisiva por error, sin grants no hay acceso.
--
-- ── Por qué la PK es auth_user_id y no profile_id ───────────────────────────
-- Es una credencial de la identidad, no del perfil deportivo. `delete_own_account`
-- conserva la fila de `profiles` (el historial compartido con rivales lo
-- impide) pero el vínculo con Apple sí tiene que morir con la baja, así que la
-- fila cuelga de `auth.users` y no de `profiles`.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.apple_credentials (
  auth_user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Refresh token devuelto por https://appleid.apple.com/auth/token al canjear
  -- el authorizationCode. Es lo único que se guarda: el access_token de Apple
  -- dura 1 hora y no sirve para revocar.
  refresh_token text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.apple_credentials ENABLE ROW LEVEL SECURITY;

-- Sin policies a propósito (ver arriba). Grants explícitos y no los default
-- privileges de Supabase, que son inconsistentes entre entornos — mismo
-- criterio que 20260722120000_fix_team_stints_grants.sql.
REVOKE ALL ON public.apple_credentials FROM anon, authenticated;

COMMENT ON TABLE public.apple_credentials IS
  'Refresh token de Sign in with Apple, para revocarlo al eliminar la cuenta (Apple 5.1.1(v)). Sin policies ni grants: sólo lo toca el service_role de la edge function apple-auth. Ver el comentario largo de la migración 20260911120000.';

COMMENT ON COLUMN public.apple_credentials.refresh_token IS
  'Credencial viva: permite pedir tokens nuevos en nombre del usuario. No exponer al cliente bajo ninguna circunstancia.';


-- ── Limpieza al dar de baja ──────────────────────────────────────────────────
-- `delete_own_account()` no borra la fila de auth.users, la BANEA, así que el
-- ON DELETE CASCADE de arriba no se dispara nunca en el flujo real. Se agrega
-- el DELETE explícito dentro de la función.
--
-- La revocación contra Apple la hace la edge function ANTES de llamar a esta
-- RPC (ver lib/account-data.ts): Postgres no puede salir a internet por sí
-- mismo y meter pg_net acá ataría la baja de cuenta a que un POST externo
-- responda. Acá sólo se borra la fila local.
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

  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = v_auth_user_id::text;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delete_own_account: no se pudo limpiar el avatar de storage (perfil %): %',
      v_profile_id, SQLERRM;
  END;

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
  'Autoservicio de baja de cuenta (Apple 5.1.1). Anonimiza profiles, borra la credencial de Apple y banea auth.users — NO hace DELETE físico del perfil: el historial deportivo compartido con rivales lo impide. La revocación del token contra Apple la hace la edge function apple-auth antes de llamar a esta RPC.';
