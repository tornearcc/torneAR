-- ============================================================
-- 630-instagram-insights — estadísticas de Instagram (pgTAP)
-- ============================================================
-- Cubre 20261005120000 (P2-8). El capitán de Tigres (auth …0004) hace de
-- admin sólo dentro de esta transacción.
--
--   I-1..I-2  service_instagram_insights_upsert escribe un día y una
--             métrica que no vino no borra la que ya estaba.
--   I-3       las escrituras exigen service_role.
--   I-4       service_instagram_media_upsert guarda un snapshot por
--             publicación y día.
--   I-5..I-6  dashboard_instagram_insights rellena el rango con NULL y
--             dashboard_instagram_posts trae el último snapshot de cada post.
--   I-7       las lecturas exigen is_admin.
--   I-8       ninguna de las dos tablas se lee ni se escribe desde la API.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(8);

update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

insert into social_accounts (platform, handle, display_name, is_active)
select 'instagram', 'tornear.app', 'torneAR', true
where not exists (select 1 from social_accounts where platform = 'instagram');

-- ── I-1..I-3 ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.service_instagram_insights_upsert(
  (select id from social_accounts where platform = 'instagram'), '2026-10-03',
  '{"reach": 1406, "views": 2868, "profile_views": 110, "website_clicks": 7, "total_interactions": 147, "shares": 30}'::jsonb);
select public.service_instagram_insights_upsert(
  (select id from social_accounts where platform = 'instagram'), '2026-10-03',
  '{"views": 2900}'::jsonb);

select results_eq(
  $$ select day, views, reach, website_clicks from social_insights_daily $$,
  $$ values ('2026-10-03'::date, 2900, 1406, 7) $$,
  'I-1: el día se guarda y la corrida nueva actualiza lo que trae');

select is(
  (select profile_views from social_insights_daily where day = '2026-10-03'),
  110,
  'I-2: una métrica que no vino no borra la que ya estaba');

-- ── I-4 ─────────────────────────────────────────────────────────────────────
select public.service_instagram_media_upsert(
  (select id from social_accounts where platform = 'instagram'), '2026-10-04',
  '[{"id": "m1", "type": "REELS", "posted_at": "2026-10-03T22:50:36+0000", "caption": "Ya llegó TorneAR", "views": 3000, "reach": 2000, "shares": 30, "ig_reels_avg_watch_time": 7324},
    {"id": "m2", "type": "FEED", "posted_at": "2026-09-14T15:00:00+0000", "views": 120}]'::jsonb);
select public.service_instagram_media_upsert(
  (select id from social_accounts where platform = 'instagram'), '2026-10-05',
  '[{"id": "m1", "type": "REELS", "posted_at": "2026-10-03T22:50:36+0000", "caption": "Ya llegó TorneAR", "views": 3488, "reach": 2170, "shares": 38, "ig_reels_avg_watch_time": 7324}]'::jsonb);

select is(
  (select count(*)::int from social_media_snapshots),
  3,
  'I-4: un snapshot por publicación y día de corrida');
select set_config('request.jwt.claims', null, true);

select throws_matching(
  $$ select public.service_instagram_insights_upsert((select id from social_accounts where platform = 'instagram'), '2026-10-04', '{}'::jsonb) $$,
  '^NOT_AUTHORIZED',
  'I-3: escribir estadísticas exige service_role');

-- ── I-5..I-7 ────────────────────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select results_eq(
  $$ select day, views from public.dashboard_instagram_insights('2026-10-02', '2026-10-04') $$,
  $$ values ('2026-10-02'::date, null::int), ('2026-10-03'::date, 2900), ('2026-10-04'::date, null::int) $$,
  'I-5: todos los días del rango, los que no tienen dato en NULL');

select results_eq(
  $$ select media_id, views, shares, avg_watch_ms from public.dashboard_instagram_posts('2026-10-01', '2026-10-05') $$,
  $$ values ('m1', 3488, 38, 7324) $$,
  'I-6: publicaciones del rango con su último snapshot');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select throws_matching(
  $$ select * from public.dashboard_instagram_insights() $$,
  '^NOT_AUTHORIZED',
  'I-7: las estadísticas exigen is_admin');
select tests.clear_auth();

-- ── I-8 ─────────────────────────────────────────────────────────────────────
select ok(
  not has_table_privilege('anon', 'public.social_insights_daily', 'SELECT')
  and not has_table_privilege('authenticated', 'public.social_insights_daily', 'SELECT')
  and not has_table_privilege('authenticated', 'public.social_insights_daily', 'INSERT')
  and not has_table_privilege('anon', 'public.social_media_snapshots', 'SELECT')
  and not has_table_privilege('authenticated', 'public.social_media_snapshots', 'SELECT')
  and not has_table_privilege('authenticated', 'public.social_media_snapshots', 'INSERT'),
  'I-8: las tablas de estadísticas no se leen ni se escriben directo desde la API');

select * from finish();
rollback;
