-- ============================================================
-- Disk IO: agrupar los cron en los mismos minutos y limpiar su historial
-- 2026-09-29 · Mail de Supabase del 25/09 («running out of Disk IO Budget»)
-- ------------------------------------------------------------
-- La base pesa 35 MB y lee casi todo de caché, pero el 28-29/09 generó
-- 6,5 GB de WAL en 24 h (~400 segmentos de 16 MB). Supabase cierra un
-- segmento cada 2 minutos si hubo alguna escritura (archive_timeout = 120) y
-- el backup lo lee y lo sube. Cada corrida de cron escribe (como mínimo, su
-- fila en cron.job_run_details), y los jobs estaban repartidos en minutos
-- distintos (cada 5 min, :20, :40, 06:50, 06:55, 07:02…): casi no quedaban
-- ventanas de 2 minutos sin escritura.
--
-- Ahora todo cae en :00, :15, :30 y :45, así las escrituras de cron se juntan
-- en 96 ventanas por día en vez de más de 300:
--   · retry-pending-pushes: cada 5 min → cada 15. Reintenta notificaciones
--     de entre 2 minutos y 2 horas: un push que falló sale como mucho 15 min
--     después en vez de 5.
--   · sweep-stale-matches: :20 → :15.  sweep-disputed-matches: :40 → :45.
--   · Barridos diarios de archivos (wo_evidences, avatars, shields): 06:50,
--     06:55 y 07:02 → los tres a las 07:00.
--   · purge-cron-history (nuevo, 07:00): borra el historial de cron de más de
--     7 días (tenía 12.859 filas desde el 27/07).
-- Los demás (cada 15 min, cada hora en punto, 12:00, 09:00) ya estaban
-- alineados.
--
-- Complementa el cambio en seed_testing.sql, que evita que el stack local y
-- el CI llamen a push-dispatch de producción.
-- ============================================================

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT j.jobid, x.schedule
      FROM (VALUES
              ('retry-pending-pushes',      '*/15 * * * *'),
              ('sweep-stale-matches',       '15 * * * *'),
              ('sweep-disputed-matches',    '45 * * * *'),
              ('sweep-orphan-wo-evidences', '0 7 * * *'),
              ('sweep-orphan-avatars',      '0 7 * * *'),
              ('sweep-orphan-shields',      '0 7 * * *')
           ) AS x(jobname, schedule)
      JOIN cron.job j ON j.jobname = x.jobname
  LOOP
    PERFORM cron.alter_job(job_id => v_job.jobid, schedule => v_job.schedule);
  END LOOP;
END $$;

-- Idempotente por nombre: cron.schedule reemplaza la definición si ya existe.
SELECT cron.schedule(
  'purge-cron-history',
  '0 7 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
