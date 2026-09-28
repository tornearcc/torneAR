-- ============================================================
-- UN SOLO PARTIDO DE RANKING ACTIVO POR PAR DE EQUIPOS — 2026-09-07
-- ------------------------------------------------------------
-- Hallazgo:
--   `send_challenge` valida tres cosas para RANKING —jugadores en común (4a),
--   cooldown de 30 días sobre partidos YA JUGADOS (4b) y tope de 3 por
--   temporada (4c)— pero ninguna mira si el par de equipos tiene un partido de
--   ranking TODAVÍA SIN RESOLVER.
--
--   · El bloque 4b filtra `status IN ('FINALIZADO','WO_A','WO_B')`: un partido
--     confirmado para el sábado que viene no entra.
--   · El bloque 4c sí cuenta los estados activos, pero recién frena en el
--     tercero.
--
--   Resultado: se podían acumular hasta 3 partidos de ranking simultáneos
--   contra el mismo rival. Y como el desafío es asincrónico (se manda, el rival
--   contesta cuando quiere), alcanzaba con mandar varios y esperar: cada
--   aceptación creaba su propio partido sin que nada mirara los anteriores.
--
-- ── Qué agrega ──────────────────────────────────────────────────────────────
--   · `send_challenge`  — bloque 4d: rechaza el desafío si ya hay un partido de
--     RANKING entre esos dos equipos en un estado no resuelto.
--   · `accept_challenge` — el mismo chequeo justo antes del INSERT del partido.
--     Es defensa en profundidad, no redundancia: `send_challenge` mira el
--     estado del mundo cuando se ENVÍA el desafío, y entre ese momento y la
--     aceptación pueden pasar días. Un desafío legítimo del lunes no puede
--     crear un segundo partido activo el viernes.
--
-- ── Qué cuenta como "todavía sin resolver" ──────────────────────────────────
--   PENDIENTE  — aceptado, sin fecha ni cancha acordadas todavía.
--   CONFIRMADO — con fecha, cancha y formato; está por jugarse.
--   EN_VIVO    — en curso.
--   EN_DISPUTA — jugado, con resultados que no cruzan; el veredicto lo pone el
--                cron `sweep_disputed_matches` a las 24 h.
--   Quedan afuera los estados terminales (FINALIZADO, WO_A, WO_B, CANCELADO):
--   ésos ya los cubre el cooldown de 30 días del bloque 4b.
--
-- ── Sobre la concurrencia ───────────────────────────────────────────────────
-- El chequeo es de NO-existencia, así que dos transacciones simultáneas podrían
-- pasarlo las dos. En `send_challenge` ya está el `pg_advisory_xact_lock` sobre
-- el par ordenado de equipos (bloque 2c) y el nuevo chequeo va DESPUÉS, dentro
-- de esa sección crítica. En `accept_challenge` se toma el mismo lock, con la
-- misma clave (42 + hash del par ordenado), por el mismo motivo.
--
-- ── Mensajes de error ───────────────────────────────────────────────────────
-- Llevan el prefijo `RANKING_MATCH_ACTIVE:` para que el cliente los traduzca a
-- un texto propio (lib/challenge-actions.ts · getChallengeErrorMessage) en vez
-- de mostrar el texto crudo de Postgres. Es el mismo patrón de códigos que ya
-- usan `TEAM_INACTIVE` y `TEAM_NOT_FOUND`.
--
-- ⚠️ El literal 'No autorizado' NO se toca: lo verifica
--    supabase/tests/100-rls-security.spec.sql (P1-1).
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- send_challenge — se reescribe entera (es un CREATE OR REPLACE)
-- Base: 20260729122000_e9_cooldown_play_date.sql + bloque 4d nuevo.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_challenge(
  p_from_team_id uuid,
  p_to_team_id   uuid,
  p_match_type   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
$$;

COMMENT ON FUNCTION public.send_challenge(uuid, uuid, text) IS
  'Envía un desafío con todas las validaciones server-side. E3: rechaza equipos dados de baja. E9: el cooldown de 30 días se mide sobre coalesce(finished_at, scheduled_at, created_at). 4d: rechaza si ya hay un partido de RANKING sin resolver (PENDIENTE/CONFIRMADO/EN_VIVO/EN_DISPUTA) contra el mismo rival.';

REVOKE EXECUTE ON FUNCTION public.send_challenge(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_challenge(uuid, uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- accept_challenge — misma guarda, en el punto donde nace el partido
-- Base: 20260328150331_fix_match_rpc_security.sql + bloques 3b y 3c nuevos.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_challenge(p_challenge_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
$$;

COMMENT ON FUNCTION public.accept_challenge(uuid) IS
  'Acepta un desafío y crea el partido en PENDIENTE. Verifica autorización (CAPITAN/SUBCAPITAN del equipo receptor) y, para RANKING, que no exista ya un partido sin resolver contra el mismo rival.';

REVOKE EXECUTE ON FUNCTION public.accept_challenge(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_challenge(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- Índice de apoyo
-- ─────────────────────────────────────────────────────────────
-- El filtro de 4d / 3c es (match_type, status, par de equipos). El índice
-- parcial deja la búsqueda del par contra un subconjunto chico: los partidos de
-- ranking sin resolver son, por definición de esta misma regla, muy pocos.
CREATE INDEX IF NOT EXISTS idx_matches_ranking_unresolved_pair
  ON public.matches (team_a_id, team_b_id)
  WHERE match_type = 'RANKING'
    AND status IN ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA');
