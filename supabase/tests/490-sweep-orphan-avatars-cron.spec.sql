-- ============================================================
-- 490-sweep-orphan-avatars-cron — job diario del barrido (pgTAP)
-- ============================================================
-- Cubre 20260925150000: el job existe, corre a las 06:55 UTC, llama a
-- sweep_orphan_avatars en modo real (no dry-run) y está activo.
-- ============================================================

begin;
select plan(3);

select is(
  (select schedule from cron.job where jobname = 'sweep-orphan-avatars'),
  '55 6 * * *',
  'el job sweep-orphan-avatars corre todos los días a las 06:55 UTC');

select is(
  (select command from cron.job where jobname = 'sweep-orphan-avatars'),
  'select public.sweep_orphan_avatars();',
  'y llama al barrido en modo real (sin dry-run)');

select ok(
  (select active from cron.job where jobname = 'sweep-orphan-avatars'),
  'y está activo');

select * from finish();
rollback;
