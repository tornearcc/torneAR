-- ============================================================
-- Zona: Rosario
-- 2026-11-24 · Expansión por demanda (D-71)
-- ------------------------------------------------------------
-- El estadio de clubes trajo mucho público de Rosario (Central y Newell's
-- entre los no grandes con más hinchas). Una zona por ciudad; las canchas se
-- cargan aparte con el scraper. La app lee la tabla en vivo
-- (lib/zones-data.ts): no necesita OTA.
-- ============================================================

INSERT INTO public.zones (name, slug)
VALUES ('Rosario', 'rosario')
ON CONFLICT DO NOTHING;
