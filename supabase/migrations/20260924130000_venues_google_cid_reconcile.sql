-- ============================================================
-- venues.google_cid — reconciliar el repo con producción
-- 2026-09-24
-- ------------------------------------------------------------
-- Producción tiene `venues.google_cid` (text, nullable) y el índice único
-- parcial `venues_google_cid_key`, pero ninguna migración los crea: se
-- agregaron por fuera del historial, probablemente junto con la carga del
-- catálogo de complejos (las 6357 filas lo tienen completo al 24/09/2026).
--
-- Salió a la luz al regenerar `types/supabase.ts` desde una base local: el
-- tipo de `venues` perdía la columna que el dashboard ya tenía tipada. Una
-- base local, la de CI o una recreada desde cero no la tendrían.
--
-- Es el Google Maps CID del complejo, un identificador estable de Google:
-- el índice único evita cargar dos veces el mismo predio.
--
-- ⚠️ En producción la columna y el índice ya existen, así que las dos
-- sentencias (IF NOT EXISTS) no hacen nada: no toca datos ni reescribe la
-- tabla. Lo único que cambia allá es el COMMENT de la columna. El objetivo es
-- que el historial de migraciones describa la base real.
-- ============================================================

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS google_cid text;

CREATE UNIQUE INDEX IF NOT EXISTS venues_google_cid_key
  ON public.venues USING btree (google_cid)
  WHERE (google_cid IS NOT NULL);

COMMENT ON COLUMN public.venues.google_cid IS
  'Google Maps CID del complejo. Único cuando está cargado (venues_google_cid_key). Agregada en producción por fuera del historial; reconciliada en 20260924130000.';
