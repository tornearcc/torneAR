-- ============================================================
-- 530-team-zone-lock — candado y normalización de teams.zone (pgTAP)
-- ============================================================
-- Cubre 20260928240000 (D-55, P3-9). Un equipo propio en Palermo con el
-- capitán del seed (auth …0001); el capitán de Tigres (auth …0004) hace de
-- admin sólo dentro de esta transacción. Zonas del catálogo del seed:
-- Palermo, Caballito, Almagro.
--
--   Z-1..Z-2  el primer cambio de la temporada pasa y queda registrado.
--   Z-3       el segundo cambio de la temporada se rechaza (ZONE_LOCKED).
--   Z-4       guardar el equipo sin tocar la zona sigue funcionando.
--   Z-5..Z-6  una zona fuera del catálogo se rechaza (ZONE_UNKNOWN), también
--             al crear un equipo.
--   Z-7..Z-9  la excepción de admin cambia la zona, queda registrada con motivo
--             y deja admin.set_team_zone en app_logs.
--   Z-10      la excepción no consume el cambio del equipo.
--   Z-11..Z-12 la RPC de admin exige is_admin y motivo.
--   Z-13..Z-14 renombrar una zona la propaga a los equipos sin contar como
--             mudanza.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(14);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
insert into teams (id, name, category, zone, preferred_format) values
  ('53000000-0000-0000-0000-0000000000a1', 'ZNL_A', 'HOMBRES', 'Palermo', 'FUTBOL_5');
insert into team_members (team_id, profile_id, role) values
  ('53000000-0000-0000-0000-0000000000a1', '33333333-3333-3333-3333-000000000001', 'CAPITAN');

update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

-- ── Z-1..Z-4. Una mudanza por temporada ─────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$ update teams set zone = 'Caballito' where id = '53000000-0000-0000-0000-0000000000a1' $$,
  'Z-1: el primer cambio de zona de la temporada pasa');

select tests.clear_auth();
select results_eq(
  $$ select c.from_zone, c.to_zone, c.is_admin_override, c.changed_by,
            c.season_id = (select id from seasons where is_active order by starts_at desc limit 1)
       from team_zone_changes c where c.team_id = '53000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('Palermo', 'Caballito', false, '33333333-3333-3333-3333-000000000001'::uuid, true) $$,
  'Z-2: la mudanza queda registrada con la temporada activa y quién la hizo');

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select throws_matching(
  $$ update teams set zone = 'Almagro' where id = '53000000-0000-0000-0000-0000000000a1' $$,
  '^ZONE_LOCKED',
  'Z-3: el segundo cambio de la temporada se rechaza');

select lives_ok(
  $$ update teams set zone = 'Caballito', name = 'ZNL_A2' where id = '53000000-0000-0000-0000-0000000000a1' $$,
  'Z-4: editar el equipo mandando la misma zona no cuenta como cambio');

-- ── Z-5..Z-6. Zona fuera del catálogo ───────────────────────────────────────
select throws_matching(
  $$ update teams set zone = 'Narnia' where id = '53000000-0000-0000-0000-0000000000a1' $$,
  '^ZONE_UNKNOWN',
  'Z-5: una zona que no está en el catálogo se rechaza');

select throws_matching(
  $$ select public.assert_team_zone_change_allowed(gen_random_uuid(), 'Narnia', false) $$,
  '^ZONE_UNKNOWN',
  'Z-6: también al crear un equipo (la misma validación, sin candado)');
select tests.clear_auth();

-- ── Z-7..Z-10. Excepción de admin ───────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select is(
  (select (public.admin_set_team_zone('53000000-0000-0000-0000-0000000000a1', 'Almagro',
                                      'Se mudaron de barrio (pedido por mail)')->>'changed')),
  'true',
  'Z-7: el admin cambia la zona aunque el equipo ya usó su cambio');
select tests.clear_auth();

select results_eq(
  $$ select c.from_zone, c.to_zone, c.is_admin_override, c.reason
       from team_zone_changes c
      where c.team_id = '53000000-0000-0000-0000-0000000000a1' and c.is_admin_override $$,
  $$ values ('Caballito', 'Almagro', true, 'Se mudaron de barrio (pedido por mail)') $$,
  'Z-8: la excepción queda registrada con su motivo');

select is(
  (select count(*)::int from app_logs where message = 'admin.set_team_zone'
     and details->>'team_id' = '53000000-0000-0000-0000-0000000000a1'
     and details->>'previous' = 'Caballito' and details->>'zone' = 'Almagro'),
  1,
  'Z-9: y deja admin.set_team_zone en app_logs');

-- Sin la mudanza propia de Z-1, al equipo sólo le queda la excepción del admin.
delete from team_zone_changes
 where team_id = '53000000-0000-0000-0000-0000000000a1' and not is_admin_override;

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok(
  $$ update teams set zone = 'Palermo' where id = '53000000-0000-0000-0000-0000000000a1' $$,
  'Z-10: la excepción del admin no consume el cambio del equipo');

-- ── Z-11..Z-12. Permisos y motivo de la RPC ─────────────────────────────────
select throws_matching(
  $$ select public.admin_set_team_zone('53000000-0000-0000-0000-0000000000a1', 'Almagro', 'x') $$,
  '^NOT_AUTHORIZED',
  'Z-11: un capitán que no es admin no puede usar la excepción');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_matching(
  $$ select public.admin_set_team_zone('53000000-0000-0000-0000-0000000000a1', 'Almagro', '  ') $$,
  '^REASON_REQUIRED',
  'Z-12: la excepción exige motivo');
select tests.clear_auth();

-- ── Z-13..Z-14. Renombrar una zona ──────────────────────────────────────────
create temp table z_before on commit drop as
  select count(*)::int as n from team_zone_changes where team_id = '53000000-0000-0000-0000-0000000000a1';

update zones set name = 'Palermo Viejo' where name = 'Palermo';

select is(
  (select zone from teams where id = '53000000-0000-0000-0000-0000000000a1'),
  'Palermo Viejo',
  'Z-13: renombrar la zona la propaga al equipo');

select is(
  (select count(*)::int from team_zone_changes where team_id = '53000000-0000-0000-0000-0000000000a1'),
  (select n from z_before),
  'Z-14: el renombre no cuenta como mudanza');

select * from finish();
rollback;
