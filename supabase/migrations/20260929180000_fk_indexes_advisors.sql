-- ============================================================
-- Índices para las claves foráneas que marca el advisor de Supabase
-- 2026-09-29 · Tanda 5
-- ------------------------------------------------------------
-- `get_advisors` (performance) marcaba cuatro claves foráneas sin índice que
-- las cubra. Con el volumen de hoy no pesan, pero un DELETE en la tabla
-- referenciada (un perfil, una temporada, un secreto de Vault) recorre la
-- tabla entera sin índice.
--
-- Queda sin tocar la otra advertencia («multiple permissive policies» en
-- notifications y team_join_requests): unir esas políticas obliga a
-- reescribir la de INSERT de notifications, que es larga y crítica, para una
-- ganancia nula con este volumen.
-- ============================================================

CREATE INDEX IF NOT EXISTS app_feedback_profile_id_idx
  ON public.app_feedback (profile_id);
CREATE INDEX IF NOT EXISTS social_accounts_access_token_secret_id_idx
  ON public.social_accounts (access_token_secret_id);
CREATE INDEX IF NOT EXISTS team_zone_changes_changed_by_idx
  ON public.team_zone_changes (changed_by);
CREATE INDEX IF NOT EXISTS team_zone_changes_season_id_idx
  ON public.team_zone_changes (season_id);
