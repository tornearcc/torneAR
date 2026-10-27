-- ============================================================
-- Zona: Mar del Plata
-- 2026-10-27 · Primer embajador fuera del AMBA
-- ------------------------------------------------------------
-- El catálogo de `zones` cubría solo CABA, el conurbano y La Plata, y la zona
-- es obligatoria para crear un equipo. Un embajador de Mar del Plata que llegó
-- por la pauta no tenía cómo cargar su equipo ni los que trae. Una sola zona
-- para toda la ciudad mientras haya pocos equipos; se divide en barrios cuando
-- haga falta. La app lee la tabla en vivo (lib/zones-data.ts): no necesita OTA.
-- ============================================================

INSERT INTO public.zones (name, slug)
VALUES ('Mar del Plata', 'mar-del-plata')
ON CONFLICT DO NOTHING;
