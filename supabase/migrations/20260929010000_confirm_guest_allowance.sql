-- ============================================================
-- Invitados al confirmar un partido: un lugar de invitado (D-56 / D-60)
-- 2026-09-28 · Registro P1-4 · Tanda 3
-- ------------------------------------------------------------
-- D-56 dice que los invitados cuentan para confirmar un partido, igual que
-- cuentan para el quórum del check-in. Pero un invitado sólo se puede sumar a
-- un partido YA CONFIRMADO (`join_match_as_guest` exige CONFIRMADO): en el
-- momento de confirmar no hay ninguno que contar.
--
-- D-60 (28/09, opción A de Agustín): al confirmar, a cada plantel se le deja
-- un lugar para completar con invitados. Es el caso «falta uno» para el que
-- existen los invitados (D-20). Si el día del partido no llegan al quórum,
-- no pasa nada nuevo: el check-in no sella y el WO automático resuelve.
--
-- ── La regla ────────────────────────────────────────────────────────────────
--   miembros necesarios = min_players_to_start − confirm_guest_slots (mín. 1)
-- `confirm_guest_slots` vive en app_settings (arranca en 1) para poder
-- ajustarlo sin migración. La app lee el mismo valor para su aviso al
-- desafiar (lib/challenge-actions.ts, fetchSquadReadiness).
--
-- El resto de la función queda igual a 20260925160000 (F3).
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES ('confirm_guest_slots', 1,
        'Lugares de invitado que se descuentan del mínimo de plantel al confirmar un partido (D-60). Miembros necesarios = min_players_to_start − este valor, nunca menos de 1.')
ON CONFLICT (key) DO NOTHING;

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
  v_slots       integer;
  v_needed      integer;
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

    -- D-60: a cada plantel se le deja lugar para completar con invitados, que
    -- recién pueden sumarse con el partido confirmado (ver el encabezado).
    v_slots  := greatest(coalesce(
      (SELECT value FROM app_settings WHERE key = 'confirm_guest_slots'), 1)::integer, 0);
    v_needed := greatest(v_rules.min_players_to_start - v_slots, 1);

    IF v_count_a < v_needed THEN
      RAISE EXCEPTION
        'SQUAD_TOO_SMALL: % tiene % jugador(es) y para % necesita al menos % en el plantel (más % invitado(s) el día del partido)',
        v_name_a, v_count_a, v_proposal.format, v_needed, v_rules.min_players_to_start - v_needed;
    END IF;

    IF v_count_b < v_needed THEN
      RAISE EXCEPTION
        'SQUAD_TOO_SMALL: % tiene % jugador(es) y para % necesita al menos % en el plantel (más % invitado(s) el día del partido)',
        v_name_b, v_count_b, v_proposal.format, v_needed, v_rules.min_players_to_start - v_needed;
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
