-- ============================================================
-- search_path fijo en las 2 funciones que el linter de Supabase marca
-- 2026-11-25 · Registro P2-9 (advisor function_search_path_mutable)
-- ------------------------------------------------------------
-- Sin search_path fijo, quien pueda crear objetos en un schema que esté antes
-- en el search_path del que llama podría hacer que la función resuelva otra
-- tabla o función. Las dos sólo usan public (o nada), así que se fija a public.
-- No cambia el comportamiento.
-- ============================================================

ALTER FUNCTION public.teams_clear_ambassador_on_insert() SET search_path = public;
ALTER FUNCTION public.storage_shields_object_url()       SET search_path = public;
