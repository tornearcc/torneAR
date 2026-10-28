-- ============================================================
-- Zona: Córdoba Capital
-- 2026-10-28 · Expansión por demanda
-- ------------------------------------------------------------
-- Segunda ciudad fuera del AMBA (después de Mar del Plata, 20261027120000):
-- escribió una jugadora de Córdoba Capital y la zona es obligatoria para crear
-- un equipo. Criterio acordado el 28/10: las ciudades nuevas se agregan a
-- medida que aparece alguien de ahí, una zona por ciudad mientras haya pocos
-- equipos. «Córdoba Capital» y no «Córdoba», para no confundirla con la
-- provincia. La app lee la tabla en vivo (lib/zones-data.ts): no necesita OTA.
-- ============================================================

INSERT INTO public.zones (name, slug)
VALUES ('Córdoba Capital', 'cordoba-capital')
ON CONFLICT DO NOTHING;
