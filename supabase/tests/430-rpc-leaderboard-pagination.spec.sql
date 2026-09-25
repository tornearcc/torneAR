-- ============================================================
-- 430-rpc-leaderboard-pagination — get_player_leaderboard paginado (pgTAP)
-- ============================================================
-- Prueba 20260924120000_leaderboard_pagination_filters.sql:
--   · firma nueva (p_category, p_format, p_limit, p_offset al final) y que
--     no quedó una sobrecarga vieja al lado;
--   · la llamada vieja de 3 argumentos (por nombre, como la manda la app
--     instalada) sigue devolviendo el top 20;
--   · paginación determinista con empates: las páginas no se pisan, cubren
--     el conjunto completo y coinciden fila a fila con una sola llamada;
--   · rank_position = rank(): los empatados comparten posición, también en
--     una página del medio del empate;
--   · tope de p_limit y defaults ante valores inválidos;
--   · filtros por categoría del equipo y formato del partido;
--   · grants: authenticated sí, anon no.
--
-- Escenario aislado en la zona 'ZLB_PAGE', todo en BEGIN...ROLLBACK:
--   TX (MIXTO) vs TR, FUTBOL_7 · 3 goleadores de TX con 2 goles cada uno.
--   TH (HOMBRES) vs TR, FUTBOL_5 · 110 goleadores de TH con 1 gol cada uno
--     (110 empates: es el caso que rompía el OFFSET sin desempate).
--   Total goleadores de la zona: 113 filas (jugador, equipo).
-- Los perfiles salen del seed de testing por orden de id; sólo importa que
-- sean distintos.
-- ============================================================

begin;
select plan(18);

do $$
declare
  v_tx uuid; v_th uuid; v_tr uuid;
  v_m7 uuid; v_m5 uuid;
  v_ids uuid[];
  v_submitter uuid;
begin
  select array_agg(id order by id) into v_ids
  from (select id from public.profiles order by id limit 113) p;
  if coalesce(array_length(v_ids, 1), 0) < 113 then
    raise exception 'el seed de testing necesita al menos 113 perfiles';
  end if;
  v_submitter := v_ids[1];

  insert into teams (name, category, zone, preferred_format)
  values ('TX_LBP', 'MIXTO', 'ZLB_PAGE', 'FUTBOL_7') returning id into v_tx;
  insert into teams (name, category, zone, preferred_format)
  values ('TH_LBP', 'HOMBRES', 'ZLB_PAGE', 'FUTBOL_5') returning id into v_th;
  insert into teams (name, category, zone, preferred_format)
  values ('TR_LBP', 'HOMBRES', 'ZLB_PAGE', 'FUTBOL_5') returning id into v_tr;

  -- F7: TX 6-0. Tres goleadores con 2 goles; los mismos tres participan.
  insert into matches (team_a_id, team_b_id, status, format)
  values (v_tx, v_tr, 'FINALIZADO', 'FUTBOL_7') returning id into v_m7;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers) values
    (v_m7, v_tx, v_submitter, 6, 0,
     (select jsonb_agg(jsonb_build_object('profile_id', id, 'goals', 2))
        from unnest(v_ids[1:3]) as id)),
    (v_m7, v_tr, v_submitter, 0, 6, '[]'::jsonb);
  insert into match_participants (match_id, profile_id, team_id)
  select v_m7, id, v_tx from unnest(v_ids[1:3]) as id;

  -- F5: TH 110-0. 110 goleadores empatados en 1 gol.
  insert into matches (team_a_id, team_b_id, status, format)
  values (v_th, v_tr, 'FINALIZADO', 'FUTBOL_5') returning id into v_m5;
  insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers) values
    (v_m5, v_th, v_submitter, 110, 0,
     (select jsonb_agg(jsonb_build_object('profile_id', id, 'goals', 1))
        from unnest(v_ids[4:113]) as id)),
    (v_m5, v_tr, v_submitter, 0, 110, '[]'::jsonb);
end;
$$;

-- ── 1-2. Firma ───────────────────────────────────────────────────────────────
select has_function(
  'public', 'get_player_leaderboard',
  array['text', 'text', 'uuid', 'team_category', 'team_format', 'integer', 'integer'],
  'get_player_leaderboard tiene la firma nueva de 7 argumentos'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_player_leaderboard'),
  1,
  'no queda una sobrecarga vieja (PostgREST no podría elegir entre las dos)'
);

-- ── 3-4. Compatibilidad con la app instalada ────────────────────────────────
select is(
  (select count(*)::int from public.get_player_leaderboard(
     p_stat => 'goals', p_zone => 'ZLB_PAGE', p_season_id => null)),
  20,
  'llamada vieja por nombre (3 args): devuelve el top 20 como antes'
);

select results_eq(
  $$ select value from public.get_player_leaderboard('goals', 'ZLB_PAGE') order by rank_position limit 4 $$,
  array[2::bigint, 2, 2, 1],
  'llamada vieja posicional: mismos valores, ordenados de mayor a menor'
);

-- ── 5-9. Paginación determinista con empates ─────────────────────────────────
select is(
  (select count(*)::int from public.get_player_leaderboard(
     'goals', 'ZLB_PAGE', null, null, null, 1000, 0)),
  100,
  'p_limit se topea en 100'
);

select is(
  (select count(*)::int from (
     select * from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 50, 0)
     union all
     select * from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 50, 50)
     union all
     select * from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 50, 100)
   ) pages),
  113,
  'tres páginas de 50 suman las 113 filas'
);

select is(
  (select count(distinct (profile_id, team_id))::int from (
     select * from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 50, 0)
     union all
     select * from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 50, 50)
     union all
     select * from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 50, 100)
   ) pages),
  113,
  'las páginas no se pisan: 113 (jugador, equipo) distintos pese a 110 empates'
);

-- Con empates, `order by rank_position` no alcanza para comparar: se compara
-- el orden en que el servidor devuelve las filas (WITH ORDINALITY), corriendo
-- cada página por su offset.
select results_eq(
  $$ select pg.ord + pg.base, pg.pid, pg.tid, pg.rp from (
       select p1.*, 0 as base from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 7, 0)
         with ordinality as p1(rp, pid, fname, uname, av, tid, tname, zn, val, ord)
       union all
       select p2.*, 7 from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 7, 7)
         with ordinality as p2(rp, pid, fname, uname, av, tid, tname, zn, val, ord)
       union all
       select p3.*, 14 from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 7, 14)
         with ordinality as p3(rp, pid, fname, uname, av, tid, tname, zn, val, ord)
     ) pg order by 1 $$,
  $$ select one.ord, one.pid, one.tid, one.rp
       from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 21, 0)
         with ordinality as one(rp, pid, fname, uname, av, tid, tname, zn, val, ord)
      order by 1 $$,
  'tres páginas de 7 = una llamada de 21: mismas filas, mismo orden y misma posición'
);

-- ── Empatados comparten posición (rank, no row_number) ──────────────────────
select results_eq(
  $$ select rank_position, count(*)::int
       from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 100, 0)
      group by rank_position order by rank_position $$,
  $$ values (1::bigint, 3), (4::bigint, 97) $$,
  'los 3 de 2 goles comparten el 1°; los de 1 gol comparten el 4° (el 2° y el 3° se saltean)'
);

select is(
  (select array_agg(distinct rank_position)
     from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 50, 50)),
  array[4::bigint],
  'una página del medio del empate conserva la posición global compartida (4°)'
);

-- ── 10-11. Límites inválidos vuelven al default ──────────────────────────────
select is(
  (select count(*)::int from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 0, 0)),
  20,
  'p_limit = 0 usa el default de 20'
);

select is(
  (select count(*)::int from public.get_player_leaderboard('goals', 'ZLB_PAGE', null, null, null, 20, -5)),
  20,
  'p_offset negativo se toma como 0'
);

-- ── 12-15. Filtros de categoría y formato ────────────────────────────────────
select is(
  (select count(*)::int from public.get_player_leaderboard(
     p_stat => 'goals', p_zone => 'ZLB_PAGE', p_category => 'MIXTO', p_limit => 100)),
  3,
  'p_category MIXTO: sólo los goleadores que sumaron con el equipo MIXTO'
);

select is(
  (select count(*)::int from public.get_player_leaderboard(
     p_stat => 'goals', p_zone => 'ZLB_PAGE', p_category => 'HOMBRES', p_limit => 100)),
  100,
  'p_category HOMBRES: los 110 del equipo HOMBRES (topeado en 100 por página)'
);

select is(
  (select count(*)::int from public.get_player_leaderboard(
     p_stat => 'goals', p_zone => 'ZLB_PAGE', p_format => 'FUTBOL_7', p_limit => 100)),
  3,
  'p_format FUTBOL_7: sólo goles de partidos F7'
);

select is(
  (select count(*)::int from public.get_player_leaderboard(
     p_stat => 'matches', p_zone => 'ZLB_PAGE', p_format => 'FUTBOL_7', p_category => 'MIXTO')),
  3,
  'rama matches: los filtros nuevos también aplican (3 participantes F7 del MIXTO)'
);

-- ── 16-17. Grants ────────────────────────────────────────────────────────────
select ok(
  has_function_privilege('authenticated',
    'public.get_player_leaderboard(text, text, uuid, team_category, team_format, integer, integer)', 'EXECUTE'),
  'authenticated puede ejecutar get_player_leaderboard'
);

select ok(
  not has_function_privilege('anon',
    'public.get_player_leaderboard(text, text, uuid, team_category, team_format, integer, integer)', 'EXECUTE'),
  'anon ya no puede ejecutar get_player_leaderboard'
);

select * from finish();
rollback;
