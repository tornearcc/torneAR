-- ============================================================
-- APAGAR EL SYNC DIARIO DE INSTAGRAM
-- 2026-09-28 · Registro P2-8
-- ------------------------------------------------------------
-- `instagram-daily-sync` (20260819230000) llama todos los días a la edge
-- function `instagram-sync`, pero no hay ninguna cuenta conectada: sin token,
-- `last_synced_at` nulo y 0 filas en `social_metrics_daily`. Conectarla hoy no
-- es posible: Meta rechaza el login con «Invalid platform app» porque la app de
-- Meta no tiene configurado el producto de Instagram.
--
-- Se apaga el job en vez de borrarlo: la función, el secreto y el resto de la
-- integración quedan como están. Para volver a prenderlo, una vez conectada
-- la cuenta: `SELECT cron.alter_job(<jobid>, active := true)` sobre el job
-- `instagram-daily-sync`, en una migración nueva.
-- ============================================================

SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE jobname = 'instagram-daily-sync';
