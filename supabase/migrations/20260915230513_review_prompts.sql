-- ============================================================
-- Pedido de valoración en la tienda — control de frecuencia
-- 2026-09-15
-- ------------------------------------------------------------
-- La app va a poder abrir el diálogo nativo de valoración (SKStoreReviewController
-- en iOS, In-App Review en Play) desde `expo-store-review`. Esas APIs no
-- devuelven NADA: no dicen si el diálogo se mostró ni si la persona calificó.
-- Lo único que se puede registrar es "se lo pedimos", y ese registro es esta
-- tabla.
--
-- ── Por qué el criterio vive en la base y no en el cliente ───────────────────
-- Los umbrales quedan en `app_settings` (misma mecánica que los barridos y la
-- geocerca): con la política de `runtimeVersion` que usa el proyecto, cambiar
-- un número hardcodeado en el cliente exige un OTA, y el interruptor de apagado
-- tiene que poder accionarse sin esperar un release. Además, el gate corre una
-- sola vez y del lado del servidor: dos toques simultáneos no pueden colarse.
--
-- ── Lo que las tiendas PROHÍBEN, y por eso no se hace ────────────────────────
-- Google Play es explícito: la app no debe preguntarle nada al usuario antes de
-- mostrar la tarjeta ("¿te gusta la app?", "¿nos pondrías 5 estrellas?"), ni
-- disparar la API desde un botón. Apple exige usar su API y prohíbe los pedidos
-- propios (guideline 5.6.1). Por eso acá NO hay encuesta previa que filtre a los
-- contentos: lo que hay es lo contrario, señales YA registradas que hacen callar
-- el pedido (un partido en disputa, un WO en contra, una denuncia propia). No se
-- le pregunta nada a nadie; se mira lo que ya pasó.
--
-- ── Los topes ────────────────────────────────────────────────────────────────
-- Apple muestra el diálogo como máximo 3 veces por año por usuario y decide él
-- si lo muestra. Nuestro tope es más conservador que el suyo a propósito: una
-- vez por versión publicada y no más de una cada `review_prompt_cooldown_days`.
-- Gastar los tres intentos del año en un mes sería desperdiciar el cupo que el
-- sistema operativo concede.
--
-- Uso desde el cliente:
--   select public.claim_review_prompt('match_shared', 'ios', '1.1.0');
--   -- true  → llamar a StoreReview.requestReview()
--   -- false → no hacer nada (y NO reintentar)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Umbrales configurables
-- ════════════════════════════════════════════════════════════
-- `app_settings.value` es numeric: alcanza para todos estos (el interruptor va
-- como 0/1). Mismo patrón que `sweep_*` y `checkin_geofence_radius_m`.

INSERT INTO public.app_settings (key, value, description) VALUES
  ('review_prompt_enabled', 1,
   'Interruptor del pedido de valoración en la tienda. 0 lo apaga para todos sin necesidad de un OTA.'),
  ('review_prompt_min_account_days', 7,
   'Días mínimos desde el alta del perfil antes de pedir una valoración. Pedirla el primer día produce reseñas de alguien que todavía no usó la app.'),
  ('review_prompt_cooldown_days', 120,
   'Días mínimos entre dos pedidos al mismo usuario. Más conservador que el tope de Apple (3 por año) para no gastar el cupo del sistema operativo.'),
  ('review_prompt_max_per_365d', 3,
   'Tope propio de pedidos por usuario en 365 días, espejo del que aplica Apple. Si el cooldown baja, este sigue siendo el techo.'),
  ('review_prompt_negative_lookback_days', 14,
   'Ventana hacia atrás para las señales negativas (partido en disputa, WO en contra, denuncia propia) que silencian el pedido.')
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- 2. Registro de pedidos
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.review_prompts (
  -- `extensions.uuid_generate_v4()` y no `gen_random_uuid()`: es la convención
  -- del schema (las extensiones viven en `extensions`, no en `public`).
  id           uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- La columna NO se llama `trigger`: es palabra clave de Postgres y obligaría
  -- a citarla en cada query.
  trigger_name text NOT NULL CHECK (trigger_name IN ('match_shared', 'result_confirmed')),
  platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
  -- La versión del binario (app.json), no el runtime del OTA: el tope "uno por
  -- versión" se cuenta contra lo que el usuario ve publicado en la tienda.
  app_version  text NOT NULL CHECK (char_length(btrim(app_version)) BETWEEN 1 AND 20),
  requested_at timestamptz NOT NULL DEFAULT now()
);

-- Las tres consultas del gate (última, por versión, y las del último año) son
-- todas "las de este perfil, de la más nueva a la más vieja".
CREATE INDEX IF NOT EXISTS review_prompts_profile_requested_idx
  ON public.review_prompts (profile_id, requested_at DESC);

ALTER TABLE public.review_prompts ENABLE ROW LEVEL SECURITY;

-- Sin grants y sin policies: RLS activo sin ninguna policy niega todo por
-- PostgREST, para anon y para authenticated. La tabla se escribe ÚNICAMENTE
-- por `claim_review_prompt` (SECURITY DEFINER) y se lee desde el dashboard con
-- service_role. Si el cliente pudiera escribirla, el gate sería decorativo:
-- bastaría con borrar la propia fila para volver a pedir.
REVOKE ALL ON public.review_prompts FROM anon, authenticated;

COMMENT ON TABLE public.review_prompts IS
  'Pedidos de valoración en la tienda ya realizados. Sin acceso directo para anon/authenticated: se escribe sólo por claim_review_prompt(). Registra que SE PIDIÓ, no que el usuario haya calificado — ni Apple ni Google informan eso.';

COMMENT ON COLUMN public.review_prompts.app_version IS
  'Versión del binario (app.json) en el momento del pedido. Es la unidad del tope "un pedido por versión".';


-- ════════════════════════════════════════════════════════════
-- 3. El gate
-- ════════════════════════════════════════════════════════════
-- Devuelve `true` UNA sola vez por oportunidad válida y deja la fila en el
-- mismo acto. El cliente llama al diálogo nativo sólo si recibe `true`.
--
-- Devuelve `false` (y no excepción) en todo lo que es "no corresponde ahora":
-- para el llamador no hay diferencia de comportamiento entre "estás en
-- cooldown" y "sos cuenta nueva", y una excepción lo obligaría a envolver la
-- llamada en un try/catch para un caso que es el normal. Sí levanta excepción
-- ante un argumento inválido, que es un error de programación del cliente.

CREATE OR REPLACE FUNCTION public.claim_review_prompt(
  p_trigger     text,
  p_platform    text,
  p_app_version text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  IF p_trigger IS NULL OR p_trigger NOT IN ('match_shared', 'result_confirmed') THEN
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
$fn$;

REVOKE ALL ON FUNCTION public.claim_review_prompt(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_review_prompt(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.claim_review_prompt(text, text, text) IS
  'Gate del pedido de valoración (migración *_review_prompts). true = corresponde pedirla ahora, y deja registrado el pedido en el mismo acto; false = no corresponde (apagado, cuenta nueva, ya pedido en esta versión, cooldown, tope anual o señal negativa reciente). Umbrales en app_settings (review_prompt_*). Levanta excepción sólo ante argumentos inválidos.';
