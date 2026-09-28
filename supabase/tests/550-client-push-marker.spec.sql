-- ============================================================
-- 550-client-push-marker — convivencia de apps vieja y nueva (pgTAP)
-- ============================================================
-- Cubre 20260928120000:
--   M-1  App vieja (sin marca): SOLICITUD_UNION_ACEPTADA queda sellada, porque
--        esa app ya mandó el push.
--   M-2  App nueva (data.server_push = true): no se sella; la manda push-dispatch.
--   M-3  La marca en false se trata como app vieja.
--
-- Mismo setup que 530 (seed_testing.sql): capitán de Leones (auth …0001) y el
-- Jugador Mercado (ef88b757…) con una solicitud ACEPTADA a Leones. Replica los
-- grants de producción (deriva P2-7, ver 530).
-- ============================================================

begin;
select plan(3);

grant insert on public.notifications to authenticated;
grant select on public.team_members, public.profiles, public.team_join_requests,
  public.challenges, public.matches, public.team_stints,
  public.market_team_posts, public.market_team_post_applications,
  public.market_player_posts, public.market_player_post_applications
  to authenticated;

insert into team_join_requests (team_id, profile_id, status) values
  ('22222222-2222-2222-2222-222222222221', 'ef88b757-4d4e-48b1-b300-51da1cb2e678', 'ACEPTADA');

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

insert into notifications (id, profile_id, type, title, body, data) values
  ('7c7c7c7c-0000-0000-0000-000000000001', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   'SOLICITUD_UNION_ACEPTADA', 'app vieja', 'x', '{"team_id":"22222222-2222-2222-2222-222222222221"}'),
  ('7c7c7c7c-0000-0000-0000-000000000002', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   'SOLICITUD_UNION_ACEPTADA', 'app nueva', 'x', '{"team_id":"22222222-2222-2222-2222-222222222221","server_push":true}'),
  ('7c7c7c7c-0000-0000-0000-000000000003', 'ef88b757-4d4e-48b1-b300-51da1cb2e678',
   'SOLICITUD_UNION_ACEPTADA', 'marca en false', 'x', '{"server_push":false}');

select tests.clear_auth();

select ok(
  (select pushed_at is not null from notifications where id = '7c7c7c7c-0000-0000-0000-000000000001'),
  'M-1: sin marca (app vieja) se sella: esa app ya mandó el push');

select ok(
  (select pushed_at is null from notifications where id = '7c7c7c7c-0000-0000-0000-000000000002'),
  'M-2: con server_push (app nueva) no se sella: el push lo manda push-dispatch');

select ok(
  (select pushed_at is not null from notifications where id = '7c7c7c7c-0000-0000-0000-000000000003'),
  'M-3: server_push en false cuenta como app vieja');

select * from finish();
rollback;
