-- ============================================================
-- Programa de embajadores v2 (P3-14, D-66) — por persona
-- 2026-10-21
-- ------------------------------------------------------------
-- Embajador = persona con cuenta que se inscribe desde la app (Instagram
-- obligatorio, mayor de 18, bases aceptadas). Gana plata por cada equipo que
-- trae («equipo traído»: su capitán carga el usuario del embajador en
-- «¿Quién los invitó?» dentro de las 24 h de creado) y un extra de debut si el
-- primer partido de su equipo propio es contra uno de esos equipos.
--
-- Esta migración tiene dos partes:
--   1. Base (esta tarea): ajustes, tablas, columna en teams, inscripción,
--      equipo propio, equipo traído, prefill e insignia «Reclutador».
--   2. Premios y barrido (se suma en la tarea siguiente).
--
-- Todo el acceso pasa por RPCs SECURITY DEFINER: las tablas quedan cerradas a
-- anon y authenticated (RLS prendida, sin policies, sin GRANT).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PARTE 1 — BASE
-- ════════════════════════════════════════════════════════════

-- ─── 1.1 Ajustes (app_settings) ─────────────────────────────

INSERT INTO public.app_settings (key, value, description) VALUES
  ('ambassador_program_enabled',     0,    'Interruptor del programa de embajadores: 0 apagado, 1 prendido.'),
  ('ambassador_program_start_epoch', 0,    'Arranque del programa (epoch en segundos): sólo cuentan partidos finalizados desde ahí.'),
  ('ambassador_reward_amount',       5000, 'Premio en pesos por equipo traído (TEAM_BROUGHT) y por debut (DEBUT).'),
  ('ambassador_bonus_5_amount',      5000, 'Bono en pesos al llegar a 5 equipos traídos.'),
  ('ambassador_bonus_10_amount',     5000, 'Bono en pesos al llegar a 10 equipos traídos.'),
  ('ambassador_max_paid_teams',      100,  'Tope de premios TEAM_BROUGHT no rechazados; es también el fin del programa.'),
  ('ambassador_terms_version',       1,    'Versión vigente de las bases del programa de embajadores.')
ON CONFLICT (key) DO NOTHING;


-- ─── 1.2 Tablas ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ambassadors (
  profile_id             uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  own_team_id            uuid        REFERENCES public.teams(id) ON DELETE SET NULL,
  own_team_set_at        timestamptz,
  own_team_first_match_id uuid       REFERENCES public.matches(id) ON DELETE SET NULL,
  instagram              text        NOT NULL CHECK (instagram ~ '^[a-z0-9._]{1,30}$'),
  show_in_ranking        boolean     NOT NULL DEFAULT false,
  follow_verified_at     timestamptz,
  follow_verified_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  payout_alias           text        CHECK (length(payout_alias) BETWEEN 6 AND 40),
  terms_version          integer     NOT NULL,
  accepted_at            timestamptz NOT NULL DEFAULT now(),
  status                 text        NOT NULL DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO', 'SUSPENDIDO')),
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ambassadors IS
  'Programa de embajadores v2 (P3-14). Una fila por persona inscripta. own_team_id es el equipo propio (opcional; sólo sirve para el extra de debut). follow_verified_at lo carga TorneAR a mano: sin eso no se paga.';

-- Un equipo es propio de un solo embajador.
CREATE UNIQUE INDEX IF NOT EXISTS ambassadors_own_team_uidx
  ON public.ambassadors (own_team_id) WHERE own_team_id IS NOT NULL;
-- Índices de FK que no cubre la clave anterior.
CREATE INDEX IF NOT EXISTS ambassadors_follow_verified_by_idx
  ON public.ambassadors (follow_verified_by) WHERE follow_verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS ambassadors_first_match_idx
  ON public.ambassadors (own_team_first_match_id) WHERE own_team_first_match_id IS NOT NULL;

ALTER TABLE public.ambassadors ENABLE ROW LEVEL SECURITY;
-- Sin policies: sólo las RPCs (SECURITY DEFINER) y el dashboard (service role).
REVOKE ALL ON public.ambassadors FROM anon, authenticated;


CREATE TABLE IF NOT EXISTS public.ambassador_exclusions (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  note    text NOT NULL
);

COMMENT ON TABLE public.ambassador_exclusions IS
  'Equipos que no entran en el programa de embajadores (demo de Apple, D-52): no se pueden traer, no son equipo propio y sus partidos no cuentan.';

ALTER TABLE public.ambassador_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ambassador_exclusions FROM anon, authenticated;

-- Demo de Apple (D-52). En una base sin la demo no inserta nada.
INSERT INTO public.ambassador_exclusions (team_id, note)
SELECT t.id, 'Demo de Apple (D-52)'
  FROM public.teams t
 WHERE t.name IN ('Apple FC', 'Los Pibes del Barrio')
ON CONFLICT (team_id) DO NOTHING;


-- ─── 1.3 teams.ambassador_profile_id («lo trajo tal embajador») ───

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS ambassador_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.teams.ambassador_profile_id IS
  'Embajador que trajo a este equipo (lo cargó el capitán en «¿Quién los invitó?»). Sólo se escribe con set_team_ambassador.';

CREATE INDEX IF NOT EXISTS teams_ambassador_profile_idx
  ON public.teams (ambassador_profile_id) WHERE ambassador_profile_id IS NOT NULL;

-- UPDATE ya está cerrado por columna (sólo name, zone, ...). El INSERT del
-- cliente sí es amplio: nadie puede crear un equipo ya «traído» por su cuenta.
CREATE OR REPLACE FUNCTION public.teams_clear_ambassador_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.ambassador_profile_id IS NOT NULL
     AND current_user IN ('anon', 'authenticated') THEN
    NEW.ambassador_profile_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_teams_clear_ambassador ON public.teams;
CREATE TRIGGER trg_teams_clear_ambassador
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_clear_ambassador_on_insert();


-- ─── 1.4 Helpers internos (sin acceso desde la API) ─────────

CREATE OR REPLACE FUNCTION public.ambassador_program_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_program_enabled'), 0) = 1;
$function$;

REVOKE ALL ON FUNCTION public.ambassador_program_enabled() FROM PUBLIC, anon, authenticated;

-- Equipos que un perfil puede tener como propios: es integrante, no es un
-- equipo traído, no está excluido y no es el propio de otro embajador.
CREATE OR REPLACE FUNCTION public.ambassador_eligible_teams(p_profile_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.team_id
    FROM public.team_members m
    JOIN public.teams t ON t.id = m.team_id
   WHERE m.profile_id = p_profile_id
     AND t.ambassador_profile_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.ambassador_exclusions x WHERE x.team_id = m.team_id)
     AND NOT EXISTS (SELECT 1 FROM public.ambassadors a
                      WHERE a.own_team_id = m.team_id AND a.profile_id <> p_profile_id);
$function$;

REVOKE ALL ON FUNCTION public.ambassador_eligible_teams(uuid) FROM PUBLIC, anon, authenticated;


-- ─── 1.5 upsert_ambassador ──────────────────────────────────
-- Inscripción y edición. Crear exige las dos casillas (bases y mayoría de
-- edad); editar sólo cambia Instagram y ranking. Si el Instagram cambia, el
-- follow verificado deja de valer.

CREATE OR REPLACE FUNCTION public.upsert_ambassador(
  p_instagram       text,
  p_show_in_ranking boolean,
  p_accept_terms    boolean,
  p_confirm_adult   boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller   uuid;
  v_ig       text;
  v_existing public.ambassadors%ROWTYPE;
  v_teams    uuid[];
BEGIN
  SELECT id INTO v_caller FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF NOT public.ambassador_program_enabled() THEN
    RETURN 'noop_disabled';
  END IF;

  v_ig := btrim(ltrim(lower(btrim(coalesce(p_instagram, ''))), '@'));
  IF v_ig = '' OR v_ig !~ '^[a-z0-9._]{1,30}$' THEN
    RETURN 'noop_instagram';
  END IF;

  SELECT * INTO v_existing FROM public.ambassadors WHERE profile_id = v_caller FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status <> 'ACTIVO' THEN
      RETURN 'noop_suspended';
    END IF;
    UPDATE public.ambassadors
       SET instagram          = v_ig,
           show_in_ranking    = coalesce(p_show_in_ranking, show_in_ranking),
           follow_verified_at = CASE WHEN v_ig <> v_existing.instagram THEN NULL ELSE follow_verified_at END,
           follow_verified_by = CASE WHEN v_ig <> v_existing.instagram THEN NULL ELSE follow_verified_by END
     WHERE profile_id = v_caller;
    RETURN 'updated';
  END IF;

  IF NOT coalesce(p_accept_terms, false) OR NOT coalesce(p_confirm_adult, false) THEN
    RETURN 'noop_terms';
  END IF;

  INSERT INTO public.ambassadors (profile_id, instagram, show_in_ranking, terms_version)
  VALUES (
    v_caller, v_ig, coalesce(p_show_in_ranking, false),
    coalesce((SELECT value FROM public.app_settings WHERE key = 'ambassador_terms_version'), 1)::integer
  );

  -- Si está en un único equipo elegible, ese queda como propio sin preguntar.
  SELECT array_agg(team_id) INTO v_teams FROM public.ambassador_eligible_teams(v_caller) AS team_id;
  IF coalesce(array_length(v_teams, 1), 0) = 1 THEN
    UPDATE public.ambassadors
       SET own_team_id = v_teams[1], own_team_set_at = now()
     WHERE profile_id = v_caller;
  END IF;

  RETURN 'created';
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_ambassador(text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_ambassador(text, boolean, boolean, boolean) TO authenticated;


-- ─── 1.6 set_ambassador_own_team ────────────────────────────
-- p_team_id NULL = sacar el equipo propio. Se puede cambiar mientras el equipo
-- propio no tuvo su primer partido válido (own_team_first_match_id nulo).

CREATE OR REPLACE FUNCTION public.set_ambassador_own_team(p_team_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_amb    public.ambassadors%ROWTYPE;
BEGIN
  SELECT id INTO v_caller FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF NOT public.ambassador_program_enabled() THEN
    RETURN 'noop_disabled';
  END IF;

  SELECT * INTO v_amb FROM public.ambassadors WHERE profile_id = v_caller FOR UPDATE;
  IF NOT FOUND OR v_amb.status <> 'ACTIVO' THEN
    RETURN 'noop_not_ambassador';
  END IF;

  IF v_amb.own_team_first_match_id IS NOT NULL THEN
    RETURN 'noop_locked';
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND profile_id = v_caller) THEN
      RETURN 'noop_not_member';
    END IF;
    IF EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id AND ambassador_profile_id IS NOT NULL) THEN
      RETURN 'noop_team_brought';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ambassador_exclusions WHERE team_id = p_team_id) THEN
      RETURN 'noop_excluded';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ambassadors WHERE own_team_id = p_team_id AND profile_id <> v_caller) THEN
      RETURN 'noop_team_taken';
    END IF;
  END IF;

  UPDATE public.ambassadors
     SET own_team_id = p_team_id, own_team_set_at = now()
   WHERE profile_id = v_caller;
  RETURN 'applied';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_ambassador_own_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ambassador_own_team(uuid) TO authenticated;


-- ─── 1.7 Asignación automática del equipo propio ────────────
-- Si un embajador ACTIVO sin equipo propio crea un equipo o se suma a uno y
-- queda con exactamente un equipo elegible, ese pasa a ser el propio. Nunca
-- pisa un own_team_id ya cargado.

CREATE OR REPLACE FUNCTION public.ambassador_auto_own_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teams uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ambassadors
                  WHERE profile_id = NEW.profile_id AND status = 'ACTIVO' AND own_team_id IS NULL) THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(team_id) INTO v_teams FROM public.ambassador_eligible_teams(NEW.profile_id) AS team_id;
  IF coalesce(array_length(v_teams, 1), 0) = 1 THEN
    UPDATE public.ambassadors
       SET own_team_id = v_teams[1], own_team_set_at = now()
     WHERE profile_id = NEW.profile_id AND own_team_id IS NULL AND status = 'ACTIVO';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.ambassador_auto_own_team() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ambassador_auto_own_team ON public.team_members;
CREATE TRIGGER trg_ambassador_auto_own_team
  AFTER INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.ambassador_auto_own_team();


-- ─── 1.8 set_ambassador_payout_alias ────────────────────────

CREATE OR REPLACE FUNCTION public.set_ambassador_payout_alias(p_alias text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_alias  text := btrim(coalesce(p_alias, ''));
BEGIN
  SELECT id INTO v_caller FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ambassadors WHERE profile_id = v_caller) THEN
    RETURN 'noop_not_ambassador';
  END IF;

  IF length(v_alias) NOT BETWEEN 6 AND 40 THEN
    RETURN 'noop_invalid';
  END IF;

  UPDATE public.ambassadors SET payout_alias = v_alias WHERE profile_id = v_caller;
  RETURN 'applied';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_ambassador_payout_alias(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ambassador_payout_alias(text) TO authenticated;


-- ─── 1.9 set_team_ambassador ────────────────────────────────
-- El capitán de un equipo recién creado carga el usuario del embajador que los
-- invitó. Vale hasta 24 h después de creado y mientras no tenga partidos
-- FINALIZADO; después queda fijo.

CREATE OR REPLACE FUNCTION public.set_team_ambassador(p_team_id uuid, p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid;
  v_amb        uuid;
  v_team       public.teams%ROWTYPE;
  v_username   text := btrim(ltrim(lower(btrim(coalesce(p_username, ''))), '@'));
BEGIN
  SELECT id INTO v_caller FROM public.profiles WHERE auth_user_id = auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: perfil no encontrado para el usuario actual';
  END IF;

  IF NOT public.ambassador_program_enabled() THEN
    RETURN 'noop_disabled';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.team_members
                  WHERE team_id = p_team_id AND profile_id = v_caller AND role = 'CAPITAN') THEN
    RETURN 'noop_not_captain';
  END IF;

  SELECT p.id INTO v_amb
    FROM public.profiles p
    JOIN public.ambassadors a ON a.profile_id = p.id AND a.status = 'ACTIVO'
   WHERE lower(p.username) = v_username;
  IF v_amb IS NULL THEN
    RETURN 'noop_invalid';
  END IF;

  IF v_amb = v_caller THEN
    RETURN 'noop_self';
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF v_team.ambassador_profile_id IS NOT NULL THEN
    RETURN 'noop_already_set';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ambassador_exclusions WHERE team_id = p_team_id) THEN
    RETURN 'noop_excluded';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ambassadors WHERE own_team_id = p_team_id) THEN
    RETURN 'noop_is_own_team';
  END IF;

  IF v_team.created_at < now() - interval '24 hours'
     OR EXISTS (SELECT 1 FROM public.matches
                 WHERE status = 'FINALIZADO' AND (team_a_id = p_team_id OR team_b_id = p_team_id)) THEN
    RETURN 'noop_too_late';
  END IF;

  UPDATE public.teams SET ambassador_profile_id = v_amb WHERE id = p_team_id;
  RETURN 'applied';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_team_ambassador(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_ambassador(uuid, text) TO authenticated;


-- ─── 1.10 get_team_create_ambassador_prefill ────────────────
-- Al crear un equipo, «¿Quién los invitó?» sale precargado con el embajador
-- que invitó al propio capitán (profiles.referred_by), si sigue activo.

CREATE OR REPLACE FUNCTION public.get_team_create_ambassador_prefill()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_username text;
BEGIN
  IF NOT public.ambassador_program_enabled() THEN
    RETURN NULL;
  END IF;

  SELECT r.username INTO v_username
    FROM public.profiles me
    JOIN public.profiles r ON r.id = me.referred_by
    JOIN public.ambassadors a ON a.profile_id = r.id AND a.status = 'ACTIVO'
   WHERE me.auth_user_id = auth.uid();

  RETURN v_username;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_team_create_ambassador_prefill() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_create_ambassador_prefill() TO authenticated;


-- ─── 1.11 Insignia «Embajador» → «Reclutador» ───────────────
-- El slug no cambia: lo usan la app 1.0.0 y constants/podium.ts. «Embajador»
-- pasa a ser el nombre del programa pago.

UPDATE public.badges SET name = 'Reclutador' WHERE slug = 'embajador';
