-- ============================================================
-- Barrido de huérfanos de avatars: job diario
-- 2026-09-25
-- ------------------------------------------------------------
-- Activa `sweep_orphan_avatars` (20260925140000). La primera corrida en
-- producción fue en modo sólo listado (`sweep_orphan_avatars(true)`) y dio 0
-- filas: el bucket había quedado limpio con la limpieza manual del mismo día.
--
-- Idempotente por nombre: cron.schedule reemplaza la definición si ya existe.
-- 06:55 UTC (03:55 AR), cinco minutos después del barrido de evidencias de WO
-- (06:50) y lejos de los jobs de cada hora (:00 mercado, */15 recordatorios y
-- moderación, :20 y :40 barridos de partidos).
-- ============================================================

SELECT cron.schedule(
  'sweep-orphan-avatars', '55 6 * * *',
  $$select public.sweep_orphan_avatars();$$
);
