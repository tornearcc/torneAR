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
--   2. Premios y barrido: ambassador_rewards, sweep_ambassador_rewards() y su
--      cron (ambassador-rewards-sweep, a los :30 de cada hora).
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
    -- Nunca bloquea el INSERT en team_members: si otro embajador tomó el mismo
    -- equipo como propio en paralelo (índice único), éste se queda sin propio.
    BEGIN
      UPDATE public.ambassadors
         SET own_team_id = v_teams[1], own_team_set_at = now()
       WHERE profile_id = NEW.profile_id AND own_team_id IS NULL AND status = 'ACTIVO';
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
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
-- FINALIZADO; después queda fijo. Un embajador nunca «trae» un equipo del que
-- es o fue integrante (p. ej. lo creó, le pasó la capitanía a un amigo y se
-- fue): eso devuelve noop_ambassador_member (R8).
--
-- Devuelve: applied · noop_disabled · noop_not_captain · noop_invalid ·
-- noop_self · noop_already_set · noop_ambassador_member · noop_excluded ·
-- noop_is_own_team · noop_too_late.

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

  IF EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND profile_id = v_amb)
     OR EXISTS (SELECT 1 FROM public.team_stints WHERE team_id = p_team_id AND profile_id = v_amb) THEN
    RETURN 'noop_ambassador_member';
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


-- ════════════════════════════════════════════════════════════
-- PARTE 2 — PREMIOS Y BARRIDO
-- ════════════════════════════════════════════════════════════
-- Premios (ambassador_reward_amount = $5.000 los dos primeros):
--   · TEAM_BROUGHT: un equipo traído juega su primer partido válido contra
--     cualquier equipo. Una vez por equipo, para siempre (aunque se rechace).
--   · DEBUT: el primer partido válido del equipo propio (desde que lo eligió)
--     es contra un equipo que trajo el embajador. Se evalúa una sola vez
--     (own_team_first_match_id); si ese partido es contra otro, se pierde.
--   · BONUS_5 / BONUS_10: al llegar a 5 y a 10 TEAM_BROUGHT no rechazados.
-- Tope: ambassador_max_paid_teams TEAM_BROUGHT no rechazados. Con el tope
-- alcanzado no se crea ningún premio, salvo el bono que dispara el último
-- TEAM_BROUGHT. Un RECHAZADO libera el lugar (para otros equipos).

-- ─── 2.1 ambassador_rewards ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ambassador_rewards (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind                  text        NOT NULL CHECK (kind IN ('TEAM_BROUGHT', 'DEBUT', 'BONUS_5', 'BONUS_10')),
  team_id               uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  match_id              uuid        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  amount                numeric     NOT NULL,
  counted_profile_ids   uuid[]      NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'PAGADO', 'RECHAZADO')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  paid_at               timestamptz,
  paid_by               uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  note                  text
);

COMMENT ON TABLE public.ambassador_rewards IS
  'Programa de embajadores v2 (P3-14). Premios generados por sweep_ambassador_rewards. team_id: TEAM_BROUGHT = el equipo traído; DEBUT = el traído rival; BONUS_* = el traído que llevó al umbral. counted_profile_ids: integrantes que contaron para un TEAM_BROUGHT (no vuelven a contar para otro del mismo embajador). Un BONUS_* rechazado con nota «Bajó de …» es un rechazo automático y se puede volver a generar; uno rechazado a mano, no.';

-- Un equipo cobra un solo TEAM_BROUGHT; un embajador, un solo DEBUT y cada bono.
CREATE UNIQUE INDEX IF NOT EXISTS ambassador_rewards_team_brought_uidx
  ON public.ambassador_rewards (team_id) WHERE kind = 'TEAM_BROUGHT' AND status <> 'RECHAZADO';
CREATE UNIQUE INDEX IF NOT EXISTS ambassador_rewards_once_per_ambassador_uidx
  ON public.ambassador_rewards (ambassador_profile_id, kind)
  WHERE kind IN ('DEBUT', 'BONUS_5', 'BONUS_10') AND status <> 'RECHAZADO';
-- Índices de FK y de las búsquedas del barrido.
CREATE INDEX IF NOT EXISTS ambassador_rewards_ambassador_idx
  ON public.ambassador_rewards (ambassador_profile_id, kind, status);
CREATE INDEX IF NOT EXISTS ambassador_rewards_team_idx
  ON public.ambassador_rewards (team_id, kind);
CREATE INDEX IF NOT EXISTS ambassador_rewards_match_idx
  ON public.ambassador_rewards (match_id);
CREATE INDEX IF NOT EXISTS ambassador_rewards_paid_by_idx
  ON public.ambassador_rewards (paid_by) WHERE paid_by IS NOT NULL;

ALTER TABLE public.ambassador_rewards ENABLE ROW LEVEL SECURITY;
-- Sin policies: sólo el barrido (SECURITY DEFINER) y el dashboard (service role).
REVOKE ALL ON public.ambassador_rewards FROM anon, authenticated;


-- ─── 2.2 Helpers internos ───────────────────────────────────

-- Titulares por formato. NULL si no conoce el formato (o no hay formato).
CREATE OR REPLACE FUNCTION public.ambassador_required_members(p_format public.team_format)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE p_format
           WHEN 'FUTBOL_5'  THEN 5
           WHEN 'FUTBOL_6'  THEN 6
           WHEN 'FUTBOL_7'  THEN 7
           WHEN 'FUTBOL_8'  THEN 8
           WHEN 'FUTBOL_9'  THEN 9
           WHEN 'FUTBOL_11' THEN 11
         END;
$function$;

REVOKE ALL ON FUNCTION public.ambassador_required_members(public.team_format) FROM PUBLIC, anon, authenticated;

-- Integrantes de un equipo en un momento dado (team_stints), sin cuentas
-- eliminadas.
CREATE OR REPLACE FUNCTION public.ambassador_team_members_at(p_team_id uuid, p_at timestamptz)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT s.profile_id
    FROM public.team_stints s
    JOIN public.profiles p ON p.id = s.profile_id
   WHERE s.team_id = p_team_id
     AND s.started_at <= p_at
     AND (s.ended_at IS NULL OR s.ended_at > p_at)
     AND p.username NOT LIKE 'usuario\_eliminado\_%';
$function$;

REVOKE ALL ON FUNCTION public.ambassador_team_members_at(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- ¿Se puede generar este bono? Sí, si no tiene uno no rechazado y todos los
-- rechazados que tuvo fueron automáticos (nota «Bajó de …»). Uno rechazado a
-- mano es definitivo (R2).
CREATE OR REPLACE FUNCTION public.ambassador_bonus_allowed(p_profile_id uuid, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.ambassador_rewards r
     WHERE r.ambassador_profile_id = p_profile_id
       AND r.kind = p_kind
       AND (r.status <> 'RECHAZADO' OR coalesce(r.note, '') NOT LIKE 'Bajó de%')
  );
$function$;

REVOKE ALL ON FUNCTION public.ambassador_bonus_allowed(uuid, text) FROM PUBLIC, anon, authenticated;


-- ─── 2.3 sweep_ambassador_rewards ───────────────────────────
-- Recorre en orden (finished_at, id) los partidos válidos que todavía pueden
-- dar algo: un lado es un equipo traído (embajador ACTIVO) que nunca tuvo un
-- TEAM_BROUGHT (R1: ni siquiera rechazado), o es el equipo propio de un
-- embajador ACTIVO todavía sin primer partido. Partido válido: FINALIZADO,
-- los dos check-ins, desde el arranque del programa, sin equipos excluidos,
-- con formato y los dos equipos con al menos los titulares como integrantes
-- al finished_at (sin cuentas eliminadas).
--
-- Re-evalúa todo en cada corrida (sin marca de agua): un traído que no llegó
-- al mínimo puede cobrar en un partido posterior y un lugar liberado por un
-- rechazo lo toma el siguiente en orden. Devuelve cuántos premios creó.

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
  v_used      integer;
  v_created   integer := 0;
  v_cap_hit   boolean := false;
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
       AND m.finished_at >= v_start
       AND NOT EXISTS (SELECT 1 FROM public.ambassador_exclusions x
                        WHERE x.team_id IN (m.team_a_id, m.team_b_id))
       AND (
         EXISTS (SELECT 1
                   FROM public.teams t
                   JOIN public.ambassadors a ON a.profile_id = t.ambassador_profile_id AND a.status = 'ACTIVO'
                  WHERE t.id IN (m.team_a_id, m.team_b_id)
                    AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards r
                                     WHERE r.team_id = t.id AND r.kind = 'TEAM_BROUGHT'))
         OR EXISTS (SELECT 1 FROM public.ambassadors a
                     WHERE a.status = 'ACTIVO'
                       AND a.own_team_id IN (m.team_a_id, m.team_b_id)
                       AND a.own_team_first_match_id IS NULL
                       AND m.finished_at >= a.own_team_set_at)
       )
     ORDER BY m.finished_at, m.id
  LOOP
    v_req := public.ambassador_required_members(v_m.format);
    CONTINUE WHEN v_req IS NULL;
    CONTINUE WHEN (SELECT count(*) FROM public.ambassador_team_members_at(v_m.team_a_id, v_m.finished_at)) < v_req
               OR (SELECT count(*) FROM public.ambassador_team_members_at(v_m.team_b_id, v_m.finished_at)) < v_req;

    v_new_ids := '{}';

    -- 1. Equipos traídos que juegan su primer partido válido (que paga).
    FOR v_side IN
      SELECT t.id AS team_id, t.ambassador_profile_id AS amb, a.own_team_id
        FROM public.teams t
        JOIN public.ambassadors a ON a.profile_id = t.ambassador_profile_id AND a.status = 'ACTIVO'
       WHERE t.id IN (v_m.team_a_id, v_m.team_b_id)
         AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards r
                          WHERE r.team_id = t.id AND r.kind = 'TEAM_BROUGHT')
       ORDER BY (t.id = v_m.team_a_id) DESC
    LOOP
      -- R8: si el embajador es integrante del traído, ese partido no paga.
      CONTINUE WHEN v_side.amb IN (SELECT public.ambassador_team_members_at(v_side.team_id, v_m.finished_at));

      -- Un jugador suma para un solo equipo por embajador: afuera el propio
      -- embajador, los de su equipo propio y los ya contados en otro traído.
      SELECT coalesce(array_agg(pid ORDER BY pid), '{}') INTO v_counted
        FROM public.ambassador_team_members_at(v_side.team_id, v_m.finished_at) AS pid
       WHERE pid <> v_side.amb
         AND (v_side.own_team_id IS NULL
              OR pid NOT IN (SELECT public.ambassador_team_members_at(v_side.own_team_id, v_m.finished_at)))
         AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards r
                          WHERE r.ambassador_profile_id = v_side.amb
                            AND r.kind = 'TEAM_BROUGHT'
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
        v_cap_hit := true;
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
         AND a.own_team_first_match_id IS NULL
         AND v_m.finished_at >= a.own_team_set_at
       FOR UPDATE
    LOOP
      CONTINUE WHEN v_own.profile_id NOT IN
        (SELECT public.ambassador_team_members_at(v_own.own_team_id, v_m.finished_at));

      UPDATE public.ambassadors SET own_team_first_match_id = v_m.id WHERE profile_id = v_own.profile_id;

      v_rival := CASE WHEN v_own.own_team_id = v_m.team_a_id THEN v_m.team_b_id ELSE v_m.team_a_id END;
      IF EXISTS (SELECT 1 FROM public.teams WHERE id = v_rival AND ambassador_profile_id = v_own.profile_id)
         AND NOT EXISTS (SELECT 1 FROM public.ambassador_rewards
                          WHERE ambassador_profile_id = v_own.profile_id AND kind = 'DEBUT' AND status <> 'RECHAZADO') THEN
        IF v_used >= v_max THEN
          v_cap_hit := true;   -- con el tope alcanzado el debut se pierde
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

COMMENT ON FUNCTION public.sweep_ambassador_rewards() IS
  'Programa de embajadores v2 (P3-14). Genera TEAM_BROUGHT, DEBUT y BONUS_5/10 a partir de los partidos válidos, respetando el tope ambassador_max_paid_teams, y avisa al embajador (ANUNCIO + push). La corre el cron ambassador-rewards-sweep; devuelve cuántos premios creó.';

REVOKE ALL ON FUNCTION public.sweep_ambassador_rewards() FROM PUBLIC, anon, authenticated;

-- Cae en :30 como pide 20260929170000 (Disk IO). Idempotente por nombre.
SELECT cron.schedule(
  'ambassador-rewards-sweep',
  '30 * * * *',
  $$SELECT public.sweep_ambassador_rewards()$$
);
