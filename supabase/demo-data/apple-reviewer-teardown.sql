-- ============================================================
-- CUENTA DE DEMO PARA EL REVISOR DE APPLE — TEARDOWN
-- ------------------------------------------------------------
-- Revierte exactamente lo que crea `apple-reviewer-setup.sql`, incluidas las
-- filas que escribieron los triggers al resolverse el partido jugado
-- (elo_history, match_goals, notificaciones, team_stints, team_rankings) y las
-- estadísticas de temporada — que se van solas con los equipos, porque viven en
-- `teams.season_*`.
--
-- ── Lo que este script NO borra ─────────────────────────────────────────────
--   · `public.profiles` del revisor (47e89302-…)
--   · `auth.users` del revisor      (4bba271e-…)
-- Se conservan a propósito: si Apple pide una segunda revisión, alcanza con
-- volver a correr el setup.
--
-- Sí borra el capitán inventado del equipo rival (demo.rival@tornear.com), que
-- lo creó el setup y no le sirve a nadie más.
--
-- Todo se identifica por los UUID fijos del setup, no por nombre: si alguien
-- renombró un equipo desde la app, el borrado igual da en el blanco.
--
-- Es idempotente: correrlo dos veces no falla.
-- ============================================================

begin;

set local search_path = public, extensions, auth;

do $$
declare
  k_team_apple     constant uuid := 'a99a0000-0000-4000-8000-000000000001';
  k_team_rival     constant uuid := 'a99a0000-0000-4000-8000-000000000002';
  k_rival_auth_id  constant uuid := 'a99a0000-0000-4000-8000-000000000010';
  k_rival_profile  constant uuid := 'a99a0000-0000-4000-8000-000000000011';
  k_match_upcoming constant uuid := 'a99a0000-0000-4000-8000-000000000021';
  k_match_played   constant uuid := 'a99a0000-0000-4000-8000-000000000022';

  k_matches        constant uuid[] := array[k_match_upcoming, k_match_played];
  k_teams          constant uuid[] := array[k_team_apple, k_team_rival];
begin
  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. NOTIFICACIONES DE LOS PARTIDOS DEMO
  -- ══════════════════════════════════════════════════════════════════════════
  -- Las genera `notify_match_status_change` en cada cambio de estado y cuelgan
  -- del profile (CASCADE desde profiles, no desde matches): como el profile del
  -- revisor sobrevive, hay que barrerlas por el match_id que llevan en `data`.
  delete from public.notifications
  where (data->>'match_id')::uuid = any(k_matches);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. HISTORIAL DE ELO
  -- ══════════════════════════════════════════════════════════════════════════
  -- `elo_history.match_id` es ON DELETE NO ACTION: si quedara una fila, el
  -- DELETE de `matches` fallaría. (Con el setup tal como está no debería haber
  -- ninguna: el partido jugado es AMISTOSO y el ELO sólo se mueve en RANKING.
  -- Se borra igual, por si alguien cambió el tipo del partido.)
  delete from public.elo_history where match_id = any(k_matches);
  delete from public.elo_history where team_id  = any(k_teams);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. HIJOS DE LOS PARTIDOS
  -- ══════════════════════════════════════════════════════════════════════════
  -- La mayoría cascadea desde `matches`, pero tres FKs son NO ACTION
  -- (`match_results.team_id`, `match_participants.team_id`,
  --  `match_proposals.from_team_id`) y bloquearían el DELETE de `teams`.
  -- Se borra todo explícitamente para no depender del orden del cascade.
  delete from public.match_goals         where match_id = any(k_matches);
  delete from public.match_results       where match_id = any(k_matches);
  delete from public.match_participants  where match_id = any(k_matches);
  delete from public.match_proposals     where match_id = any(k_matches);
  delete from public.match_dispute_votes where match_id = any(k_matches);
  delete from public.result_dispute_votes where match_id = any(k_matches);
  delete from public.wo_claims           where match_id = any(k_matches);
  delete from public.cancellation_requests where match_id = any(k_matches);

  -- El chat del partido y sus mensajes (messages cascadea desde conversations).
  delete from public.conversations where match_id = any(k_matches);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. PARTIDOS
  -- ══════════════════════════════════════════════════════════════════════════
  delete from public.matches where id = any(k_matches);

  -- Red de seguridad: cualquier otro partido que alguien haya generado desde la
  -- app con estos equipos (por ejemplo aceptando un desafío durante la prueba).
  delete from public.match_goals          where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.match_results        where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.match_participants   where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.match_proposals      where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.match_dispute_votes  where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.result_dispute_votes where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.wo_claims            where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.cancellation_requests where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.notifications
   where (data->>'match_id')::uuid in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.elo_history          where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.conversations        where match_id in (select id from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams));
  delete from public.matches where team_a_id = any(k_teams) or team_b_id = any(k_teams);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. DESAFÍOS Y MERCADO
  -- ══════════════════════════════════════════════════════════════════════════
  -- Cascadean desde `teams`, pero se borran antes para que el mensaje de error
  -- —si algo quedara colgado— apunte a la tabla real y no al DELETE de teams.
  delete from public.challenges where from_team_id = any(k_teams) or to_team_id = any(k_teams);
  delete from public.market_player_post_applications where team_id = any(k_teams);
  delete from public.market_team_posts where team_id = any(k_teams);
  delete from public.team_join_requests where team_id = any(k_teams);
  delete from public.conversations where team_id = any(k_teams);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. PLANTELES, PASOS POR EL CLUB Y RANKINGS POR FORMATO
  -- ══════════════════════════════════════════════════════════════════════════
  -- `team_stints` NO tiene FK a `teams` (desnormaliza nombre y escudo para
  -- sobrevivir a la disolución del club), así que el cascade no la alcanza: si
  -- no se borra acá, al revisor le queda "Apple FC" en su historial de equipos
  -- para siempre.
  delete from public.team_stints   where team_id = any(k_teams);
  delete from public.team_members  where team_id = any(k_teams);
  delete from public.team_rankings where team_id = any(k_teams);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. EQUIPOS
  -- ══════════════════════════════════════════════════════════════════════════
  -- Con los equipos se van también las estadísticas de temporada que sumó
  -- `apply_match_outcome` (matches_played, season_wins, season_goals_*, ELO):
  -- viven como columnas de `teams`, no en una tabla aparte.
  delete from public.teams where id = any(k_teams);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. CAPITÁN INVENTADO DEL RIVAL
  -- ══════════════════════════════════════════════════════════════════════════
  -- ⚠️ El profile y el auth.users del REVISOR no se tocan (ver encabezado).
  -- `profiles.auth_user_id` es ON DELETE CASCADE, así que borrar el auth user
  -- se lleva el profile y todo lo que cascadea de él (badges, atribuciones,
  -- lecturas de chat). Las FKs NO ACTION que apuntaban a este profile ya
  -- quedaron limpias en los bloques 3 a 6.
  delete from public.profiles   where id      = k_rival_profile;
  delete from auth.identities   where user_id = k_rival_auth_id;
  delete from auth.users        where id      = k_rival_auth_id;

  raise notice '[demo] Teardown completo. El profile y la cuenta de auth del revisor quedaron intactos.';
end;
$$;

commit;


-- ============================================================
-- VERIFICACIÓN (opcional — correr después del COMMIT)
-- ============================================================
-- Las tres consultas tienen que devolver 0 filas, y la cuarta exactamente 1
-- (el revisor sigue existiendo).
--
--   select * from public.teams
--    where id in ('a99a0000-0000-4000-8000-000000000001',
--                 'a99a0000-0000-4000-8000-000000000002');
--
--   select * from public.matches
--    where id in ('a99a0000-0000-4000-8000-000000000021',
--                 'a99a0000-0000-4000-8000-000000000022');
--
--   select * from public.team_stints
--    where team_id in ('a99a0000-0000-4000-8000-000000000001',
--                      'a99a0000-0000-4000-8000-000000000002');
--
--   select id, username from public.profiles
--    where id = '47e89302-bd97-4d17-b4be-0a24a000f6f5';
