-- ============================================================
-- Candado y normalización de teams.zone (D-55)
-- 2026-09-28 · Registro P3-9 · Tanda 3 · tarjeta #54
-- ------------------------------------------------------------
-- `teams.zone` es texto libre sin FK contra `zones`, y el capitán la podía
-- cambiar cuando quisiera. Dos problemas:
--   1. Si se renombra una zona, los equipos quedan con un nombre que ya no
--      existe (y `season_standings.zone_id`, que resuelve por nombre exacto,
--      congela esa zona huérfana al cerrar la temporada).
--   2. Con ranking de barrios, los equipos se mudarían a la zona que va
--      ganando. D-55: un cambio de zona por temporada, con excepción de admin.
--
-- ── Normalización: triggers, no FK ──────────────────────────────────────────
-- Una FK `teams.zone → zones(name)` sería lo más sólido, pero 21 archivos de
-- pgTAP crean equipos con zonas inventadas (ZQRM, ZDISP, ...) y
-- 410-season-standings prueba a propósito un equipo con zona fuera del
-- catálogo. Mismo criterio que el candado de género (F3): las reglas valen
-- para lo que escribe la app (`authenticated`/`anon`); las funciones SECURITY
-- DEFINER, las migraciones y los tests pasan.
--   · Validación: la zona de un equipo que crea o edita la app tiene que
--     existir en `zones` (ZONE_UNKNOWN). Hoy no hay ningún equipo fuera del
--     catálogo (verificado el 28/09: 0 de 13 zonas en uso).
--   · Renombres: `zones_propagate_rename` lleva el nombre nuevo a
--     `teams.zone`. No cuenta como mudanza (no se registra ni consume el
--     cambio de la temporada).
--
-- ── Candado ─────────────────────────────────────────────────────────────────
-- `team_zone_changes` registra cada mudanza con la temporada activa. Desde la
-- app, la segunda mudanza de la temporada se rechaza con ZONE_LOCKED. Sin
-- temporada activa no hay candado (entre el cierre de una y el inicio de la
-- siguiente, el cambio no cuenta para ninguna).
--
-- ── Excepción de admin ──────────────────────────────────────────────────────
-- `admin_set_team_zone(team, zone, motivo)`: exige is_admin y motivo, registra
-- la mudanza como excepción (no consume el cambio del equipo) y deja
-- `admin.set_team_zone` en app_logs.
-- ============================================================

-- ── 1. Registro de mudanzas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_zone_changes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season_id         uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  from_zone         text NOT NULL,
  to_zone           text NOT NULL,
  changed_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_admin_override boolean NOT NULL DEFAULT false,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_zone_changes_team_season_idx
  ON public.team_zone_changes (team_id, season_id);

ALTER TABLE public.team_zone_changes ENABLE ROW LEVEL SECURITY;

-- Sólo lectura para admins (el dashboard). Nadie escribe desde el cliente: la
-- tabla la llenan el trigger y la RPC de admin.
DROP POLICY IF EXISTS team_zone_changes_admin_select ON public.team_zone_changes;
CREATE POLICY team_zone_changes_admin_select ON public.team_zone_changes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = (SELECT auth.uid()) AND p.is_admin
  ));

REVOKE ALL ON public.team_zone_changes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.team_zone_changes FROM authenticated;
GRANT SELECT ON public.team_zone_changes TO authenticated;

COMMENT ON TABLE public.team_zone_changes IS
  'Mudanzas de zona de los equipos (D-55). Una por temporada desde la app; las excepciones de admin (is_admin_override) no consumen ese cambio. La llenan enforce/log_team_zone_change y admin_set_team_zone (20260928240000).';


-- ── 2. Validación y candado (BEFORE) ────────────────────────────────────────
-- Dos funciones porque hacen falta dos identidades:
--   · El trigger corre con el rol de quien escribe (SECURITY INVOKER): es la
--     única forma de saber si el UPDATE viene de la app (`authenticated`).
--   · La consulta corre como dueño (SECURITY DEFINER): la RLS de
--     team_zone_changes sólo deja leer a los admins, y con la sesión del
--     capitán el candado no vería su propia mudanza.
CREATE OR REPLACE FUNCTION public.assert_team_zone_change_allowed(
  p_team_id   uuid,
  p_zone      text,
  p_is_update boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_season_id   uuid;
  v_season_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.zones z WHERE z.name = p_zone) THEN
    RAISE EXCEPTION 'ZONE_UNKNOWN: la zona «%» no está en el catálogo', p_zone;
  END IF;

  IF NOT p_is_update THEN
    RETURN;
  END IF;

  SELECT s.id, s.name INTO v_season_id, v_season_name
    FROM public.seasons s WHERE s.is_active
   ORDER BY s.starts_at DESC LIMIT 1;

  IF v_season_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_zone_changes c
     WHERE c.team_id = p_team_id AND c.season_id = v_season_id AND NOT c.is_admin_override
  ) THEN
    RAISE EXCEPTION 'ZONE_LOCKED: el equipo ya cambió de zona en %. Vas a poder cambiarla de nuevo cuando empiece la próxima temporada', v_season_name;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_team_zone_change_allowed(uuid, text, boolean) IS
  'D-55. Levanta ZONE_UNKNOWN si la zona no está en el catálogo y ZONE_LOCKED si el equipo ya se mudó en la temporada activa (sin contar excepciones de admin). La llama el trigger teams_zone_rules (20260928240000).';

CREATE OR REPLACE FUNCTION public.enforce_team_zone_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Lo que escribe la app nunca es una excepción de admin, aunque la
  -- transacción traiga la variable (ver log_team_zone_change).
  PERFORM set_config('tornear.zone_override_reason', '', true);

  IF TG_OP = 'UPDATE' AND NEW.zone IS NOT DISTINCT FROM OLD.zone THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_team_zone_change_allowed(NEW.id, NEW.zone, TG_OP = 'UPDATE');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS teams_zone_rules ON public.teams;
CREATE TRIGGER teams_zone_rules
  BEFORE INSERT OR UPDATE OF zone ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.enforce_team_zone_rules();


-- ── 3. Registro de la mudanza (AFTER) ───────────────────────────────────────
-- Registra toda mudanza real. La excepción de admin trae su motivo en la
-- variable de transacción `tornear.zone_override_reason` (la pone
-- admin_set_team_zone); un renombre de zona trae `tornear.zone_rename = on` y
-- no se registra. PostgREST no le da al cliente forma de poner variables, y
-- aunque la tuviera, enforce_team_zone_rules borra el motivo en todo UPDATE
-- que llega desde la app, antes de que corra este trigger.
CREATE OR REPLACE FUNCTION public.log_team_zone_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(current_setting('tornear.zone_override_reason', true), '')), '');
BEGIN
  IF NEW.zone IS NOT DISTINCT FROM OLD.zone
     OR coalesce(current_setting('tornear.zone_rename', true), '') = 'on'
  THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.team_zone_changes
    (team_id, season_id, from_zone, to_zone, changed_by, is_admin_override, reason)
  VALUES (
    NEW.id,
    (SELECT s.id FROM public.seasons s WHERE s.is_active ORDER BY s.starts_at DESC LIMIT 1),
    OLD.zone,
    NEW.zone,
    (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid()),
    v_reason IS NOT NULL,
    v_reason
  );

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS teams_zone_change_log ON public.teams;
CREATE TRIGGER teams_zone_change_log
  AFTER UPDATE OF zone ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.log_team_zone_change();


-- ── 4. Renombre de una zona ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zones_propagate_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM set_config('tornear.zone_rename', 'on', true);
    UPDATE public.teams SET zone = NEW.name WHERE zone = OLD.name;
    PERFORM set_config('tornear.zone_rename', '', true);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS zones_rename_propagation ON public.zones;
CREATE TRIGGER zones_rename_propagation
  AFTER UPDATE OF name ON public.zones
  FOR EACH ROW EXECUTE FUNCTION public.zones_propagate_rename();


-- ── 5. Excepción de admin ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_team_zone(
  p_team_id uuid,
  p_zone    text,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_auth_user_id uuid := auth.uid();
  v_team_name          text;
  v_previous           text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = v_admin_auth_user_id AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  -- La excepción es para casos reales (un equipo que se muda de verdad): el
  -- motivo deja constancia, como en admin_set_profile_gender.
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: indicá el motivo del cambio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.zones z WHERE z.name = p_zone) THEN
    RAISE EXCEPTION 'ZONE_UNKNOWN: la zona «%» no está en el catálogo', p_zone;
  END IF;

  SELECT name, zone INTO v_team_name, v_previous
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND: equipo % no encontrado', p_team_id;
  END IF;

  IF v_previous IS NOT DISTINCT FROM p_zone THEN
    RETURN jsonb_build_object('teamId', p_team_id, 'previous', v_previous,
                              'zone', p_zone, 'changed', false);
  END IF;

  PERFORM set_config('tornear.zone_override_reason', btrim(p_reason), true);
  UPDATE public.teams SET zone = p_zone WHERE id = p_team_id;
  PERFORM set_config('tornear.zone_override_reason', '', true);

  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'info',
    'admin.set_team_zone',
    jsonb_build_object(
      'team_id',   p_team_id,
      'team_name', v_team_name,
      'previous',  v_previous,
      'zone',      p_zone,
      'reason',    btrim(p_reason)
    ),
    v_admin_auth_user_id
  );

  RETURN jsonb_build_object('teamId', p_team_id, 'previous', v_previous,
                            'zone', p_zone, 'changed', true);
END;
$function$;

COMMENT ON FUNCTION public.admin_set_team_zone(uuid, text, text) IS
  'D-55. Excepción al candado de zona (una mudanza por temporada): exige is_admin y motivo, no consume el cambio del equipo y deja admin.set_team_zone en app_logs (20260928240000).';


-- ── 6. Permisos ─────────────────────────────────────────────────────────────
-- Supabase da EXECUTE a anon y authenticated sobre toda función nueva de
-- `public`: las internas se cierran a mano. La de admin queda para
-- authenticated (chequea is_admin adentro, como las demás admin_*).
REVOKE ALL ON FUNCTION public.enforce_team_zone_rules() FROM PUBLIC, anon, authenticated;
-- La llama el trigger con el rol del cliente, así que `authenticated`
-- necesita EXECUTE. Llamarla directo sólo dice si el cambio se permitiría.
REVOKE ALL ON FUNCTION public.assert_team_zone_change_allowed(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_team_zone_change_allowed(uuid, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.log_team_zone_change()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zones_propagate_rename()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_team_zone(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_team_zone(uuid, text, text) TO authenticated;
