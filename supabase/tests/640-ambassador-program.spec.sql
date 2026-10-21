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
--   T-5b el embajador es o fue integrante del equipo → noop_ambassador_member (R8).
--   T-6  prefill, alias, permisos de anon, insignia «Reclutador», created_at forzado.
--
--   Parte 2 — premios y barrido (sweep_ambassador_rewards)
--   Perfiles propios 0b200000-…-NNN (helpers tests.amb_*), equipos de 7 en F7.
--   T-7   caso de $10.000: traído nuevo + debut del equipo propio.
--   T-8   el traído ya cobró → sólo DEBUT.
--   T-9   primer partido del propio contra un no traído → el debut se pierde.
--   T-10  embajador sin equipo propio.
--   T-11  jugadores repetidos no cuentan; el embajador en el traído (R8).
--   T-12  tope de equipos pagos, aviso único en app_logs, rechazo libera lugar.
--   T-12b bonos por 5 y 10 equipos; regeneración sólo tras rechazo automático (R2).
--   T-13  partidos inválidos, embajador suspendido, permisos, cron.
--
--   Parte 3 — lecturas y acciones de admin (perfiles 0b200000-…-401 a 560)
--   T-14  get_my_ambassador_overview (SIN_EQUIPO, DISPONIBLE, GANADO, PERDIDO, estados de los traídos).
--   T-15  public_ambassador_board: anon, sólo con ranking y premios, sin datos personales.
--   T-16  dashboard_* y admin_*: NOT_AUTHORIZED, pago con follow, rechazo en cascada,
--         bono «Bajó de N equipos» y su regeneración con la RPC real, lock del barrido.
--   R9    el DEBUT y el BONUS_5 del TEAM_BROUGHT que llena el último lugar sí se crean.
--   R10   sin pagos retroactivos tras una suspensión (reactivated_at).
--   R13   el DEBUT exige un TEAM_BROUGHT no rechazado del rival; rechazarlo arrastra el DEBUT.
--   T-17  canal embajador en log_link_click.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(213);

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

-- ── T-5b: el embajador es o fue integrante (R8) ─────────────────────────────
-- XA: free_agent (que ya tiene equipo propio) lo creó y le pasó la capitanía a
-- cap_beta; sigue como jugador. XB: free_agent estuvo y se fue (ciclo cerrado).
insert into teams (id, name, category, zone, preferred_format, created_at) values
  ('0c000000-0000-0000-0000-0000000000da', 'Amigos XA', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours'),
  ('0c000000-0000-0000-0000-0000000000db', 'Amigos XB', 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '2 hours');
insert into public.team_members (team_id, profile_id, role) values
  ('0c000000-0000-0000-0000-0000000000da', '0b000000-0000-0000-0000-000000000010', 'JUGADOR'),
  ('0c000000-0000-0000-0000-0000000000da', '0b000000-0000-0000-0000-000000000003', 'CAPITAN'),
  ('0c000000-0000-0000-0000-0000000000db', '0b000000-0000-0000-0000-000000000003', 'CAPITAN');
insert into public.team_stints (profile_id, team_id, team_name, started_at, ended_at, leave_reason, last_role)
  values ('0b000000-0000-0000-0000-000000000010', '0c000000-0000-0000-0000-0000000000db', 'Amigos XB',
          now() - interval '2 hours', now() - interval '1 hour', 'ABANDONO', 'CAPITAN');

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000003');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000da', 'free_agent'), 'noop_ambassador_member',
  'T-5b: el embajador es integrante del equipo → noop_ambassador_member');
select is(public.set_team_ambassador('0c000000-0000-0000-0000-0000000000db', 'free_agent'), 'noop_ambassador_member',
  'T-5b: el embajador fue integrante (ciclo cerrado) → noop_ambassador_member');
select tests.clear_auth();
select is((select count(*)::int from public.teams
            where id in ('0c000000-0000-0000-0000-0000000000da', '0c000000-0000-0000-0000-0000000000db')
              and ambassador_profile_id is not null), 0,
  'T-5b: ninguno de los dos queda como traído');

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

select ok(not has_column_privilege('authenticated', 'public.teams', 'ambassador_profile_id', 'UPDATE'),
  'T-6: authenticated no puede escribir teams.ambassador_profile_id con un UPDATE');

-- Un INSERT desde la API tampoco elige su created_at: la ventana de 24 h de
-- «¿Quién los invitó?» se cuenta desde el alta real.
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000010');
insert into public.teams (id, name, category, zone, preferred_format, created_at)
  values ('0c000000-0000-0000-0000-0000000000dc', 'Del futuro', 'HOMBRES', 'Palermo', 'FUTBOL_5',
          now() + interval '10 days');
select tests.clear_auth();
select is((select created_at from public.teams where id = '0c000000-0000-0000-0000-0000000000dc'),
  now(), 'T-6: un INSERT desde la API con created_at en el futuro queda con now()');


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — premios y barrido
-- ════════════════════════════════════════════════════════════════════════════
-- Estado limpio: sin embajadores ni equipos traídos de la parte 1.
delete from public.ambassadors;
update public.teams set ambassador_profile_id = null where ambassador_profile_id is not null;

-- Helpers (mueren con el ROLLBACK).
create function tests.amb_p(n int) returns uuid language sql immutable
  as $$ select ('0b200000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function tests.amb_t(n int) returns uuid language sql immutable
  as $$ select ('0c200000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function tests.amb_m(n int) returns uuid language sql immutable
  as $$ select ('0d200000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function tests.amb_r(a int, b int) returns int[] language sql immutable
  as $$ select array(select generate_series(a, b)) $$;

-- Equipo con sus integrantes (desde hace 30 días). p_amb = embajador que lo trajo.
create function tests.amb_team(p_team int, p_name text, p_players int[], p_amb int default null)
returns void language plpgsql as $$
begin
  insert into public.teams (id, name, category, zone, preferred_format, created_at, ambassador_profile_id)
  values (tests.amb_t(p_team), p_name, 'HOMBRES', 'Palermo', 'FUTBOL_7', now() - interval '40 days',
          case when p_amb is null then null else tests.amb_p(p_amb) end);
  insert into public.team_members (team_id, profile_id, role, joined_at)
  select tests.amb_t(p_team), tests.amb_p(u.x),
         (case when u.ord = 1 then 'CAPITAN' else 'JUGADOR' end)::team_role, now() - interval '30 days'
    from unnest(p_players) with ordinality as u(x, ord);
end $$;

create function tests.amb_match(p_id int, p_a int, p_b int, p_hours_ago int,
                                p_status match_status default 'FINALIZADO',
                                p_format team_format default 'FUTBOL_7',
                                p_checkin_b boolean default true)
returns void language sql as $$
  insert into public.matches (id, team_a_id, team_b_id, status, format, finished_at,
                              checkin_team_a_at, checkin_team_b_at)
  values (tests.amb_m(p_id), tests.amb_t(p_a), tests.amb_t(p_b), p_status, p_format,
          now() - make_interval(hours => p_hours_ago),
          now() - make_interval(hours => p_hours_ago + 2),
          case when p_checkin_b then now() - make_interval(hours => p_hours_ago + 2) end);
$$;

create function tests.amb_add(p int, p_own int default null, p_alias text default null,
                              p_follow boolean default false, p_status text default 'ACTIVO')
returns void language sql as $$
  insert into public.ambassadors (profile_id, instagram, terms_version, own_team_id, own_team_set_at,
                                  payout_alias, follow_verified_at, status)
  values (tests.amb_p(p), 'amb' || p, 1,
          case when p_own is null then null else tests.amb_t(p_own) end,
          case when p_own is null then null else now() - interval '20 days' end,
          p_alias, case when p_follow then now() end, p_status);
$$;

-- Cuántos premios (de un tipo) tiene un embajador.
create function tests.amb_n(p int, p_kind text default null, p_include_rejected boolean default false)
returns int language sql as $$
  select count(*)::int from public.ambassador_rewards
   where ambassador_profile_id = tests.amb_p(p)
     and (p_kind is null or kind = p_kind)
     and (p_include_rejected or status <> 'RECHAZADO');
$$;

-- 400 perfiles: amb_p1 … amb_p400.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('0a200000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'amb.p' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from generate_series(1, 400) g;
insert into public.profiles (id, auth_user_id, username, full_name, zone)
select tests.amb_p(g), ('0a200000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'amb_p' || g, 'Jugador ' || g, 'Palermo'
  from generate_series(1, 400) g;

-- ── T-7: el caso de $10.000 ─────────────────────────────────────────────────
-- E1 (p1) con equipo propio A1 (p1..p7) juega su primer partido contra B1
-- (p8..p14), que trajo él y también debuta.
select tests.amb_team(1, 'Propio A1', tests.amb_r(1, 7));
select tests.amb_team(2, 'Traído B1', tests.amb_r(8, 14), 1);
select tests.amb_add(1, 1);
select tests.amb_match(1, 1, 2, 100);

-- Programa apagado (lo dejó así T-6) → 0.
select is(public.sweep_ambassador_rewards(), 0, 'T-13: programa apagado → sweep 0');
update public.app_settings set value = 1 where key = 'ambassador_program_enabled';
select is(public.sweep_ambassador_rewards(), 0, 'T-13: start_epoch = 0 → sweep 0');
update public.app_settings set value = floor(extract(epoch from now() - interval '15 days'))
 where key = 'ambassador_program_start_epoch';

select is(public.sweep_ambassador_rewards(), 2, 'T-7: sweep crea 2 premios (TEAM_BROUGHT + DEBUT)');
select results_eq(
  $$ select kind, team_id, match_id, amount, status from public.ambassador_rewards
      where ambassador_profile_id = tests.amb_p(1) order by kind $$,
  $$ values ('DEBUT'::text, tests.amb_t(2), tests.amb_m(1), 5000::numeric, 'PENDIENTE'::text),
            ('TEAM_BROUGHT'::text, tests.amb_t(2), tests.amb_m(1), 5000::numeric, 'PENDIENTE'::text) $$,
  'T-7: TEAM_BROUGHT y DEBUT de $5.000 cada uno, con el traído y el partido');
select is(
  (select array(select unnest(counted_profile_ids) order by 1) from public.ambassador_rewards
    where ambassador_profile_id = tests.amb_p(1) and kind = 'TEAM_BROUGHT'),
  array(select tests.amb_p(g) from generate_series(8, 14) g order by 1),
  'T-7: counted_profile_ids son los 7 de B1');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(1)),
  tests.amb_m(1), 'T-7: own_team_first_match_id queda cargado');
select results_eq(
  $$ select type::text, title, body, data->>'kind', data->>'url' from public.notifications
      where profile_id = tests.amb_p(1) $$,
  $$ values ('ANUNCIO', '¡Sumaste $10.000!',
             'Tu equipo debutó contra Traído B1, el equipo que trajiste. Cargá tu alias para cobrar. Recordá seguir a @tornear.app.',
             'ambassador_reward', 'tornear://ambassador') $$,
  'T-7: una sola notificación con $10.000, recordatorio de alias y de follow');
select is(public.sweep_ambassador_rewards(), 0, 'T-7: correr de nuevo → 0');
select is((select count(*)::int from public.notifications where profile_id = tests.amb_p(1)), 1,
  'T-7: correr de nuevo no manda otra notificación');

-- ── T-8: el traído ya cobró → sólo DEBUT ────────────────────────────────────
select tests.amb_team(3, 'Propio A2', tests.amb_r(20, 26));
select tests.amb_team(4, 'Traído C2', tests.amb_r(27, 33), 20);
select tests.amb_team(5, 'Rival X2', tests.amb_r(34, 40));
select tests.amb_add(20, 3, 'alias.e20', true);
select tests.amb_match(2, 4, 5, 99);
select is(public.sweep_ambassador_rewards(), 1, 'T-8: C2 vs X2 → 1 (TEAM_BROUGHT de C2)');
select tests.amb_match(3, 3, 4, 98);
select is(public.sweep_ambassador_rewards(), 1, 'T-8: primer partido de A2 contra C2 → 1');
select results_eq(
  $$ select kind, team_id, match_id from public.ambassador_rewards
      where ambassador_profile_id = tests.amb_p(20) order by kind $$,
  $$ values ('DEBUT'::text, tests.amb_t(4), tests.amb_m(3)),
            ('TEAM_BROUGHT'::text, tests.amb_t(4), tests.amb_m(2)) $$,
  'T-8: sólo un TEAM_BROUGHT (del primer partido de C2) y el DEBUT');
select results_eq(
  $$ select title, body from public.notifications where profile_id = tests.amb_p(20) order by body $$,
  $$ values ('¡Sumaste $5.000!', 'Traído C2 jugó su primer partido en TorneAR.'),
            ('¡Sumaste $5.000!', 'Tu equipo debutó contra Traído C2, el equipo que trajiste.') $$,
  'T-8: dos notificaciones de $5.000, sin recordatorios (alias y follow cargados)');

-- ── T-9: el primer partido del propio es contra un no traído ────────────────
select tests.amb_team(6, 'Propio A3', tests.amb_r(41, 47));
select tests.amb_team(7, 'Rival X3', tests.amb_r(48, 54));
select tests.amb_team(8, 'Traído D3', tests.amb_r(55, 61), 41);
select tests.amb_add(41, 6);
select tests.amb_match(4, 6, 7, 97);
select is(public.sweep_ambassador_rewards(), 0, 'T-9: A3 vs X3 (no traído) → 0');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(41)),
  tests.amb_m(4), 'T-9: own_team_first_match_id queda en ese partido');
select tests.amb_match(5, 6, 8, 96);
select is(public.sweep_ambassador_rewards(), 1, 'T-9: después A3 vs D3 → 1');
select results_eq(
  $$ select kind, team_id from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(41) $$,
  $$ values ('TEAM_BROUGHT'::text, tests.amb_t(8)) $$,
  'T-9: sólo el TEAM_BROUGHT de D3, sin DEBUT');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(41)),
  tests.amb_m(4), 'T-9: el primer partido no cambia');

-- ── T-10: embajador sin equipo propio ───────────────────────────────────────
select tests.amb_team(9, 'Traído B4', tests.amb_r(63, 69), 62);
select tests.amb_team(10, 'Rival X4', tests.amb_r(70, 76));
select tests.amb_add(62, null, 'alias.e62', true);
select tests.amb_match(6, 9, 10, 95);
select is(public.sweep_ambassador_rewards(), 1, 'T-10: B4 vs X4 → 1');
select results_eq(
  $$ select kind, amount from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(62) $$,
  $$ values ('TEAM_BROUGHT'::text, 5000::numeric) $$,
  'T-10: un TEAM_BROUGHT de $5.000');
select results_eq(
  $$ select title, body from public.notifications where profile_id = tests.amb_p(62) $$,
  $$ values ('¡Sumaste $5.000!', 'Traído B4 jugó su primer partido en TorneAR.') $$,
  'T-10: notificación de $5.000');
select tests.amb_match(7, 10, 9, 94);
select is(public.sweep_ambassador_rewards(), 0, 'T-10: un segundo partido de B4 → 0');

-- ── T-11: jugadores repetidos ───────────────────────────────────────────────
-- E5 (p77) con propio A5 (p77..p83). B5: 3 de A5 + 4 nuevos. D5: 7 nuevos.
-- C5: 2 de D5 + 5 nuevos. G5: 7 nuevos + el propio E5.
select tests.amb_team(11, 'Propio A5', tests.amb_r(77, 83));
select tests.amb_team(12, 'Traído B5', array[78, 79, 80, 84, 85, 86, 87], 77);
select tests.amb_team(13, 'Rival X5', tests.amb_r(88, 94));
select tests.amb_team(14, 'Traído D5', tests.amb_r(95, 101), 77);
select tests.amb_team(15, 'Traído C5', array[95, 96, 102, 103, 104, 105, 106], 77);
select tests.amb_team(16, 'Traído G5', tests.amb_r(109, 115) || 77, 77);
select tests.amb_add(77, 11);
select tests.amb_match(8, 12, 13, 90);
select tests.amb_match(9, 14, 13, 89);
select tests.amb_match(10, 15, 13, 88);
select is(public.sweep_ambassador_rewards(), 1, 'T-11: B5 (4 sin repetir), D5 (7), C5 (5 sin repetir) → 1');
select results_eq(
  $$ select team_id from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(77) $$,
  $$ values (tests.amb_t(14)) $$,
  'T-11: sólo paga D5; B5 y C5 no llegan al mínimo sin los repetidos');
-- C5 suma 2 nuevos y juega otro partido.
insert into public.team_members (team_id, profile_id, role, joined_at) values
  (tests.amb_t(15), tests.amb_p(107), 'JUGADOR', now() - interval '50 hours'),
  (tests.amb_t(15), tests.amb_p(108), 'JUGADOR', now() - interval '50 hours');
select tests.amb_match(11, 15, 13, 40);
select is(public.sweep_ambassador_rewards(), 1, 'T-11: C5 con 2 nuevos en otro partido válido → 1');
select is(
  (select array(select unnest(counted_profile_ids) order by 1) from public.ambassador_rewards
    where team_id = tests.amb_t(15) and kind = 'TEAM_BROUGHT'),
  array(select tests.amb_p(g) from generate_series(102, 108) g order by 1),
  'T-11: counted_profile_ids de C5 sin los 2 ya contados en D5');
select is((select match_id from public.ambassador_rewards where team_id = tests.amb_t(15)),
  tests.amb_m(11), 'T-11: el premio de C5 es del partido posterior');
-- R8: el embajador es integrante de su traído G5 al partido → no paga.
select tests.amb_match(12, 16, 13, 39);
select is(public.sweep_ambassador_rewards(), 0, 'T-11: el embajador es integrante de G5 → 0 (R8)');
select is((select count(*)::int from public.ambassador_rewards where team_id = tests.amb_t(16)), 0,
  'T-11: G5 no tiene premio');

-- ── T-12: tope de equipos pagos ─────────────────────────────────────────────
select tests.amb_team(17, 'Propio A6', tests.amb_r(120, 126));
select tests.amb_team(18, 'Traído B6a', tests.amb_r(127, 133), 120);
select tests.amb_team(19, 'Traído B6b', tests.amb_r(135, 141), 134);
select tests.amb_team(20, 'Traído B6c', tests.amb_r(143, 149), 142);
select tests.amb_team(21, 'Rival X6', tests.amb_r(150, 156));
select tests.amb_add(120, 17);
select tests.amb_add(134);
select tests.amb_add(142);
-- Quedan 2 lugares.
update public.app_settings
   set value = (select count(*) from public.ambassador_rewards
                 where kind = 'TEAM_BROUGHT' and status <> 'RECHAZADO') + 2
 where key = 'ambassador_max_paid_teams';
select tests.amb_match(13, 18, 21, 80);
select tests.amb_match(14, 19, 21, 79);
select tests.amb_match(15, 20, 21, 78);
select tests.amb_match(16, 17, 18, 77);   -- debut de A6 contra su traído, ya con el tope
select is(public.sweep_ambassador_rewards(), 2, 'T-12: con 2 lugares se crean 2 premios');
select results_eq(
  $$ select team_id from public.ambassador_rewards
      where team_id in (tests.amb_t(18), tests.amb_t(19), tests.amb_t(20)) order by team_id $$,
  $$ values (tests.amb_t(18)), (tests.amb_t(19)) $$,
  'T-12: pagan B6a y B6b (en orden de finished_at); B6c no');
select is(tests.amb_n(120, 'DEBUT'), 0, 'T-12: el debut que llega con el tope alcanzado no se crea');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(120)),
  tests.amb_m(16), 'T-12: ese partido igual queda como el primero del equipo propio');
select is((select count(*)::int from public.app_logs
            where level = 'warn' and details->>'event' = 'ambassador.slots_exhausted'), 1,
  'T-12: un aviso ambassador.slots_exhausted en app_logs');
select is(public.sweep_ambassador_rewards(), 0, 'T-12: correr de nuevo con el tope → 0');
select is((select count(*)::int from public.app_logs
            where details->>'event' = 'ambassador.slots_exhausted'), 1,
  'T-12: correr de nuevo no repite el aviso');
update public.ambassador_rewards set status = 'RECHAZADO', note = 'Prueba'
 where team_id = tests.amb_t(19) and kind = 'TEAM_BROUGHT';
select is(public.sweep_ambassador_rewards(), 1, 'T-12: rechazar uno libera el lugar → 1');
select is(tests.amb_n(142, 'TEAM_BROUGHT'), 1, 'T-12: paga el tercero (B6c)');
select is((select count(*)::int from public.ambassador_rewards where team_id = tests.amb_t(19)), 1,
  'T-12: el rechazado (B6b) no vuelve a cobrar (R1)');
select is(tests.amb_n(120, 'DEBUT'), 0, 'T-12: el debut perdido sigue perdido');
select is((select count(*)::int from public.app_logs
            where details->>'event' = 'ambassador.slots_exhausted'), 1,
  'T-12: sigue habiendo un solo aviso');
update public.app_settings set value = 100 where key = 'ambassador_max_paid_teams';

-- ── T-12b: bonos ────────────────────────────────────────────────────────────
-- E7 (p160) sin equipo propio, 10 traídos B7_k (equipos 22..31, p161..p230).
select tests.amb_team(32, 'Rival X7', tests.amb_r(231, 237));
select tests.amb_team(21 + k, 'Traído B7_' || k, tests.amb_r(161 + 7 * (k - 1), 167 + 7 * (k - 1)), 160)
  from generate_series(1, 10) k;
select tests.amb_add(160);
select tests.amb_match(16 + k, 21 + k, 32, 70 - k) from generate_series(1, 5) k;
select is(public.sweep_ambassador_rewards(), 6, 'T-12b: 5 traídos → 5 TEAM_BROUGHT + BONUS_5');
select is((select sum(amount) from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(160)),
  30000::numeric, 'T-12b: $30.000');
select results_eq(
  $$ select team_id, match_id, amount from public.ambassador_rewards
      where ambassador_profile_id = tests.amb_p(160) and kind = 'BONUS_5' $$,
  $$ values (tests.amb_t(26), tests.amb_m(21), 5000::numeric) $$,
  'T-12b: el BONUS_5 es del quinto traído');
select results_eq(
  $$ select title, body from public.notifications
      where profile_id = tests.amb_p(160) and data->>'match_id' = tests.amb_m(21)::text $$,
  $$ values ('¡Sumaste $10.000!',
             'Traído B7_5 jugó su primer partido en TorneAR (+ bono por 5 equipos). Cargá tu alias para cobrar. Recordá seguir a @tornear.app.') $$,
  'T-12b: la notificación del quinto incluye el bono');
select tests.amb_match(16 + k, 21 + k, 32, 60 - k) from generate_series(6, 10) k;
select is(public.sweep_ambassador_rewards(), 6, 'T-12b: 5 traídos más → 5 TEAM_BROUGHT + BONUS_10');
select is((select sum(amount) from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(160)),
  60000::numeric, 'T-12b: $60.000 en total');
select is(tests.amb_n(160, 'BONUS_10'), 1, 'T-12b: un BONUS_10');
select is(public.sweep_ambassador_rewards(), 0, 'T-12b: correr de nuevo → 0');
-- E8 (p240) con 4 traídos (equipos 33..36).
select tests.amb_team(32 + k, 'Traído B8_' || k, tests.amb_r(241 + 7 * (k - 1), 247 + 7 * (k - 1)), 240)
  from generate_series(1, 4) k;
select tests.amb_add(240);
select tests.amb_match(26 + k, 32 + k, 32, 50 - k) from generate_series(1, 4) k;
select is(public.sweep_ambassador_rewards(), 4, 'T-12b: otro embajador con 4 traídos → 4');
select is(tests.amb_n(240, 'BONUS_5'), 0, 'T-12b: con 4 no hay bono');
-- R2: E9 y E10 ya tienen 4 TEAM_BROUGHT y un BONUS_5 rechazado. Al de E9 lo
-- rechazó el sistema («Bajó de…»); al de E10, una persona.
select tests.amb_team(36 + k, 'Viejo E9_' || k, array[]::int[], 270) from generate_series(1, 4) k;
select tests.amb_team(41 + k, 'Viejo E10_' || k, array[]::int[], 280) from generate_series(1, 4) k;
select tests.amb_team(41, 'Traído B9', tests.amb_r(271, 277), 270);
select tests.amb_team(46, 'Traído B10', tests.amb_r(281, 287), 280);
select tests.amb_add(270);
select tests.amb_add(280);
insert into public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount)
select tests.amb_p(270), 'TEAM_BROUGHT', tests.amb_t(36 + k), tests.amb_m(17), 5000 from generate_series(1, 4) k
union all
select tests.amb_p(280), 'TEAM_BROUGHT', tests.amb_t(41 + k), tests.amb_m(17), 5000 from generate_series(1, 4) k;
insert into public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount, status, note) values
  (tests.amb_p(270), 'BONUS_5', tests.amb_t(37), tests.amb_m(17), 5000, 'RECHAZADO', 'Bajó de 5 equipos'),
  (tests.amb_p(280), 'BONUS_5', tests.amb_t(42), tests.amb_m(17), 5000, 'RECHAZADO', 'No corresponde');
select tests.amb_match(31, 41, 32, 45);
select tests.amb_match(32, 46, 32, 44);
select is(public.sweep_ambassador_rewards(), 3, 'T-12b: B9 y B10 pagan, y sólo E9 recupera el bono → 3');
select is(tests.amb_n(270, 'BONUS_5'), 1, 'T-12b: BONUS_5 rechazado automáticamente se vuelve a generar (R2)');
select is(tests.amb_n(280, 'BONUS_5'), 0, 'T-12b: BONUS_5 rechazado a mano no se vuelve a generar (R2)');

-- ── T-13: partidos inválidos y bordes ───────────────────────────────────────
-- E11 (p300) con propio A11 (p300..p306); todos sus partidos son inválidos.
select tests.amb_team(50, 'Propio A11', tests.amb_r(300, 306));
select tests.amb_team(51, 'Traído B11', tests.amb_r(307, 313), 300);
select tests.amb_team(52, 'Traído B11b', tests.amb_r(314, 319), 300);       -- 6 en F7
select tests.amb_team(53, 'Traído B11c', tests.amb_r(320, 326), 300);       -- excluido
select tests.amb_team(54, 'Traído B11d', tests.amb_r(327, 333), 300);       -- 1 cuenta eliminada
insert into public.ambassador_exclusions (team_id, note) values (tests.amb_t(53), 'Demo (test)');
update public.profiles set username = 'usuario_eliminado_333' where id = tests.amb_p(333);
select tests.amb_add(300, 50);
-- E12 (p340) suspendido, con un traído que juega un partido válido.
select tests.amb_team(55, 'Traído B12', tests.amb_r(341, 347), 340);
select tests.amb_team(56, 'Rival X12', tests.amb_r(348, 354));
select tests.amb_add(340, null, null, false, 'SUSPENDIDO');

select tests.amb_match(40, 50, 52, 30);                                 -- rival con 6
select tests.amb_match(41, 50, 51, 29, p_checkin_b => false);           -- sin check-in de B
select tests.amb_match(42, 50, 53, 28);                                 -- equipo excluido
select tests.amb_match(43, 50, 51, 27, 'WO_A');
select tests.amb_match(44, 50, 51, 26, 'EN_DISPUTA');
select tests.amb_match(45, 50, 51, 25, p_format => null);
select tests.amb_match(46, 50, 51, 18 * 24);                            -- antes de start_epoch
select tests.amb_match(47, 50, 54, 24);                                 -- 6 sin la cuenta eliminada
select tests.amb_match(48, 55, 56, 23);                                 -- embajador suspendido
select is(public.sweep_ambassador_rewards(), 0, 'T-13: partidos inválidos y embajador suspendido → 0');
select is(tests.amb_n(300, null, true) + tests.amb_n(340, null, true), 0,
  'T-13: ni E11 ni el suspendido tienen premios');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(300)),
  null::uuid, 'T-13: un partido inválido no cuenta como primero del equipo propio');

-- Un TEAM_BROUGHT con 7 que después pierde 2 sigue PENDIENTE.
delete from public.team_members
 where team_id = tests.amb_t(9) and profile_id in (tests.amb_p(68), tests.amb_p(69));
select is(public.sweep_ambassador_rewards(), 0, 'T-13: B4 pierde 2 integrantes → sweep 0');
select results_eq(
  $$ select status from public.ambassador_rewards where team_id = tests.amb_t(9) $$,
  $$ values ('PENDIENTE'::text) $$,
  'T-13: el TEAM_BROUGHT de B4 sigue PENDIENTE');

select throws_ok(
  $$ insert into public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount)
     values (tests.amb_p(1), 'TEAM_BROUGHT', tests.amb_t(2), tests.amb_m(1), 5000) $$,
  '23505', null, 'T-13: un equipo no puede tener dos TEAM_BROUGHT no rechazados');
select throws_ok(
  $$ insert into public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount)
     values (tests.amb_p(1), 'DEBUT', tests.amb_t(2), tests.amb_m(1), 5000) $$,
  '23505', null, 'T-13: un embajador no puede tener dos DEBUT no rechazados');

select results_eq(
  $$ select public.ambassador_required_members(f)
       from unnest(enum_range(null::team_format)) f $$,
  $$ values (5), (6), (7), (8), (9), (11) $$,
  'T-13: ambassador_required_members = 5, 6, 7, 8, 9, 11');
select is(public.ambassador_required_members(null), null::int, 'T-13: sin formato → NULL');

select ok(
  not has_function_privilege('anon', 'public.sweep_ambassador_rewards()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.sweep_ambassador_rewards()', 'EXECUTE'),
  'T-13: ni anon ni authenticated ejecutan el sweep');
select ok(
  not has_table_privilege('anon', 'public.ambassador_rewards', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ambassador_rewards', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ambassador_rewards', 'UPDATE'),
  'T-13: ni anon ni authenticated leen ni escriben ambassador_rewards');
select results_eq(
  $$ select schedule, command from cron.job where jobname = 'ambassador-rewards-sweep' $$,
  $$ values ('30 * * * *'::text, 'SELECT public.sweep_ambassador_rewards()'::text) $$,
  'T-13: el cron ambassador-rewards-sweep corre a los :30');


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 3 — lecturas (app, web pública, dashboard) y acciones de admin
-- ════════════════════════════════════════════════════════════════════════════
create function tests.amb_a(n int) returns uuid language sql immutable
  as $$ select ('0a200000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
-- id del premio de un equipo (los tests de admin corren como authenticated).
create function tests.amb_rw(p_team int, p_kind text default 'TEAM_BROUGHT') returns uuid
  language sql security definer as $$
  select id from public.ambassador_rewards
   where team_id = tests.amb_t(p_team) and kind = p_kind order by created_at limit 1 $$;

create function tests.amb_used() returns int language sql security definer as $$
  select count(*)::int from public.ambassador_rewards where kind = 'TEAM_BROUGHT' and status <> 'RECHAZADO' $$;
-- Lo que debería decir dashboard_ambassador_summary (comprometido = pendiente + pagado).
create function tests.amb_exp() returns table(slots_used int, committed numeric, paid numeric, ambs int, pending int)
  language sql security definer as $$
  select tests.amb_used(),
         (select coalesce(sum(amount), 0) from public.ambassador_rewards where status <> 'RECHAZADO'),
         (select coalesce(sum(amount), 0) from public.ambassador_rewards where status = 'PAGADO'),
         (select count(*)::int from public.ambassadors),
         (select count(*)::int from public.ambassadors where status = 'ACTIVO' and follow_verified_at is null) $$;

-- Perfiles 401..560: 401 admin, 402 sin inscribir, 403 inscripto común.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', tests.amb_a(g),
       'authenticated', 'authenticated', 'amb.p' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from generate_series(401, 560) g;
insert into public.profiles (id, auth_user_id, username, full_name, zone)
select tests.amb_p(g), tests.amb_a(g), 'amb_p' || g, 'Jugador ' || g, 'Palermo'
  from generate_series(401, 560) g;
update public.profiles set is_admin = true where id = tests.amb_p(401);

-- ── T-14: get_my_ambassador_overview ────────────────────────────────────────
select tests.authenticate_as_profile(tests.amb_a(402));
select is((public.get_my_ambassador_overview()->>'registered')::boolean, false,
  'T-14: un no inscripto → registered = false');
select is((public.get_my_ambassador_overview()->>'enabled')::boolean, true,
  'T-14: enabled = true con el programa prendido');
select tests.authenticate_as_profile(tests.amb_a(62));
select is(public.get_my_ambassador_overview()->>'debut_state', 'SIN_EQUIPO',
  'T-14: embajador sin equipo propio → debut_state SIN_EQUIPO');
select is(jsonb_typeof(public.get_my_ambassador_overview()->'own_team'), 'null',
  'T-14: sin equipo propio, own_team es null');
select results_eq(
  $$ select (o->>'teams_counted')::int, (o->>'earned_total')::numeric, (o->>'paid_total')::numeric, (o->>'next_bonus_at')::int
       from (select public.get_my_ambassador_overview() o) s $$,
  $$ values (1, 5000::numeric, 0::numeric, 5) $$,
  'T-14: contadores del embajador sin equipo propio');
select tests.authenticate_as_profile(tests.amb_a(1));
select results_eq(
  $$ select o->>'debut_state', (o->>'earned_total')::numeric, o->'own_team'->>'name',
            (o->'own_team'->>'members_now')::int, (o->'own_team'->>'members_needed')::int,
            o->>'username', o->>'instagram', (o->>'has_payout_alias')::boolean, (o->>'follow_verified')::boolean
       from (select public.get_my_ambassador_overview() o) s $$,
  $$ values ('GANADO'::text, 10000::numeric, 'Propio A1'::text, 7, 7, 'amb_p1'::text, 'amb1'::text, false, false) $$,
  'T-14: tras T-7, debut GANADO, $10.000 y datos del equipo propio');
select results_eq(
  $$ select e->>'name', e->>'state', (e->>'amount')::numeric, (e->>'members_now')::int, (e->>'members_needed')::int
       from jsonb_array_elements(public.get_my_ambassador_overview()->'brought_teams') e $$,
  $$ values ('Traído B1'::text, 'PENDIENTE'::text, 5000::numeric, 7, 7) $$,
  'T-14: el traído B1 está PENDIENTE con $5.000');
select is((public.get_my_ambassador_overview()->>'slots_left')::int, 100 - tests.amb_used(),
  'T-14: slots_left = tope - ocupados');
select tests.authenticate_as_profile(tests.amb_a(20));
select results_eq(
  $$ select o->>'payout_alias', (o->>'has_payout_alias')::boolean from (select public.get_my_ambassador_overview() o) s $$,
  $$ values ('alias.e20'::text, true) $$,
  'T-14: el resumen trae el alias propio para poder corregirlo');
select tests.authenticate_as_profile(tests.amb_a(41));
select is(public.get_my_ambassador_overview()->>'debut_state', 'PERDIDO', 'T-14: tras T-9, debut PERDIDO');
select tests.authenticate_as_profile(tests.amb_a(134));
select is(
  (select e->>'state' from jsonb_array_elements(public.get_my_ambassador_overview()->'brought_teams') e
    where e->>'team_id' = tests.amb_t(19)::text),
  'RECHAZADO', 'T-14: un traído con premio rechazado figura RECHAZADO');
select tests.authenticate_as_profile(tests.amb_a(300));
select results_eq(
  $$ select o->>'debut_state', jsonb_array_length(o->'brought_teams'),
            (select e->>'state' from jsonb_array_elements(o->'brought_teams') e where e->>'name' = 'Traído B11'),
            (select (e->>'amount') is null from jsonb_array_elements(o->'brought_teams') e where e->>'name' = 'Traído B11'),
            (o->'eligible_own_teams') @> jsonb_build_array(jsonb_build_object('team_id', '0c200000-0000-0000-0000-000000000050', 'name', 'Propio A11'))
       from (select public.get_my_ambassador_overview() o) s $$,
  $$ values ('DISPONIBLE'::text, 4, 'ESPERANDO'::text, true, true) $$,
  'T-14: con equipo propio sin partido, DISPONIBLE; un traído que no jugó está ESPERANDO sin monto');
select tests.clear_auth();

-- ── T-15: tablero público ───────────────────────────────────────────────────
set local role anon;
select is(jsonb_array_length(public.public_ambassador_board()->'ranking'), 0,
  'T-15: anon ejecuta el tablero; con show_in_ranking = false no sale nadie');
reset role;
update public.ambassadors set show_in_ranking = true
 where profile_id in (tests.amb_p(1), tests.amb_p(20), tests.amb_p(62), tests.amb_p(300), tests.amb_p(340));
set local role anon;
select results_eq(
  $$ select e->>'username' from jsonb_array_elements(public.public_ambassador_board()->'ranking') with ordinality t(e, o)
      order by o $$,
  $$ values ('amb_p1'), ('amb_p20'), ('amb_p62') $$,
  'T-15: sólo ACTIVO con ranking y con premios, por ganado desc y usuario (sin E300 ni el suspendido)');
select is(
  (select array(select k from jsonb_object_keys(public.public_ambassador_board()->'ranking'->0) k order by k)),
  array['avatar_url', 'earned', 'teams', 'username'],
  'T-15: cada fila sólo trae username, avatar_url, teams y earned (sin nombre, mail ni Instagram)');
select results_eq(
  $$ select (b->'ranking'->0->>'teams')::int, (b->'ranking'->0->>'earned')::numeric,
            (b->>'slots_total')::int, (b->>'enabled')::boolean
       from (select public.public_ambassador_board() b) s $$,
  $$ values (1, 10000::numeric, 100, true) $$,
  'T-15: E1 figura con 1 equipo y $10.000; el tablero trae el tope');
select is(jsonb_array_length(public.public_ambassador_board(1)->'ranking'), 1, 'T-15: p_limit recorta');
reset role;
select ok(
  has_function_privilege('anon', 'public.public_ambassador_board(integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.public_ambassador_board(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_my_ambassador_overview()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_my_ambassador_overview()', 'EXECUTE'),
  'T-15: el tablero es público; el resumen propio sólo para authenticated');

-- ── T-16: admin ─────────────────────────────────────────────────────────────
select tests.authenticate_as_profile(tests.amb_a(403));
select throws_matching($$ select * from public.dashboard_ambassadors() $$, '^NOT_AUTHORIZED', 'T-16: dashboard_ambassadors exige is_admin');
select throws_matching($$ select * from public.dashboard_ambassador_rewards() $$, '^NOT_AUTHORIZED', 'T-16: dashboard_ambassador_rewards exige is_admin');
select throws_matching($$ select * from public.dashboard_ambassador_summary() $$, '^NOT_AUTHORIZED', 'T-16: dashboard_ambassador_summary exige is_admin');
select throws_matching($$ select public.admin_set_ambassador_reward_status(gen_random_uuid(), 'PAGADO', null) $$, '^NOT_AUTHORIZED', 'T-16: admin_set_ambassador_reward_status exige is_admin');
select throws_matching($$ select public.admin_verify_ambassador_follow(gen_random_uuid(), true) $$, '^NOT_AUTHORIZED', 'T-16: admin_verify_ambassador_follow exige is_admin');
select throws_matching($$ select public.admin_set_ambassador_status(gen_random_uuid(), 'SUSPENDIDO', null) $$, '^NOT_AUTHORIZED', 'T-16: admin_set_ambassador_status exige is_admin');
select tests.clear_auth();
select ok(
  not has_function_privilege('anon', 'public.dashboard_ambassadors()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.dashboard_ambassador_rewards()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.dashboard_ambassador_summary()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_ambassador_reward_status(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_verify_ambassador_follow(uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_ambassador_status(uuid,text,text)', 'EXECUTE'),
  'T-16: anon no ejecuta ninguna función de admin');

-- Lecturas del dashboard.
select tests.authenticate_as_profile(tests.amb_a(401));
select results_eq(
  $$ select email, instagram, own_team_name, debut_state, teams_brought, earned, paid, status, show_in_ranking
       from public.dashboard_ambassadors() where profile_id = tests.amb_p(1) $$,
  $$ values ('amb.p1@test.local'::text, 'amb1'::text, 'Propio A1'::text, 'GANADO'::text, 1, 10000::numeric, 0::numeric, 'ACTIVO'::text, true) $$,
  'T-16: dashboard_ambassadors trae mail, equipo propio, debut y montos');
select results_eq(
  $$ select kind, team_name, rival_team_name, format, counted_members, amount, status, follow_verified
       from public.dashboard_ambassador_rewards()
      where ambassador_profile_id = tests.amb_p(1) and kind = 'TEAM_BROUGHT' $$,
  $$ values ('TEAM_BROUGHT'::text, 'Traído B1'::text, 'Propio A1'::text, 'FUTBOL_7'::text, 7, 5000::numeric, 'PENDIENTE'::text, false) $$,
  'T-16: dashboard_ambassador_rewards trae equipo, rival, formato y conteo');
select is((select status from public.dashboard_ambassador_rewards() limit 1), 'PENDIENTE',
  'T-16: los pendientes van primero');
select tests.clear_auth();

-- Pagar.
select tests.authenticate_as_profile(tests.amb_a(401));
select throws_matching(
  $$ select public.admin_set_ambassador_reward_status(tests.amb_rw(2), 'PAGADO', null) $$,
  'FOLLOW_NOT_VERIFIED', 'T-16: PAGADO sin follow verificado → FOLLOW_NOT_VERIFIED');
select throws_matching(
  $$ select public.admin_set_ambassador_reward_status(tests.amb_rw(2), 'XX', null) $$,
  'INVALID_STATUS', 'T-16: estado inválido → INVALID_STATUS');
select throws_matching(
  $$ select public.admin_set_ambassador_reward_status(gen_random_uuid(), 'PAGADO', null) $$,
  'REWARD_NOT_FOUND', 'T-16: premio inexistente → REWARD_NOT_FOUND');
select lives_ok($$ select public.admin_verify_ambassador_follow(tests.amb_p(1), true) $$, 'T-16: verificar el follow');
select lives_ok(
  $$ select public.admin_set_ambassador_reward_status(tests.amb_rw(2), 'PAGADO', 'MP 21/10') $$,
  'T-16: con follow verificado, PAGADO');
select throws_matching(
  $$ select public.admin_set_ambassador_reward_status(tests.amb_rw(2), 'RECHAZADO', 'me arrepentí') $$,
  'ALREADY_PAID', 'T-16: PAGADO → RECHAZADO → ALREADY_PAID');
select throws_matching(
  $$ select public.admin_set_ambassador_reward_status(tests.amb_rw(2), 'PAGADO', null) $$,
  'ALREADY_PAID', 'T-16: PAGADO → PAGADO → ALREADY_PAID');
select throws_matching(
  $$ select public.admin_set_ambassador_reward_status(tests.amb_rw(4, 'DEBUT'), 'RECHAZADO', null) $$,
  'NOTE_REQUIRED', 'T-16: rechazo sin nota → NOTE_REQUIRED');
select throws_matching(
  $$ select public.admin_set_ambassador_reward_status(tests.amb_rw(4, 'DEBUT'), 'RECHAZADO', '   ') $$,
  'NOTE_REQUIRED', 'T-16: rechazo con nota en blanco → NOTE_REQUIRED');
select tests.clear_auth();
select results_eq(
  $$ select status, paid_at is not null, paid_by, note from public.ambassador_rewards where id = tests.amb_rw(2) $$,
  $$ values ('PAGADO'::text, true, tests.amb_p(401), 'MP 21/10'::text) $$,
  'T-16: el pago deja paid_at, paid_by y la nota');
select ok((select follow_verified_at is not null and follow_verified_by = tests.amb_p(401)
             from public.ambassadors where profile_id = tests.amb_p(1)),
  'T-16: el follow queda verificado por el admin');
select tests.authenticate_as_profile(tests.amb_a(401));
select lives_ok($$ select public.admin_verify_ambassador_follow(tests.amb_p(1), false) $$, 'T-16: sacar la verificación');
select tests.clear_auth();
select ok((select follow_verified_at is null and follow_verified_by is null
             from public.ambassadors where profile_id = tests.amb_p(1)), 'T-16: sin verificación queda en null');

-- Rechazo en cascada (end-to-end con la RPC real y el barrido).
-- E410 (sin equipo propio) con 6 traídos de 7 que juegan contra X (team 60).
select tests.amb_team(60, 'Rival X13', tests.amb_r(411, 417));
select tests.amb_team(60 + k, 'Cas_' || k, tests.amb_r(418 + 7 * (k - 1), 424 + 7 * (k - 1)), 410)
  from generate_series(1, 6) k;
select tests.amb_add(410, null, 'alias.e410', true);
select tests.amb_match(60 + k, 60 + k, 60, 20 - k) from generate_series(1, 5) k;
select is(public.sweep_ambassador_rewards(), 6, 'T-16: 5 traídos → 5 TEAM_BROUGHT + BONUS_5');
select tests.authenticate_as_profile(tests.amb_a(401));
select lives_ok($$ select public.admin_set_ambassador_reward_status(tests.amb_rw(62), 'RECHAZADO', 'Jugadores falsos') $$,
  'T-16: rechazar uno de los 5');
select tests.clear_auth();
select results_eq(
  $$ select status, note from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(410) and kind = 'BONUS_5' $$,
  $$ values ('RECHAZADO'::text, 'Bajó de 5 equipos'::text) $$,
  'T-16: el BONUS_5 pendiente se rechaza junto con nota «Bajó de 5 equipos»');
select is(tests.amb_n(410, 'TEAM_BROUGHT'), 4, 'T-16: quedan 4 TEAM_BROUGHT no rechazados');
select is(public.sweep_ambassador_rewards(), 0, 'T-16: el rechazado no vuelve a cobrar y 4 no dan bono (R1)');
select tests.amb_match(66, 66, 60, 10);
select is(public.sweep_ambassador_rewards(), 2, 'T-16: un sexto traído válido → TEAM_BROUGHT + un BONUS_5 nuevo');
select is(tests.amb_n(410, 'BONUS_5'), 1, 'T-16: hay un solo BONUS_5 vigente');
select is(tests.amb_n(410, 'BONUS_5', true), 2, 'T-16: el rechazado automático queda de historial');
select tests.authenticate_as_profile(tests.amb_a(410));
select results_eq(
  $$ select (o->>'teams_counted')::int, (o->>'bonus_5_earned')::boolean, (o->>'bonus_10_earned')::boolean, (o->>'next_bonus_at')::int,
            (select e->>'state' from jsonb_array_elements(o->'brought_teams') e where e->>'name' = 'Cas_2')
       from (select public.get_my_ambassador_overview() o) s $$,
  $$ values (5, true, false, 10, 'RECHAZADO'::text) $$,
  'T-16: el resumen refleja el bono nuevo y el traído rechazado');
select tests.clear_auth();

-- Rechazar un TEAM_BROUGHT rechaza el DEBUT del mismo partido.
-- E460 con equipo propio (team 70) y un traído (team 71) que se enfrentan.
select tests.amb_team(70, 'Propio A14', tests.amb_r(460, 466));
select tests.amb_team(71, 'Traído B14', tests.amb_r(467, 473), 460);
select tests.amb_add(460, 70);
select tests.amb_match(70, 70, 71, 30);
select is(public.sweep_ambassador_rewards(), 2, 'T-16: TEAM_BROUGHT + DEBUT de E460');
select tests.authenticate_as_profile(tests.amb_a(401));
select lives_ok($$ select public.admin_set_ambassador_reward_status(tests.amb_rw(71), 'RECHAZADO', 'Mismo grupo') $$,
  'T-16: rechazar el TEAM_BROUGHT del partido del debut');
select tests.clear_auth();
select is(tests.amb_n(460, null), 0, 'T-16: el DEBUT del mismo partido se rechaza también');
select is(public.sweep_ambassador_rewards(), 0, 'T-16: ni el debut ni el traído se regeneran');

-- Los bonos pendientes bajan solos con el conteo; uno ya pagado se mantiene.
-- E480: 10 TEAM_BROUGHT + BONUS_5 + BONUS_10 pendientes. E490: 5 + BONUS_5 pagado.
select tests.amb_team(79 + k, 'Viejo E480_' || k, array[]::int[], 480) from generate_series(1, 10) k;
select tests.amb_team(89 + k, 'Viejo E490_' || k, array[]::int[], 490) from generate_series(1, 5) k;
select tests.amb_add(480);
select tests.amb_add(490);
insert into public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount)
select tests.amb_p(480), 'TEAM_BROUGHT', tests.amb_t(79 + k), tests.amb_m(17), 5000 from generate_series(1, 10) k
union all
select tests.amb_p(490), 'TEAM_BROUGHT', tests.amb_t(89 + k), tests.amb_m(17), 5000 from generate_series(1, 5) k;
insert into public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount, status) values
  (tests.amb_p(480), 'BONUS_5',  tests.amb_t(84), tests.amb_m(17), 5000, 'PENDIENTE'),
  (tests.amb_p(480), 'BONUS_10', tests.amb_t(89), tests.amb_m(17), 5000, 'PENDIENTE'),
  (tests.amb_p(490), 'BONUS_5',  tests.amb_t(94), tests.amb_m(17), 5000, 'PAGADO');
select tests.authenticate_as_profile(tests.amb_a(401));
select public.admin_set_ambassador_reward_status(tests.amb_rw(80), 'RECHAZADO', 'Prueba');
select tests.clear_auth();
select results_eq(
  $$ select kind, status, note from public.ambassador_rewards
      where ambassador_profile_id = tests.amb_p(480) and kind like 'BONUS%' order by kind $$,
  $$ values ('BONUS_10'::text, 'RECHAZADO'::text, 'Bajó de 10 equipos'::text), ('BONUS_5'::text, 'PENDIENTE'::text, null::text) $$,
  'T-16: con 9 baja el BONUS_10 («Bajó de 10 equipos») y el BONUS_5 sigue');
select tests.authenticate_as_profile(tests.amb_a(401));
select public.admin_set_ambassador_reward_status(tests.amb_rw(80 + k), 'RECHAZADO', 'Prueba') from generate_series(1, 5) k;
select public.admin_set_ambassador_reward_status(tests.amb_rw(90), 'RECHAZADO', 'Prueba');
select tests.clear_auth();
select results_eq(
  $$ select status, note from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(480) and kind = 'BONUS_5' $$,
  $$ values ('RECHAZADO'::text, 'Bajó de 5 equipos'::text) $$,
  'T-16: con 3 baja también el BONUS_5 («Bajó de 5 equipos»)');
select is((select status from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(490) and kind = 'BONUS_5'),
  'PAGADO', 'T-16: un bono ya PAGADO se mantiene');

-- Concurrencia: mismo lock que el barrido.
select ok(
  pg_get_functiondef('public.admin_set_ambassador_reward_status(uuid,text,text)'::regprocedure)
    like '%pg_advisory_xact_lock(hashtext(''sweep_ambassador_rewards''))%',
  'T-16: admin_set_ambassador_reward_status toma el lock del barrido');

-- ── R9: el DEBUT del partido que llena el último lugar sí se crea ───────────
-- E500: propio A (team 100) y traídos 101 y 102; rival 103. Quedan 2 lugares.
select tests.amb_team(100, 'Propio A15', tests.amb_r(500, 506));
select tests.amb_team(101, 'Traído B15a', tests.amb_r(507, 513), 500);
select tests.amb_team(102, 'Traído B15b', tests.amb_r(514, 520), 500);
select tests.amb_team(103, 'Rival X15', tests.amb_r(521, 527));
select tests.amb_add(500, 100);
update public.app_settings
   set value = (select count(*) from public.ambassador_rewards
                 where kind = 'TEAM_BROUGHT' and status <> 'RECHAZADO') + 2
 where key = 'ambassador_max_paid_teams';
select tests.amb_match(100, 101, 103, 15);
select tests.amb_match(101, 100, 102, 14);   -- su primer partido, contra el 2º traído (llena el tope)
select is(public.sweep_ambassador_rewards(), 3, 'R9: TEAM_BROUGHT + TEAM_BROUGHT + DEBUT con el tope recién llenado');
select results_eq(
  $$ select kind, team_id, amount from public.ambassador_rewards
      where ambassador_profile_id = tests.amb_p(500) and match_id = tests.amb_m(101) order by kind $$,
  $$ values ('DEBUT'::text, tests.amb_t(102), 5000::numeric), ('TEAM_BROUGHT'::text, tests.amb_t(102), 5000::numeric) $$,
  'R9: el partido del último lugar paga $10.000 (TEAM_BROUGHT + DEBUT)');
select is((select count(*)::int from public.ambassador_rewards where kind = 'TEAM_BROUGHT' and status <> 'RECHAZADO'),
  (select value::int from public.app_settings where key = 'ambassador_max_paid_teams'), 'R9: el tope quedó exacto');

-- R9b: un BONUS_5 disparado por el TEAM_BROUGHT que llena el último lugar sí se crea.
-- E530 ya tiene 4; su 5º traído (team 114) llena el tope.
select tests.amb_team(109 + k, 'Viejo E530_' || k, array[]::int[], 530) from generate_series(1, 4) k;
select tests.amb_team(114, 'Traído E530_5', tests.amb_r(531, 537), 530);
select tests.amb_add(530);
insert into public.ambassador_rewards (ambassador_profile_id, kind, team_id, match_id, amount, status)
select tests.amb_p(530), 'TEAM_BROUGHT', tests.amb_t(109 + k), tests.amb_m(17), 5000, 'PAGADO' from generate_series(1, 4) k;
update public.app_settings
   set value = (select count(*) from public.ambassador_rewards
                 where kind = 'TEAM_BROUGHT' and status <> 'RECHAZADO') + 1
 where key = 'ambassador_max_paid_teams';
select tests.amb_match(110, 114, 103, 13);
select is(public.sweep_ambassador_rewards(), 2, 'R9: el 5º traído llena el tope → TEAM_BROUGHT + BONUS_5');
select is(tests.amb_n(530, 'BONUS_5'), 1, 'R9: el BONUS_5 del último lugar se crea');
update public.app_settings set value = 100 where key = 'ambassador_max_paid_teams';

-- ── R10: sin pagos retroactivos tras una suspensión ─────────────────────────
-- E540 (suspendido) con equipo propio (team 120) y un traído (team 121); rival 122.
select tests.amb_team(120, 'Propio A16', tests.amb_r(540, 546));
select tests.amb_team(121, 'Traído B16', tests.amb_r(547, 553), 540);
select tests.amb_team(122, 'Rival X16', tests.amb_r(554, 560));
select tests.amb_add(540, 120, null, false, 'SUSPENDIDO');
select tests.amb_match(120, 121, 122, 10);   -- el traído juega su primer partido
select tests.amb_match(121, 120, 121, 9);    -- el propio juega contra el traído
select is(public.sweep_ambassador_rewards(), 0, 'R10: suspendido, el barrido no paga');
select tests.authenticate_as_profile(tests.amb_a(401));
select throws_matching($$ select public.admin_set_ambassador_status(tests.amb_p(540), 'BORRADO', null) $$,
  'INVALID_STATUS', 'R10: estado inválido → INVALID_STATUS');
select throws_matching($$ select public.admin_set_ambassador_status(gen_random_uuid(), 'ACTIVO', null) $$,
  'AMBASSADOR_NOT_FOUND', 'R10: embajador inexistente → AMBASSADOR_NOT_FOUND');
select lives_ok($$ select public.admin_set_ambassador_status(tests.amb_p(540), 'ACTIVO', 'Aclaró el malentendido') $$,
  'R10: reactivar');
select tests.clear_auth();
select ok((select status = 'ACTIVO' and reactivated_at is not null and status_note = 'Aclaró el malentendido'
             from public.ambassadors where profile_id = tests.amb_p(540)),
  'R10: reactivar deja status ACTIVO, reactivated_at y la nota');
select is(public.sweep_ambassador_rewards(), 0, 'R10: lo jugado durante la suspensión no se paga al reactivar');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(540)),
  null::uuid, 'R10: un partido de la suspensión no fija el primer partido del propio');
select tests.amb_match(122, 120, 121, 0);    -- ya reactivado
select is(public.sweep_ambassador_rewards(), 2, 'R10: un partido posterior válido paga (TEAM_BROUGHT + DEBUT)');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(540)),
  tests.amb_m(122), 'R10: el primer partido del propio es el posterior');
select tests.authenticate_as_profile(tests.amb_a(401));
select lives_ok($$ select public.admin_set_ambassador_status(tests.amb_p(540), 'SUSPENDIDO', 'Cuenta dudosa') $$,
  'R10: suspender');
select tests.clear_auth();
select ok((select status = 'SUSPENDIDO' and status_note = 'Cuenta dudosa' from public.ambassadors where profile_id = tests.amb_p(540)),
  'R10: suspender deja SUSPENDIDO y el motivo');

-- ── R13: el DEBUT exige que el rival haya generado su TEAM_BROUGHT ──────────
-- (a) E355: propio (team 130, p355..p362) y un «traído» (team 131) armado con
-- los 7 compañeros del propio. No cobra como traído, así que tampoco hay debut.
select tests.amb_team(130, 'Propio A17', tests.amb_r(355, 362));
select tests.amb_team(131, 'Traído B17', tests.amb_r(356, 362), 355);
select tests.amb_add(355, 130);
select tests.amb_match(130, 130, 131, 8);
select is(public.sweep_ambassador_rewards(), 0, 'R13: rival traído hecho con jugadores del propio → 0');
select is(tests.amb_n(355, null, true), 0, 'R13: ni TEAM_BROUGHT ni DEBUT para E355');
select is((select own_team_first_match_id from public.ambassadors where profile_id = tests.amb_p(355)),
  tests.amb_m(130), 'R13: ese partido igual queda como el primero del propio (debut perdido)');

-- (b) E363: propio (team 132) y un traído (team 133) al que E363 se sumó
-- después de vincularlo (R8): el traído no cobra y el debut tampoco.
select tests.amb_team(132, 'Propio A18', tests.amb_r(363, 369));
select tests.amb_team(133, 'Traído B18', tests.amb_r(370, 376), 363);
insert into public.team_members (team_id, profile_id, role, joined_at)
  values (tests.amb_t(133), tests.amb_p(363), 'JUGADOR', now() - interval '20 days');
select tests.amb_add(363, 132);
select tests.amb_match(131, 132, 133, 7);
select is(public.sweep_ambassador_rewards(), 0, 'R13: el embajador está en el traído rival (R8) → 0');
select is(tests.amb_n(363, null, true), 0, 'R13: ni TEAM_BROUGHT ni DEBUT para E363');

-- (c) E377: el traído C (team 135) cobra contra X (team 136) y después el
-- propio (team 134) debuta contra C. Rechazar el TEAM_BROUGHT de C (de otro
-- partido) rechaza también el DEBUT pendiente.
select tests.amb_team(134, 'Propio A19', tests.amb_r(377, 383));
select tests.amb_team(135, 'Traído C19', tests.amb_r(384, 390), 377);
select tests.amb_team(136, 'Rival X19', tests.amb_r(391, 397));
select tests.amb_add(377, 134);
select tests.amb_match(132, 135, 136, 6);
select tests.amb_match(133, 134, 135, 5);
select is(public.sweep_ambassador_rewards(), 2, 'R13: TEAM_BROUGHT de C19 y después el DEBUT contra C19');
select tests.authenticate_as_profile(tests.amb_a(401));
select lives_ok($$ select public.admin_set_ambassador_reward_status(tests.amb_rw(135), 'RECHAZADO', 'Mismo grupo') $$,
  'R13: rechazar el TEAM_BROUGHT de C19');
select tests.clear_auth();
select results_eq(
  $$ select kind, status from public.ambassador_rewards where ambassador_profile_id = tests.amb_p(377) order by kind $$,
  $$ values ('DEBUT'::text, 'RECHAZADO'::text), ('TEAM_BROUGHT'::text, 'RECHAZADO'::text) $$,
  'R13: el DEBUT pendiente contra C19, de otro partido, se rechaza también');
select is(public.sweep_ambassador_rewards(), 0, 'R13: ni el debut ni el traído se regeneran');

-- Resumen del dashboard (al final: ya hay de todo).
select tests.authenticate_as_profile(tests.amb_a(401));
select results_eq(
  $$ select enabled, slots_total, slots_used, committed, paid, ambassadors, pending_follow_checks from public.dashboard_ambassador_summary() $$,
  $$ select true, 100, e.slots_used, e.committed, e.paid, e.ambs, e.pending from tests.amb_exp() e $$,
  'T-16: dashboard_ambassador_summary: tope, ocupados, comprometido, pagado, embajadores y follows por verificar');
select tests.clear_auth();

-- ── T-17: canal embajador en /d/<canal> ─────────────────────────────────────
set local role anon;
select lives_ok($$ select public.log_link_click('embajador', 'ios') $$, 'T-17: anon registra el canal embajador');
reset role;
select is((select count(*)::int from public.link_clicks where channel = 'embajador'), 1, 'T-17: el click del canal embajador queda guardado');

select * from finish();
rollback;
