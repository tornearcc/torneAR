-- ============================================================
-- 620-team-solo-nudge — aviso al capitán de un equipo solo (pgTAP)
-- ============================================================
-- Cubre 20260930120000 (Tanda 7, P1-11). Fixtures de seed_testing:
--   · Gamma Nuevo (…c0): sólo su capitán (…0008). Es el equipo que se avisa.
--   · Beta United (…b0): tres integrantes. Nunca se avisa.
--   · Los Leones FC, Tigres Palermo, Rayos del Norte: un capitán cada uno;
--     se usan para los casos que NO avisan (baja, cuenta eliminada, demo).
-- Al arrancar, todos los equipos pasan a «recién creados» para que ningún
-- otro equipo del seed entre en la corrida.
--
--   N-1  aviso 1: equipo solo de 24 h o más → ANUNCIO al capitán con team_id y url.
--   N-2  otra corrida enseguida no repite.
--   N-3  aviso 2: 48 h después del aviso 1, si sigue solo.
--   N-4  después del aviso 2 no insiste.
--   N-5  un equipo con compañeros, uno recién creado, uno dado de baja, uno de
--        una cuenta eliminada y uno excluido (demo) no reciben nada.
--   N-6  ni anon ni authenticated ejecutan la función ni leen team_nudges.
--   N-7  el cron corre a las 14 y 21 UTC.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(10);

update teams set created_at = now();

update teams set created_at = now() - interval '2 days'
 where id in ('0c000000-0000-0000-0000-0000000000c0',   -- Gamma: se avisa
              '0c000000-0000-0000-0000-0000000000b0',   -- Beta: tiene compañeros
              '22222222-2222-2222-2222-222222222221',   -- Leones: dado de baja
              '22222222-2222-2222-2222-222222222222',   -- Tigres: cuenta eliminada
              '22222222-2222-2222-2222-222222222223');  -- Rayos: excluido (demo)

update teams set is_active = false where id = '22222222-2222-2222-2222-222222222221';
update profiles set username = 'usuario_eliminado_x' where id = '33333333-3333-3333-3333-000000000004';
insert into team_nudges (team_id, stage, note) values
  ('22222222-2222-2222-2222-222222222223', 1, 'Excluido (test)'),
  ('22222222-2222-2222-2222-222222222223', 2, 'Excluido (test)');

-- ── N-1 ─────────────────────────────────────────────────────────────────────
select is(public.nudge_solo_team_captains(), 1, 'N-1: la primera corrida manda un solo aviso');

select results_eq(
  $$ select profile_id, type::text, data->>'stage', data->>'team_id', data->>'url'
       from notifications where data->>'kind' = 'team_solo_nudge' $$,
  $$ values ('0b000000-0000-0000-0000-000000000008'::uuid, 'ANUNCIO', '1',
             '0c000000-0000-0000-0000-0000000000c0',
             'tornear://team-manage?teamId=0c000000-0000-0000-0000-0000000000c0') $$,
  'N-1: el aviso 1 va al capitán del equipo solo, como ANUNCIO con team_id y url');

-- ── N-2 ─────────────────────────────────────────────────────────────────────
select is(public.nudge_solo_team_captains(), 0, 'N-2: otra corrida enseguida no repite el aviso');

-- ── N-3 ─────────────────────────────────────────────────────────────────────
update team_nudges set sent_at = now() - interval '47 hours'
 where team_id = '0c000000-0000-0000-0000-0000000000c0' and stage = 1;
select is(public.nudge_solo_team_captains(), 0, 'N-3: antes de 48 h del aviso 1 no manda el 2');

update team_nudges set sent_at = now() - interval '49 hours'
 where team_id = '0c000000-0000-0000-0000-0000000000c0' and stage = 1;
select is(public.nudge_solo_team_captains(), 1, 'N-3: 48 h después del aviso 1, manda el aviso 2');

-- Dentro de la transacción now() no avanza: se cuenta por aviso en vez de
-- ordenar por created_at.
select results_eq(
  $$ select data->>'stage', count(*)::int from notifications
      where data->>'kind' = 'team_solo_nudge' group by 1 order by 1 $$,
  $$ values ('1', 1), ('2', 1) $$,
  'N-3: queda un aviso 1 y un aviso 2');

-- ── N-4 ─────────────────────────────────────────────────────────────────────
update team_nudges set sent_at = now() - interval '30 days'
 where team_id = '0c000000-0000-0000-0000-0000000000c0';
select is(public.nudge_solo_team_captains(), 0, 'N-4: después del aviso 2 no insiste');

-- ── N-5 ─────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from notifications
    where data->>'kind' = 'team_solo_nudge'
      and data->>'team_id' <> '0c000000-0000-0000-0000-0000000000c0'),
  0,
  'N-5: con compañeros, recién creado, de baja, de una cuenta eliminada o excluido: sin aviso');

-- ── N-6 ─────────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.nudge_solo_team_captains()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.nudge_solo_team_captains()', 'EXECUTE')
  and not has_table_privilege('anon', 'public.team_nudges', 'SELECT')
  and not has_table_privilege('authenticated', 'public.team_nudges', 'SELECT')
  and not has_table_privilege('authenticated', 'public.team_nudges', 'INSERT'),
  'N-6: la función y team_nudges no se tocan desde la API');

-- ── N-7 ─────────────────────────────────────────────────────────────────────
select results_eq(
  $$ select schedule, command from cron.job where jobname = 'nudge-solo-team-captains' $$,
  $$ values ('0 14,21 * * *'::text, 'SELECT public.nudge_solo_team_captains()'::text) $$,
  'N-7: el cron corre a las 14 y 21 UTC (11 y 18 h en Argentina)');

select * from finish();
rollback;
