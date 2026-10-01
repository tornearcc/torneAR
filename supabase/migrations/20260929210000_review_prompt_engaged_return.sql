-- ============================================================
-- Pedido de valoración: momento «usuario frecuente» (D-63)
-- 2026-09-29 · Tanda 6 · tarjeta #75
-- ------------------------------------------------------------
-- El popup no aparecía nunca porque sus dos momentos (D-50: compartir un
-- partido, cerrar un resultado) casi no ocurren: al 29/09 hubo 2 partidos
-- cerrados en total y el último compartido fue el 24/09, con 39 usuarios
-- activos por semana.
--
-- Se suma el disparador `engaged_return`: la app lo usa al volver a la
-- pestaña Inicio (no al abrir la app) a partir del 5.º día distinto de uso,
-- una vez por sesión. Los días los cuenta la app en el dispositivo; acá sólo
-- se acepta el nombre. Los filtros no cambian: cuenta de más de 7 días, uno
-- por versión, 120 días entre pedidos, 3 por año y nada después de una
-- disputa, un WO en contra o una denuncia.
-- ============================================================

ALTER TABLE public.review_prompts DROP CONSTRAINT IF EXISTS review_prompts_trigger_name_check;
ALTER TABLE public.review_prompts ADD CONSTRAINT review_prompts_trigger_name_check
  CHECK (trigger_name IN ('match_shared', 'result_confirmed', 'engaged_return'));

CREATE OR REPLACE FUNCTION public.claim_review_prompt(p_trigger text, p_platform text, p_app_version text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id  uuid := public.current_profile_id();
  v_version     text := btrim(coalesce(p_app_version, ''));
  v_enabled     numeric;
  v_min_days    numeric;
  v_cooldown    numeric;
  v_max_year    numeric;
  v_lookback    numeric;
  v_created_at  timestamptz;
  v_since       timestamptz;
BEGIN
  -- Sin perfil no hay a quién pedirle nada: pasa con anon y durante el
  -- onboarding, antes de que exista la fila en `profiles`.
  IF v_profile_id IS NULL THEN
    RETURN false;
  END IF;

  -- engaged_return (D-63, 20260929210000): al volver a Inicio desde el 5.º día
  -- distinto de uso. Los días los cuenta la app; los filtros son los de siempre.
  IF p_trigger IS NULL OR p_trigger NOT IN ('match_shared', 'result_confirmed', 'engaged_return') THEN
    RAISE EXCEPTION 'INVALID_TRIGGER: el disparador % no existe', p_trigger;
  END IF;

  IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'INVALID_PLATFORM: la plataforma % no existe', p_platform;
  END IF;

  IF v_version = '' THEN
    RAISE EXCEPTION 'INVALID_APP_VERSION: falta la versión de la app';
  END IF;

  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'review_prompt_enabled'), 1),
         coalesce((SELECT value FROM app_settings WHERE key = 'review_prompt_min_account_days'), 7),
         coalesce((SELECT value FROM app_settings WHERE key = 'review_prompt_cooldown_days'), 120),
         coalesce((SELECT value FROM app_settings WHERE key = 'review_prompt_max_per_365d'), 3),
         coalesce((SELECT value FROM app_settings WHERE key = 'review_prompt_negative_lookback_days'), 14)
    INTO v_enabled, v_min_days, v_cooldown, v_max_year, v_lookback;

  IF v_enabled < 1 THEN
    RETURN false;
  END IF;

  -- Dos toques simultáneos (compartir dos veces, o compartir mientras se
  -- confirma un resultado) podrían pasar los dos por el chequeo antes de que
  -- cualquiera inserte. El lock es por perfil y muere con la transacción.
  PERFORM pg_advisory_xact_lock(hashtext('review_prompt:' || v_profile_id::text));

  SELECT created_at INTO v_created_at FROM profiles WHERE id = v_profile_id;

  IF v_created_at > now() - make_interval(days => v_min_days::integer) THEN
    RETURN false;
  END IF;

  -- Uno por versión publicada: si ya se lo pedimos en esta versión, la próxima
  -- oportunidad es el release siguiente.
  IF EXISTS (
    SELECT 1 FROM review_prompts
     WHERE profile_id = v_profile_id AND app_version = v_version
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM review_prompts
     WHERE profile_id = v_profile_id
       AND requested_at > now() - make_interval(days => v_cooldown::integer)
  ) THEN
    RETURN false;
  END IF;

  IF (
    SELECT count(*) FROM review_prompts
     WHERE profile_id = v_profile_id
       AND requested_at > now() - interval '365 days'
  ) >= v_max_year THEN
    RETURN false;
  END IF;

  v_since := now() - make_interval(days => v_lookback::integer);

  -- Señales negativas vividas por esta persona (no por su equipo en abstracto):
  -- se miran los partidos que jugó. Pedirle una valoración a alguien que viene
  -- de un partido en disputa o de un WO en contra es pedirle una mala reseña.
  IF EXISTS (
    SELECT 1
      FROM match_participants mp
      JOIN matches m ON m.id = mp.match_id
     WHERE mp.profile_id = v_profile_id
       AND (
         (m.disputed_at IS NOT NULL AND m.disputed_at > v_since)
         OR (m.status = 'WO_A' AND mp.team_id = m.team_b_id AND m.updated_at > v_since)
         OR (m.status = 'WO_B' AND mp.team_id = m.team_a_id AND m.updated_at > v_since)
       )
  ) THEN
    RETURN false;
  END IF;

  -- Denunciar algo es la declaración más explícita de "acá pasó algo malo" que
  -- tenemos registrada.
  IF EXISTS (
    SELECT 1 FROM content_reports
     WHERE reporter_id = v_profile_id AND created_at > v_since
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO review_prompts (profile_id, trigger_name, platform, app_version)
  VALUES (v_profile_id, p_trigger, p_platform, v_version);

  RETURN true;
END;
$function$;
