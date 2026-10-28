-- ============================================================
-- Zona: Villa Carlos Paz
-- 2026-10-28 · Expansión por demanda (D-71)
-- ------------------------------------------------------------
-- La jugadora de Córdoba que pidió su zona es de Villa Carlos Paz, no de
-- Córdoba Capital (20261028140000, que queda igual). Una zona por ciudad; las
-- canchas se cargan aparte con el scraper. La app lee la tabla en vivo
-- (lib/zones-data.ts): no necesita OTA.
-- ============================================================

INSERT INTO public.zones (name, slug)
VALUES ('Villa Carlos Paz', 'villa-carlos-paz')
ON CONFLICT DO NOTHING;
