-- ============================================================
-- Zona Juan Bautista Alberdi (Tucumán) · 25/11/2026
-- ------------------------------------------------------------
-- Pedido «alberdi» en la app (place_request del 25/11) y por DM de Instagram,
-- donde aclararon que es la ciudad de Tucumán. Completa 20261125170000.
-- ============================================================

INSERT INTO public.zones (name, slug)
VALUES ('Juan Bautista Alberdi', 'juan-bautista-alberdi')
ON CONFLICT DO NOTHING;
