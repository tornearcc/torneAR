-- ============================================================
-- VENTANA HORARIA DEL CHECK-IN EN EL SERVIDOR
-- 2026-09-28 · Registro P1-3 · Tanda 3
-- ------------------------------------------------------------
-- La app sólo deja hacer check-in desde 2 h antes hasta 1 h después del
-- horario del partido (`isWithin2Hours`, components/matches/CheckinSection.tsx),
-- pero ni `checkin_team` ni `submit_team_checkin` miraban `scheduled_at`.
-- Cualquiera que llamara a la API directo podía presentarse días antes o
-- después, y el check-in es lo que decide el WO automático y, por él, el ELO.
--
-- ── La regla, en un solo lugar ──────────────────────────────────────────────
-- `assert_checkin_window` la aplican las dos RPC con los mismos bordes que la
-- app: abre justo 2 h antes (incluido) y cierra justo 1 h después (excluido).
-- Si algún día cambia, cambian las dos cosas juntas: esta función y
-- `isWithin2Hours`.
--
-- ── Dónde va el chequeo ─────────────────────────────────────────────────────
-- Después de las validaciones de permisos, estado y lista, y ANTES del geofence
-- y de cualquier escritura. Así los errores de siempre ('No autorizado',
-- NOT_TEAM_ADMIN, INVALID_MATCH_STATUS, ...) salen igual que antes, y un
-- intento fuera de horario no deja ni la distancia registrada.
--
-- ── Por qué no choca con el WO automático ───────────────────────────────────
-- `sweep_stale_matches` resuelve los CONFIRMADO recién 4 h después del horario
-- (`sweep_confirmed_grace_hours`). Cuando corre, la ventana ya cerró hace 3 h.
--
-- ── Errores ─────────────────────────────────────────────────────────────────
-- Prefijos estables que mapea lib/checkin-data.ts: CHECKIN_NOT_OPEN (todavía no
-- abrió, o el partido no tiene horario) y CHECKIN_CLOSED (ya cerró).
--
-- El resto de las dos funciones es idéntico a la versión en producción
-- (checkin_team de 20260925160000, submit_team_checkin de 20260925160000).
-- ============================================================

CREATE OR REPLACE FUNCTION public.assert_checkin_window(p_scheduled_at timestamptz)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'CHECKIN_NOT_OPEN: el partido no tiene horario confirmado';
  END IF;

  IF now() < p_scheduled_at - interval '2 hours' THEN
    RAISE EXCEPTION 'CHECKIN_NOT_OPEN: el check-in abre 2 horas antes del horario del partido';
  END IF;

  IF now() >= p_scheduled_at + interval '1 hour' THEN
    RAISE EXCEPTION 'CHECKIN_CLOSED: el check-in cerró 1 hora después del horario del partido';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_checkin_window(timestamptz) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_checkin_window(timestamptz) IS
  'Ventana del check-in: desde 2 h antes (incluido) hasta 1 h después (excluido) del horario. La usan checkin_team y submit_team_checkin; es la misma regla que isWithin2Hours en la app (P1-3).';


-- ── checkin_team ────────────────────────────────────────────────────────────
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

  -- P1-3: fuera de la ventana horaria no hay check-in (ver el encabezado).
  PERFORM public.assert_checkin_window(v_match.scheduled_at);

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


-- ── submit_team_checkin ─────────────────────────────────────────────────────
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
      RAISE EXCEPTION 'MIXED_COMPOSITION: los titulares no cumplen la composición mínima de un equipo mixto: %',
        public.mixed_composition_missing_text(v_comp);
    END IF;
  END IF;

  -- 6c. P1-3: fuera de la ventana horaria no se presenta la lista.
  PERFORM public.assert_checkin_window(v_match.scheduled_at);

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
