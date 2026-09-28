-- ============================================================
-- Paridad de grants entre producción, CI y bases nuevas (P2-7)
-- 2026-09-28 · Tanda 3 · tarjeta #66
-- ------------------------------------------------------------
-- Inventario del 28/09 (pg_class.relacl de public, anon y authenticated),
-- comparando producción con la base efímera del CI (`supabase start`):
--   · Producción conserva el default viejo de Supabase: SELECT, INSERT,
--     UPDATE y DELETE para anon y authenticated en casi todas las tablas, y
--     SIN TRUNCATE, salvo en las tablas creadas con el default nuevo
--     (user_blocks y team_zone_changes, que sí lo tienen).
--   · La imagen nueva del CI no da ese DML por defecto, pero da TRUNCATE en
--     todas las tablas. Los tests pasaban igual porque casi todo entra por
--     funciones SECURITY DEFINER, pero el CI no probaba los permisos reales y
--     ya hizo fallar tests el 27/09 (PR #57).
--   · Los grants por columna (profiles, teams, match_participants, ...) son
--     iguales en los dos lados.
--
-- Qué hace esta migración:
--   1. Declara, tabla por tabla, el DML que producción tiene hoy. En
--      producción no cambia nada; en el CI y en una base nueva, las deja
--      iguales a producción. Es PARIDAD, no endurecimiento: achicar lo que
--      tiene anon es otro trabajo y necesita probar la app entera.
--   2. Revoca TRUNCATE a anon y authenticated en todo public, y en los
--      defaults de las tablas futuras. TRUNCATE se saltea RLS; ningún cliente
--      lo usa (PostgREST no lo expone) y las funciones SECURITY DEFINER corren
--      como dueño. En producción cierra user_blocks y team_zone_changes.
--
-- Regla para lo que venga (de PR #57): los tests afirman grants literales y
-- nunca comparan contra otra tabla (ver 550-grants-parity).
-- ============================================================

-- ── 1. DML de producción, declarado ─────────────────────────────────────────
GRANT INSERT ON public.app_feedback TO anon;
GRANT INSERT ON public.app_feedback TO authenticated;
GRANT INSERT, SELECT ON public.app_logs TO anon;
GRANT INSERT, SELECT ON public.app_logs TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_versions TO anon;
GRANT SELECT ON public.app_versions TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.badges TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.badges TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.cancellation_requests TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.cancellation_requests TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.challenges TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.challenges TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.content_reports TO anon;
GRANT INSERT, SELECT, UPDATE ON public.content_reports TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.conversation_reads TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.conversation_reads TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.conversations TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.conversations TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.elo_history TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.elo_history TO authenticated;
GRANT SELECT ON public.format_rules TO anon;
GRANT SELECT ON public.format_rules TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_player_post_applications TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_player_post_applications TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_player_posts TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_player_posts TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_team_post_applications TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_team_post_applications TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_team_posts TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.market_team_posts TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.match_dispute_votes TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.match_dispute_votes TO authenticated;
GRANT SELECT ON public.match_goals TO authenticated;
GRANT DELETE, SELECT ON public.match_participants TO anon;
GRANT SELECT ON public.match_participants TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.match_proposals TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.match_proposals TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.match_results TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.match_results TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.matches TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.matches TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.messages TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.messages TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.notifications TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT ON public.profile_attributions TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.profile_badges TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.profile_badges TO authenticated;
GRANT DELETE, INSERT ON public.profiles TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.result_dispute_votes TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.result_dispute_votes TO authenticated;
GRANT SELECT ON public.season_standings_formats TO anon;
GRANT SELECT ON public.season_standings_formats TO authenticated;
GRANT SELECT ON public.season_standings TO anon;
GRANT SELECT ON public.season_standings TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.seasons TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.seasons TO authenticated;
GRANT SELECT ON public.social_accounts TO authenticated;
GRANT SELECT ON public.social_metrics_daily TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.team_join_requests TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.team_join_requests TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.team_members TO anon;
GRANT INSERT, SELECT, UPDATE ON public.team_members TO authenticated;
GRANT SELECT ON public.team_rankings TO anon;
GRANT SELECT ON public.team_rankings TO authenticated;
GRANT SELECT ON public.team_stints TO anon;
GRANT SELECT ON public.team_stints TO authenticated;
GRANT SELECT ON public.team_zone_changes TO authenticated;
GRANT DELETE, INSERT, SELECT ON public.teams TO anon;
GRANT DELETE, INSERT, SELECT ON public.teams TO authenticated;
GRANT DELETE, INSERT, SELECT ON public.user_blocks TO anon;
GRANT DELETE, INSERT, SELECT ON public.user_blocks TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.venues TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.venues TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.wo_claims TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.wo_claims TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.zones TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.zones TO authenticated;
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.v_player_stats TO authenticated;
GRANT SELECT ON public.v_team_ranking TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.v_venues TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.v_venues TO authenticated;

-- ── 2. Sin TRUNCATE para los roles cliente ──────────────────────────────────
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
