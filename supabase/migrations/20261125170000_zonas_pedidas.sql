-- ============================================================
-- Zonas pedidas por Instagram y desde la app (25/11/2026)
-- ------------------------------------------------------------
-- Respuestas a la historia «¿Tu zona no está?» y place_request en la app.
-- De 21 lugares pedidos, 16 ya existían (City Bell, Bahía Blanca, Formosa,
-- Corrientes, La Rioja, San Justo, Quilmes, Merlo, Cañuelas, Ezeiza, Ushuaia,
-- San Luis, Neuquén, Paraná; Villa Caraza es parte de Lanús). Faltaban estas 4.
-- «Alberdi» queda afuera hasta saber cuál es (barrio de Córdoba o Rosario, o
-- Juan Bautista Alberdi en Tucumán). Las canchas se cargan aparte con el scraper.
-- La app lee la tabla en vivo: no necesita OTA.
-- ============================================================

INSERT INTO public.zones (name, slug)
VALUES
  ('Mina Clavero', 'mina-clavero'),
  ('Camilo Aldao', 'camilo-aldao'),
  ('Villa Cañas', 'villa-canas'),
  ('Camarones', 'camarones')
ON CONFLICT DO NOTHING;
