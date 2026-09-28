-- ============================================================
-- Barrido de huérfanos de shields: job diario
-- 2026-09-28 · Registro P2-10
-- ------------------------------------------------------------
-- Activa `sweep_orphan_shields` (20260928220000). Antes de aplicarla, la
-- corrida en modo sólo listado en producción (`sweep_orphan_shields(true)`)
-- devolvió los 12 huérfanos esperados: 11 escudos de equipos disueltos y uno
-- reemplazado. Ninguno lo usa un equipo ni el historial.
--
-- Idempotente por nombre: cron.schedule reemplaza la definición si ya existe.
-- 07:02 UTC (04:02 AR), siete minutos después del barrido de avatars (06:55) y
-- lejos de los que corren en minutos redondos (:00 mercado, */5 reintento de
-- pushes, */15 recordatorios y moderación, :20 y :40 barridos de partidos).
-- ============================================================

SELECT cron.schedule(
  'sweep-orphan-shields', '2 7 * * *',
  $$select public.sweep_orphan_shields();$$
);
