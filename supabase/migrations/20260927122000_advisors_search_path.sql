-- ============================================================
-- Advisors de seguridad: search_path fijo — 2026-09-27
-- ------------------------------------------------------------
-- `get_advisors(security)` marca `function_search_path_mutable` en tres
-- funciones que se crearon sin `SET search_path`:
--   - avatar_object_path(text)      (20260925130000_avatar_file_cleanup)
--   - storage_avatars_object_url()  (20260925130000_avatar_file_cleanup)
--   - normalize_for_filter(text)    (20260911160000_content_filter)
--
-- Las tres son SQL puro que sólo usa funciones de pg_catalog (btrim, ltrim,
-- split_part, lower, translate, regexp_replace…), que se resuelven siempre,
-- así que el search_path queda vacío: no hay nada que un schema ajeno pueda
-- suplantar. Ninguna es SECURITY DEFINER, así que el riesgo real era bajo;
-- esto es para que el advisor quede limpio y el patrón no se copie.
--
-- Se hace con ALTER FUNCTION y no con CREATE OR REPLACE para no reescribir
-- los cuerpos. Idempotente.
-- ============================================================

ALTER FUNCTION public.avatar_object_path(text)     SET search_path = '';
ALTER FUNCTION public.storage_avatars_object_url() SET search_path = '';
ALTER FUNCTION public.normalize_for_filter(text)   SET search_path = '';
