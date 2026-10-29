-- Bases v2 del programa de embajadores (29/10/2026).
--
-- Ajusta sweep_ambassador_rewards a las bases v2
-- (docs/legales/TorneAR_Programa_de_Embajadores_V2_Final_Limpio.docx):
--   · Sólo partidos por RANKING (art. 7): los amistosos no cuentan.
--   · El traído es «nuevo» sólo si ninguno de sus integrantes jugó antes un
--     partido FINALIZADO con otro equipo (art. 5). Sus amistosos previos no lo
--     descalifican.
--   · Cada jugador se cuenta una sola vez en todo el programa, no por embajador (art. 7).
--   · Para generar premios el embajador tiene que haber aceptado las bases
--     vigentes (art. 13): ambassador_terms_version pasa a 2 y los inscriptos con
--     la v1 las aceptan desde la app (accept_ambassador_terms).
-- Al aplicarse no había premios ni equipos traídos: no hay derechos adquiridos.

-- ─── 1. ¿Jugó antes con otro equipo? ───────────────────────
-- Un partido FINALIZADO anterior a p_before en el que el jugador estaba en el
-- plantel de un equipo distinto de p_team_id (team_stints) o jugó para él,
-- incluso como invitado (match_participants).

CREATE OR REPLACE FUNCTION public.ambassador_played_with_other_team(p_profile_id uuid, p_team_id uuid, p_before timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.matches m
     WHERE m.status = 'FINALIZADO'
       AND m.finished_at < p_before
       AND (
         EXISTS (SELECT 1 FROM public.team_stints s
                  WHERE s.profile_id = p_profile_id
                    AND s.team_id IN (m.team_a_id, m.team_b_id)
                    AND s.team_id <> p_team_id
                    AND s.started_at <= m.finished_at
                    AND (s.ended_at IS NULL OR s.ended_at > m.finished_at))
         OR EXISTS (SELECT 1 FROM public.match_participants mp
                     WHERE mp.match_id = m.id
                       AND mp.profile_id = p_profile_id
                       AND mp.team_id <> p_team_id)
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.ambassador_played_with_other_team(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;


-- ─── 2. sweep_ambassador_rewards con las reglas de la v2 ────

CREATE OR REPLACE FUNCTION public.sweep_ambassador_rewards()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_epoch     numeric;
  v_start     timestamptz;
  v_amount    numeric;
  v_bonus5    numeric;
  v_bonus10   numeric;
  v_max       integer;
  v_terms     integer;
  v_used      integer;
  v_created   integer := 0;
  v_cap_hit   boolean := false;
  v_filled_amb uuid;
  v_req       integer;
  v_m         record;
  v_side      record;
  v_own       record;
  v_n         record;
  v_counted   uuid[];
  v_new_ids   uuid[];
  v_id        uuid;
  v_total     integer;
  v_rival     uuid;
  v_body      text;
BEGIN
  IF NOT public.ambassador_program_enabled() THEN
    RETURN 0;
  END IF;

  SELECT value INTO v_epoch FROM public.app_settings WHERE key = 'ambassador_program_start_epoch';
  IF coalesce(v_epoch, 0) <= 0 THEN
    RETURN 0;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sweep_ambassador_rewards'));

  v_start   := to_timestamp(v_epoch);
  v_amount  := coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_reward_amount'), 5000);
  v_bonus5  := coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_bonus_5_amount'), 5000);
  v_bonus10 := coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_bonus_10_amount'), 5000);
  v_max     := coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_max_paid_teams'), 100)::integer;
  v_terms   := coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_terms_version'), 1)::integer;

  SELECT count(*) INTO v_used
    FROM public.ambassador_rewards
   WHERE kind = 'TEAM_BROUGHT' AND status <> 'RECHAZADO';

  FOR v_m IN
    SELECT m.id, m.team_a_id, m.team_b_id, m.finished_at, m.format
      FROM public.matches m
     WHERE m.status = 'FINALIZADO'
       AND m.checkin_team_a_at IS NOT NULL
       AND m.checkin_team_b_at IS NOT NULL
       AND m.format IS NOT NULL
       AND m.match_type = 'RANKING'   -- bases v2: los amistosos no cuentan
       AND m.finished_at >= v_start
       AND NOT EXISTS (SELECT 1 FROM public.ambassador_exclusions x
                        WHERE x.team_id IN (m.team_a_id, m.team_b_id))
       AND (
         EXISTS (SELECT 1
                   FROM public.teams t
                   JOIN public.ambassadors a ON a.profile_id = t.ambassador_profile_id AND a.status = 'ACTIVO'
                  WHERE t.id IN (m.team_a_id, m.team_b_id)
                    AND m.finished_at >= coalesce(a.reactivated_at, '-infinity'::timestamptz)
                    AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards r
                                     WHERE r.team_id = t.id AND r.kind = 'TEAM_BROUGHT'))
         OR EXISTS (SELECT 1 FROM public.ambassadors a
                     WHERE a.status = 'ACTIVO'
                       AND a.own_team_id IN (m.team_a_id, m.team_b_id)
                       AND a.own_team_first_match_id IS NULL
                       AND m.finished_at >= a.own_team_set_at
                       AND m.finished_at >= coalesce(a.reactivated_at, '-infinity'::timestamptz))
       )
     ORDER BY m.finished_at, m.id
  LOOP
    v_req := public.ambassador_required_members(v_m.format);
    CONTINUE WHEN v_req IS NULL;
    CONTINUE WHEN (SELECT count(*) FROM public.ambassador_team_members_at(v_m.team_a_id, v_m.finished_at)) < v_req
               OR (SELECT count(*) FROM public.ambassador_team_members_at(v_m.team_b_id, v_m.finished_at)) < v_req;

    v_new_ids    := '{}';
    v_filled_amb := NULL;

    -- 1. Equipos traídos que juegan su primer partido válido (que paga).
    FOR v_side IN
      SELECT t.id AS team_id, t.ambassador_profile_id AS amb, a.own_team_id
        FROM public.teams t
        JOIN public.ambassadors a ON a.profile_id = t.ambassador_profile_id AND a.status = 'ACTIVO'
       WHERE t.id IN (v_m.team_a_id, v_m.team_b_id)
         AND a.terms_version >= v_terms   -- aceptó las bases vigentes
         AND v_m.finished_at >= coalesce(a.reactivated_at, '-infinity'::timestamptz)
         AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards r
                          WHERE r.team_id = t.id AND r.kind = 'TEAM_BROUGHT')
       ORDER BY (t.id = v_m.team_a_id) DESC
    LOOP
      -- R8: si el embajador es integrante del traído, ese partido no paga.
      CONTINUE WHEN v_side.amb IN (SELECT public.ambassador_team_members_at(v_side.team_id, v_m.finished_at));

      -- Bases v2 (art. 5): el traído es «nuevo» sólo si ninguno de sus
      -- integrantes jugó antes un partido FINALIZADO con otro equipo. Sus
      -- propios amistosos previos no cuentan. Si no califica, no paga.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.ambassador_team_members_at(v_side.team_id, v_m.finished_at) AS pid
         WHERE public.ambassador_played_with_other_team(pid, v_side.team_id, v_m.finished_at));

      -- Bases v2 (art. 7): un jugador suma una sola vez en todo el programa.
      -- Afuera el propio embajador, los de su equipo propio y los ya contados
      -- en cualquier traído (de cualquier embajador).
      SELECT coalesce(array_agg(pid ORDER BY pid), '{}') INTO v_counted
        FROM public.ambassador_team_members_at(v_side.team_id, v_m.finished_at) AS pid
       WHERE pid <> v_side.amb
         AND (v_side.own_team_id IS NULL
              OR pid NOT IN (SELECT public.ambassador_team_members_at(v_side.own_team_id, v_m.finished_at)))
         AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards r
                          WHERE r.kind = 'TEAM_BROUGHT'
                            AND r.status <> 'RECHAZADO'
                            AND pid = ANY (r.counted_profile_ids));

      -- Si no llega, saltear: un partido posterior del mismo equipo puede pagar.
      CONTINUE WHEN coalesce(array_length(v_counted, 1), 0) < v_req;

      IF v_used >= v_max THEN
        v_cap_hit := true;
        CONTINUE;
      END IF;

      INSERT INTO public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount, counted_profile_ids)
      VALUES (v_side.amb, 'TEAM_BROUGHT', v_side.team_id, v_m.id, v_amount, v_counted)
      RETURNING id INTO v_id;
      v_new_ids := v_new_ids || v_id;
      v_used    := v_used + 1;
      v_created := v_created + 1;
      IF v_used >= v_max THEN
        v_cap_hit    := true;
        v_filled_amb := v_side.amb;   -- R9: éste llenó el último lugar
      END IF;

      -- 3. Bonos: los dispara un TEAM_BROUGHT nuevo (aun el último del tope).
      SELECT count(*) INTO v_total
        FROM public.ambassador_rewards
       WHERE ambassador_profile_id = v_side.amb AND kind = 'TEAM_BROUGHT' AND status <> 'RECHAZADO';

      IF v_total >= 5 AND public.ambassador_bonus_allowed(v_side.amb, 'BONUS_5') THEN
        INSERT INTO public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount)
        VALUES (v_side.amb, 'BONUS_5', v_side.team_id, v_m.id, v_bonus5)
        RETURNING id INTO v_id;
        v_new_ids := v_new_ids || v_id;
        v_created := v_created + 1;
      END IF;
      IF v_total >= 10 AND public.ambassador_bonus_allowed(v_side.amb, 'BONUS_10') THEN
        INSERT INTO public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount)
        VALUES (v_side.amb, 'BONUS_10', v_side.team_id, v_m.id, v_bonus10)
        RETURNING id INTO v_id;
        v_new_ids := v_new_ids || v_id;
        v_created := v_created + 1;
      END IF;
    END LOOP;

    -- 2. Debut: primer partido válido del equipo propio; queda fijo, gane o no.
    FOR v_own IN
      SELECT a.profile_id, a.own_team_id
        FROM public.ambassadors a
       WHERE a.status = 'ACTIVO'
         AND a.own_team_id IN (v_m.team_a_id, v_m.team_b_id)
         AND a.terms_version >= v_terms
         AND a.own_team_first_match_id IS NULL
         AND v_m.finished_at >= a.own_team_set_at
         AND v_m.finished_at >= coalesce(a.reactivated_at, '-infinity'::timestamptz)
       FOR UPDATE
    LOOP
      CONTINUE WHEN v_own.profile_id NOT IN
        (SELECT public.ambassador_team_members_at(v_own.own_team_id, v_m.finished_at));

      UPDATE public.ambassadors SET own_team_first_match_id = v_m.id WHERE profile_id = v_own.profile_id;

      v_rival := CASE WHEN v_own.own_team_id = v_m.team_a_id THEN v_m.team_b_id ELSE v_m.team_a_id END;
      -- R13: el rival tiene que ser un traído de este embajador que ya generó
      -- su TEAM_BROUGHT (no rechazado) en este partido o en uno anterior. Un
      -- «traído» que no califica (sus jugadores son los del propio, el
      -- embajador está adentro, …) no da debut: se pierde.
      IF EXISTS (SELECT 1 FROM public.teams WHERE id = v_rival AND ambassador_profile_id = v_own.profile_id)
         AND EXISTS (SELECT 1
                       FROM public.ambassador_rewards tb
                       JOIN public.matches tm ON tm.id = tb.match_id
                      WHERE tb.ambassador_profile_id = v_own.profile_id
                        AND tb.kind = 'TEAM_BROUGHT'
                        AND tb.team_id = v_rival
                        AND tb.status <> 'RECHAZADO'
                        AND (tm.finished_at, tm.id) <= (v_m.finished_at, v_m.id))
         AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards
                          WHERE ambassador_profile_id = v_own.profile_id AND kind = 'DEBUT' AND status <> 'RECHAZADO') THEN
        -- R9: con el tope alcanzado el debut se pierde, salvo que este mismo
        -- partido haya generado el TEAM_BROUGHT que llenó el último lugar.
        IF v_used >= v_max AND v_filled_amb IS DISTINCT FROM v_own.profile_id THEN
          v_cap_hit := true;
        ELSE
          INSERT INTO public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount)
          VALUES (v_own.profile_id, 'DEBUT', v_rival, v_m.id, v_amount)
          RETURNING id INTO v_id;
          v_new_ids := v_new_ids || v_id;
          v_created := v_created + 1;
        END IF;
      END IF;
    END LOOP;

    -- 4. Una notificación por embajador y partido con lo que sumó.
    FOR v_n IN
      SELECT r.ambassador_profile_id AS amb,
             sum(r.amount) AS total,
             max(t.name) FILTER (WHERE r.kind = 'DEBUT') AS debut_team,
             string_agg(t.name, ' y ' ORDER BY t.name) FILTER (WHERE r.kind = 'TEAM_BROUGHT') AS brought_teams,
             count(*) FILTER (WHERE r.kind = 'TEAM_BROUGHT') AS n_brought,
             string_agg(CASE r.kind WHEN 'BONUS_5' THEN '5' ELSE '10' END, ' y ' ORDER BY r.kind DESC)
               FILTER (WHERE r.kind IN ('BONUS_5', 'BONUS_10')) AS bonuses,
             bool_or(a.payout_alias IS NULL) AS no_alias,
             bool_or(a.follow_verified_at IS NULL) AS no_follow
        FROM public.ambassador_rewards r
        JOIN public.teams t ON t.id = r.team_id
        JOIN public.ambassadors a ON a.profile_id = r.ambassador_profile_id
       WHERE r.id = ANY (v_new_ids)
       GROUP BY r.ambassador_profile_id
    LOOP
      IF v_n.debut_team IS NOT NULL THEN
        v_body := 'Tu equipo debutó contra ' || v_n.debut_team || ', el equipo que trajiste';
      ELSIF v_n.n_brought > 1 THEN
        v_body := v_n.brought_teams || ' jugaron su primer partido en TorneAR';
      ELSE
        v_body := v_n.brought_teams || ' jugó su primer partido en TorneAR';
      END IF;
      IF v_n.bonuses IS NOT NULL THEN
        v_body := v_body || ' (+ bono por ' || v_n.bonuses || ' equipos)';
      END IF;
      v_body := v_body || '.';
      IF v_n.no_alias THEN
        v_body := v_body || ' Cargá tu alias para cobrar.';
      END IF;
      IF v_n.no_follow THEN
        v_body := v_body || ' Recordá seguir a @tornear.app.';
      END IF;

      INSERT INTO public.notifications (profile_id, type, title, body, data)
      VALUES (
        v_n.amb,
        'ANUNCIO',
        '¡Sumaste $' || replace(to_char(v_n.total, 'FM999,999,990'), ',', '.') || '!',
        v_body,
        jsonb_build_object(
          'kind', 'ambassador_reward',
          'match_id', v_m.id,
          'amount', v_n.total,
          'url', 'tornear://ambassador'
        )
      );
    END LOOP;
  END LOOP;

  -- 5. Tope alcanzado: un solo aviso por valor del tope.
  IF v_cap_hit AND NOT EXISTS (
       SELECT 1 FROM public.app_logs
        WHERE level = 'warn'
          AND details->>'event' = 'ambassador.slots_exhausted'
          AND details->>'max_paid_teams' = v_max::text) THEN
    INSERT INTO public.app_logs (level, message, details)
    VALUES ('warn',
            'Programa de embajadores: se alcanzó el tope de equipos pagos',
            jsonb_build_object('event', 'ambassador.slots_exhausted',
                               'max_paid_teams', v_max::text,
                               'used', v_used));
  END IF;

  RETURN v_created;
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_ambassador_rewards() FROM PUBLIC, anon, authenticated;

-- ─── 3. Aceptar las bases vigentes ─────────────────────────
-- Para el embajador inscripto con una versión anterior. Devuelve applied ·
-- noop_not_ambassador · noop_already_current.

CREATE OR REPLACE FUNCTION public.accept_ambassador_terms()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  uuid;
  v_current integer := coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_terms_version'), 1)::integer;
BEGIN
  SELECT id INTO v_caller FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ambassadors WHERE profile_id = v_caller) THEN
    RETURN 'noop_not_ambassador';
  END IF;

  UPDATE public.ambassadors
     SET terms_version = v_current, accepted_at = now()
   WHERE profile_id = v_caller AND terms_version < v_current;
  RETURN CASE WHEN FOUND THEN 'applied' ELSE 'noop_already_current' END;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_ambassador_terms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ambassador_terms() TO authenticated;


-- ─── 4. get_my_ambassador_overview avisa si falta aceptar la v2 ─

CREATE OR REPLACE FUNCTION public.get_my_ambassador_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid;
  v_amb        public.ambassadors%ROWTYPE;
  v_enabled    boolean := public.ambassador_program_enabled();
  v_max        integer := coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_max_paid_teams'), 100)::integer;
  v_used       integer;
  v_username   text;
  v_own        jsonb;
  v_eligible   jsonb;
  v_debut      text;
  v_counted    integer;
  v_earned     numeric;
  v_paid       numeric;
  v_brought    jsonb;
BEGIN
  SELECT count(*) INTO v_used
    FROM public.ambassador_rewards
   WHERE kind = 'TEAM_BROUGHT' AND status <> 'RECHAZADO';

  SELECT id, username INTO v_caller, v_username FROM public.profiles WHERE auth_user_id = auth.uid();
  SELECT * INTO v_amb FROM public.ambassadors WHERE profile_id = v_caller;

  IF v_caller IS NULL OR NOT FOUND THEN
    RETURN jsonb_build_object('enabled', v_enabled, 'registered', false,
                              'slots_left', greatest(v_max - v_used, 0));
  END IF;

  SELECT jsonb_build_object(
           'team_id', t.id, 'name', t.name, 'format', t.preferred_format::text,
           'members_now', (SELECT count(*) FROM public.team_members m WHERE m.team_id = t.id),
           'members_needed', public.ambassador_required_members(t.preferred_format))
    INTO v_own
    FROM public.teams t
   WHERE t.id = v_amb.own_team_id;

  -- Equipos entre los que puede elegir (sólo mientras el propio no esté fijo).
  IF v_amb.own_team_first_match_id IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name) ORDER BY t.name, t.id), '[]'::jsonb)
      INTO v_eligible
      FROM public.teams t
     WHERE t.id IN (SELECT public.ambassador_eligible_teams(v_caller));
  ELSE
    v_eligible := '[]'::jsonb;
  END IF;

  SELECT count(*) FILTER (WHERE kind = 'TEAM_BROUGHT' AND status <> 'RECHAZADO'),
         coalesce(sum(amount) FILTER (WHERE status IN ('PENDIENTE', 'PAGADO')), 0),
         coalesce(sum(amount) FILTER (WHERE status = 'PAGADO'), 0)
    INTO v_counted, v_earned, v_paid
    FROM public.ambassador_rewards
   WHERE ambassador_profile_id = v_caller;

  v_debut := CASE
    WHEN EXISTS (SELECT 1 FROM public.ambassador_rewards
                  WHERE ambassador_profile_id = v_caller AND kind = 'DEBUT' AND status <> 'RECHAZADO') THEN 'GANADO'
    WHEN v_amb.own_team_first_match_id IS NOT NULL THEN 'PERDIDO'
    WHEN v_amb.own_team_id IS NOT NULL THEN 'DISPONIBLE'
    ELSE 'SIN_EQUIPO'
  END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'team_id', t.id, 'name', t.name, 'format', t.preferred_format::text,
           'members_now', (SELECT count(*) FROM public.team_members m WHERE m.team_id = t.id),
           'members_needed', public.ambassador_required_members(t.preferred_format),
           'state', CASE WHEN r.status IS NULL THEN 'ESPERANDO' ELSE r.status END,
           'amount', CASE WHEN r.status IN ('PENDIENTE', 'PAGADO') THEN r.amount END
         ) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_brought
    FROM public.teams t
    LEFT JOIN LATERAL (
      -- El premio vigente si lo hay; si no, el rechazado.
      SELECT rr.status, rr.amount
        FROM public.ambassador_rewards rr
       WHERE rr.team_id = t.id AND rr.kind = 'TEAM_BROUGHT'
       ORDER BY (rr.status <> 'RECHAZADO') DESC, rr.created_at DESC
       LIMIT 1
    ) r ON true
   WHERE t.ambassador_profile_id = v_caller;

  RETURN jsonb_build_object(
    'enabled',          v_enabled,
    'registered',       true,
    'status',           v_amb.status,
    'username',         v_username,
    'instagram',        v_amb.instagram,
    'show_in_ranking',  v_amb.show_in_ranking,
    'follow_verified',  v_amb.follow_verified_at IS NOT NULL,
    'has_payout_alias', v_amb.payout_alias IS NOT NULL,
    'payout_alias',     v_amb.payout_alias,
    'own_team',         v_own,
    'eligible_own_teams', v_eligible,
    'debut_state',      v_debut,
    'teams_counted',    v_counted,
    'next_bonus_at',    CASE WHEN v_counted < 5 THEN 5 WHEN v_counted < 10 THEN 10 END,
    'bonus_5_earned',   EXISTS (SELECT 1 FROM public.ambassador_rewards
                                 WHERE ambassador_profile_id = v_caller AND kind = 'BONUS_5' AND status <> 'RECHAZADO'),
    'bonus_10_earned',  EXISTS (SELECT 1 FROM public.ambassador_rewards
                                 WHERE ambassador_profile_id = v_caller AND kind = 'BONUS_10' AND status <> 'RECHAZADO'),
    'earned_total',     v_earned,
    'paid_total',       v_paid,
    'slots_left',       greatest(v_max - v_used, 0),
    'brought_teams',    v_brought,
    'terms_outdated',   v_amb.terms_version < coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_terms_version'), 1)::integer
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_ambassador_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ambassador_overview() TO authenticated;

-- ─── 5. Versión vigente de las bases ───────────────────────

UPDATE public.app_settings SET value = 2 WHERE key = 'ambassador_terms_version';
