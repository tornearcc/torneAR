-- ============================================================
-- F3 — Composición de equipos MIXTO, categoría en ranking y género bloqueado
-- 2026-09-25
-- ------------------------------------------------------------
-- Migración A de F3. Deja todo el mecanismo instalado y APAGADO: lo único que
-- cambia el comportamiento el día que se aplica es el bloqueo del género
-- (sección 5) y que el género deja de ser visible para otros usuarios
-- (sección 6).
--
-- ── Las reglas ───────────────────────────────────────────────────────────────
-- 1. Un equipo MIXTO necesita al menos `format_rules.mixed_min_per_gender`
--    jugadores de género M y otros tantos de género F:
--      · en el plantel, para desafiar, aceptar un desafío y confirmar la fecha
--        de un partido;
--      · entre los titulares, al presentar la lista (submit_team_checkin);
--      · entre los presentes, para que el check-in individual selle la
--        llegada del equipo (checkin_team). Sin sello no hay presentación, y
--        el WO automático corre como con cualquier equipo que no llegó.
--    La regla es sólo para el lado MIXTO: en un amistoso MIXTO contra HOMBRES
--    se controla únicamente al MIXTO.
--    Interruptor: `app_settings.mixed_composition_enforced` (0 = apagado).
--    Al activarlo corre también sobre los partidos ya abiertos (decisión 5 del
--    plan): el día de esta migración no hay ninguno con un equipo MIXTO.
-- 2. «X» (Otro) cuenta para el total del equipo, no para los mínimos.
--    Configurable: `mixed_composition_x_counts_as_any` = 1 lo convierte en
--    comodín que puede cubrir cualquiera de los dos mínimos.
-- 3. Ranking sólo entre equipos de la misma categoría (`CATEGORY_MISMATCH`), al
--    desafiar y al aceptar. Los amistosos siguen libres. Interruptor propio,
--    `ranking_same_category_enforced` (0 = apagado), porque afecta también a
--    HOMBRES y MUJERES y puede activarse en otro momento. El partido de ranking
--    MUJERES–HOMBRES que ya existe no se toca (y hoy está CANCELADO).
--
-- ── Compatibilidad con la app instalada (1.0.0 y 1.1.0) ──────────────────────
-- · Ninguna firma cambia. Las RPC tocadas se redefinen con CREATE OR REPLACE,
--   sobre la última versión de cada una:
--     send_challenge, accept_challenge   → 20260907120000_ranking_active_match_guard
--     confirm_match_proposal             → 20260728221000_d13_proposal_schedule_guard
--     submit_team_checkin, checkin_team  → 20260818120000_drop_checkin_coordinates
--     save_own_profile                   → 20260821120000
--   Cada una conserva su cuerpo; los bloques nuevos llevan la marca «F3».
-- · Errores nuevos con prefijo estable: `MIXED_COMPOSITION:`,
--   `CATEGORY_MISMATCH:`, `GENDER_LOCKED:`. La app vieja muestra el texto
--   crudo en los desafíos y un mensaje genérico en propuestas y check-in; la
--   nueva los traduce. Con las banderas en 0, sólo `GENDER_LOCKED` puede
--   aparecer.
-- · `checkin_team` suma las claves `compositionOk` y `compositionMissing` a su
--   JSON. La app vieja ignora las claves que no conoce.
-- · `profiles_public.gender` sigue existiendo, pero devuelve NULL: la app
--   instalada lo nombra en un select explícito (lib/profile-stats-api.ts) y
--   quitar la columna le haría fallar la consulta entera. No lo muestra en
--   ningún lado.
-- · Se revoca `SELECT (gender)` sobre `profiles` a `authenticated`. Verificado
--   el 25/09/2026: ninguna consulta de la app ni del dashboard lee `profiles`
--   con `*` ni nombra `gender`. El perfil propio llega por `get_own_profile()`
--   (SECURITY DEFINER), que lo sigue devolviendo completo.
-- · El UPDATE de «Editar perfil» de la app instalada manda siempre `gender`.
--   Si no cambió, el trigger lo deja pasar; si cambió, falla con
--   `GENDER_LOCKED` y la app vieja muestra su mensaje genérico de error.
-- ============================================================


-- ── 1. Configuración ─────────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  ('mixed_composition_enforced', 0,
   'F3. 1 exige la composición mínima de los equipos MIXTO (format_rules.mixed_min_per_gender de cada género) al desafiar, aceptar, confirmar la fecha y hacer el check-in. 0 la apaga. Se activa después del aviso de dos semanas a los capitanes y con la Política de Privacidad nueva publicada.'),
  ('mixed_composition_x_counts_as_any', 0,
   'F3. 0: el género X (Otro) cuenta para el total del equipo pero no para los mínimos de cada género. 1: X funciona como comodín y puede cubrir cualquiera de los dos mínimos.'),
  ('ranking_same_category_enforced', 0,
   'F3. 1 exige que los dos equipos de un partido de RANKING sean de la misma categoría (CATEGORY_MISMATCH al desafiar y al aceptar). Los amistosos no se controlan. 0 lo apaga.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.format_rules
  ADD COLUMN IF NOT EXISTS mixed_min_per_gender integer NOT NULL DEFAULT 2;

-- Contra `players_on_field` y no contra `min_players_to_start`: las suites
-- 310 y 330 bajan el quórum de FUTBOL_5 a 2 dentro de su transacción, y el
-- límite real es que los mínimos entren en la cancha.
ALTER TABLE public.format_rules
  DROP CONSTRAINT IF EXISTS format_rules_mixed_min_per_gender_check;
ALTER TABLE public.format_rules
  ADD CONSTRAINT format_rules_mixed_min_per_gender_check
  CHECK (mixed_min_per_gender >= 0 AND 2 * mixed_min_per_gender <= players_on_field);

COMMENT ON COLUMN public.format_rules.mixed_min_per_gender IS
  'F3. Mínimo de jugadores de género M y, por separado, de género F que necesita un equipo MIXTO en este formato. Lo usan mixed_composition_eval() y, a través de ella, las RPC de desafío, propuesta y check-in.';


-- ── 2. Evaluación ───────────────────────────────────────────────────────────
-- Cuenta géneros sobre un conjunto de perfiles y dice si alcanza. No mira la
-- bandera ni la categoría: eso lo decide quien la llama. Sin formato (al
-- desafiar todavía no se acordó), usa el mínimo más bajo del catálogo: el que
-- alcanza para jugar en algún formato. Formato sin reglas: mismo criterio.
CREATE OR REPLACE FUNCTION public.mixed_composition_eval(
  p_profile_ids uuid[],
  p_format      team_format DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_min       integer;
  v_x_any     boolean;
  v_male      integer;
  v_female    integer;
  v_other     integer;
  v_unset     integer;
  v_miss_m    integer;
  v_miss_f    integer;
  v_miss_tot  integer;
BEGIN
  IF p_format IS NOT NULL THEN
    SELECT mixed_min_per_gender INTO v_min FROM format_rules WHERE format = p_format;
  END IF;
  IF v_min IS NULL THEN
    SELECT min(mixed_min_per_gender) INTO v_min FROM format_rules;
  END IF;
  v_min := coalesce(v_min, 0);

  v_x_any := coalesce(
    (SELECT value FROM app_settings WHERE key = 'mixed_composition_x_counts_as_any'), 0) = 1;

  SELECT count(*) FILTER (WHERE gender = 'M'),
         count(*) FILTER (WHERE gender = 'F'),
         count(*) FILTER (WHERE gender = 'X'),
         count(*) FILTER (WHERE gender IS NULL)
    INTO v_male, v_female, v_other, v_unset
  FROM profiles
  WHERE id = ANY (coalesce(p_profile_ids, '{}'::uuid[]));

  v_miss_m := greatest(v_min - v_male, 0);
  v_miss_f := greatest(v_min - v_female, 0);
  v_miss_tot := CASE WHEN v_x_any
                     THEN greatest(v_miss_m + v_miss_f - v_other, 0)
                     ELSE v_miss_m + v_miss_f END;

  RETURN jsonb_build_object(
    'ok',            v_miss_tot = 0,
    'minPerGender',  v_min,
    'male',          v_male,
    'female',        v_female,
    'other',         v_other,
    'unset',         v_unset,
    'missingMale',   v_miss_m,
    'missingFemale', v_miss_f,
    'missingTotal',  v_miss_tot,
    'xCountsAsAny',  v_x_any
  );
END;
$function$;

COMMENT ON FUNCTION public.mixed_composition_eval(uuid[], team_format) IS
  'F3. Cuenta géneros sobre un conjunto de perfiles y dice si cumple el mínimo de un equipo MIXTO. Interna: la llaman las RPC. No mira la bandera ni la categoría.';

-- La regla corre para este equipo: bandera encendida y categoría MIXTO.
CREATE OR REPLACE FUNCTION public.mixed_composition_applies(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'mixed_composition_enforced'), 0) = 1
     AND EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND category = 'MIXTO');
$function$;

-- Plantel de un equipo contra la regla. `p_own` decide cuánto dice el error:
-- a quien conduce el equipo, cuántos faltan de cada género; al rival, sólo que
-- no cumple.
CREATE OR REPLACE FUNCTION public.assert_mixed_roster(
  p_team_id uuid,
  p_format  team_format,
  p_own     boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eval jsonb;
  v_name text;
BEGIN
  IF NOT public.mixed_composition_applies(p_team_id) THEN
    RETURN;
  END IF;

  v_eval := public.mixed_composition_eval(
    ARRAY(SELECT profile_id FROM team_members WHERE team_id = p_team_id),
    p_format);

  IF (v_eval->>'ok')::boolean THEN
    RETURN;
  END IF;

  SELECT name INTO v_name FROM teams WHERE id = p_team_id;

  IF p_own THEN
    RAISE EXCEPTION 'MIXED_COMPOSITION: el plantel de % no cumple la composición mínima de un equipo mixto (faltan % de género masculino y % de género femenino)',
      v_name, v_eval->>'missingMale', v_eval->>'missingFemale';
  ELSE
    RAISE EXCEPTION 'MIXED_COMPOSITION: % no cumple la composición mínima de un equipo mixto', v_name;
  END IF;
END;
$function$;

-- Ranking sólo entre equipos de la misma categoría. `p_own_team_id` es el del
-- que ejecuta la acción, para que el mensaje diga cuál es cuál.
CREATE OR REPLACE FUNCTION public.assert_ranking_same_category(
  p_own_team_id   uuid,
  p_rival_team_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_own   team_category;
  v_rival team_category;
BEGIN
  IF coalesce((SELECT value FROM app_settings WHERE key = 'ranking_same_category_enforced'), 0) <> 1 THEN
    RETURN;
  END IF;

  SELECT category INTO v_own   FROM teams WHERE id = p_own_team_id;
  SELECT category INTO v_rival FROM teams WHERE id = p_rival_team_id;

  IF v_own IS DISTINCT FROM v_rival THEN
    RAISE EXCEPTION 'CATEGORY_MISMATCH: los partidos de ranking se juegan entre equipos de la misma categoría (tu equipo: %, rival: %)',
      v_own, v_rival;
  END IF;
END;
$function$;


-- ── 3. Lectura para la app ──────────────────────────────────────────────────
-- Estado de la composición de un equipo. A un integrante le devuelve las
-- cantidades por género del plantel y cuánto falta; a cualquier otro, sólo si
-- cumple. Nunca devuelve el género de una persona.
CREATE OR REPLACE FUNCTION public.get_mixed_composition_status(
  p_team_id uuid,
  p_format  team_format DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_category team_category;
  v_enforced boolean;
  v_member   boolean;
  v_eval     jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_mixed_composition_status requiere una sesión activa'
      USING ERRCODE = '42501';
  END IF;

  SELECT category INTO v_category FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: equipo % inexistente', p_team_id;
  END IF;

  v_enforced := coalesce(
    (SELECT value FROM app_settings WHERE key = 'mixed_composition_enforced'), 0) = 1;

  IF v_category <> 'MIXTO' THEN
    RETURN jsonb_build_object('applies', false, 'enforced', v_enforced, 'ok', true);
  END IF;

  v_eval := public.mixed_composition_eval(
    ARRAY(SELECT profile_id FROM team_members WHERE team_id = p_team_id),
    p_format);

  v_member := EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id = p_team_id AND p.auth_user_id = auth.uid());

  IF NOT v_member THEN
    RETURN jsonb_build_object('applies', true, 'enforced', v_enforced, 'ok', v_eval->'ok');
  END IF;

  RETURN v_eval || jsonb_build_object('applies', true, 'enforced', v_enforced);
END;
$function$;

COMMENT ON FUNCTION public.get_mixed_composition_status(uuid, team_format) IS
  'F3. Composición de un equipo MIXTO. Integrantes: cantidades por género del plantel y faltantes. Resto: sólo applies/enforced/ok. Sin formato usa el mínimo más bajo del catálogo.';


-- ── 4. RPC existentes (cuerpos vigentes + bloques F3) ───────────────────────

CREATE OR REPLACE FUNCTION public.send_challenge(p_from_team_id uuid, p_to_team_id uuid, p_match_type text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id    uuid;
  v_season_id     uuid;
  v_challenge_id  uuid;
  v_from_elo      integer;
  v_to_elo        integer;
  v_elo_diff_warn boolean := false;
  v_shared_count  integer;
  v_recent_count  integer;
  v_season_count  integer;
  v_active_count  integer;
  v_from_active   boolean;
  v_to_active     boolean;
BEGIN
  -- ── 1. Resolver perfil del usuario ────────────────────────
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- ── 2. Autorización: solo CAPITAN/SUBCAPITAN del equipo atacante ──
  -- ⚠️ El literal 'No autorizado' lo verifica supabase/tests/100-rls-security.spec.sql
  -- (P1-1): no cambiar ese texto.
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id   = p_from_team_id
      AND profile_id = v_profile_id
      AND role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán puede enviar un desafío';
  END IF;

  -- ── 2b. Equipos dados de baja (E3) ─────────────────────────
  -- Ocultarlos del ranking no alcanza: el desafío también se puede disparar
  -- desde la ficha del equipo (team-stats) o desde una pantalla ya cargada.
  SELECT is_active INTO v_from_active FROM teams WHERE id = p_from_team_id;
  SELECT is_active INTO v_to_active   FROM teams WHERE id = p_to_team_id;

  IF v_from_active IS NULL OR v_to_active IS NULL THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: alguno de los equipos no existe';
  END IF;
  IF NOT v_from_active THEN
    RAISE EXCEPTION 'TEAM_INACTIVE: tu equipo está dado de baja. Reactivalo desde la gestión del equipo para volver a competir.';
  END IF;
  IF NOT v_to_active THEN
    RAISE EXCEPTION 'TEAM_INACTIVE: ese equipo está dado de baja y no puede recibir desafíos.';
  END IF;

  -- ── 2d. F3: composición de los equipos MIXTO ──────────────
  -- No hace nada con `mixed_composition_enforced` en 0 ni con equipos que no
  -- son MIXTO. El formato se acuerda después, en la propuesta: acá se exige el
  -- mínimo más bajo del catálogo.
  PERFORM public.assert_mixed_roster(p_from_team_id, NULL, true);
  PERFORM public.assert_mixed_roster(p_to_team_id,   NULL, false);

  -- ── 2c. Advisory lock transaccional sobre el par de equipos ───────────────
  -- Serializa llamadas concurrentes con el mismo par: los chequeos de los
  -- bloques 3 y 4d son de NO-existencia, así que dos transacciones simultáneas
  -- podían pasarlos las dos. El lock se libera solo al terminar la transacción.
  -- Segunda capa para el bloque 3: el índice único parcial
  -- `uq_challenges_active_pair`.
  PERFORM pg_advisory_xact_lock(
    42,
    hashtext(
      LEAST(p_from_team_id::text, p_to_team_id::text) ||
      '|' ||
      GREATEST(p_from_team_id::text, p_to_team_id::text)
    )
  );

  -- ── 3. No enviar si ya hay un desafío activo entre estos equipos ──
  -- E8: un ENVIADA sin responder ya no bloquea para siempre — el barrido
  -- horario lo pasa a RECHAZADA a los `sweep_challenge_expiry_days` días.
  IF EXISTS (
    SELECT 1 FROM challenges
    WHERE status = 'ENVIADA'
      AND (
        (from_team_id = p_from_team_id AND to_team_id = p_to_team_id)
        OR
        (from_team_id = p_to_team_id   AND to_team_id = p_from_team_id)
      )
  ) THEN
    RAISE EXCEPTION 'Ya hay un desafío activo con este equipo. Esperá que sea respondido o cancelado primero.';
  END IF;

  -- ── 4. Validaciones específicas de RANKING ─────────────────
  IF p_match_type = 'RANKING' THEN

    -- 4-0. F3: misma categoría (`ranking_same_category_enforced`).
    PERFORM public.assert_ranking_same_category(p_from_team_id, p_to_team_id);

    -- 4a. Anti-farming: ≥2 jugadores en común
    SELECT COUNT(*) INTO v_shared_count
    FROM team_members tm1
    JOIN team_members tm2 ON tm2.profile_id = tm1.profile_id
    WHERE tm1.team_id = p_from_team_id
      AND tm2.team_id = p_to_team_id;

    IF v_shared_count >= 2 THEN
      RAISE EXCEPTION 'Los equipos comparten % jugadores. No se permiten partidos de ranking entre ellos.', v_shared_count;
    END IF;

    -- 4b. Cooldown: partido de ranking JUGADO en los últimos 30 días (E9).
    -- La fecha relevante para el anti-farming es cuándo se jugó, no cuándo se
    -- creó la fila: ver el encabezado de 20260729122000.
    SELECT COUNT(*) INTO v_recent_count
    FROM matches
    WHERE match_type = 'RANKING'
      AND status IN ('FINALIZADO', 'WO_A', 'WO_B')
      AND coalesce(finished_at, scheduled_at, created_at) >= now() - INTERVAL '30 days'
      AND (
        (team_a_id = p_from_team_id AND team_b_id = p_to_team_id)
        OR
        (team_a_id = p_to_team_id   AND team_b_id = p_from_team_id)
      );

    IF v_recent_count > 0 THEN
      RAISE EXCEPTION 'Deben pasar 30 días desde el último partido de ranking entre estos equipos.';
    END IF;

    -- 4c. Límite de temporada: máximo 3 partidos de ranking por temporada
    SELECT id INTO v_season_id FROM seasons WHERE is_active = true LIMIT 1;

    IF v_season_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_season_count
      FROM matches
      WHERE match_type = 'RANKING'
        AND season_id   = v_season_id
        AND status IN ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'FINALIZADO', 'EN_DISPUTA', 'WO_A', 'WO_B')
        AND (
          (team_a_id = p_from_team_id AND team_b_id = p_to_team_id)
          OR
          (team_a_id = p_to_team_id   AND team_b_id = p_from_team_id)
        );

      IF v_season_count >= 3 THEN
        RAISE EXCEPTION 'Máximo 3 partidos de ranking por temporada entre los mismos equipos.';
      END IF;
    END IF;

    -- 4d. Un solo partido de ranking activo por par de equipos (NUEVO).
    -- Sin `season_id` en el filtro a propósito: un partido sin resolver de la
    -- temporada anterior sigue siendo un partido sin resolver.
    SELECT COUNT(*) INTO v_active_count
    FROM matches
    WHERE match_type = 'RANKING'
      AND status IN ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA')
      AND (
        (team_a_id = p_from_team_id AND team_b_id = p_to_team_id)
        OR
        (team_a_id = p_to_team_id   AND team_b_id = p_from_team_id)
      );

    IF v_active_count > 0 THEN
      RAISE EXCEPTION 'RANKING_MATCH_ACTIVE: ya hay un partido de ranking sin resolver contra este equipo.';
    END IF;

    -- 4e. ELO diff (informativo, no bloqueante)
    SELECT elo_rating INTO v_from_elo FROM teams WHERE id = p_from_team_id;
    SELECT elo_rating INTO v_to_elo   FROM teams WHERE id = p_to_team_id;
    v_elo_diff_warn := abs(coalesce(v_from_elo, 1000) - coalesce(v_to_elo, 1000)) > 400;

  END IF;

  -- ── 5. INSERT del desafío ──────────────────────────────────
  INSERT INTO challenges (from_team_id, to_team_id, created_by, match_type, status)
  VALUES (
    p_from_team_id,
    p_to_team_id,
    v_profile_id,
    p_match_type::match_type,
    'ENVIADA'
  )
  RETURNING id INTO v_challenge_id;

  RETURN json_build_object(
    'challengeId',    v_challenge_id,
    'eloDiffWarning', v_elo_diff_warn
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_challenge(p_challenge_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge    record;
  v_season_id    uuid;
  v_match_id     uuid;
  v_conv_id      uuid;
  v_active_count integer;
BEGIN
  -- 1. Fetch the challenge
  SELECT from_team_id, to_team_id, match_type, status
  INTO v_challenge
  FROM challenges
  WHERE id = p_challenge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found: %', p_challenge_id;
  END IF;

  IF v_challenge.status <> 'ENVIADA' THEN
    RAISE EXCEPTION 'El desafío ya no está disponible para aceptar (estado: %)', v_challenge.status;
  END IF;

  -- 2. Authorization: caller must be CAPITAN or SUBCAPITAN of the receiving team
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id = v_challenge.to_team_id
      AND p.auth_user_id = auth.uid()
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán del equipo receptor puede aceptar este desafío';
  END IF;

  -- 2b. F3: composición de los equipos MIXTO — ver send_challenge. Acá el
  -- equipo propio es el que recibió el desafío. Entre el envío y la aceptación
  -- el plantel pudo cambiar.
  PERFORM public.assert_mixed_roster(v_challenge.to_team_id,   NULL, true);
  PERFORM public.assert_mixed_roster(v_challenge.from_team_id, NULL, false);

  -- 3b. Advisory lock sobre el par de equipos — misma clave que send_challenge.
  -- Dos aceptaciones simultáneas (o una aceptación y un envío) del mismo par se
  -- serializan acá; sin esto, el chequeo de no-existencia del bloque 3c lo
  -- pasarían las dos.
  PERFORM pg_advisory_xact_lock(
    42,
    hashtext(
      LEAST(v_challenge.from_team_id::text, v_challenge.to_team_id::text) ||
      '|' ||
      GREATEST(v_challenge.from_team_id::text, v_challenge.to_team_id::text)
    )
  );

  -- 3c. Un solo partido de ranking activo por par de equipos.
  -- `send_challenge` ya lo chequea al ENVIAR, pero entre el envío y la
  -- aceptación pueden pasar días: en el medio, el mismo par puede haber
  -- estrenado un partido de ranking por otra vía (otro desafío ya aceptado).
  -- Éste es el punto donde el partido nace, así que es el que tiene la última
  -- palabra.
  IF COALESCE(v_challenge.match_type, 'AMISTOSO') = 'RANKING' THEN
    -- F3: misma categoría (`ranking_same_category_enforced`).
    PERFORM public.assert_ranking_same_category(v_challenge.to_team_id, v_challenge.from_team_id);

    SELECT COUNT(*) INTO v_active_count
    FROM matches
    WHERE match_type = 'RANKING'
      AND status IN ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA')
      AND (
        (team_a_id = v_challenge.from_team_id AND team_b_id = v_challenge.to_team_id)
        OR
        (team_a_id = v_challenge.to_team_id   AND team_b_id = v_challenge.from_team_id)
      );

    IF v_active_count > 0 THEN
      RAISE EXCEPTION 'RANKING_MATCH_ACTIVE: ya hay un partido de ranking sin resolver contra este equipo.';
    END IF;
  END IF;

  -- 3. Active season (nullable — OK if none)
  SELECT id INTO v_season_id
  FROM seasons
  WHERE is_active = true
  LIMIT 1;

  -- 4. Create the match (PENDIENTE, teams from challenge)
  INSERT INTO matches (
    challenge_id,
    team_a_id,
    team_b_id,
    match_type,
    season_id,
    status
  ) VALUES (
    p_challenge_id,
    v_challenge.from_team_id,
    v_challenge.to_team_id,
    COALESCE(v_challenge.match_type, 'AMISTOSO'),
    v_season_id,
    'PENDIENTE'
  )
  RETURNING id INTO v_match_id;

  -- 5. Create the match chat conversation
  INSERT INTO conversations (type, match_id)
  VALUES ('MATCH_CHAT', v_match_id)
  RETURNING id INTO v_conv_id;

  -- 6. Mark challenge as ACEPTADA
  UPDATE challenges
  SET status = 'ACEPTADA', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN json_build_object(
    'matchId',        v_match_id,
    'conversationId', v_conv_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_match_proposal(p_proposal_id uuid, p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal    match_proposals%rowtype;
  v_match       matches%rowtype;
  v_rules       format_rules%rowtype;
  v_count_a     integer;
  v_count_b     integer;
  v_name_a      text;
  v_name_b      text;
  v_conflict    text;
BEGIN
  -- FOR UPDATE: bloquea la fila durante la transacción para serializar
  -- llamadas concurrentes sobre la misma propuesta.
  SELECT * INTO v_proposal
    FROM match_proposals
    WHERE id = p_proposal_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propuesta no encontrada: %', p_proposal_id;
  END IF;

  IF v_proposal.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La propuesta ya no está pendiente (estado: %)', v_proposal.status;
  END IF;

  -- D7: la propuesta tiene que ser DE ESTE partido. `p_match_id` viene del
  -- cliente y gobierna tanto la autorización como el UPDATE de abajo.
  IF v_proposal.match_id <> p_match_id THEN
    RAISE EXCEPTION 'PROPOSAL_MATCH_MISMATCH: la propuesta no pertenece a este partido';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  END IF;

  -- D8: sólo se confirma lo que todavía está por jugarse. Sin esto, una
  -- propuesta que quedó PENDIENTE revivía un partido CANCELADO.
  IF v_match.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATUS: el partido ya no está pendiente (estado: %)', v_match.status;
  END IF;

  -- Autorización: solo el equipo que NO propuso puede confirmar.
  -- ⚠️ El literal 'No autorizado' lo verifica 100-rls-security.spec.sql (P1-3).
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN profiles p ON p.id = tm.profile_id
    WHERE tm.team_id IN (
      SELECT team_a_id FROM matches WHERE id = p_match_id
      UNION
      SELECT team_b_id FROM matches WHERE id = p_match_id
    )
    AND tm.team_id <> v_proposal.from_team_id
    AND p.auth_user_id = auth.uid()
    AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el equipo receptor puede confirmar esta propuesta';
  END IF;

  -- ── E1: cupo mínimo del formato acordado, para los DOS planteles ──────────
  SELECT * INTO v_rules FROM format_rules WHERE format = v_proposal.format;

  -- Sin reglas cargadas no se inventa un mínimo: se deja pasar, igual que hace
  -- apply_match_outcome cuando le falta un dato. El catálogo lo administra el
  -- equipo de torneAR, no el usuario, y bloquear acá por un hueco del catálogo
  -- sería castigar al capitán por algo que no puede resolver.
  IF FOUND THEN
    SELECT count(*) INTO v_count_a FROM team_members WHERE team_id = v_match.team_a_id;
    SELECT count(*) INTO v_count_b FROM team_members WHERE team_id = v_match.team_b_id;

    SELECT name INTO v_name_a FROM teams WHERE id = v_match.team_a_id;
    SELECT name INTO v_name_b FROM teams WHERE id = v_match.team_b_id;

    IF v_count_a < v_rules.min_players_to_start THEN
      RAISE EXCEPTION
        'SQUAD_TOO_SMALL: % tiene % jugador(es) y % necesita al menos % para presentarse',
        v_name_a, v_count_a, v_proposal.format, v_rules.min_players_to_start;
    END IF;

    IF v_count_b < v_rules.min_players_to_start THEN
      RAISE EXCEPTION
        'SQUAD_TOO_SMALL: % tiene % jugador(es) y % necesita al menos % para presentarse',
        v_name_b, v_count_b, v_proposal.format, v_rules.min_players_to_start;
    END IF;
  END IF;

  -- ── F3: composición de los equipos MIXTO, con el formato acordado ─────────
  -- El propio es el equipo que confirma: el que NO hizo la propuesta.
  PERFORM public.assert_mixed_roster(
    CASE WHEN v_match.team_a_id = v_proposal.from_team_id
         THEN v_match.team_b_id ELSE v_match.team_a_id END,
    v_proposal.format, true);
  PERFORM public.assert_mixed_roster(v_proposal.from_team_id, v_proposal.format, false);

  -- ── D13: la fecha sigue siendo futura y la franja sigue libre ─────────────
  -- Entre el INSERT de la propuesta y este confirm pueden haber pasado días.
  -- La propuesta pudo nacer válida y estar vencida ahora, o el equipo pudo
  -- confirmar otro partido para esa misma hora en el medio.
  IF v_proposal.scheduled_at <= now() THEN
    RAISE EXCEPTION 'PROPOSAL_DATE_IN_PAST: la fecha de esta propuesta (%) ya pasó', v_proposal.scheduled_at;
  END IF;

  v_conflict := public.match_schedule_conflict(
    p_match_id,
    ARRAY[v_match.team_a_id, v_match.team_b_id],
    v_proposal.scheduled_at,
    v_proposal.duration_minutes
  );

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'TEAM_SCHEDULE_CONFLICT: % ya tiene un partido confirmado en ese horario', v_conflict;
  END IF;

  UPDATE match_proposals SET status = 'ACEPTADA' WHERE id = p_proposal_id;

  UPDATE matches SET
    status           = 'CONFIRMADO',
    scheduled_at     = v_proposal.scheduled_at,
    format           = v_proposal.format,
    duration_minutes = v_proposal.duration_minutes,
    location         = v_proposal.location,
    venue_id         = v_proposal.venue_id,
    signal_amount    = v_proposal.signal_amount,
    total_cost       = v_proposal.total_cost
  WHERE id = p_match_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_team_checkin(p_match_id uuid, p_team_id uuid, p_players jsonb, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match       matches%rowtype;
  v_rules       format_rules%rowtype;
  v_caller_id   uuid;
  v_venue       venues%rowtype;
  v_distance_m  numeric;
  v_radius_m    numeric;
  v_total       integer;
  v_starters    integer;
  v_distinct    integer;
  v_invalid     integer;
  v_outsiders   text;
  v_comp        jsonb;
BEGIN
  -- 1. Lock del match
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  END IF;

  IF p_team_id <> v_match.team_a_id AND p_team_id <> v_match.team_b_id THEN
    RAISE EXCEPTION 'TEAM_NOT_IN_MATCH: el equipo no juega este partido';
  END IF;

  -- 2. Estado y formato
  IF v_match.status <> 'CONFIRMADO' THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATUS: la lista sólo se presenta con el partido CONFIRMADO (estado: %)', v_match.status;
  END IF;
  IF v_match.format IS NULL THEN
    RAISE EXCEPTION 'FORMAT_NOT_SET: el partido no tiene formato definido';
  END IF;

  -- 3. Autorización: CUERPO TÉCNICO del equipo (R6).
  -- Presentar la lista es un acto del banco de suplentes, no de la conducción
  -- del club: el DT arma el equipo que juega. El código de error se mantiene
  -- (`NOT_TEAM_ADMIN`) porque el cliente lo mapea por prefijo.
  SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_caller_id
      AND role IN ('CAPITAN', 'SUBCAPITAN', 'DIRECTOR_TECNICO')
  ) THEN
    RAISE EXCEPTION 'NOT_TEAM_ADMIN: sólo el capitán, el subcapitán o el DT puede presentar la lista';
  END IF;

  -- 4. Payload bien formado
  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' OR jsonb_array_length(p_players) = 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: p_players debe ser un array JSON no vacío';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE e->>'lineup_role' = 'TITULAR'),
         count(DISTINCT e->>'profile_id'),
         count(*) FILTER (
           WHERE (e->>'profile_id') IS NULL
              OR NOT (e->>'profile_id' ~ '^[0-9a-fA-F-]{36}$')
              OR (e->>'lineup_role') IS NULL
              OR (e->>'lineup_role') NOT IN ('TITULAR', 'SUPLENTE')
         )
    INTO v_total, v_starters, v_distinct, v_invalid
  FROM jsonb_array_elements(p_players) e;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: cada entrada necesita profile_id (uuid) y lineup_role TITULAR|SUPLENTE';
  END IF;
  IF v_distinct <> v_total THEN
    RAISE EXCEPTION 'DUPLICATE_PLAYER: hay jugadores repetidos en la lista';
  END IF;

  -- 5. Cupos contra el catálogo
  SELECT * INTO v_rules FROM format_rules WHERE format = v_match.format;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORMAT_RULES_MISSING: no hay reglas cargadas para %', v_match.format;
  END IF;

  IF v_starters < v_rules.min_players_to_start THEN
    RAISE EXCEPTION 'MIN_STARTERS_NOT_MET: % necesita al menos % titulares (recibidos: %)',
      v_match.format, v_rules.min_players_to_start, v_starters;
  END IF;
  IF v_starters > v_rules.players_on_field THEN
    RAISE EXCEPTION 'TOO_MANY_STARTERS: % admite % titulares en cancha (recibidos: %)',
      v_match.format, v_rules.players_on_field, v_starters;
  END IF;
  IF v_total > v_rules.max_squad_size THEN
    RAISE EXCEPTION 'SQUAD_LIMIT_EXCEEDED: % admite % convocados como máximo (recibidos: %)',
      v_match.format, v_rules.max_squad_size, v_total;
  END IF;

  -- 6. Pertenencia: miembro del equipo o invitado ya registrado en el match
  SELECT string_agg(e->>'profile_id', ', ') INTO v_outsiders
  FROM jsonb_array_elements(p_players) e
  WHERE NOT EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = p_team_id AND tm.profile_id = (e->>'profile_id')::uuid
        )
    AND NOT EXISTS (
          SELECT 1 FROM match_participants mp
          WHERE mp.match_id = p_match_id AND mp.team_id = p_team_id
            AND mp.profile_id = (e->>'profile_id')::uuid AND mp.is_guest
        );
  IF v_outsiders IS NOT NULL THEN
    RAISE EXCEPTION 'PLAYER_NOT_IN_TEAM: no son miembros ni invitados del equipo: %', v_outsiders;
  END IF;

  -- 6b. F3: en un equipo MIXTO, los TITULARES cumplen la composición.
  -- Los suplentes no cuentan: la regla es sobre quién está en la cancha.
  IF public.mixed_composition_applies(p_team_id) THEN
    v_comp := public.mixed_composition_eval(
      ARRAY(SELECT (e->>'profile_id')::uuid
              FROM jsonb_array_elements(p_players) e
             WHERE e->>'lineup_role' = 'TITULAR'),
      v_match.format);

    IF NOT (v_comp->>'ok')::boolean THEN
      RAISE EXCEPTION 'MIXED_COMPOSITION: los titulares no cumplen la composición mínima de un equipo mixto (faltan % de género masculino y % de género femenino)',
        v_comp->>'missingMale', v_comp->>'missingFemale';
    END IF;
  END IF;

  -- 7. Geofence — la ubicación es obligatoria si hay cancha del catálogo.
  -- Igual que en checkin_team: se mide y se descarta.
  IF v_match.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue FROM venues WHERE id = v_match.venue_id;

    IF FOUND AND v_venue.lat IS NOT NULL AND v_venue.lng IS NOT NULL THEN
      IF p_lat IS NULL OR p_lng IS NULL THEN
        RAISE EXCEPTION 'LOCATION_REQUIRED: presentar la lista en este partido requiere tu ubicación';
      END IF;

      v_radius_m := public.checkin_geofence_radius_m();

      v_distance_m := 2 * 6371000 * asin(sqrt(
        pow(sin(radians((p_lat - v_venue.lat) / 2)), 2) +
        cos(radians(v_venue.lat)) * cos(radians(p_lat)) *
        pow(sin(radians((p_lng - v_venue.lng) / 2)), 2)
      ));

      IF v_distance_m > v_radius_m THEN
        RAISE EXCEPTION 'GEOFENCE_FAILED: estás a %m de la cancha, el máximo es %m',
          round(v_distance_m), round(v_radius_m);
      END IF;

      -- D2: pasó el geofence. Se registra la distancia real medida.
      PERFORM public.log_checkin_distance(
        p_match_id, p_team_id, v_caller_id, v_venue.id,
        v_distance_m, v_radius_m, 'submit_team_checkin'
      );
    END IF;
  END IF;

  -- Reemplazo atómico de la lista del equipo
  DELETE FROM match_participants
  WHERE match_id = p_match_id AND team_id = p_team_id
    AND profile_id NOT IN (
      SELECT (e->>'profile_id')::uuid FROM jsonb_array_elements(p_players) e
    );

  INSERT INTO match_participants (match_id, profile_id, team_id, lineup_role)
  SELECT p_match_id, (e->>'profile_id')::uuid, p_team_id, (e->>'lineup_role')::lineup_role
  FROM jsonb_array_elements(p_players) e
  ON CONFLICT (match_id, profile_id) DO UPDATE SET
    team_id     = EXCLUDED.team_id,
    lineup_role = EXCLUDED.lineup_role;

  -- El caller que presenta la lista jugando queda con presencia marcada y
  -- habilitado a cargar el resultado. Un DT que no se convoca a sí mismo no
  -- matchea este UPDATE (no tiene fila en match_participants) — y no lo
  -- necesita: la policy de match_results ahora lo habilita por rol.
  UPDATE match_participants SET
    did_checkin      = true,
    checkin_at       = now(),
    is_result_loader = true
  WHERE match_id = p_match_id AND profile_id = v_caller_id AND team_id = p_team_id;

  IF v_match.team_a_id = p_team_id THEN
    UPDATE matches SET checkin_team_a_at = now() WHERE id = p_match_id;
  ELSE
    UPDATE matches SET checkin_team_b_at = now() WHERE id = p_match_id;
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.checkin_team_a_at IS NOT NULL
     AND v_match.checkin_team_b_at IS NOT NULL
     AND v_match.status = 'CONFIRMADO'
  THEN
    UPDATE matches SET status = 'EN_VIVO', started_at = now() WHERE id = p_match_id;
    v_match.status := 'EN_VIVO';
  END IF;

  RETURN json_build_object(
    'matchId',     p_match_id,
    'teamId',      p_team_id,
    'format',      v_match.format,
    'starters',    v_starters,
    'substitutes', v_total - v_starters,
    'total',       v_total,
    'matchStatus', v_match.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkin_team(p_match_id uuid, p_team_id uuid, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match       matches%rowtype;
  v_profile_id  uuid;
  v_venue       venues%rowtype;
  v_distance_m  numeric;
  v_radius_m    numeric;
  v_checked_in  integer;
  v_min_players integer;
  v_sealed_at   timestamptz;
  v_just_sealed boolean := false;
  v_comp        jsonb;
  v_comp_ok     boolean := true;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND: partido % inexistente', p_match_id;
  END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  -- ÍTEM 4 (heredado de 20260328150331): el caller tiene que ser miembro del
  -- equipo por el que hace check-in — o invitado ya registrado en este partido
  -- para ese equipo (join_match_as_guest). El literal 'No autorizado' lo
  -- verifica 100-rls-security.spec.sql (P1-4): no cambiar el texto ni adelantar
  -- esta guarda sin tocar el test.
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_profile_id
  ) AND NOT EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id AND team_id = p_team_id
      AND profile_id = v_profile_id AND is_guest
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro del equipo que intentás hacer check-in';
  END IF;

  IF v_match.team_a_id <> p_team_id AND v_match.team_b_id <> p_team_id THEN
    RAISE EXCEPTION 'TEAM_NOT_IN_MATCH: el equipo no participa en este partido';
  END IF;

  -- D9: sin esta guarda, un check-in sobre un partido PENDIENTE dejaba el sello
  -- puesto y lo pre-confirmaba; y sobre un FINALIZADO/CANCELADO era ruido puro.
  IF v_match.status NOT IN ('CONFIRMADO', 'EN_VIVO') THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATUS: el check-in sólo corre con el partido CONFIRMADO o EN_VIVO (estado: %)', v_match.status;
  END IF;

  -- Geofence. Radio configurable desde app_settings; error con prefijo estable.
  --
  -- `p_lat`/`p_lng` viven sólo dentro de este bloque: se usan para medir y se
  -- descartan al terminar la llamada. Lo único que sobrevive es la distancia
  -- redondeada que registra log_checkin_distance.
  IF v_match.venue_id IS NOT NULL THEN
    SELECT * INTO v_venue FROM venues WHERE id = v_match.venue_id;

    IF FOUND AND v_venue.lat IS NOT NULL AND v_venue.lng IS NOT NULL THEN
      IF p_lat IS NULL OR p_lng IS NULL THEN
        RAISE EXCEPTION 'LOCATION_REQUIRED: el check-in de este partido requiere tu ubicación';
      END IF;

      v_radius_m := public.checkin_geofence_radius_m();

      v_distance_m := 2 * 6371000 * asin(sqrt(
        pow(sin(radians((p_lat - v_venue.lat) / 2)), 2) +
        cos(radians(v_venue.lat)) * cos(radians(p_lat)) *
        pow(sin(radians((p_lng - v_venue.lng) / 2)), 2)
      ));

      IF v_distance_m > v_radius_m THEN
        RAISE EXCEPTION 'GEOFENCE_FAILED: estás a %m de la cancha, el máximo es %m',
          round(v_distance_m), round(v_radius_m);
      END IF;

      -- D2: pasó el geofence. Se registra la distancia real medida.
      PERFORM public.log_checkin_distance(
        p_match_id, p_team_id, v_profile_id, v_venue.id,
        v_distance_m, v_radius_m, 'checkin_team'
      );
    END IF;
  END IF;

  -- ── Hecho 1: MI llegada ───────────────────────────────────────────────────
  -- Esto siempre pasa, para cualquier miembro. Es el registro individual, y es
  -- lo que la evidencia de un WO necesita: quién estuvo y a qué hora.
  --
  -- Riesgo 01: la evidencia del WO es «quién y cuándo». El «dónde» ya lo
  -- garantiza el geofence de arriba —si la fila existe, el jugador pasó la
  -- validación— así que guardar además la coordenada no agregaba prueba, sólo
  -- un dato personal de más.
  INSERT INTO match_participants
    (match_id, profile_id, team_id, is_result_loader, did_checkin, checkin_at)
  VALUES
    (p_match_id, v_profile_id, p_team_id, true, true, now())
  ON CONFLICT (match_id, profile_id)
  DO UPDATE SET
    did_checkin      = true,
    checkin_at       = now(),
    is_result_loader = true;

  -- ── Hecho 2: ¿se presentó el EQUIPO? ─────────────────────────────────────
  SELECT count(*) INTO v_checked_in
  FROM match_participants
  WHERE match_id = p_match_id AND team_id = p_team_id AND did_checkin;

  v_min_players := public.checkin_min_players(v_match.format);

  -- F3: en un equipo MIXTO, los presentes además tienen que cumplir la
  -- composición para sellar. El check-in individual se registra igual (Hecho
  -- 1): sin sello, el equipo no está presentado y el WO automático lo trata
  -- como a cualquier equipo que no llegó.
  IF public.mixed_composition_applies(p_team_id) THEN
    v_comp := public.mixed_composition_eval(
      ARRAY(SELECT profile_id FROM match_participants
             WHERE match_id = p_match_id AND team_id = p_team_id AND did_checkin),
      v_match.format);
    v_comp_ok := (v_comp->>'ok')::boolean;
  END IF;

  v_sealed_at := CASE WHEN v_match.team_a_id = p_team_id
                      THEN v_match.checkin_team_a_at
                      ELSE v_match.checkin_team_b_at END;

  -- Sólo se sella una vez: si el capitán ya presentó la lista por
  -- submit_team_checkin, el timestamp original manda. Re-sellar movería la hora
  -- de llegada del equipo hacia adelante y falsearía la evidencia del WO.
  IF v_sealed_at IS NULL AND v_checked_in >= v_min_players AND v_comp_ok THEN
    IF v_match.team_a_id = p_team_id THEN
      UPDATE matches SET checkin_team_a_at = now() WHERE id = p_match_id;
    ELSE
      UPDATE matches SET checkin_team_b_at = now() WHERE id = p_match_id;
    END IF;
    v_just_sealed := true;
  END IF;

  -- Ambos equipos presentes → EN_VIVO.
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.checkin_team_a_at IS NOT NULL
     AND v_match.checkin_team_b_at IS NOT NULL
     AND v_match.status = 'CONFIRMADO'
  THEN
    UPDATE matches SET status = 'EN_VIVO', started_at = now() WHERE id = p_match_id;
    v_match.status := 'EN_VIVO';
  END IF;

  RETURN json_build_object(
    'matchId',          p_match_id,
    'teamId',           p_team_id,
    'checkedInPlayers', v_checked_in,
    'minPlayers',       v_min_players,
    'teamSealed',       (v_sealed_at IS NOT NULL OR v_just_sealed),
    'justSealed',       v_just_sealed,
    'matchStatus',      v_match.status,
    -- F3. compositionMissing es NULL cuando la regla no aplica al equipo.
    'compositionOk',      v_comp_ok,
    'compositionMissing', CASE WHEN v_comp IS NULL THEN NULL ELSE jsonb_build_object(
                            'male',   (v_comp->>'missingMale')::int,
                            'female', (v_comp->>'missingFemale')::int,
                            'total',  (v_comp->>'missingTotal')::int) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_own_profile(p_full_name text, p_username text, p_zone text, p_preferred_position player_position, p_date_of_birth date, p_gender text, p_strong_foot text, p_favorite_team text DEFAULT NULL::text, p_expo_push_token text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_current_gender text;
BEGIN
  -- Un SECURITY DEFINER sin este chequeo es una puerta abierta: sin sesión,
  -- `auth.uid()` es NULL y el INSERT fallaría recién por el NOT NULL, con un
  -- error que no dice nada. 42501 es el código correcto y el que el cliente
  -- ya sabe traducir (`getGenericSupabaseErrorMessage`).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'save_own_profile requiere una sesión activa'
      USING ERRCODE = '42501';
  END IF;

  -- F3: el género se elige una sola vez. Esta función es SECURITY DEFINER y
  -- el trigger profiles_gender_lock no la frena (corre como su dueño), así que
  -- el control va acá. Guardar el mismo valor pasa.
  SELECT gender INTO v_current_gender FROM public.profiles WHERE auth_user_id = v_uid;
  IF v_current_gender IS NOT NULL AND p_gender IS DISTINCT FROM v_current_gender THEN
    RAISE EXCEPTION 'GENDER_LOCKED: el género se elige al registrarte. Para corregirlo, escribinos a tornearcc@gmail.com';
  END IF;

  INSERT INTO public.profiles AS p (
    auth_user_id,
    full_name,
    username,
    zone,
    preferred_position,
    date_of_birth,
    gender,
    strong_foot,
    favorite_team,
    expo_push_token,
    updated_at
  )
  VALUES (
    v_uid,
    p_full_name,
    p_username,
    p_zone,
    p_preferred_position,
    p_date_of_birth,
    p_gender,
    p_strong_foot,
    NULLIF(btrim(p_favorite_team), ''),
    p_expo_push_token,
    now()
  )
  -- `auth_user_id` y no `id`: es la unique que de verdad identifica "el
  -- perfil de este usuario". Ver el BONUS de la cabecera.
  ON CONFLICT (auth_user_id) DO UPDATE SET
    full_name          = excluded.full_name,
    username           = excluded.username,
    zone               = excluded.zone,
    preferred_position = excluded.preferred_position,
    date_of_birth      = excluded.date_of_birth,
    gender             = excluded.gender,
    strong_foot        = excluded.strong_foot,
    favorite_team      = excluded.favorite_team,
    -- El token de push sólo se pisa si el cliente mandó uno. Un dispositivo
    -- que rechazó el permiso manda NULL, y sin este COALESCE borraría el
    -- token válido que había dejado otro dispositivo del mismo usuario.
    expo_push_token    = COALESCE(excluded.expo_push_token, p.expo_push_token),
    updated_at         = now()
  RETURNING p.id INTO v_profile_id;

  RETURN v_profile_id;
END;
$function$;


-- ── 5. Género bloqueado después del registro ────────────────────────────────
-- Se elige en el onboarding (NULL → valor) y después sólo lo cambia soporte
-- con admin_set_profile_gender. El trigger frena los UPDATE directos del
-- cliente (roles `authenticated`/`anon`). Las funciones SECURITY DEFINER
-- corren como su dueño y deciden ellas:
--   · save_own_profile trae su propio control (sección 4);
--   · delete_own_account lo pone en NULL al anonimizar, y tiene que poder;
--   · admin_set_profile_gender es justamente la vía de cambio.
-- Guardar el mismo valor pasa: «Editar perfil» de la app instalada lo manda
-- siempre.
CREATE OR REPLACE FUNCTION public.enforce_gender_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.gender IS NOT NULL
     AND NEW.gender IS DISTINCT FROM OLD.gender
     AND current_user IN ('authenticated', 'anon')
  THEN
    RAISE EXCEPTION 'GENDER_LOCKED: el género se elige al registrarte. Para corregirlo, escribinos a tornearcc@gmail.com';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_gender_lock ON public.profiles;
CREATE TRIGGER profiles_gender_lock
  BEFORE UPDATE OF gender ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gender_lock();


-- ── 6. El género deja de ser visible para otros usuarios ────────────────────
-- La columna queda en la vista con NULL (ver la cabecera: la app instalada la
-- nombra). Mismo nombre, tipo y posición: CREATE OR REPLACE VIEW no admite
-- otra cosa, y conserva los grants de la vista.
CREATE OR REPLACE VIEW public.profiles_public AS
 SELECT id,
    username,
    full_name,
    avatar_url,
    zone,
    preferred_position,
    favorite_team,
    strong_foot,
    NULL::text AS gender,
    created_at,
        CASE
            WHEN date_of_birth IS NULL THEN NULL::integer
            ELSE EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone, date_of_birth::timestamp with time zone))::integer
        END AS age
   FROM profiles;

REVOKE SELECT (gender) ON public.profiles FROM authenticated, anon;


-- ── 7. Soporte: consultar y corregir el género ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_profile_gender(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gender text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  SELECT gender INTO v_gender FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil % no encontrado', p_profile_id;
  END IF;

  RETURN v_gender;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_gender(
  p_profile_id uuid,
  p_gender     text,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_auth_user_id uuid := auth.uid();
  v_username           text;
  v_previous           text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = v_admin_auth_user_id AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  IF p_gender IS NULL OR p_gender NOT IN ('M', 'F', 'X') THEN
    RAISE EXCEPTION 'INVALID_GENDER: el género tiene que ser M, F o X';
  END IF;

  -- El cambio sólo se hace a pedido del titular: el motivo deja constancia de
  -- ese pedido (por ejemplo, «correo del 25/09 desde la cuenta»).
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: indicá el motivo del cambio';
  END IF;

  SELECT username, gender INTO v_username, v_previous
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil % no encontrado', p_profile_id;
  END IF;

  IF v_previous IS NOT DISTINCT FROM p_gender THEN
    RETURN jsonb_build_object('profileId', p_profile_id, 'previous', v_previous,
                              'gender', p_gender, 'changed', false);
  END IF;

  UPDATE public.profiles SET gender = p_gender WHERE id = p_profile_id;

  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'info',
    'admin.set_profile_gender',
    jsonb_build_object(
      'profile_id', p_profile_id,
      'username',   v_username,
      'previous',   v_previous,
      'gender',     p_gender,
      'reason',     btrim(p_reason)
    ),
    v_admin_auth_user_id
  );

  RETURN jsonb_build_object('profileId', p_profile_id, 'previous', v_previous,
                            'gender', p_gender, 'changed', true);
END;
$function$;

COMMENT ON FUNCTION public.admin_set_profile_gender(uuid, text, text) IS
  'F3. Única vía para cambiar el género después del registro: la usa soporte desde el dashboard, a pedido del titular. Exige is_admin y un motivo; deja admin.set_profile_gender en app_logs con el valor anterior y el nuevo.';


-- ── 8. Permisos ─────────────────────────────────────────────────────────────
-- Supabase da EXECUTE a anon y authenticated sobre toda función nueva de
-- `public`: las internas se cierran a mano.
REVOKE ALL ON FUNCTION public.mixed_composition_eval(uuid[], team_format)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mixed_composition_applies(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_mixed_roster(uuid, team_format, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_ranking_same_category(uuid, uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_gender_lock()                           FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_mixed_composition_status(uuid, team_format) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_profile_gender(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_profile_gender(uuid, text, text)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mixed_composition_status(uuid, team_format) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_gender(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_gender(uuid, text, text)      TO authenticated;
