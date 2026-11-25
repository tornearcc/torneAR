-- ============================================================
-- Escudos prediseñados para los equipos sin foto
-- 2026-11-25 · Registro P3-26 · pedido de Juani (audios del 25/11)
-- ------------------------------------------------------------
-- 15 PNG compartidos en el bucket shields, carpeta presets/
-- (presets/escudo-01.png … escudo-15.png; los genera
-- scripts/generar-escudos-presets.mjs y se suben a mano ANTES de esta
-- migración: el backfill de abajo apunta a esos archivos).
--
-- Un prediseñado se guarda en teams.shield_url como cualquier escudo subido,
-- así que las ~30 pantallas de la app y la web que muestran escudos no
-- cambian.
--
-- 1. default_shield_preset(id): siempre el mismo prediseñado para el mismo
--    equipo (hash del id), para que no cambie entre cargas.
-- 2. Trigger: un equipo nunca queda sin escudo. Al crearlo sin foto, o si
--    shield_url pasa a NULL (moderación: admin_remove_reported_content), toma
--    su prediseñado.
-- 3. Backfill de los equipos que hoy no tienen escudo.
-- 4. sweep_orphan_shields no toca presets/: son compartidos, y un prediseñado
--    que ningún equipo usa hoy lo puede elegir uno mañana.
-- ============================================================

-- ── 1. El prediseñado de cada equipo ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.default_shield_preset(p_team_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 'presets/escudo-'
      || lpad(((abs(hashtext(p_team_id::text)::bigint) % 15) + 1)::text, 2, '0')
      || '.png';
$$;

COMMENT ON FUNCTION public.default_shield_preset(uuid) IS
  'Path del escudo prediseñado (bucket shields, presets/escudo-01..15.png) que le toca a un equipo: siempre el mismo para el mismo id. Lo usa el trigger teams_default_shield (20261125140000, P3-26).';

-- ── 2. Un equipo nunca queda sin escudo ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.teams_default_shield()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.shield_url IS NULL OR btrim(NEW.shield_url) = '' THEN
    NEW.shield_url := public.default_shield_preset(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_default_shield ON public.teams;
CREATE TRIGGER teams_default_shield
  BEFORE INSERT OR UPDATE OF shield_url ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_default_shield();

-- ── 3. Backfill ─────────────────────────────────────────────────────────────
UPDATE public.teams
   SET shield_url = public.default_shield_preset(id)
 WHERE shield_url IS NULL OR btrim(shield_url) = '';

-- ── 4. El barrido de huérfanos no toca presets/ ─────────────────────────────
-- Igual que 20260928220000, con una sola condición más.
CREATE OR REPLACE FUNCTION public.sweep_orphan_shields(
  p_dry_run boolean DEFAULT false,
  p_limit   integer DEFAULT 500
)
RETURNS TABLE (objeto text, subido_at timestamptz, bytes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_hours     numeric := coalesce(
    (SELECT value FROM public.app_settings WHERE key = 'sweep_orphan_shields_min_age_hours'), 24);
  v_paths     text[] := '{}';
  v_bytes     bigint := 0;
  v_requested integer := 0;
  v_row       record;
BEGIN
  FOR v_row IN
    SELECT o.name, o.created_at, coalesce((o.metadata->>'size')::bigint, 0) AS size
      FROM storage.objects o
     WHERE o.bucket_id = 'shields'
       AND o.name NOT LIKE 'presets/%'
       AND o.created_at < now() - make_interval(secs => (v_hours * 3600)::double precision)
       AND NOT EXISTS (SELECT 1 FROM public.teams t            WHERE t.shield_url = o.name)
       AND NOT EXISTS (SELECT 1 FROM public.season_standings s WHERE s.shield_url = o.name)
       AND NOT EXISTS (SELECT 1 FROM public.team_stints s      WHERE s.shield_url = o.name)
     ORDER BY o.created_at
     LIMIT greatest(coalesce(p_limit, 500), 1)
  LOOP
    objeto    := v_row.name;
    subido_at := v_row.created_at;
    bytes     := v_row.size;
    v_paths   := v_paths || v_row.name;
    v_bytes   := v_bytes + v_row.size;
    RETURN NEXT;
  END LOOP;

  IF p_dry_run THEN
    RETURN;
  END IF;

  v_requested := public.request_shield_file_deletion(
    v_paths, jsonb_build_object('scope', 'sweep_orphan_shields'));

  INSERT INTO public.app_logs (level, message, details)
  VALUES ('info', 'shield.orphan_sweep',
          jsonb_build_object(
            'candidatos', coalesce(array_length(v_paths, 1), 0),
            'pedidos_de_borrado', v_requested,
            'bytes', v_bytes,
            'min_age_hours', v_hours));
END;
$fn$;

REVOKE ALL ON FUNCTION public.sweep_orphan_shields(boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_orphan_shields(boolean, integer) FROM anon, authenticated;

COMMENT ON FUNCTION public.sweep_orphan_shields(boolean, integer) IS
  'Borra por la Storage API (request_shield_file_deletion, pg_net) los objetos de shields que no usa ningún equipo ni el historial (season_standings, team_stints) y con más de app_settings.sweep_orphan_shields_min_age_hours. Nunca toca presets/ (escudos prediseñados compartidos, 20261125140000). p_dry_run = true sólo lista. Cada corrida real registra shield.orphan_sweep en app_logs (20260928220000).';
