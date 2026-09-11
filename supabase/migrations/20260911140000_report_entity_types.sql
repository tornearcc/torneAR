-- ============================================================
-- TIPOS DE ENTIDAD DENUNCIABLE — sólo el ALTER TYPE
-- 2026-09-11
-- ------------------------------------------------------------
-- Guideline 1.2 pide «a mechanism for users to flag objectionable content».
-- Hoy sólo se puede denunciar un PERFIL o un PARTIDO, y las dos superficies
-- donde realmente hay contenido escrito por usuarios —los chats del Mercado y
-- las publicaciones— no tienen ninguna. Rechazo del 11/09/2026, submission
-- f80970f0.
--
-- ⚠️ Esta migración hace UNA sola cosa y va separada a propósito. Postgres
-- permite `ALTER TYPE ... ADD VALUE` dentro de una transacción, pero NO deja
-- usar el valor nuevo en esa misma transacción. `supabase db push` corre cada
-- archivo en su propia transacción, así que todo lo que consuma estos valores
-- tiene que vivir en una migración posterior — ver 20260911150000.
--
-- Dos valores para el Mercado y no uno: «market_posts» no existe como tabla,
-- son `market_team_posts` y `market_player_posts`. Con un valor genérico el
-- dashboard tendría que adivinar en cuál de las dos buscar el contenido
-- denunciado.
--
-- TEAM cubre los nombres y escudos de equipo, que también son contenido
-- cargado por usuarios y son reportables.
-- ============================================================

ALTER TYPE public.report_entity_type ADD VALUE IF NOT EXISTS 'MESSAGE';
ALTER TYPE public.report_entity_type ADD VALUE IF NOT EXISTS 'MARKET_TEAM_POST';
ALTER TYPE public.report_entity_type ADD VALUE IF NOT EXISTS 'MARKET_PLAYER_POST';
ALTER TYPE public.report_entity_type ADD VALUE IF NOT EXISTS 'TEAM';
