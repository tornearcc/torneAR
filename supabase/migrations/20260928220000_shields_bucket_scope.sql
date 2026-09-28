-- ============================================================
-- Bucket shields: quién sube escudos y barrido de huérfanos
-- 2026-09-28 · Registro P2-10 · Tanda 3
-- ------------------------------------------------------------
-- Problema (verificado en producción el 27/09):
--   · "Usuarios autenticados suben escudos" (INSERT) y "Usuarios autenticados
--     actualizan escudos" (UPDATE) sólo chequeaban `bucket_id = 'shields'`.
--     Cualquier usuario logueado podía subir en cualquier carpeta y, con el
--     UPDATE, sobrescribir el escudo de otro equipo.
--   · Los escudos viejos no se borraban: de 20 objetos, 12 no los usaba nadie
--     (11 de equipos disueltos y 1 escudo reemplazado).
--
-- ── 1. Subida: sólo el capitán o el subcapitán, sólo en su carpeta ──────────
-- Calcado de lo que hace la app (`uploadTeamShield`, lib/team-manage-data.ts):
--   <team_id>/shield-<Date.now()>.(jpg|png|webp)
-- y de quién puede editar el equipo (policy `teams_update_by_captain`:
-- CAPITAN o SUBCAPITAN). La app sólo sube escudos desde "Gestionar equipo",
-- con el equipo ya creado, así que la carpeta siempre es un equipo que existe.
-- La policy lee `team_members` y `profiles` con la sesión del usuario: las dos
-- tienen SELECT abierto para autenticados.
--
-- ── 2. Sin policy de UPDATE ─────────────────────────────────────────────────
-- La app sube con `upsert: true`, pero el nombre lleva Date.now(): nunca pisa
-- un objeto existente, igual que las evidencias de WO (20260915205324). Lo
-- único que habilitaba esa policy era sobrescribir escudos ajenos.
--
-- ── 3. Barrido de huérfanos ─────────────────────────────────────────────────
-- Mismo mecanismo que avatars (20260925140000): Storage API por pg_net con el
-- secreto storage_service_role_key. Un objeto de shields es huérfano si:
--   · no lo usa ningún equipo (`teams.shield_url`),
--   · ni el historial (`season_standings.shield_url`, `team_stints.shield_url`):
--     el historial guarda su propia copia del escudo, y un equipo disuelto se
--     sigue viendo ahí;
--   · y tiene más de `sweep_orphan_shields_min_age_hours` (24 h). La app sube
--     el archivo ANTES de actualizar `teams`, así que sin margen el barrido
--     podría borrar un escudo recién subido.
-- Con eso también se cubre "borrar el escudo anterior al cambiarlo": deja de
-- estar en `teams` y el barrido lo levanta al día siguiente. No hace falta un
-- trigger ni que la app borre nada (la app no podría: sin policy SELECT sobre
-- archivos ajenos, un capitán no puede borrar el escudo que subió otro).
--
-- ── Sin cron todavía ────────────────────────────────────────────────────────
-- Como con avatars: la primera corrida en producción es en modo sólo listado
-- (`select * from sweep_orphan_shields(true)`). El cron va en una migración
-- aparte, después de revisar ese listado.
--
-- ⚠️ Bloque tolerante para las policies, igual que las otras migraciones de
--   storage: en el stack local / CI el rol de migraciones no es dueño de
--   storage.objects. pgTAP cubre el barrido; las policies se verifican contra
--   producción en una transacción revertida.
-- ============================================================

-- ── 1 y 2. Policies ─────────────────────────────────────────────────────────
DO $storage$
BEGIN
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios autenticados suben escudos" ON storage.objects $p$;
  EXECUTE $p$ DROP POLICY IF EXISTS "Usuarios autenticados actualizan escudos" ON storage.objects $p$;
  EXECUTE $p$ DROP POLICY IF EXISTS "Capitanes suben el escudo de su equipo" ON storage.objects $p$;
  EXECUTE $p$
    CREATE POLICY "Capitanes suben el escudo de su equipo"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'shields'
        AND array_length(storage.foldername(name), 1) = 1
        AND storage.filename(name) ~ '^shield-[0-9]+\.(jpg|png|webp)$'
        AND EXISTS (
          SELECT 1
          FROM public.team_members tm
          JOIN public.profiles p ON p.id = tm.profile_id
          WHERE tm.team_id::text = (storage.foldername(objects.name))[1]
            AND p.auth_user_id = (SELECT auth.uid())
            AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
        )
      )
  $p$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Storage omitido (sin ownership de storage.objects en el stack local)';
END
$storage$;


-- ── 3. Borrado por la Storage API ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_shields_object_url()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'https://yusfykqimalghmmhlfdn.supabase.co/storage/v1/object/shields/'::text;
$$;

COMMENT ON FUNCTION public.storage_shields_object_url() IS
  'Endpoint de la Storage API para objetos del bucket shields (DELETE <url><path>). Fijo, como storage_avatars_object_url.';

-- Copia de request_avatar_file_deletion (20260925130000) para el bucket shields.
CREATE OR REPLACE FUNCTION public.request_shield_file_deletion(p_paths text[], p_context jsonb DEFAULT '{}'::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_key   text;
  v_path  text;
  v_count integer := 0;
  v_paths text[];
BEGIN
  SELECT array_agg(DISTINCT p) INTO v_paths
  FROM unnest(coalesce(p_paths, '{}'::text[])) AS p
  WHERE p IS NOT NULL AND btrim(p) <> '';

  IF v_paths IS NULL THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'storage_service_role_key';

  IF v_key IS NULL THEN
    INSERT INTO public.app_logs (level, message, details)
    VALUES ('warn', 'shield.file_deletion_skipped',
            p_context || jsonb_build_object('reason', 'falta el secreto storage_service_role_key en Vault', 'paths', to_jsonb(v_paths)));
    RETURN 0;
  END IF;

  FOREACH v_path IN ARRAY v_paths LOOP
    PERFORM net.http_delete(
      url     := public.storage_shields_object_url() || v_path,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key)
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.app_logs (level, message, details)
  VALUES ('info', 'shield.file_deletion_requested', p_context || jsonb_build_object('paths', to_jsonb(v_paths)));

  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.app_logs (level, message, details)
    VALUES ('warn', 'shield.file_deletion_failed', p_context || jsonb_build_object('error', SQLERRM, 'paths', to_jsonb(v_paths)));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_shield_file_deletion: %', SQLERRM;
  END;
  RETURN 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.storage_shields_object_url() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_shield_file_deletion(text[], jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.request_shield_file_deletion(text[], jsonb) IS
  'Encola por pg_net el DELETE de objetos del bucket shields (Storage API, secreto storage_service_role_key de Vault). Nunca levanta: sin secreto o ante un error deja un warn en app_logs y devuelve 0 (20260928220000).';


-- ── 3. Barrido ──────────────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description)
VALUES ('sweep_orphan_shields_min_age_hours', 24,
        'Antigüedad mínima (horas) de un escudo sin referencia para que sweep_orphan_shields lo borre. Protege el escudo recién subido: la app sube el archivo antes de actualizar el equipo.')
ON CONFLICT (key) DO NOTHING;

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
  'Borra por la Storage API (request_shield_file_deletion, pg_net) los objetos de shields que no usa ningún equipo ni el historial (season_standings, team_stints) y con más de app_settings.sweep_orphan_shields_min_age_hours. Cubre equipos disueltos y escudos reemplazados. p_dry_run = true sólo lista. Cada corrida real registra shield.orphan_sweep en app_logs (20260928220000). El cron se programa aparte.';
