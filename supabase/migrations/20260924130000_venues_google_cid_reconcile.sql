-- ============================================================
-- venues.google_cid — reconciliar el repo con producción
-- 2026-09-24
-- ------------------------------------------------------------
-- Producción tiene `venues.google_cid` (text, nullable) y el índice único
-- parcial `venues_google_cid_key`, pero ninguna migración los crea: se
-- agregaron por fuera del historial.
--
-- Salió a la luz al regenerar `types/supabase.ts` desde una base local: el
-- tipo de `venues` perdía la columna que el dashboard ya tenía tipada. Una
-- base local, la de CI o una recreada desde cero no la tendrían.
--
-- ─── Qué guarda y de dónde sale ──────────────────────────────────────────────
-- Pese al nombre, NO es el CID decimal: es el feature ID de Google Maps del
-- complejo, con formato `0x<hex>:0x<hex>` (la segunda mitad es el CID en
-- hexadecimal). Lo produce el scraping de Google Maps de
-- `torneAR/scraping-canchas/` (carpeta fuera de los dos repos): 327 de los
-- 373 feature IDs de su `html/` están en producción. El catálogo actual —las
-- 6357 filas, todas con google_cid— se cargó el 26/08/2026 entre las 23:49:14
-- y las 23:49:29 UTC. El SQL de esa carga y el ALTER que agregó la columna no
-- están en la carpeta: su `sql/` es la versión anterior (35 complejos, sin
-- la columna, del 25/08). El índice único evita cargar dos veces el mismo
-- predio al re-importar.
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
  'Feature ID de Google Maps del complejo (0x<hex>:0x<hex>; la segunda mitad es el CID en hexadecimal), no el CID decimal. Origen: scraping de Google Maps de torneAR/scraping-canchas (fuera de los repos); carga del catálogo del 26/08/2026. Único cuando está cargado (venues_google_cid_key): evita duplicar un predio al re-importar. La columna se agregó en producción por fuera del historial; reconciliada en 20260924130000.';
