-- ============================================================
-- 520-push-dispatch-retry — timeout y reintento del push (pgTAP)
-- ============================================================
-- Cubre 20260927120000:
--   R-1  send_push_dispatch arma el pedido con timeout de 30 s.
--   R-2  Ni el helper ni el reintento son ejecutables por anon/authenticated.
--   R-3  El job retry-pending-pushes existe, corre cada 15 minutos (20260929170000) y está activo.
--   R-4  El reintento corre sin error.
--   R-5  Con secretos, reenvía sólo lo que está en la ventana de 2 min a 2 h
--        y sin pushed_at: ni la recién creada, ni la vieja, ni la ya empujada.
--   R-6  Deja un warn en app_logs con la cantidad y los ids reenviados.
--
-- Los secretos de Vault los crea g1_a2 (20260711032948) en cualquier base;
-- si faltaran, se crean acá. pg_net sólo encola el pedido y el rollback lo
-- descarta: nada sale de la base de test.
-- ============================================================

begin;
select plan(8);

-- ── R-1 ─────────────────────────────────────────────────────────────────────
select ok(
  pg_get_functiondef('public.send_push_dispatch(jsonb)'::regprocedure)
    like '%timeout_milliseconds := 30000%',
  'R-1: send_push_dispatch pide la edge function con timeout de 30 s');

-- ── R-2 ─────────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.send_push_dispatch(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.send_push_dispatch(jsonb)', 'EXECUTE'),
  'R-2a: send_push_dispatch no es ejecutable desde la API');

select ok(
  not has_function_privilege('authenticated', 'public.retry_pending_pushes(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.retry_pending_pushes(integer)', 'EXECUTE'),
  'R-2b: retry_pending_pushes no es ejecutable desde la API');

-- ── R-3 ─────────────────────────────────────────────────────────────────────
select results_eq(
  $$ select schedule, command, active from cron.job where jobname = 'retry-pending-pushes' $$,
  $$ values ('*/15 * * * *'::text, 'select public.retry_pending_pushes();'::text, true) $$,
  'R-3: el job corre cada 15 minutos, llama al reintento y está activo');

-- ── Setup ───────────────────────────────────────────────────────────────────
-- Las notificaciones del seed se dan por empujadas para aislar el caso.
update notifications set pushed_at = now() where pushed_at is null;

-- Cuatro filas: en ventana (10 min), recién creada (30 s), vieja (3 h) y en
-- ventana pero ya empujada.
insert into notifications (id, profile_id, type, title, body, created_at, pushed_at) values
  ('5e5e5e5e-0000-0000-0000-000000000001', '33333333-3333-3333-3333-000000000001',
   'TEMPORADA_INICIADA', 'En ventana', 'x', now() - interval '10 minutes', null),
  ('5e5e5e5e-0000-0000-0000-000000000002', '33333333-3333-3333-3333-000000000001',
   'TEMPORADA_INICIADA', 'Recién creada', 'x', now() - interval '30 seconds', null),
  ('5e5e5e5e-0000-0000-0000-000000000003', '33333333-3333-3333-3333-000000000001',
   'TEMPORADA_INICIADA', 'Vieja', 'x', now() - interval '3 hours', null),
  ('5e5e5e5e-0000-0000-0000-000000000004', '33333333-3333-3333-3333-000000000001',
   'TEMPORADA_INICIADA', 'Ya empujada', 'x', now() - interval '10 minutes', now());

-- ── R-4 / R-5 / R-6 ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_url') then
    perform vault.create_secret('http://127.0.0.1:9/push-dispatch', 'push_dispatch_url');
  end if;
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_secret') then
    perform vault.create_secret('pgtap-secret', 'push_dispatch_secret');
  end if;
end $$;

select lives_ok(
  $$ select public.retry_pending_pushes(0) $$,
  'R-4: el reintento corre sin error');

select is(
  public.retry_pending_pushes(),
  1,
  'R-5: con secretos reenvía sólo la fila en ventana y sin pushed_at');

select is(
  (select (details->>'count')::int from app_logs
    where message = 'push-dispatch: reintento de notificaciones sin procesar'
    order by created_at desc limit 1),
  1,
  'R-6a: deja un warn en app_logs con la cantidad reenviada');

select ok(
  (select details->'notificationIds' ? '5e5e5e5e-0000-0000-0000-000000000001'
     from app_logs
    where message = 'push-dispatch: reintento de notificaciones sin procesar'
    order by created_at desc limit 1),
  'R-6b: y con el id de la notificación reenviada');

select * from finish();
rollback;
