-- ============================================================
-- 640-ambassador-program — programa de embajadores v2 (pgTAP)
-- ============================================================
-- Cubre 20261021120000_ambassador_program_v2.sql (P3-14, D-66).
-- Fixtures de seed_testing (profile 0b…NN <-> auth 0a…NN):
--   · free_agent (…10): sin equipos. Es el embajador que «crea» equipos.
--   · beta_nuevo (…09): sólo en Beta United → equipo propio al inscribirse.
--   · trotamundos (…11): en Alfa FC; se lo suma a Gamma para tener dos.
--   · cap_beta (…03): capitán de los equipos nuevos de los tests T-4/T-5.
--   · alfa_jug1 (…04): jugador (no capitán) de Alfa FC.
--
--   Parte 1 — inscripción, equipo propio y equipos traídos
--   T-1  programa apagado: las tres RPCs devuelven noop_disabled y no crean filas.
--   T-2  upsert_ambassador + asignación automática del equipo propio.
--   T-3  set_ambassador_own_team.
--   T-4  set_team_ambassador: caminos felices y rechazos.
--   T-5  set_team_ambassador: demasiado tarde y demo excluida.
--   T-6  prefill, alias, permisos de anon, insignia «Reclutador».
--
--   Parte 2 — premios y barrido: se suma en la tarea siguiente.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(56);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Equipos nuevos (superuser: no pasan por las policies).
insert into teams (id, name, category, zone, preferred_format, created_at) values
  ('0c000000-0000-0000-0000-0000000000d1', 'Nuevo X1', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours'),
  ('0c000000-0000-0000-0000-0000000000d2', 'Nuevo X2', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours'),
  ('0c000000-0000-0000-0000-0000000000d3', 'Nuevo X3', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours'),
  ('0c000000-0000-0000-0000-0000000000d4', 'Nuevo X4', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours'),
  ('0c000000-0000-0000-0000-0000000000d6', 'Viejo X6', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '25 hours'),
  ('0c000000-0000-0000-0000-0000000000d7', 'Jugado X7', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours'),
  ('0c000000-0000-0000-0000-0000000000d8', 'Demo X8',  'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours');

-- ── T-1: programa apagado ───────────────────────────────────────────────────
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000010');
select is(public.upsert_ambassador('juan', true, true, true), 'noop_disabled',
  'T-1: apagado, upsert_ambassador devuelve noop_disabled');
select is(public.set_ambassador_own_team('0c000000-0000-0000-0000-0000000000a0'), 'noop_disabled',
  'T-1: apagado, set_ambassador_own_team devuelve noop_disabled');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d1', 'cap_alfa'), 'noop_disabled',
  'T-1: apagado, set_team_ambassador devuelve noop_disabled');
select tests.clear_auth();
select is((select count(*)::int from public.ambassadors), 0, 'T-1: apagado no se crea ninguna fila');
select is((select count(*)::int from public.teams where ambassador_profile_id is not null), 0,
  'T-1: apagado no se marca ningún equipo traído');

update public.app_settings set value = 1 where key = 'ambassador_program_enabled';

-- ── T-2: inscripción ────────────────────────────────────────────────────────
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000010');
select is(public.upsert_ambassador('', true, true, true), 'noop_instagram', 'T-2: Instagram vacío → noop_instagram');
select is(public.upsert_ambassador('no valido!', true, true, true), 'noop_instagram', 'T-2: Instagram inválido → noop_instagram');
select is(public.upsert_ambassador('juan', true, false, true), 'noop_terms', 'T-2: sin aceptar las bases → noop_terms');
select is(public.upsert_ambassador('juan', true, true, false), 'noop_terms', 'T-2: sin confirmar mayoría de edad → noop_terms');
select is(public.upsert_ambassador('@Juan.Perez', true, true, true), 'created', 'T-2: alta → created');
select tests.clear_auth();

select results_eq(
  $$ select instagram, own_team_id, follow_verified_at, show_in_ranking, status, terms_version
       from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000010' $$,
  $$ values ('juan.perez'::text, null::uuid, null::timestamptz, true, 'ACTIVO'::text, 1) $$,
  'T-2: Instagram normalizado, sin equipo propio ni follow verificado, ranking y versión de bases guardados');

-- Crea un equipo (primer equipo) → queda como propio.
insert into public.team_members (team_id, profile_id, role)
  values ('0c000000-0000-0000-0000-0000000000d1', '0b000000-0000-0000-0000-000000000010', 'CAPITAN');
select is(
  (select own_team_id from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000010'),
  '0c000000-0000-0000-0000-0000000000d1'::uuid,
  'T-2: el primer equipo que crea queda como propio');
select isnt(
  (select own_team_set_at from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000010'),
  null::timestamptz, 'T-2: la asignación automática deja own_team_set_at');

-- Se suma a un segundo → no cambia.
insert into public.team_members (team_id, profile_id, role)
  values ('0c000000-0000-0000-0000-0000000000d2', '0b000000-0000-0000-0000-000000000010', 'JUGADOR');
select is(
  (select own_team_id from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000010'),
  '0c000000-0000-0000-0000-0000000000d1'::uuid,
  'T-2: sumarse a un segundo equipo no pisa el propio');

-- Cambiar el Instagram baja el follow verificado.
update public.ambassadors set follow_verified_at = now() where profile_id = '0b000000-0000-0000-0000-000000000010';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000010');
select is(public.upsert_ambassador('juan.perez', false, true, true), 'updated', 'T-2: misma cuenta, otro ranking → updated');
select tests.clear_auth();
select isnt(
  (select follow_verified_at from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000010'),
  null::timestamptz, 'T-2: si el Instagram no cambia, el follow sigue verificado');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000010');
select is(public.upsert_ambassador('juan.nuevo', false, true, true), 'updated', 'T-2: cambiar Instagram → updated');
select tests.clear_auth();
select results_eq(
  $$ select instagram, show_in_ranking, follow_verified_at from public.ambassadors
      where profile_id = '0b000000-0000-0000-0000-000000000010' $$,
  $$ values ('juan.nuevo'::text, false, null::timestamptz) $$,
  'T-2: cambiar Instagram deja follow_verified_at en NULL');

-- Un solo equipo elegible al inscribirse (Beta United) → asignado.
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000009');
select is(public.upsert_ambassador('beta.nuevo', false, true, true), 'created', 'T-2: alta de quien está en un solo equipo');
select tests.clear_auth();
select is(
  (select own_team_id from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000009'),
  '0c000000-0000-0000-0000-0000000000b0'::uuid,
  'T-2: con un solo equipo elegible queda como propio al inscribirse');

-- Dos equipos elegibles al inscribirse → NULL (la app pregunta).
insert into public.team_members (team_id, profile_id, role)
  values ('0c000000-0000-0000-0000-0000000000c0', '0b000000-0000-0000-0000-000000000011', 'JUGADOR');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000011');
select is(public.upsert_ambassador('trota', false, true, true), 'created', 'T-2: alta de quien está en dos equipos');
select tests.clear_auth();
select is(
  (select own_team_id from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000011'),
  null::uuid, 'T-2: con dos equipos elegibles no se asigna ninguno');

-- ── T-3: set_ambassador_own_team ────────────────────────────────────────────
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000011');
select is(public.set_ambassador_own_team('0c000000-0000-0000-0000-0000000000b0'), 'noop_not_member',
  'T-3: equipo donde no es integrante → noop_not_member');
select is(public.set_ambassador_own_team('0c000000-0000-0000-0000-0000000000a0'), 'applied',
  'T-3: equipo propio → applied');
select tests.clear_auth();
select is(
  (select own_team_id from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000011'),
  '0c000000-0000-0000-0000-0000000000a0'::uuid, 'T-3: queda cargado el equipo propio');

-- Otro embajador (cap_alfa) con el mismo equipo → ocupado. Se inscribe cuando Alfa ya es de otro.
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');
select is(public.upsert_ambassador('cap.alfa', false, true, true), 'created', 'T-3: alta de cap_alfa (Alfa ya es de otro)');
select is(public.set_ambassador_own_team('0c000000-0000-0000-0000-0000000000a0'), 'noop_team_taken',
  'T-3: equipo propio de otro embajador → noop_team_taken');
select tests.clear_auth();
select is(
  (select own_team_id from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000002'),
  null::uuid, 'T-3: la asignación automática tampoco toma un equipo ocupado');

-- Equipo traído: Gamma lo trajo free_agent.
update public.teams set ambassador_profile_id = '0b000000-0000-0000-0000-000000000010'
 where id = '0c000000-0000-0000-0000-0000000000c0';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000011');
select is(public.set_ambassador_own_team('0c000000-0000-0000-0000-0000000000c0'), 'noop_team_brought',
  'T-3: equipo traído → noop_team_brought');
select tests.clear_auth();

-- Con el primer partido procesado queda fijo.
update public.ambassadors set own_team_first_match_id = '0d000000-0000-0000-0000-000000000001'
 where profile_id = '0b000000-0000-0000-0000-000000000011';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000011');
select is(public.set_ambassador_own_team(null), 'noop_locked', 'T-3: con primer partido cargado → noop_locked');
select tests.clear_auth();
update public.ambassadors set own_team_first_match_id = null
 where profile_id = '0b000000-0000-0000-0000-000000000011';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000011');
select is(public.set_ambassador_own_team(null), 'applied', 'T-3: NULL antes del primer partido → applied');
select tests.clear_auth();
select is(
  (select own_team_id from public.ambassadors where profile_id = '0b000000-0000-0000-0000-000000000011'),
  null::uuid, 'T-3: queda sin equipo propio');

-- ── T-4: set_team_ambassador ────────────────────────────────────────────────
-- cap_beta es capitán de X3 (2 h) y de X1 (propio de free_agent); alfa_jug1 es jugador de Alfa.
insert into public.team_members (team_id, profile_id, role) values
  ('0c000000-0000-0000-0000-0000000000d3', '0b000000-0000-0000-0000-000000000003', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000000d1', '0b000000-0000-0000-0000-000000000003', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000000d4', '0b000000-0000-0000-0000-000000000010', 'CAPITAN');
update public.ambassadors set status = 'SUSPENDIDO' where profile_id = '0b000000-0000-0000-0000-000000000009';

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000003');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d3', 'usuario_que_no_existe'), 'noop_invalid',
  'T-4: usuario inexistente → noop_invalid');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d3', 'cap_gamma'), 'noop_invalid',
  'T-4: usuario no inscripto como embajador → noop_invalid');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d3', 'beta_nuevo'), 'noop_invalid',
  'T-4: embajador SUSPENDIDO → noop_invalid');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d1', 'trotamundos'), 'noop_is_own_team',
  'T-4: sobre el equipo propio de un embajador → noop_is_own_team');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d3', '@FREE_AGENT'), 'applied',
  'T-4: capitán, equipo de 2 h, usuario en mayúsculas y con @ → applied');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d3', 'trotamundos'), 'noop_already_set',
  'T-4: segunda carga → noop_already_set');
select tests.clear_auth();
select is(
  (select ambassador_profile_id from public.teams where id = '0c000000-0000-0000-0000-0000000000d3'),
  '0b000000-0000-0000-0000-000000000010'::uuid, 'T-4: el equipo queda traído por free_agent');

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000010');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d4', 'free_agent'), 'noop_self',
  'T-4: el propio embajador → noop_self');
select tests.clear_auth();

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000004');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000a0', 'free_agent'), 'noop_not_captain',
  'T-4: jugador no capitán → noop_not_captain');
select tests.clear_auth();

-- ── T-5: demasiado tarde y demo ─────────────────────────────────────────────
insert into public.team_members (team_id, profile_id, role) values
  ('0c000000-0000-0000-0000-0000000000d6', '0b000000-0000-0000-0000-000000000003', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000000d7', '0b000000-0000-0000-0000-000000000003', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000000d8', '0b000000-0000-0000-0000-000000000003', 'CAPITAN');
insert into public.matches (id, team_a_id, team_b_id, status, format, finished_at) values
  ('0d000000-0000-0000-0000-0000000000f7', '0c000000-0000-0000-0000-0000000000d7',
   '0c000000-0000-0000-0000-0000000000a0', 'FINALIZADO', 'FUTBOL_5', now());
insert into public.ambassador_exclusions (team_id, note)
  values ('0c000000-0000-0000-0000-0000000000d8', 'Demo (test)');

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000003');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d6', 'free_agent'), 'noop_too_late',
  'T-5: equipo de 25 h → noop_too_late');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d7', 'free_agent'), 'noop_too_late',
  'T-5: equipo de 2 h con un partido FINALIZADO → noop_too_late');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000d8', 'free_agent'), 'noop_excluded',
  'T-5: equipo demo → noop_excluded');
select tests.clear_auth();

-- ── T-6: prefill, alias, permisos, insignia ─────────────────────────────────
update public.profiles set referred_by = '0b000000-0000-0000-0000-000000000010'
 where id = '0b000000-0000-0000-0000-000000000004';   -- embajador activo
update public.profiles set referred_by = '0b000000-0000-0000-0000-000000000009'
 where id = '0b000000-0000-0000-0000-000000000005';   -- embajador suspendido
update public.profiles set referred_by = '0b000000-0000-0000-0000-000000000008'
 where id = '0b000000-0000-0000-0000-000000000006';   -- no inscripto

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000004');
select is(public.get_team_create_ambassador_prefill(), 'free_agent', 'T-6: prefill con referente embajador activo');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000005');
select is(public.get_team_create_ambassador_prefill(), null::text, 'T-6: prefill NULL con embajador suspendido');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000006');
select is(public.get_team_create_ambassador_prefill(), null::text, 'T-6: prefill NULL con referente no inscripto');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000007');
select is(public.get_team_create_ambassador_prefill(), null::text, 'T-6: prefill NULL sin referente');
select tests.clear_auth();

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000011');
select is(public.set_ambassador_payout_alias('abc'), 'noop_invalid', 'T-6: alias muy corto → noop_invalid');
select is(public.set_ambassador_payout_alias('mi.alias.mp'), 'applied', 'T-6: alias válido → applied');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000007');
select is(public.set_ambassador_payout_alias('mi.alias.mp'), 'noop_not_ambassador', 'T-6: sin inscripción → noop_not_ambassador');
select tests.clear_auth();

update public.app_settings set value = 0 where key = 'ambassador_program_enabled';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000004');
select is(public.get_team_create_ambassador_prefill(), null::text, 'T-6: prefill NULL con el programa apagado');
select tests.clear_auth();

select ok(
  not has_function_privilege('anon', 'public.upsert_ambassador(text,boolean,boolean,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_ambassador_own_team(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_ambassador_payout_alias(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_team_ambassador(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_team_create_ambassador_prefill()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_team_ambassador(uuid,text)', 'EXECUTE'),
  'T-6: anon no ejecuta ninguna RPC; authenticated sí');
select ok(
  not has_table_privilege('anon', 'public.ambassadors', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ambassadors', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ambassadors', 'INSERT')
  and not has_table_privilege('anon', 'public.ambassador_exclusions', 'SELECT'),
  'T-6: ni anon ni authenticated leen ni escriben las tablas del programa');
select is((select name from public.badges where slug = 'embajador'), 'Reclutador',
  'T-6: la insignia embajador se llama Reclutador');

-- Nadie puede crear un equipo ya «traído» desde la API.
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000010');
insert into public.teams (id, name, category, zone, preferred_format, ambassador_profile_id)
  values ('0c000000-0000-0000-0000-0000000000d9', 'Truchos', 'HOMBRES', 'Palermo', 'FUTBOL_5',
          '0b000000-0000-0000-0000-000000000010');
select tests.clear_auth();
select is((select ambassador_profile_id from public.teams where id = '0c000000-0000-0000-0000-0000000000d9'),
  null::uuid, 'T-6: un INSERT desde la API no puede marcar un equipo como traído');

select * from finish();
rollback;
