-- ============================================================
-- 011-schema-fk-rules — Reglas ON DELETE de los FKs hacia teams (pgTAP)
-- ============================================================
-- Por qué existe esta suite:
--   Eliminar un equipo devolvía 409 (Conflict) en producción. La causa era
--   `messages.sender_team_id` con ON DELETE NO ACTION: cualquier equipo que
--   hubiera escrito un mensaje de chat quedaba imposible de borrar.
--
--   010-schema.spec.sql verifica tablas y columnas, pero NO verificaba reglas
--   de FK (0 referencias a confdeltype), así que el bug no tenía forma de
--   aparecer hasta que alguien lo probó a mano.
--
-- Qué fija esta suite — y por qué importa que fije las DOS listas:
--   · CASCADE / SET NULL → datos accesorios del equipo. Si alguno vuelve a
--     NO ACTION, borrar un equipo se rompe de nuevo.
--   · NO ACTION → historial deportivo COMPARTIDO con el equipo rival
--     (matches, resultados, WO). Cascadearlos "para que el borrado funcione"
--     destruiría partidos que también le pertenecen al otro equipo. Que un
--     equipo con historial NO se pueda borrar es la conducta deseada; el
--     cliente lo explica (lib/team-manage-data.ts → deleteTeam, código 23503).
--
--   El set completo se compara con set_eq, así que un FK NUEVO hacia teams
--   también rompe el test: obliga a decidir explícitamente su regla de borrado
--   en vez de heredar el NO ACTION por defecto.
--
-- confdeltype: 'a' = NO ACTION · 'c' = CASCADE · 'n' = SET NULL · 'r' = RESTRICT
-- ============================================================

begin;
select plan(4);

-- ── 1. Foto completa de los FKs hacia teams ─────────────────────────────────
-- Si este falla, mirá el diff: o cambió una regla existente, o se agregó un FK
-- nuevo sin decidir qué pasa al borrar el equipo.
select set_eq(
  $$
    select c.conname::text || ' => ' ||
           case c.confdeltype
             when 'a' then 'NO ACTION' when 'c' then 'CASCADE'
             when 'n' then 'SET NULL'  when 'r' then 'RESTRICT'
             when 'd' then 'SET DEFAULT'
           end
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'public.teams'::regclass
  $$,
  $$ values
      ('cancellation_requests_requested_by_team_id_fkey => CASCADE'),
      ('challenges_from_team_id_fkey => CASCADE'),
      ('challenges_to_team_id_fkey => CASCADE'),
      ('conversations_team_id_fkey => CASCADE'),
      ('elo_history_team_id_fkey => CASCADE'),
      ('market_player_post_applications_team_id_fkey => CASCADE'),
      ('market_team_posts_team_id_fkey => CASCADE'),
      ('match_dispute_votes_voted_team_id_fkey => CASCADE'),
      -- match_goals es una PROYECCIÓN de match_results.scorers
      -- (20260819120000), no una fuente de verdad: si el equipo se borra, sus
      -- filas de goles no le sirven a nadie. La fuente (match_results) es la
      -- que conserva NO ACTION más abajo, porque esa fila le pertenece
      -- también al rival.
      ('match_goals_team_id_fkey => CASCADE'),
      ('team_join_requests_team_id_fkey => CASCADE'),
      ('team_members_team_id_fkey => CASCADE'),
      -- El ELO por formato es un dato accesorio del equipo: si el equipo se
      -- borra, sus filas de ranking no le sirven a nadie (a diferencia de
      -- matches/match_results, que le pertenecen también al rival).
      ('team_rankings_team_id_fkey => CASCADE'),
      -- Las mudanzas de zona (D-55, 20260928240000) sólo sirven para el
      -- candado del propio equipo: disuelto el equipo, no hay nada que auditar.
      -- La zona al cierre de cada temporada vive aparte, en season_standings.
      ('team_zone_changes_team_id_fkey => CASCADE'),
      ('messages_sender_team_id_fkey => SET NULL'),
      ('match_participants_team_id_fkey => NO ACTION'),
      ('match_proposals_from_team_id_fkey => NO ACTION'),
      ('match_results_team_id_fkey => NO ACTION'),
      ('matches_team_a_id_fkey => NO ACTION'),
      ('matches_team_b_id_fkey => NO ACTION'),
      ('result_dispute_votes_voted_for_team_fkey => NO ACTION'),
      ('wo_claims_claiming_team_id_fkey => NO ACTION')
  $$,
  'Todos los FKs hacia teams tienen la regla ON DELETE decidida explicitamente'
);

-- ── 2. El FK exacto que produjo el 409 en produccion ────────────────────────
select is(
  (select confdeltype from pg_constraint where conname = 'messages_sender_team_id_fkey'),
  'n'::"char",
  'messages.sender_team_id debe ser SET NULL: con NO ACTION, un equipo que chateo no se puede borrar'
);

-- ── 3. El historial deportivo NO se cascadea ────────────────────────────────
-- Guarda contra el "arreglo" tentador de poner CASCADE para destrabar el borrado.
select is_empty(
  $$
    select c.conname::text
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.teams'::regclass
      and c.confdeltype <> 'a'
      and c.conrelid::regclass::text in (
        'matches', 'match_participants', 'match_proposals',
        'match_results', 'result_dispute_votes', 'wo_claims'
      )
  $$,
  'El historial de partidos nunca se borra en cascada: es compartido con el equipo rival'
);

-- ── 4. Lo que la app SI espera que se limpie solo ───────────────────────────
select is_empty(
  $$
    select c.conname::text
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.teams'::regclass
      and c.confdeltype = 'a'
      and c.conrelid::regclass::text in (
        'team_members', 'team_join_requests', 'challenges',
        'conversations', 'market_team_posts', 'elo_history'
      )
  $$,
  'Membresias, solicitudes, desafios, chats y publicaciones se borran con el equipo'
);

select * from finish();
rollback;
