-- ============================================================
-- Barrido de archivos huérfanos del bucket avatars
-- 2026-09-25
-- ------------------------------------------------------------
-- 20260925130000 borra la foto anterior al cambiarla y todas al dar de baja,
-- pero quedan dos fuentes de huérfanos:
--   · Fotos que eran evidencia de una denuncia USER abierta: el trigger las
--     saltea mientras la denuncia está PENDING, y si después se desestima o
--     se marca revisada, nadie las borra.
--   · Borrados de pg_net que fallaron (red, Storage caído): la request se
--     pierde y el archivo queda.
-- Este barrido los levanta con el mismo mecanismo que el de las evidencias de
-- WO (20260915211044): Storage API por pg_net, secreto storage_service_role_key.
--
-- ── Qué borra ───────────────────────────────────────────────────────────────
-- Objetos de avatars que:
--   · no referencia ningún perfil (avatar_url, en cualquiera de sus formatos:
--     path o URL pública; ver avatar_object_path),
--   · no son evidencia de una denuncia USER PENDING
--     (avatar_file_in_open_report), y
--   · tienen más de `sweep_orphan_avatars_min_age_hours` (app_settings, 24 h).
--     El margen no es decorativo: la app sube el archivo ANTES de actualizar
--     el perfil, así que sin él el barrido podría borrar una foto recién
--     subida en el medio de ese cambio.
--
-- ── Registro ────────────────────────────────────────────────────────────────
-- Cada corrida real deja un `avatar.orphan_sweep` en app_logs con cuántos
-- candidatos encontró, cuántos pidió borrar y el umbral usado, aunque sean 0:
-- así se ve que el job corre. El detalle de paths queda en el
-- `avatar.file_deletion_requested` de request_avatar_file_deletion.
-- `p_dry_run = true` sólo lista y no registra nada.
--
-- ── Sin cron todavía ────────────────────────────────────────────────────────
-- Esta migración NO programa el job: la primera corrida en producción es en
-- modo sólo listado (`select * from sweep_orphan_avatars(true)`) y se revisa
-- antes de activarlo. El cron va en una migración aparte, después del OK.
-- ============================================================

INSERT INTO public.app_settings (key, value, description)
VALUES ('sweep_orphan_avatars_min_age_hours', 24,
        'Antigüedad mínima (horas) de un archivo de avatars sin referencia para que sweep_orphan_avatars lo borre. Protege la foto recién subida: la app sube el archivo antes de actualizar el perfil.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sweep_orphan_avatars(
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
    (SELECT value FROM public.app_settings WHERE key = 'sweep_orphan_avatars_min_age_hours'), 24);
  v_paths     text[] := '{}';
  v_bytes     bigint := 0;
  v_requested integer := 0;
  v_row       record;
BEGIN
  FOR v_row IN
    SELECT o.name, o.created_at, coalesce((o.metadata->>'size')::bigint, 0) AS size
      FROM storage.objects o
     WHERE o.bucket_id = 'avatars'
       AND o.created_at < now() - make_interval(secs => (v_hours * 3600)::double precision)
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles p
          WHERE public.avatar_object_path(p.avatar_url) = o.name
       )
       AND NOT public.avatar_file_in_open_report(o.name)
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

  v_requested := public.request_avatar_file_deletion(
    v_paths, jsonb_build_object('scope', 'sweep_orphan_avatars'));

  INSERT INTO public.app_logs (level, message, details)
  VALUES ('info', 'avatar.orphan_sweep',
          jsonb_build_object(
            'candidatos', coalesce(array_length(v_paths, 1), 0),
            'pedidos_de_borrado', v_requested,
            'bytes', v_bytes,
            'min_age_hours', v_hours));
END;
$fn$;

REVOKE ALL ON FUNCTION public.sweep_orphan_avatars(boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_orphan_avatars(boolean, integer) FROM anon, authenticated;

COMMENT ON FUNCTION public.sweep_orphan_avatars(boolean, integer) IS
  'Borra por la Storage API (request_avatar_file_deletion, pg_net) los objetos de avatars sin referencia en profiles ni en denuncias USER PENDING y con más de app_settings.sweep_orphan_avatars_min_age_hours. Cubre la evidencia de denuncias ya cerradas y los borrados de pg_net que fallaron. p_dry_run = true sólo lista. Cada corrida real registra avatar.orphan_sweep en app_logs (20260925140000). El cron se programa aparte.';
