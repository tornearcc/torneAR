-- ============================================================
-- Tipo de notificación para moderación — sólo el ALTER TYPE
-- 2026-09-11
-- ------------------------------------------------------------
-- Habilita el aviso automático de denuncias nuevas (20260911190000).
--
-- ⚠️ Va sola, por el mismo motivo que 20260911140000: Postgres no deja usar un
-- valor de enum recién agregado dentro de la misma transacción, y
-- `supabase db push` corre cada archivo en la suya.
-- ============================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'DENUNCIA_NUEVA';
