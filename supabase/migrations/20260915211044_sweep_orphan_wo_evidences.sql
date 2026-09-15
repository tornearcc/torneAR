-- ============================================================
-- Barrido diario de evidencias de WO sin reclamo — 2026-09-15
-- ------------------------------------------------------------
-- Problema:
--   Un objeto de `wo_evidences` puede quedar sin ningún reclamo que lo
--   referencie por dos caminos:
--     1. `claimWo` (lib/match-actions.ts) sube la foto ANTES de llamar a
--        `claim_wo`, y si la RPC falla (partido en un estado inválido, equipo
--        sin check-in, goleadores inválidos) la foto queda y nadie la borra.
--     2. Se borra un partido: `wo_claims` cae en cascada (ON DELETE CASCADE),
--        pero el archivo sigue en el bucket. Así apareció el huérfano del 28/07.
--
-- Solución: una función que lista los objetos del bucket con más de 24 horas
-- y sin reclamo asociado, y los borra por la Storage API vía `pg_net`, más un
-- job de `pg_cron` que la corre una vez por día.
--
-- Por qué la Storage API y no un DELETE sobre storage.objects:
--   `storage.protect_delete` bloquea el borrado directo, y aunque se lo saltee,
--   borrar la fila deja el archivo en el almacenamiento. Sólo la API borra las
--   dos cosas.
--
-- Por qué 24 horas:
--   La subida y la RPC ocurren segundos una de otra; 24 horas deja un margen
--   holgado para que un reclamo en curso nunca pierda su foto.
--
-- Por qué un barrido y no un trigger sobre wo_claims ni un cambio en la app:
--   El barrido cubre los dos caminos de arriba con un solo mecanismo, no
--   depende de la versión de la app que tenga cada usuario y no necesita una
--   policy de DELETE sobre storage.objects.
--
-- Secreto: `storage_service_role_key` en Vault (la service_role legacy). Lo
--   carga un humano desde el dashboard; nunca va en un archivo versionado. Si
--   falta, la función no borra nada y deja un `warn` en app_logs. En el stack
--   local no existe, así que el job local nunca llama a producción.
--
-- Uso manual:
--   select * from public.sweep_orphan_wo_evidences(p_dry_run := true);
--   lista lo que borraría, sin encolar ningún pedido.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sweep_orphan_wo_evidences(
  p_dry_run boolean DEFAULT false,
  p_limit   integer DEFAULT 500
)
RETURNS TABLE (objeto text, subido_at timestamptz, request_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key   text;
  v_base  constant text := 'https://yusfykqimalghmmhlfdn.supabase.co/storage/v1/object/wo_evidences/';
  v_row   record;
  v_count integer := 0;
BEGIN
  IF NOT p_dry_run THEN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets
     WHERE name = 'storage_service_role_key';

    IF v_key IS NULL THEN
      INSERT INTO public.app_logs (level, message, details)
      VALUES (
        'warn',
        'Barrido de evidencias de WO omitido: falta el secreto storage_service_role_key en Vault',
        jsonb_build_object('scope', 'sweep_orphan_wo_evidences')
      );
      RETURN;
    END IF;
  END IF;

  FOR v_row IN
    SELECT o.name, o.created_at
      FROM storage.objects o
     WHERE o.bucket_id = 'wo_evidences'
       AND o.created_at < now() - interval '24 hours'
       AND NOT EXISTS (
         SELECT 1
           FROM public.wo_claims c
          WHERE c.photo_url = o.name
             -- Reclamos viejos con la URL pública completa guardada en vez del path.
             OR c.photo_url LIKE '%/wo_evidences/' || o.name
       )
     ORDER BY o.created_at
     LIMIT p_limit
  LOOP
    objeto     := v_row.name;
    subido_at  := v_row.created_at;
    request_id := NULL;

    IF NOT p_dry_run THEN
      request_id := net.http_delete(
        url     := v_base || v_row.name,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_key,
          'apikey',        v_key
        )
      );
    END IF;

    v_count := v_count + 1;
    RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run AND v_count > 0 THEN
    INSERT INTO public.app_logs (level, message, details)
    VALUES (
      'info',
      'Barrido de evidencias de WO sin reclamo',
      jsonb_build_object('scope', 'sweep_orphan_wo_evidences', 'objetos', v_count)
    );
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.sweep_orphan_wo_evidences(boolean, integer) IS
  'Borra por la Storage API (pg_net) los objetos de wo_evidences con más de 24 h y sin reclamo en wo_claims. p_dry_run = true sólo lista. Usa el secreto storage_service_role_key de Vault; si falta, no borra y deja un warn en app_logs. La corre el job sweep-orphan-wo-evidences.';

-- Borra archivos con la service_role: nadie la llama desde la API.
REVOKE ALL ON FUNCTION public.sweep_orphan_wo_evidences(boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_orphan_wo_evidences(boolean, integer) FROM anon, authenticated;

-- ─── Job diario ─────────────────────────────────────────────────────────────
-- Idempotente por nombre: cron.schedule reemplaza la definición si ya existe.
-- 06:50 UTC (03:50 AR), a los :50 para no pisar los jobs de cada hora
-- (:00 mercado, */15 recordatorios y moderación, :20 y :40 barridos de partidos).
SELECT cron.schedule(
  'sweep-orphan-wo-evidences', '50 6 * * *',
  $$select public.sweep_orphan_wo_evidences();$$
);
