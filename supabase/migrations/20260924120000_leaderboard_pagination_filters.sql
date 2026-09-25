-- ============================================================
-- Leaderboard de jugadores: paginación + filtros de categoría y formato
-- 2026-09-24
-- ------------------------------------------------------------
-- La pestaña Ranking suma "Ver tabla completa" (app/ranking-full.tsx), que
-- muestra TODOS los jugadores con los mismos filtros que la tabla de equipos.
-- `get_player_leaderboard` no alcanzaba para eso por tres motivos:
--
--   1. `limit 20` fijo en las cinco ramas. La tabla completa necesita
--      paginar: se agregan `p_limit` (default 20, tope 100) y `p_offset`
--      (default 0).
--
--   2. Sin desempate. Las ramas ordenaban sólo por el valor, y con OFFSET eso
--      no es determinista: dos jugadores con 1 gol podían intercambiarse
--      entre la página 1 y la 2, y uno salía repetido mientras el otro no
--      aparecía nunca. El ORDER BY que pagina ahora desempata por
--      (profile_id, team_id) —win_rate conserva antes su desempate por
--      partidos jugados—.
--
--      La POSICIÓN que se muestra es otra cosa: `rank_position` pasa de
--      `row_number()` a `rank()` sobre el valor, así los empatados comparten
--      puesto (46, 46, 46, 49). Antes, dos jugadores con los mismos goles
--      salían 4° y 5° según un orden arbitrario. El desempate sólo decide en
--      qué orden se listan los empatados, no quién está "arriba".
--
--   3. Sólo filtraba por zona. Se agregan:
--        · `p_category` → `teams.category` del equipo CON EL QUE SUMÓ, que
--          es el mismo equipo por el que ya agrupa cada rama (un jugador de
--          dos equipos sigue apareciendo una vez por equipo).
--        · `p_format`   → `matches.format` del partido. Los partidos viejos
--          sin formato quedan afuera sólo cuando se pide un formato.
--
-- ─── Compatibilidad con la app instalada (1.0.0 y 1.1.0) ─────────────────────
-- Los parámetros nuevos van AL FINAL y todos con default. Un cliente viejo
-- llama con `{p_stat, p_zone, p_season_id}` por nombre y recibe exactamente
-- lo mismo que antes: primeros 20, sin filtros de categoría ni formato. Las
-- llamadas posicionales de los tests (200, 230) también siguen resolviendo.
--
-- ─── Por qué DROP + CREATE y no CREATE OR REPLACE ────────────────────────────
-- Cambian los argumentos, así que CREATE OR REPLACE crearía una SEGUNDA
-- función al lado de la vieja. PostgREST no puede elegir entre dos
-- sobrecargas que aceptan los mismos argumentos por nombre y responde
-- PGRST203. El DROP y el CREATE corren en la misma transacción de la
-- migración, así que no hay ventana sin función.
--
-- ─── Grants ──────────────────────────────────────────────────────────────────
-- La función vieja nunca tuvo grants explícitos: le quedaba el EXECUTE por
-- defecto de PUBLIC, `anon` incluido. Ninguna superficie la llama sin sesión
-- (la app exige login y el dashboard no la usa), así que se cierra al mismo
-- criterio que 20260711012137 (A2): sólo `authenticated`. `service_role`
-- conserva el suyo por los default privileges del schema.
--
-- Sigue siendo SECURITY INVOKER, como antes: las lecturas pasan por la RLS
-- de quien llama. Se marca STABLE porque sólo lee.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_player_leaderboard(text, text, uuid);

CREATE FUNCTION public.get_player_leaderboard(
  p_stat      text,
  p_zone      text          DEFAULT NULL::text,
  p_season_id uuid          DEFAULT NULL::uuid,
  p_category  team_category DEFAULT NULL::team_category,
  p_format    team_format   DEFAULT NULL::team_format,
  p_limit     integer       DEFAULT 20,
  p_offset    integer       DEFAULT 0
)
RETURNS TABLE(
  rank_position bigint, profile_id uuid, full_name text, username text,
  avatar_url text, team_id uuid, team_name text, zone text, value bigint
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
declare
  -- Un límite nulo, cero o negativo vuelve al default; el tope evita que un
  -- cliente pida la tabla entera de una sola vez.
  v_limit  integer := case when p_limit is null or p_limit < 1 then 20
                           else least(p_limit, 100) end;
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_stat = 'goals' then
    return query
      select
        rank() over (order by sum((scorer->>'goals')::integer) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone,
        sum((scorer->>'goals')::integer)::bigint
      from match_results mr
      cross join jsonb_array_elements(mr.scorers) as scorer
      join profiles p on p.id = (scorer->>'profile_id')::uuid
      join matches m on m.id = mr.match_id
      join teams t on t.id = mr.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mr.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mr.team_id = m.team_b_id) )
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
        and (p_category is null or t.category = p_category)
        and (p_format is null or m.format = p_format)
      group by p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone
      order by sum((scorer->>'goals')::integer) desc, p.id, mr.team_id
      limit v_limit offset v_offset;

  elsif p_stat = 'mvps' then
    return query
      select
        rank() over (order by count(*) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone,
        count(*)::bigint
      from match_results mr
      join profiles p on p.id = mr.mvp_id
      join matches m on m.id = mr.match_id
      join teams t on t.id = mr.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mr.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mr.team_id = m.team_b_id) )
        and mr.mvp_id is not null
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
        and (p_category is null or t.category = p_category)
        and (p_format is null or m.format = p_format)
      group by p.id, p.full_name, p.username, p.avatar_url, mr.team_id, t.name, t.zone
      order by count(*) desc, p.id, mr.team_id
      limit v_limit offset v_offset;

  elsif p_stat = 'clean_sheets' then
    return query
      select
        rank() over (order by count(*) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone,
        count(*)::bigint
      from match_participants mp2
      join profiles p on p.id = mp2.profile_id
      join matches m on m.id = mp2.match_id
      join teams t on t.id = mp2.team_id
      join match_results mr on mr.match_id = m.id and mr.team_id = mp2.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mp2.team_id = m.team_b_id) )
        and mr.goals_against = 0
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
        and (p_category is null or t.category = p_category)
        and (p_format is null or m.format = p_format)
      group by p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone
      order by count(*) desc, p.id, mp2.team_id
      limit v_limit offset v_offset;

  elsif p_stat = 'win_rate' then
    return query
      with stats as (
        select
          mp2.profile_id,
          mp2.team_id,
          count(*) as played,
          count(*) filter (
            where (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
               or (m.status = 'WO_B' and mp2.team_id = m.team_b_id)
               or (m.status = 'FINALIZADO' and mp2.team_id = m.team_a_id and mr_a.goals_scored > mr_b.goals_scored)
               or (m.status = 'FINALIZADO' and mp2.team_id = m.team_b_id and mr_b.goals_scored > mr_a.goals_scored)
          ) as wins
        from match_participants mp2
        join matches m on m.id = mp2.match_id
          and ( m.status = 'FINALIZADO'
                or (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
                or (m.status = 'WO_B' and mp2.team_id = m.team_b_id) )
        left join match_results mr_a on mr_a.match_id = m.id and mr_a.team_id = m.team_a_id
        left join match_results mr_b on mr_b.match_id = m.id and mr_b.team_id = m.team_b_id
        join teams t on t.id = mp2.team_id
        where (p_zone is null or t.zone = p_zone)
          and (p_season_id is null or m.season_id = p_season_id)
          and (p_category is null or t.category = p_category)
          and (p_format is null or m.format = p_format)
          -- FINALIZADO sin ambos resultados no computa como jugado (paridad
          -- con el comportamiento previo, donde el INNER JOIN lo excluía).
          and (m.status in ('WO_A','WO_B') or (mr_a.id is not null and mr_b.id is not null))
        group by mp2.profile_id, mp2.team_id
        having count(*) >= 3
      )
      select
        rank() over (order by round(100.0 * s.wins / s.played) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, s.team_id, t.name, t.zone,
        round(100.0 * s.wins / s.played)::bigint
      from stats s
      join profiles p on p.id = s.profile_id
      join teams t on t.id = s.team_id
      order by round(100.0 * s.wins / s.played) desc, s.played desc, s.profile_id, s.team_id
      limit v_limit offset v_offset;

  else
    return query
      select
        rank() over (order by count(*) desc)::bigint,
        p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone,
        count(*)::bigint
      from match_participants mp2
      join profiles p on p.id = mp2.profile_id
      join matches m on m.id = mp2.match_id
      join teams t on t.id = mp2.team_id
      where ( m.status = 'FINALIZADO'
              or (m.status = 'WO_A' and mp2.team_id = m.team_a_id)
              or (m.status = 'WO_B' and mp2.team_id = m.team_b_id) )
        and (p_zone is null or t.zone = p_zone)
        and (p_season_id is null or m.season_id = p_season_id)
        and (p_category is null or t.category = p_category)
        and (p_format is null or m.format = p_format)
      group by p.id, p.full_name, p.username, p.avatar_url, mp2.team_id, t.name, t.zone
      order by count(*) desc, p.id, mp2.team_id
      limit v_limit offset v_offset;
  end if;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_player_leaderboard(text, text, uuid, team_category, team_format, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_player_leaderboard(text, text, uuid, team_category, team_format, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.get_player_leaderboard(text, text, uuid, team_category, team_format, integer, integer) IS
  'Leaderboard de jugadores por stat (goals, mvps, clean_sheets, win_rate; cualquier otro = partidos). Una fila por (jugador, equipo con el que sumó). Filtros: zona y categoría del equipo, temporada y formato del partido. Paginado con p_limit (default 20, tope 100) y p_offset; orden determinista con desempate por (profile_id, team_id), así las páginas no se superponen. rank_position = rank() sobre el valor: global (se calcula antes de recortar) y compartida entre empatados. Los parámetros nuevos (20260924120000) van al final con default: la llamada vieja de 3 argumentos devuelve lo mismo que antes.';
