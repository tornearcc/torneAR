-- ============================================================
-- 400-moderation-alerts — El aviso que sostiene las 24 horas (pgTAP)
-- ============================================================
-- Cubre `public.enqueue_moderation_alerts` (migración 20260911190000).
--
-- Los Términos prometen revisar las denuncias dentro de las 24 horas
-- (cláusula 10, versión 12) y la guideline 1.2 lo exige. Sin este job, ese
-- plazo dependía de que un admin entrara al panel por iniciativa propia.
--
-- Lo que más importa verificar no es que avise, sino que avise UNA sola vez:
-- el job corre cada 15 minutos, así que un aviso no idempotente convertiría
-- cada denuncia en una lluvia de push hasta que alguien la atienda, y el
-- efecto práctico sería que los admins silencien las notificaciones.
--
-- ⚠️ El setup fija el conjunto de admins desde cero en vez de agregar uno.
-- El seed ya trae admins propios (`0b000000-…` y `0b5a0000-…`), así que
-- limitarse a marcar uno más dejaba los conteos dependiendo de cuántos
-- hubiera sembrado el seed — que fue exactamente cómo falló la primera
-- versión de esta suite. Todo corre dentro de la transacción del archivo, así
-- que el `update` masivo muere en el rollback.
--
-- Aserciones:
--   A-1  Avisa al admin que no denunció.
--   A-2  No le avisa a quien denunció, aunque sea admin.
--   A-3  No avisa a nadie que no sea admin.
--   A-4  Es idempotente: correrlo de nuevo no duplica.
--   A-5  No avisa de denuncias ya resueltas.
--   A-6  Una denuncia nueva sí genera aviso después de la primera corrida.
-- ============================================================

begin;
select plan(6);

-- ── Setup ───────────────────────────────────────────────────────────────────
-- Conjunto de admins conocido: 0004 (que además denuncia) y 0001 (que recibe).
update profiles set is_admin = false;
update profiles set is_admin = true where id in (
  '33333333-3333-3333-3333-000000000004',
  '33333333-3333-3333-3333-000000000001');

delete from notifications where type = 'DENUNCIA_NUEVA';

insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason, status) values
  ('e5e5e5e5-0000-0000-0000-00000000dd01', '33333333-3333-3333-3333-000000000004',
   'USER', '33333333-3333-3333-3333-000000000001', 'Acoso o amenazas', 'PENDING'),
  ('e5e5e5e5-0000-0000-0000-00000000dd02', '33333333-3333-3333-3333-000000000004',
   'USER', '33333333-3333-3333-3333-000000000001', 'Spam', 'DISMISSED');

select public.enqueue_moderation_alerts();

select is(
  (select count(*) from notifications
    where type = 'DENUNCIA_NUEVA'
      and profile_id = '33333333-3333-3333-3333-000000000001'
      and data->>'report_id' = 'e5e5e5e5-0000-0000-0000-00000000dd01'),
  1::bigint,
  'A-1: el admin que no denunció recibe el aviso');

select is(
  (select count(*) from notifications
    where type = 'DENUNCIA_NUEVA'
      and profile_id = '33333333-3333-3333-3333-000000000004'),
  0::bigint,
  'A-2: quien denunció no recibe aviso de su propia denuncia');

-- Se afirma sobre el conjunto y no sobre un id concreto: así la aserción vale
-- aunque el seed cambie de perfiles.
select is_empty(
  $$ select 1 from notifications n
      join profiles p on p.id = n.profile_id
     where n.type = 'DENUNCIA_NUEVA' and not p.is_admin $$,
  'A-3: ningún usuario común recibe avisos de moderación');

-- ── Idempotencia ────────────────────────────────────────────────────────────
select public.enqueue_moderation_alerts();
select public.enqueue_moderation_alerts();

select is(
  (select count(*) from notifications where type = 'DENUNCIA_NUEVA'),
  1::bigint,
  'A-4: correr el job tres veces deja un solo aviso — corre cada 15 minutos');

select is(
  (select count(*) from notifications
    where type = 'DENUNCIA_NUEVA'
      and data->>'report_id' = 'e5e5e5e5-0000-0000-0000-00000000dd02'),
  0::bigint,
  'A-5: una denuncia ya desestimada no genera aviso');

-- ── Una denuncia nueva después de la primera corrida ────────────────────────
insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason, status)
values ('e5e5e5e5-0000-0000-0000-00000000dd03', '33333333-3333-3333-3333-000000000004',
        'USER', '33333333-3333-3333-3333-000000000001', 'Suplantación de identidad', 'PENDING');

select public.enqueue_moderation_alerts();

select is(
  (select count(*) from notifications
    where type = 'DENUNCIA_NUEVA'
      and data->>'report_id' = 'e5e5e5e5-0000-0000-0000-00000000dd03'),
  1::bigint,
  'A-6: la denuncia siguiente sí genera su aviso');

select * from finish();
rollback;
