-- ============================================================
-- 600-cron-disk-io — los cron caen en los cuartos de hora (pgTAP)
-- ============================================================
-- Cubre 20260929170000. Cada corrida de cron escribe, y Supabase cierra un
-- segmento de WAL cada 2 minutos si hubo escrituras: repartir los jobs en
-- minutos distintos gastaba el Disk IO Budget. Si mañana se suma un job en
-- un minuto suelto, esto lo frena.
--
--   C-1  todos los jobs activos corren en :00, :15, :30 o :45.
--   C-2  existe purge-cron-history y borra el historial de más de 7 días.
-- ============================================================

begin;
select plan(2);

select is_empty(
  $$ select jobname, schedule from cron.job
      where active
        and split_part(schedule, ' ', 1) not in ('0', '15', '30', '45', '*/15', '0,15,30,45') $$,
  'C-1: todos los jobs activos corren en un cuarto de hora (:00, :15, :30, :45)');

select results_eq(
  $$ select schedule, command like '%cron.job_run_details%interval ''7 days''%' from cron.job
      where jobname = 'purge-cron-history' $$,
  $$ values ('0 7 * * *'::text, true) $$,
  'C-2: purge-cron-history borra a diario el historial de cron de más de 7 días');

select * from finish();
rollback;
