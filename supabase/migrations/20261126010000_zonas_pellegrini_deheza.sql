-- ============================================================
-- Zonas Carlos Pellegrini (Santa Fe) y General Deheza (Córdoba) · 25/11/2026
-- ------------------------------------------------------------
-- Pedidas en la app (place_request del 25/11: «Carlos pellegrini» y
-- «general deheza») y por DM de Instagram. Sigue a 20261125180000.
-- ============================================================

INSERT INTO public.zones (name, slug)
VALUES
  ('Carlos Pellegrini', 'carlos-pellegrini'),
  ('General Deheza', 'general-deheza')
ON CONFLICT DO NOTHING;
