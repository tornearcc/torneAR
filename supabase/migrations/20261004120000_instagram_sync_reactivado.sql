-- ============================================================
-- VOLVER A PRENDER EL SYNC DIARIO DE INSTAGRAM
-- 2026-10-04 · Registro P2-8
-- ------------------------------------------------------------
-- Se apagó el 28/09 (20260928200000) porque la app de Meta no tenía el caso
-- de uso de Instagram. El 04/10 se configuró y @tornear.app quedó conectada
-- desde /dashboard/social, con permiso de estadísticas. `instagram-sync`
-- ahora guarda también alcance, vistas, visitas al perfil, toques en el link
-- y las métricas de cada publicación.
--
-- Sólo se prende si hay una cuenta de Instagram con token: eso pasa en
-- producción y no en local ni en CI, donde el job tiene la URL de producción
-- fija y no debe llamarla.
-- ============================================================

SELECT cron.alter_job(jobid, active := true)
FROM cron.job
WHERE jobname = 'instagram-daily-sync'
  AND EXISTS (
    SELECT 1
    FROM public.social_accounts
    WHERE platform = 'instagram'
      AND access_token_secret_id IS NOT NULL
  );
