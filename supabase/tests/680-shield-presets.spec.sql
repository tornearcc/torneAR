-- ============================================================
-- 680-shield-presets — escudos prediseñados (pgTAP)
-- ============================================================
-- Cubre 20261125140000 (P3-26):
--   P-1  default_shield_preset da un path de presets/escudo-01..15.png.
--   P-2  Es siempre el mismo para el mismo equipo.
--   P-3  Un equipo nuevo sin escudo toma su prediseñado.
--   P-4  Un equipo nuevo con foto la conserva.
--   P-5  Si shield_url pasa a NULL vuelve a su prediseñado.
--   P-6  El capitán puede elegir otro prediseñado (no se pisa).
--   P-7  Ningún equipo del seed queda sin escudo después del backfill.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(7);

select ok(
  default_shield_preset('d8d8d8d8-0000-0000-0000-000000000001') ~ '^presets/escudo-(0[1-9]|1[0-5])\.png$',
  'P-1: el path es uno de los 15 prediseñados');

select is(
  default_shield_preset('d8d8d8d8-0000-0000-0000-000000000001'),
  default_shield_preset('d8d8d8d8-0000-0000-0000-000000000001'),
  'P-2: siempre el mismo para el mismo equipo');

insert into teams (id, name, category, zone, preferred_format) values
  ('d8d8d8d8-0000-0000-0000-000000000001', 'Sin Escudo FC', 'HOMBRES', 'Palermo', 'FUTBOL_5');
insert into teams (id, name, category, zone, preferred_format, shield_url) values
  ('d8d8d8d8-0000-0000-0000-000000000002', 'Con Foto FC', 'HOMBRES', 'Palermo', 'FUTBOL_5',
   'd8d8d8d8-0000-0000-0000-000000000002/shield-1.jpg');

select is(
  (select shield_url from teams where id = 'd8d8d8d8-0000-0000-0000-000000000001'),
  default_shield_preset('d8d8d8d8-0000-0000-0000-000000000001'),
  'P-3: el equipo nuevo sin escudo toma su prediseñado');

select is(
  (select shield_url from teams where id = 'd8d8d8d8-0000-0000-0000-000000000002'),
  'd8d8d8d8-0000-0000-0000-000000000002/shield-1.jpg',
  'P-4: el que sube foto la conserva');

update teams set shield_url = null where id = 'd8d8d8d8-0000-0000-0000-000000000002';
select is(
  (select shield_url from teams where id = 'd8d8d8d8-0000-0000-0000-000000000002'),
  default_shield_preset('d8d8d8d8-0000-0000-0000-000000000002'),
  'P-5: si el escudo pasa a NULL vuelve a su prediseñado');

update teams set shield_url = 'presets/escudo-07.png' where id = 'd8d8d8d8-0000-0000-0000-000000000001';
select is(
  (select shield_url from teams where id = 'd8d8d8d8-0000-0000-0000-000000000001'),
  'presets/escudo-07.png',
  'P-6: elegir otro prediseñado se respeta');

select is(
  (select count(*)::int from teams where shield_url is null or btrim(shield_url) = ''),
  0,
  'P-7: ningún equipo queda sin escudo');

select * from finish();
rollback;
