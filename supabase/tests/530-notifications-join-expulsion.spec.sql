-- ============================================================
-- 530-notifications-join-expulsion — policy de INSERT (pgTAP)
-- ============================================================
-- Cubre 20260927121000:
--   N-1  El capitán que aceptó una solicitud puede notificar al postulante
--        (SOLICITUD_UNION_ACEPTADA), aunque todavía no sea miembro.
--   N-2  Esa fila queda con pushed_at sellado: la app ya mandó el push.
--   N-3  El capitán de OTRO equipo no puede.
--   N-4  La rama (g) no sirve para otros tipos (ROL_ACTUALIZADO al postulante).
--   N-5  Con la solicitud todavía PENDIENTE no se puede notificar la decisión.
--   N-6  El capitán puede notificar a quien expulsó hace menos de 10 minutos.
--   N-7  Una expulsión de hace una hora ya no habilita la notificación.
--   N-8  Insertada por postgres (RPC/cron), la misma notificación NO se sella:
--        el sello es sólo para lo que inserta la app.
--
-- Seed (seed_testing.sql): Leones 2221 (cap P1, auth …0001), Tigres 2222
-- (cap P4, auth …0004), Rayos 2223 (cap P7, auth …0007). Jugador Mercado
-- ef88b757… sin equipo.
-- ============================================================

begin;
select plan(8);

-- ── Setup como postgres ─────────────────────────────────────────────────────
insert into team_join_requests (id, team_id, profile_id, status) values
  ('7a7a7a7a-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222221',
   'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'ACEPTADA'),
  ('7a7a7a7a-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222223',
   'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'PENDIENTE');

insert into team_stints (profile_id, team_id, team_name, started_at, ended_at, leave_reason, last_role) values
  ('ef88b757-4d4e-48b1-b300-51da1cb2e678', '22222222-2222-2222-2222-222222222221', 'Los Leones FC',
   now() - interval '30 days', now() - interval '1 minute', 'EXPULSADO', 'JUGADOR'),
  ('ef88b757-4d4e-48b1-b300-51da1cb2e678', '22222222-2222-2222-2222-222222222222', 'Tigres Palermo',
   now() - interval '60 days', now() - interval '1 hour', 'EXPULSADO', 'JUGADOR');

-- ── Capitán de Leones ───────────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into notifications (id, profile_id, type, title, body)
     values ('6b6b6b6b-0000-0000-0000-000000000001', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
             'SOLICITUD_UNION_ACEPTADA', '¡Solicitud aceptada!', 'x') $$,
  'N-1: el capitán que aceptó la solicitud puede notificar al postulante');

select throws_ok(
  $$ insert into notifications (profile_id, type, title, body)
     values ('ef88b757-4d4e-48b1-b300-51da1cb2e678', 'ROL_ACTUALIZADO', 'Rol', 'x') $$,
  '42501', null,
  'N-4: la rama de la solicitud no habilita otros tipos');

select lives_ok(
  $$ insert into notifications (profile_id, type, title, body)
     values ('ef88b757-4d4e-48b1-b300-51da1cb2e678', 'EXPULSADO_EQUIPO', 'Eliminado del equipo', 'x') $$,
  'N-6: el capitán puede notificar a quien expulsó hace menos de 10 minutos');

-- ── Capitán de Tigres: expulsión de hace una hora ───────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');

select throws_ok(
  $$ insert into notifications (profile_id, type, title, body)
     values ('ef88b757-4d4e-48b1-b300-51da1cb2e678', 'SOLICITUD_UNION_ACEPTADA', 'x', 'x') $$,
  '42501', null,
  'N-3: el capitán de un equipo sin solicitud no puede notificar la aceptación');

select throws_ok(
  $$ insert into notifications (profile_id, type, title, body)
     values ('ef88b757-4d4e-48b1-b300-51da1cb2e678', 'EXPULSADO_EQUIPO', 'x', 'x') $$,
  '42501', null,
  'N-7: una expulsión de hace una hora ya no habilita la notificación');

-- ── Capitán de Rayos: solicitud todavía PENDIENTE ───────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');

select throws_ok(
  $$ insert into notifications (profile_id, type, title, body)
     values ('ef88b757-4d4e-48b1-b300-51da1cb2e678', 'SOLICITUD_UNION_ACEPTADA', 'x', 'x') $$,
  '42501', null,
  'N-5: con la solicitud PENDIENTE no se puede notificar la decisión');

-- ── Verificación como postgres ──────────────────────────────────────────────
select tests.clear_auth();

select ok(
  (select pushed_at is not null from notifications where id = '6b6b6b6b-0000-0000-0000-000000000001'),
  'N-2: la notificación insertada por la app queda con pushed_at sellado');

insert into notifications (id, profile_id, type, title, body)
values ('6b6b6b6b-0000-0000-0000-000000000002', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
        'SOLICITUD_UNION_ACEPTADA', 'desde el servidor', 'x');

select ok(
  (select pushed_at is null from notifications where id = '6b6b6b6b-0000-0000-0000-000000000002'),
  'N-8: insertada por postgres no se sella (la manda push-dispatch)');

select * from finish();
rollback;
