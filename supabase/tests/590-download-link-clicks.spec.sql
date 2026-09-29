-- ============================================================
-- 590-download-link-clicks — clicks en los links de descarga (pgTAP)
-- ============================================================
-- Cubre 20260929150000 (#37). El capitán de Tigres (auth …0004) hace de admin
-- sólo dentro de esta transacción.
--
--   L-1..L-3  log_link_click registra un canal de la lista (también como
--             anon), normaliza la plataforma e ignora un canal desconocido.
--   L-4       nadie lee ni escribe link_clicks directo desde la API.
--   L-5..L-6  dashboard_link_clicks devuelve los cuatro canales con sus
--             conteos y exige is_admin.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(6);

update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

-- ── L-1..L-3 ────────────────────────────────────────────────────────────────
set local role anon;
select lives_ok(
  $$ select public.log_link_click('wpp', 'ios') $$,
  'L-1: anon registra un click de un canal de la lista');
select public.log_link_click('wpp', 'android');
select public.log_link_click('story', 'Windows NT');
select public.log_link_click('tiktok', 'ios');
select public.log_link_click(null, 'ios');
reset role;

select results_eq(
  $$ select channel, platform from link_clicks order by id $$,
  $$ values ('wpp', 'ios'), ('wpp', 'android'), ('story', 'otro') $$,
  'L-2: se guardan canal y plataforma, y una plataforma desconocida queda como otro');

select is(
  (select count(*)::int from link_clicks where channel not in ('dm', 'wpp', 'story', 'cancha')),
  0,
  'L-3: un canal fuera de la lista (o nulo) no se registra');

-- ── L-4 ─────────────────────────────────────────────────────────────────────
select ok(
  not has_table_privilege('anon', 'public.link_clicks', 'SELECT')
  and not has_table_privilege('anon', 'public.link_clicks', 'INSERT')
  and not has_table_privilege('authenticated', 'public.link_clicks', 'SELECT')
  and not has_table_privilege('authenticated', 'public.link_clicks', 'INSERT'),
  'L-4: link_clicks no se lee ni se escribe directo desde la API');

-- ── L-5..L-6 ────────────────────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select results_eq(
  $$ select channel, clicks, ios, android, otro from public.dashboard_link_clicks() $$,
  $$ values ('dm', 0::bigint, 0::bigint, 0::bigint, 0::bigint),
            ('wpp', 2::bigint, 1::bigint, 1::bigint, 0::bigint),
            ('story', 1::bigint, 0::bigint, 0::bigint, 1::bigint),
            ('cancha', 0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'L-5: el resumen trae los cuatro canales, también los que tienen 0');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select throws_matching(
  $$ select * from public.dashboard_link_clicks() $$,
  '^NOT_AUTHORIZED',
  'L-6: el resumen exige is_admin');
select tests.clear_auth();

select * from finish();
rollback;
