-- ============================================================
-- 410-season-standings — Snapshot de posiciones al cerrar temporada (pgTAP)
-- ============================================================
-- Cubre la migración 20260914235000: `season_standings`,
-- `season_standings_formats`, el snapshot dentro de `transition_season` y la
-- propagación de la moderación de equipos a las copias históricas.
--
-- Lo que importa verificar no es sólo «escribe filas», sino que congela lo que
-- el usuario VIO. Por eso las posiciones se comparan contra la propia
-- `get_team_ranking`, consultada antes de la transición: es el oráculo.
--
-- Aserciones:
--   S-1..S-7   Estructura: PKs, FK a seasons con RESTRICT y NINGUNA a teams,
--              RLS, una sola policy de SELECT, sin triggers.
--   G-1..G-3   ACL = el de team_stints, privilegio por privilegio (TRUNCATE
--              aparte: ver G-3).
--   A-1..A-4   Atomicidad: si el snapshot falla, el reset no ocurre.
--   L-1..L-2   Bloqueos en el orden y los modos correctos, con lock_timeout.
--   H-1..H-17  Transición feliz: cantidades, hechos anteriores al reset, zona
--              huérfana, mejor formato, posiciones = get_team_ranking, no
--              elegibles con posición NULL, y el reset por formato (c.2), que
--              el 220 no cubría.
--   I-1..I-7   Inmutabilidad por REST: autenticado lee pero no escribe; anon
--              no ve filas.
--   M-1..M-7   Moderación: nombre y escudo neutralizados en teams,
--              season_standings y team_stints — también de un club disuelto —
--              sin tocar los hechos competitivos.
--
-- Lo que NO se prueba acá: la carrera con dos sesiones. pgTAP corre en una sola
-- transacción; el invariante testeable es que los bloqueos se toman en los modos
-- correctos (L-1). La verificación con dos sesiones se hizo a mano y está
-- documentada en el PR.
--
-- IDs: admin 33333333-...-0004 (auth aaaaaaaa-...-0004) · jugador
-- 33333333-...-0001 (auth aaaaaaaa-...-0001) · equipos de este archivo
-- e5e5e5e5-... · club disuelto d5d5d5d5-... (no existe en teams).
-- ============================================================

begin;
select plan(47);

-- ════════════════════════════════════════════════════════════════════════════
-- S — Estructura
-- ════════════════════════════════════════════════════════════════════════════
select col_is_pk('public', 'season_standings', array['season_id', 'team_id'],
  'S-1: season_standings tiene PK (season_id, team_id)');
select col_is_pk('public', 'season_standings_formats', array['season_id', 'team_id', 'format'],
  'S-2: season_standings_formats tiene PK (season_id, team_id, format)');

-- Una sola FK, a seasons y con RESTRICT. Que no haya otra es la aserción de que
-- team_id no referencia teams: la historia sobrevive a la disolución del club.
select results_eq(
  $$ select confrelid::regclass::text, confdeltype::text from pg_constraint
      where conrelid = 'public.season_standings'::regclass and contype = 'f' $$,
  $$ values ('seasons'::text, 'r'::text) $$,
  'S-3: season_standings sólo tiene FK a seasons (ON DELETE RESTRICT), ninguna a teams');
select results_eq(
  $$ select confrelid::regclass::text, confdeltype::text from pg_constraint
      where conrelid = 'public.season_standings_formats'::regclass and contype = 'f' $$,
  $$ values ('season_standings'::text, 'r'::text) $$,
  'S-4: season_standings_formats cuelga del padre (ON DELETE RESTRICT)');

-- Los `name` del catálogo se castean con COLLATE "default": `name::text`
-- arrastra la collation "C" y results_eq no puede comparar el registro contra
-- literales con la collation por defecto.
select results_eq(
  $$ select relname::text collate "default", relrowsecurity from pg_class
      where oid in ('public.season_standings'::regclass, 'public.season_standings_formats'::regclass)
      order by 1 $$,
  $$ values ('season_standings'::text, true), ('season_standings_formats'::text, true) $$,
  'S-5: RLS habilitado en las dos tablas');

select results_eq(
  $$ select tablename::text collate "default", policyname::text collate "default", cmd,
            roles::text collate "default"
       from pg_policies
      where schemaname = 'public' and tablename in ('season_standings', 'season_standings_formats')
      order by 1 $$,
  $$ values ('season_standings'::text, 'season_standings_select_authenticated'::text, 'SELECT'::text, '{authenticated}'::text),
            ('season_standings_formats', 'season_standings_formats_select_authenticated', 'SELECT', '{authenticated}') $$,
  'S-6: una sola policy por tabla, de SELECT y para authenticated');

-- Sin trigger de bloqueo: bloquearía también al owner, y la moderación tiene
-- que poder corregir la caché de presentación.
select is_empty(
  $$ select 1 from pg_trigger
      where tgrelid in ('public.season_standings'::regclass, 'public.season_standings_formats'::regclass)
        and not tgisinternal $$,
  'S-7: ninguna de las dos tablas tiene triggers');

-- ════════════════════════════════════════════════════════════════════════════
-- G — Privilegios: el molde de team_stints
-- ════════════════════════════════════════════════════════════════════════════
select results_eq(
  $$ select r.rolname, p.priv, has_table_privilege(r.rolname, 'public.season_standings', p.priv)
       from (values ('anon'), ('authenticated')) r(rolname)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(priv)
      order by 1, 2 $$,
  $$ select r.rolname, p.priv, has_table_privilege(r.rolname, 'public.team_stints', p.priv)
       from (values ('anon'), ('authenticated')) r(rolname)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(priv)
      order by 1, 2 $$,
  'G-1: season_standings tiene el mismo ACL que team_stints, privilegio por privilegio');

select results_eq(
  $$ select r.rolname, p.priv, has_table_privilege(r.rolname, 'public.season_standings_formats', p.priv)
       from (values ('anon'), ('authenticated')) r(rolname)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(priv)
      order by 1, 2 $$,
  $$ select r.rolname, p.priv, has_table_privilege(r.rolname, 'public.team_stints', p.priv)
       from (values ('anon'), ('authenticated')) r(rolname)
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(priv)
      order by 1, 2 $$,
  'G-2: season_standings_formats tiene el mismo ACL que team_stints, privilegio por privilegio');

-- TRUNCATE va aparte porque team_stints NO es un buen patrón para ese
-- privilegio fuera de producción: allá su ACL es `rxtm`, pero con las
-- migraciones puras (local y CI) hereda TRUNCATE de los default privileges
-- (ver 010-schema). TRUNCATE saltea RLS, así que acá se afirma literal.
select results_eq(
  $$ select has_table_privilege(r.rolname, t.tbl, 'TRUNCATE')
       from (values ('anon'), ('authenticated')) r(rolname)
      cross join (values ('public.season_standings'), ('public.season_standings_formats')) t(tbl) $$,
  $$ values (false), (false), (false), (false) $$,
  'G-3: nadie de la API puede hacer TRUNCATE de la historia');

-- ════════════════════════════════════════════════════════════════════════════
-- Setup como postgres
-- ════════════════════════════════════════════════════════════════════════════
update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

-- El INSERT en teams crea la fila de FUTBOL_5 en team_rankings (trigger seed).
insert into teams (id, name, category, zone, preferred_format, shield_url) values
  ('e5e5e5e5-0000-0000-0000-000000000001', '__SS Alfa',     'HOMBRES', 'Palermo',         'FUTBOL_5', 'shields/alfa.png'),
  ('e5e5e5e5-0000-0000-0000-000000000002', '__SS Beta',     'HOMBRES', '__Zona Huerfana', 'FUTBOL_5', null),
  ('e5e5e5e5-0000-0000-0000-000000000003', '__SS Inactivo', 'HOMBRES', 'Palermo',         'FUTBOL_5', null),
  ('e5e5e5e5-0000-0000-0000-000000000004', '__SS Fuera',    'HOMBRES', 'Palermo',         'FUTBOL_5', null);

-- Alfa: contadores y ELO distintos de cero, y un segundo formato con MÁS ELO
-- que el preferido — su mejor formato tiene que salir F7, no F5.
update teams set
  elo_rating = 1100,
  season_wins = 3, season_draws = 1, season_losses = 0,
  season_goals_for = 9, season_goals_against = 2
where id = 'e5e5e5e5-0000-0000-0000-000000000001';
update team_rankings set elo_score = 1080, wins = 3, draws = 1
 where team_id = 'e5e5e5e5-0000-0000-0000-000000000001' and format = 'FUTBOL_5';
insert into team_rankings (team_id, format, elo_score)
values ('e5e5e5e5-0000-0000-0000-000000000001', 'FUTBOL_7', 1150);

-- Beta empata a Alfa en F5 (1080): el ranking de F5 desempata por nombre.
update team_rankings set elo_score = 1080
 where team_id = 'e5e5e5e5-0000-0000-0000-000000000002' and format = 'FUTBOL_5';

-- Inactivo: tiene hechos (una victoria) pero no es elegible.
update teams set is_active = false, season_wins = 1
 where id = 'e5e5e5e5-0000-0000-0000-000000000003';

-- Fuera: in_ranking = false. get_team_ranking no lo filtra, así que rankea.
update teams set in_ranking = false
 where id = 'e5e5e5e5-0000-0000-0000-000000000004';

create temp table ctx as
  select id as old_season_id from seasons where is_active;

-- ════════════════════════════════════════════════════════════════════════════
-- A — Atomicidad: si el snapshot falla, el reset no ocurre
-- ════════════════════════════════════════════════════════════════════════════
-- Una fila que ya ocupa la PK de Alfa hace fallar el INSERT del snapshot.
insert into season_standings (season_id, team_id, team_name, zone, category, preferred_format,
  in_ranking, is_active, elo_rating, fair_play_score, wins, draws, losses, goals_for, goals_against, points)
values ((select old_season_id from ctx), 'e5e5e5e5-0000-0000-0000-000000000001', 'colision', 'Palermo',
  'HOMBRES', 'FUTBOL_5', true, true, 1000, 100, 0, 0, 0, 0, 0, 0);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);

select throws_ok(
  $$ select transition_season('__TEST SS Nueva', '2027-01-01', '2027-06-30') $$,
  '23505', null,
  'A-1: una colisión en el snapshot aborta la transición');

select results_eq(
  $$ select season_wins, season_draws, season_losses, season_goals_for, season_goals_against
       from teams where id = 'e5e5e5e5-0000-0000-0000-000000000001' $$,
  $$ values (3, 1, 0, 9, 2) $$,
  'A-2: los contadores de teams NO se resetearon');

select results_eq(
  $$ select wins, draws from team_rankings
      where team_id = 'e5e5e5e5-0000-0000-0000-000000000001' and format = 'FUTBOL_5' $$,
  $$ values (3, 1) $$,
  'A-3: los contadores de team_rankings NO se resetearon');

select is(
  (select is_active from seasons where id = (select old_season_id from ctx)),
  true,
  'A-4: la temporada vieja sigue activa');

-- El owner puede borrar: es el límite asumido de la inmutabilidad.
delete from season_standings where team_id = 'e5e5e5e5-0000-0000-0000-000000000001';

-- ════════════════════════════════════════════════════════════════════════════
-- Oráculo: lo que mostraba get_team_ranking antes de cerrar
-- ════════════════════════════════════════════════════════════════════════════
create temp table pre_teams as select * from teams;
create temp table pre_tr    as select * from team_rankings;

create temp table oracle_team as
  select 'category'::text as kind, g.team_id, g.rank_position::int as pos
    from (select distinct category from teams) c
   cross join lateral get_team_ranking(null, c.category, null) g
  union all
  select 'zone', g.team_id, g.rank_position::int
    from (select distinct zone, category from teams) c
   cross join lateral get_team_ranking(c.zone, c.category, null) g;

create temp table oracle_format as
  select 'category'::text as kind, g.team_id, g.preferred_format as format, g.rank_position::int as pos
    from (select distinct t.category, tr.format
            from team_rankings tr join teams t on t.id = tr.team_id) c
   cross join lateral get_team_ranking(null, c.category, c.format) g
  union all
  select 'zone', g.team_id, g.preferred_format, g.rank_position::int
    from (select distinct t.zone, t.category, tr.format
            from team_rankings tr join teams t on t.id = tr.team_id) c
   cross join lateral get_team_ranking(c.zone, c.category, c.format) g;

create temp table t_new as
  select transition_season('__TEST SS Nueva', '2027-01-01', '2027-06-30') as new_id;

-- ════════════════════════════════════════════════════════════════════════════
-- L — Bloqueos (siguen tomados: la transacción del test no terminó)
-- ════════════════════════════════════════════════════════════════════════════
select results_eq(
  $$ select l.relation::regclass::text, l.mode
       from pg_locks l
      where l.pid = pg_backend_pid()
        and l.locktype = 'relation'
        and l.relation in ('public.matches'::regclass, 'public.teams'::regclass, 'public.team_rankings'::regclass)
        and l.mode in ('ExclusiveLock', 'ShareRowExclusiveLock')
      order by 1 $$,
  $$ values ('matches'::text, 'ExclusiveLock'::text),
            ('team_rankings', 'ShareRowExclusiveLock'),
            ('teams', 'ShareRowExclusiveLock') $$,
  'L-1: matches en EXCLUSIVE (choca con el FOR UPDATE de las resoluciones); teams y team_rankings en SHARE ROW EXCLUSIVE');

select ok(
  (select 'lock_timeout=3s' = any(proconfig) from pg_proc
    where oid = 'public.transition_season(text, date, date)'::regprocedure),
  'L-2: transition_season corre con lock_timeout propio (falla rápido en vez de colgarse)');

-- ════════════════════════════════════════════════════════════════════════════
-- H — Transición feliz
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from season_standings where season_id = (select old_season_id from ctx)),
  (select count(*)::int from pre_teams),
  'H-1: una fila por equipo, haya jugado o no (el reset sólo toca contadores <> 0; el snapshot no filtra)');

select is(
  (select count(*)::int from season_standings_formats where season_id = (select old_season_id from ctx)),
  (select count(*)::int from pre_tr),
  'H-2: una fila por cada fila de team_rankings');

select set_eq(
  $$ select team_id, team_name, shield_url, zone, category, preferred_format, in_ranking, is_active,
            elo_rating, fair_play_score, wins, draws, losses, goals_for, goals_against, points
       from season_standings where season_id = (select old_season_id from ctx) $$,
  $$ select id, name, shield_url, zone, category, preferred_format, in_ranking, is_active,
            elo_rating, fair_play_score, season_wins, season_draws, season_losses,
            season_goals_for, season_goals_against, season_wins * 3 + season_draws
       from pre_teams $$,
  'H-3: los hechos globales son los de ANTES del reset');

select set_eq(
  $$ select team_id, format, elo_score, wins, draws, losses, points
       from season_standings_formats where season_id = (select old_season_id from ctx) $$,
  $$ select team_id, format, elo_score, wins, draws, losses, wins * 3 + draws from pre_tr $$,
  'H-4: los hechos por formato son los de ANTES del reset');

select set_eq(
  $$ select team_id, zone_id from season_standings where season_id = (select old_season_id from ctx) $$,
  $$ select t.id as team_id, z.id as zone_id from pre_teams t left join zones z on z.name = t.zone $$,
  'H-5: zone_id resuelto por nombre exacto contra el catálogo');

select ok(
  (select zone = '__Zona Huerfana' and zone_id is null from season_standings
    where season_id = (select old_season_id from ctx)
      and team_id = 'e5e5e5e5-0000-0000-0000-000000000002'),
  'H-6: zona huérfana → el texto tal cual y zone_id NULL, sin fallar');

select is(
  (select best_format from season_standings
    where season_id = (select old_season_id from ctx)
      and team_id = 'e5e5e5e5-0000-0000-0000-000000000001'),
  'FUTBOL_7'::team_format,
  'H-7: best_format es el de mayor ELO (F7), no el preferido (F5)');

select set_eq(
  $$ select team_id, rank_category from season_standings
      where season_id = (select old_season_id from ctx) and rank_category is not null $$,
  $$ select team_id, pos from oracle_team where kind = 'category' $$,
  'H-8: rank_category = get_team_ranking(NULL, category, NULL)');

select set_eq(
  $$ select team_id, rank_zone from season_standings
      where season_id = (select old_season_id from ctx) and rank_zone is not null $$,
  $$ select team_id, pos from oracle_team where kind = 'zone' $$,
  'H-9: rank_zone = get_team_ranking(zone, category, NULL)');

select set_eq(
  $$ select team_id, format, rank_category from season_standings_formats
      where season_id = (select old_season_id from ctx) and rank_category is not null $$,
  $$ select team_id, format, pos from oracle_format where kind = 'category' $$,
  'H-10: rank_category por formato = get_team_ranking(NULL, category, format)');

select set_eq(
  $$ select team_id, format, rank_zone from season_standings_formats
      where season_id = (select old_season_id from ctx) and rank_zone is not null $$,
  $$ select team_id, format, pos from oracle_format where kind = 'zone' $$,
  'H-11: rank_zone por formato = get_team_ranking(zone, category, format)');

select results_eq(
  $$ select rank_category, rank_zone, wins from season_standings
      where season_id = (select old_season_id from ctx)
        and team_id = 'e5e5e5e5-0000-0000-0000-000000000003' $$,
  $$ values (null::int, null::int, 1) $$,
  'H-12: un equipo inactivo tiene fila con sus hechos y posición NULL');

select results_eq(
  $$ select count(*), count(rank_category) from season_standings_formats
      where season_id = (select old_season_id from ctx)
        and team_id = 'e5e5e5e5-0000-0000-0000-000000000003' $$,
  $$ values (1::bigint, 0::bigint) $$,
  'H-13: sus filas por formato también existen y sin posición');

select ok(
  (select not in_ranking and rank_category is not null from season_standings
    where season_id = (select old_season_id from ctx)
      and team_id = 'e5e5e5e5-0000-0000-0000-000000000004'),
  'H-14: in_ranking = false se congela, pero rankea igual — como en get_team_ranking');

select results_eq(
  $$ select season_wins, season_draws, season_losses, season_goals_for, season_goals_against, elo_rating
       from teams where id = 'e5e5e5e5-0000-0000-0000-000000000001' $$,
  $$ values (0, 0, 0, 0, 0, 1100) $$,
  'H-15: después del snapshot, teams.season_* en cero y elo_rating intacto');

select results_eq(
  $$ select format, elo_score, wins, draws, losses from team_rankings
      where team_id = 'e5e5e5e5-0000-0000-0000-000000000001' order by format $$,
  $$ values ('FUTBOL_5'::team_format, 1080, 0, 0, 0), ('FUTBOL_7'::team_format, 1150, 0, 0, 0) $$,
  'H-16: c.2 — team_rankings.wins/draws/losses en cero y elo_score intacto');

select is(
  (select count(distinct captured_at)::int from season_standings
    where season_id = (select old_season_id from ctx)),
  1,
  'H-17: todas las filas comparten el mismo captured_at');

-- ════════════════════════════════════════════════════════════════════════════
-- I — Inmutabilidad por REST
-- ════════════════════════════════════════════════════════════════════════════
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select isnt_empty(
  $$ select 1 from season_standings where team_id = 'e5e5e5e5-0000-0000-0000-000000000001' $$,
  'I-1: un autenticado lee la historia');

select throws_ok(
  $$ update season_standings set points = 99 where team_id = 'e5e5e5e5-0000-0000-0000-000000000001' $$,
  '42501', null,
  'I-2: un autenticado no puede editar season_standings');

select throws_ok(
  $$ delete from season_standings where team_id = 'e5e5e5e5-0000-0000-0000-000000000001' $$,
  '42501', null,
  'I-3: un autenticado no puede borrar de season_standings');

select throws_ok(
  $$ insert into season_standings select * from season_standings limit 1 $$,
  '42501', null,
  'I-4: un autenticado no puede insertar en season_standings');

select throws_ok(
  $$ update season_standings_formats set points = 99
      where team_id = 'e5e5e5e5-0000-0000-0000-000000000001' $$,
  '42501', null,
  'I-5: un autenticado no puede editar season_standings_formats');

select throws_ok(
  $$ truncate season_standings_formats $$,
  '42501', null,
  'I-6: un autenticado no puede vaciar la historia con TRUNCATE');

select tests.clear_auth();
set local role anon;

select is(
  (select count(*)::int from season_standings),
  0,
  'I-7: anon tiene el grant pero ninguna policy — no ve filas (igual que team_stints)');

select tests.clear_auth();

-- ════════════════════════════════════════════════════════════════════════════
-- M — Moderación
-- ════════════════════════════════════════════════════════════════════════════
-- Trayectoria de un jugador en Alfa, y un club ya disuelto que sólo sobrevive
-- en la historia (no tiene fila en teams).
insert into team_stints (profile_id, team_id, team_name, shield_url, started_at) values
  ('33333333-3333-3333-3333-000000000001', 'e5e5e5e5-0000-0000-0000-000000000001',
   '__SS Alfa', 'shields/alfa.png', now() - interval '30 days');

insert into season_standings (season_id, team_id, team_name, shield_url, zone, category, preferred_format,
  in_ranking, is_active, elo_rating, fair_play_score, wins, draws, losses, goals_for, goals_against, points)
values ((select old_season_id from ctx), 'd5d5d5d5-0000-0000-0000-000000000001', '__SS Disuelto',
  'shields/disuelto.png', 'Palermo', 'HOMBRES', 'FUTBOL_5', true, true, 1000, 100, 2, 0, 1, 5, 4, 6);

insert into team_stints (profile_id, team_id, team_name, shield_url, started_at, ended_at, leave_reason) values
  ('33333333-3333-3333-3333-000000000001', 'd5d5d5d5-0000-0000-0000-000000000001',
   '__SS Disuelto', 'shields/disuelto.png', now() - interval '90 days', now() - interval '60 days',
   'EQUIPO_DISUELTO');

create temp table facts_before as
  select season_id, team_id, zone, zone_id, category, preferred_format, in_ranking, is_active,
         elo_rating, fair_play_score, wins, draws, losses, goals_for, goals_against, points,
         best_format, rank_category, rank_zone, captured_at
    from season_standings;

insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason) values
  ('e5e5e5e5-0000-0000-0000-0000000000f1', '33333333-3333-3333-3333-000000000004', 'TEAM',
   'e5e5e5e5-0000-0000-0000-000000000001', 'Nombre o escudo inapropiado'),
  ('e5e5e5e5-0000-0000-0000-0000000000f2', '33333333-3333-3333-3333-000000000004', 'TEAM',
   'd5d5d5d5-0000-0000-0000-000000000001', 'Nombre o escudo inapropiado');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);

select lives_ok(
  $$ select admin_remove_reported_content('e5e5e5e5-0000-0000-0000-0000000000f1') $$,
  'M-1: procesa la denuncia de un equipo vivo');
select lives_ok(
  $$ select admin_remove_reported_content('e5e5e5e5-0000-0000-0000-0000000000f2') $$,
  'M-2: procesa la denuncia de un club disuelto (no existe en teams)');

select tests.clear_auth();

select results_eq(
  $$ select 'teams', name, shield_url from teams where id = 'e5e5e5e5-0000-0000-0000-000000000001'
     union all
     select 'season_standings', team_name, shield_url from season_standings
      where team_id = 'e5e5e5e5-0000-0000-0000-000000000001'
     union all
     select 'team_stints', team_name, shield_url from team_stints
      where team_id = 'e5e5e5e5-0000-0000-0000-000000000001'
     order by 1 $$,
  $$ values ('season_standings'::text, 'Equipo e5e5e5e5'::text, null::text),
            ('team_stints', 'Equipo e5e5e5e5', null),
            ('teams', 'Equipo e5e5e5e5', null) $$,
  'M-3: equipo vivo → nombre y escudo neutralizados en teams, season_standings y team_stints');

select results_eq(
  $$ select 'season_standings', team_name, shield_url from season_standings
      where team_id = 'd5d5d5d5-0000-0000-0000-000000000001'
     union all
     select 'team_stints', team_name, shield_url from team_stints
      where team_id = 'd5d5d5d5-0000-0000-0000-000000000001'
     order by 1 $$,
  $$ values ('season_standings'::text, 'Equipo d5d5d5d5'::text, null::text),
            ('team_stints', 'Equipo d5d5d5d5', null) $$,
  'M-4: club disuelto → la historia es el único lugar donde seguía el nombre, y también se neutraliza');

select set_eq(
  $$ select season_id, team_id, zone, zone_id, category, preferred_format, in_ranking, is_active,
            elo_rating, fair_play_score, wins, draws, losses, goals_for, goals_against, points,
            best_format, rank_category, rank_zone, captured_at
       from season_standings $$,
  $$ select * from facts_before $$,
  'M-5: la moderación no toca ningún hecho competitivo');

select results_eq(
  $$ select details->>'season_standings_rows', details->>'team_stints_rows'
       from app_logs
      where message = 'admin.remove_reported_content'
        and details->>'report_id' = 'e5e5e5e5-0000-0000-0000-0000000000f1' $$,
  $$ values ('1'::text, '1'::text) $$,
  'M-6: la auditoría registra cuántas copias históricas se corrigieron');

select is_empty(
  $$ select 1 from season_standings_formats f
      where not exists (select 1 from season_standings s
                         where s.season_id = f.season_id and s.team_id = f.team_id) $$,
  'M-7: la hija sigue colgando del padre (la moderación no rompe la FK)');

select * from finish();
rollback;
