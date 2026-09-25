-- ============================================================
-- 500-mixed-composition — F3: equipos MIXTO y categoría en ranking (pgTAP)
-- ============================================================
-- Cubre 20260925160000_mixed_composition (secciones 1 a 4).
--
--   C-1..C-5   mixed_composition_eval: cuenta, X, comodín, mínimo por formato y
--              el CHECK del catálogo.
--   C-6..C-7   con la bandera apagada no cambia nada, ni siquiera con un MIXTO
--              que no cumple.
--   C-8..C-12  bandera encendida: desafío (propio y rival), el lado no MIXTO
--              no se controla, aceptación de un desafío enviado ANTES de
--              encender la bandera, y aceptación con el plantel corregido.
--   C-13..C-14 confirmar la fecha controla con el formato acordado.
--   C-15..C-16 lista de titulares: los suplentes no cuentan.
--   C-17..C-20 check-in individual: el quórum sin composición no sella, la
--              llegada individual sí se registra, y sella al completarse.
--   C-21..C-24 ranking con la misma categoría: apagado, al aceptar, al enviar,
--              y misma categoría pasa.
--   C-25..C-28 get_mixed_composition_status: integrante, no integrante, equipo
--              no MIXTO y sin sesión.
--   C-29       las funciones internas no son ejecutables por la app.
--
-- Usuarios, equipos y partidos propios, con prefijos f3a0…/f3b0…/f3c0….
-- ============================================================

begin;
select plan(29);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
-- 01..05 → MXA (MIXTO): M, M, F, X y una F que entra y sale del plantel.
-- 11..15 → MXB (MIXTO): F, F, M, M y una F extra para el check-in.
-- 21     → HBA (HOMBRES), 22 → HBB (HOMBRES), 31 → MJA (MUJERES).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('f3a00000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'authenticated', 'authenticated', 'f3.mx' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from unnest(array[1,2,3,4,5,11,12,13,14,15,21,22,31]) g;

insert into profiles (id, auth_user_id, username, full_name, zone, gender)
select ('f3b00000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       ('f3a00000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       '__f3_mx' || g, 'F3 MX ' || g, 'Palermo', gen
from (values (1,'M'),(2,'M'),(3,'F'),(4,'X'),(5,'F'),
             (11,'F'),(12,'F'),(13,'M'),(14,'M'),(15,'F'),
             (21,'M'),(22,'M'),(31,'F')) v(g, gen);

insert into teams (id, name, category, zone, preferred_format) values
  ('f3c00000-0000-0000-0000-00000000000a', 'MXA', 'MIXTO',   'ZF3', 'FUTBOL_5'),
  ('f3c00000-0000-0000-0000-00000000000b', 'MXB', 'MIXTO',   'ZF3', 'FUTBOL_5'),
  ('f3c00000-0000-0000-0000-0000000000c1', 'HBA', 'HOMBRES', 'ZF3', 'FUTBOL_5'),
  ('f3c00000-0000-0000-0000-0000000000c2', 'HBB', 'HOMBRES', 'ZF3', 'FUTBOL_5'),
  ('f3c00000-0000-0000-0000-0000000000d1', 'MJA', 'MUJERES', 'ZF3', 'FUTBOL_5');

insert into team_members (team_id, profile_id, role) values
  ('f3c00000-0000-0000-0000-00000000000a', 'f3b00000-0000-0000-0000-000000000001', 'CAPITAN'),
  ('f3c00000-0000-0000-0000-00000000000a', 'f3b00000-0000-0000-0000-000000000002', 'JUGADOR'),
  ('f3c00000-0000-0000-0000-00000000000a', 'f3b00000-0000-0000-0000-000000000003', 'JUGADOR'),
  ('f3c00000-0000-0000-0000-00000000000a', 'f3b00000-0000-0000-0000-000000000004', 'JUGADOR'),
  ('f3c00000-0000-0000-0000-00000000000b', 'f3b00000-0000-0000-0000-000000000011', 'CAPITAN'),
  ('f3c00000-0000-0000-0000-00000000000b', 'f3b00000-0000-0000-0000-000000000012', 'JUGADOR'),
  ('f3c00000-0000-0000-0000-00000000000b', 'f3b00000-0000-0000-0000-000000000013', 'JUGADOR'),
  ('f3c00000-0000-0000-0000-00000000000b', 'f3b00000-0000-0000-0000-000000000014', 'JUGADOR'),
  ('f3c00000-0000-0000-0000-00000000000b', 'f3b00000-0000-0000-0000-000000000015', 'JUGADOR'),
  ('f3c00000-0000-0000-0000-0000000000c1', 'f3b00000-0000-0000-0000-000000000021', 'CAPITAN'),
  ('f3c00000-0000-0000-0000-0000000000c2', 'f3b00000-0000-0000-0000-000000000022', 'CAPITAN'),
  ('f3c00000-0000-0000-0000-0000000000d1', 'f3b00000-0000-0000-0000-000000000031', 'CAPITAN');

create temp table f3_ids on commit drop as
  select array(select profile_id from team_members
                where team_id = 'f3c00000-0000-0000-0000-00000000000a') as mxa;
grant select on f3_ids to authenticated;


-- ── C-1..C-5. Evaluación ────────────────────────────────────────────────────
select is(
  (select public.mixed_composition_eval(mxa, null) - 'xCountsAsAny' - 'minPerGender' from f3_ids),
  '{"ok": false, "male": 2, "female": 1, "other": 1, "unset": 0,
    "missingMale": 0, "missingFemale": 1, "missingTotal": 1}'::jsonb,
  'C-1: MXA (M, M, F, X) cuenta por género y le falta una F');

update app_settings set value = 1 where key = 'mixed_composition_x_counts_as_any';
select ok(
  (select (public.mixed_composition_eval(mxa, null)->>'ok')::boolean from f3_ids),
  'C-2: con X como comodín, la X cubre la F que falta');
update app_settings set value = 0 where key = 'mixed_composition_x_counts_as_any';

update format_rules set mixed_min_per_gender = 3 where format = 'FUTBOL_7';
select is(
  (select public.mixed_composition_eval(
     array(select profile_id from team_members where team_id = 'f3c00000-0000-0000-0000-00000000000b'),
     'FUTBOL_7')->>'missingMale'),
  '1',
  'C-3: con formato, el mínimo sale de ese formato (FUTBOL_7 pide 3)');

select ok(
  (select (public.mixed_composition_eval(
     array(select profile_id from team_members where team_id = 'f3c00000-0000-0000-0000-00000000000b'),
     null)->>'ok')::boolean),
  'C-4: sin formato, alcanza con el mínimo más bajo del catálogo');
update format_rules set mixed_min_per_gender = 2 where format = 'FUTBOL_7';

select throws_ok(
  $$ update format_rules set mixed_min_per_gender = 3 where format = 'FUTBOL_5' $$,
  '23514', null,
  'C-5: el catálogo no admite mínimos que no entran en la cancha (2 × 3 > 5)');


-- ── C-6..C-7. Bandera apagada ───────────────────────────────────────────────
select is(
  (select value from app_settings where key = 'mixed_composition_enforced'),
  0::numeric,
  'C-6: la migración deja la regla apagada');

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.send_challenge('f3c00000-0000-0000-0000-00000000000a',
                                  'f3c00000-0000-0000-0000-00000000000b', 'AMISTOSO') $$,
  'C-7: apagada, un MIXTO que no cumple desafía igual');
select tests.clear_auth();


-- ── C-8..C-12. Bandera encendida: desafíos ──────────────────────────────────
update app_settings set value = 1 where key = 'mixed_composition_enforced';

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.send_challenge('f3c00000-0000-0000-0000-00000000000a',
                                  'f3c00000-0000-0000-0000-0000000000d1', 'AMISTOSO') $$,
  'MIXED_COMPOSITION: el plantel de MXA no cumple la composición mínima de un equipo mixto (faltan 0 de género masculino y 1 de género femenino)',
  'C-8: al que desafía se le dice cuántos le faltan de cada género');
select tests.clear_auth();

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000031');
select throws_ok(
  $$ select public.send_challenge('f3c00000-0000-0000-0000-0000000000d1',
                                  'f3c00000-0000-0000-0000-00000000000a', 'AMISTOSO') $$,
  'MIXED_COMPOSITION: MXA no cumple la composición mínima de un equipo mixto',
  'C-9: del rival sólo se dice que no cumple, sin cantidades');

select lives_ok(
  $$ select public.send_challenge('f3c00000-0000-0000-0000-0000000000d1',
                                  'f3c00000-0000-0000-0000-00000000000b', 'AMISTOSO') $$,
  'C-10: amistoso MUJERES contra un MIXTO que cumple: el lado no MIXTO no se controla');
select tests.clear_auth();

-- El desafío de C-7 se envió con la regla apagada: al aceptarlo, se controla.
select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000011');
select throws_ok(
  $$ select public.accept_challenge(
       (select id from challenges where from_team_id = 'f3c00000-0000-0000-0000-00000000000a'
                                    and to_team_id   = 'f3c00000-0000-0000-0000-00000000000b')) $$,
  'MIXED_COMPOSITION: MXA no cumple la composición mínima de un equipo mixto',
  'C-11: un desafío enviado antes de encender la regla se controla al aceptarlo');
select tests.clear_auth();

insert into team_members (team_id, profile_id, role) values
  ('f3c00000-0000-0000-0000-00000000000a', 'f3b00000-0000-0000-0000-000000000005', 'JUGADOR');

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000011');
select lives_ok(
  $$ select public.accept_challenge(
       (select id from challenges where from_team_id = 'f3c00000-0000-0000-0000-00000000000a'
                                    and to_team_id   = 'f3c00000-0000-0000-0000-00000000000b')) $$,
  'C-12: con la segunda F en el plantel, el desafío se acepta');
select tests.clear_auth();


-- ── C-13..C-14. Confirmar la fecha ──────────────────────────────────────────
-- La F vuelve a salir: MXA tiene 4 (cumple el cupo de FUTBOL_5) pero una sola F.
delete from team_members
 where team_id = 'f3c00000-0000-0000-0000-00000000000a'
   and profile_id = 'f3b00000-0000-0000-0000-000000000005';

insert into match_proposals (id, match_id, proposed_by, from_team_id, format, match_type,
                             scheduled_at, duration_minutes)
select 'f3e00000-0000-0000-0000-000000000001', m.id, 'f3b00000-0000-0000-0000-000000000001',
       'f3c00000-0000-0000-0000-00000000000a', 'FUTBOL_5', 'AMISTOSO',
       now() + interval '2 days', 60
from matches m
where m.team_a_id = 'f3c00000-0000-0000-0000-00000000000a'
  and m.team_b_id = 'f3c00000-0000-0000-0000-00000000000b';

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000011');
select throws_ok(
  $$ select public.confirm_match_proposal('f3e00000-0000-0000-0000-000000000001',
       (select match_id from match_proposals where id = 'f3e00000-0000-0000-0000-000000000001')) $$,
  'MIXED_COMPOSITION: MXA no cumple la composición mínima de un equipo mixto',
  'C-13: confirmar la fecha controla el plantel del equipo que propuso');
select tests.clear_auth();

insert into team_members (team_id, profile_id, role) values
  ('f3c00000-0000-0000-0000-00000000000a', 'f3b00000-0000-0000-0000-000000000005', 'JUGADOR');

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000011');
select public.confirm_match_proposal('f3e00000-0000-0000-0000-000000000001',
  (select match_id from match_proposals where id = 'f3e00000-0000-0000-0000-000000000001'));
select tests.clear_auth();

select is(
  (select m.status::text from matches m
    join match_proposals p on p.match_id = m.id
   where p.id = 'f3e00000-0000-0000-0000-000000000001'),
  'CONFIRMADO',
  'C-14: con los dos planteles en regla, el partido queda confirmado');

create temp table f3_match on commit drop as
  select match_id as id from match_proposals where id = 'f3e00000-0000-0000-0000-000000000001';
grant select on f3_match to authenticated;


-- ── C-15..C-16. Lista de titulares ──────────────────────────────────────────
select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.submit_team_checkin((select id from f3_match),
       'f3c00000-0000-0000-0000-00000000000a',
       '[{"profile_id":"f3b00000-0000-0000-0000-000000000001","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000002","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000003","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000004","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000005","lineup_role":"SUPLENTE"}]'::jsonb) $$,
  'MIXED_COMPOSITION: los titulares no cumplen la composición mínima de un equipo mixto (faltan 0 de género masculino y 1 de género femenino)',
  'C-15: la segunda F en el banco no cuenta: los mínimos son entre los titulares');

select lives_ok(
  $$ select public.submit_team_checkin((select id from f3_match),
       'f3c00000-0000-0000-0000-00000000000a',
       '[{"profile_id":"f3b00000-0000-0000-0000-000000000001","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000002","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000003","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000005","lineup_role":"TITULAR"},
         {"profile_id":"f3b00000-0000-0000-0000-000000000004","lineup_role":"SUPLENTE"}]'::jsonb) $$,
  'C-16: con las dos F entre los titulares, la lista se presenta');
select tests.clear_auth();


-- ── C-17..C-20. Check-in individual de MXB ──────────────────────────────────
-- Llegan F, F, F y M: son 4 (el quórum de FUTBOL_5) pero con un solo M.
select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000011');
select public.checkin_team((select id from f3_match), 'f3c00000-0000-0000-0000-00000000000b', null, null);
select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000012');
select public.checkin_team((select id from f3_match), 'f3c00000-0000-0000-0000-00000000000b', null, null);
select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000015');
select public.checkin_team((select id from f3_match), 'f3c00000-0000-0000-0000-00000000000b', null, null);
select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000013');

create temp table f3_ck on commit drop as
  select public.checkin_team((select id from f3_match),
                             'f3c00000-0000-0000-0000-00000000000b', null, null)::jsonb as r;
select tests.clear_auth();

select is(
  (select jsonb_build_object('checkedInPlayers', r->'checkedInPlayers', 'teamSealed', r->'teamSealed',
                             'compositionOk', r->'compositionOk', 'compositionMissing', r->'compositionMissing')
     from f3_ck),
  '{"checkedInPlayers": 4, "teamSealed": false, "compositionOk": false,
    "compositionMissing": {"male": 1, "female": 0, "total": 1}}'::jsonb,
  'C-17: con el quórum alcanzado pero un solo M, el equipo no queda presentado');

select ok(
  (select checkin_team_b_at is null from matches where id = (select id from f3_match)),
  'C-18: el sello que lee el WO automático sigue vacío');

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000014');
select is(
  (select public.checkin_team((select id from f3_match),
                              'f3c00000-0000-0000-0000-00000000000b', null, null)::jsonb
          - 'matchId' - 'teamId' - 'minPlayers' - 'checkedInPlayers' - 'teamSealed' - 'matchStatus'),
  '{"justSealed": true, "compositionOk": true,
    "compositionMissing": {"male": 0, "female": 0, "total": 0}}'::jsonb,
  'C-19: con el segundo M, el check-in que completa la composición presenta al equipo');
select tests.clear_auth();

select is(
  (select status::text from matches where id = (select id from f3_match)),
  'EN_VIVO',
  'C-20: los dos equipos presentados → el partido arranca');


-- ── C-21..C-24. Ranking entre categorías ────────────────────────────────────
select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000022');
select lives_ok(
  $$ select public.send_challenge('f3c00000-0000-0000-0000-0000000000c2',
                                  'f3c00000-0000-0000-0000-00000000000b', 'RANKING') $$,
  'C-21: con ranking_same_category_enforced en 0, HOMBRES desafía a un MIXTO a ranking');
select tests.clear_auth();

update app_settings set value = 1 where key = 'ranking_same_category_enforced';

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000011');
select throws_ok(
  $$ select public.accept_challenge(
       (select id from challenges where from_team_id = 'f3c00000-0000-0000-0000-0000000000c2'
                                    and to_team_id   = 'f3c00000-0000-0000-0000-00000000000b')) $$,
  'CATEGORY_MISMATCH: los partidos de ranking se juegan entre equipos de la misma categoría (tu equipo: MIXTO, rival: HOMBRES)',
  'C-22: encendida, ese desafío de ranking ya no se puede aceptar');
select tests.clear_auth();

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000031');
select throws_ok(
  $$ select public.send_challenge('f3c00000-0000-0000-0000-0000000000d1',
                                  'f3c00000-0000-0000-0000-0000000000c1', 'RANKING') $$,
  'CATEGORY_MISMATCH: los partidos de ranking se juegan entre equipos de la misma categoría (tu equipo: MUJERES, rival: HOMBRES)',
  'C-23: tampoco se puede enviar uno nuevo entre categorías distintas');
select tests.clear_auth();

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000021');
select lives_ok(
  $$ select public.send_challenge('f3c00000-0000-0000-0000-0000000000c1',
                                  'f3c00000-0000-0000-0000-0000000000c2', 'RANKING') $$,
  'C-24: misma categoría, el ranking sigue igual');


-- ── C-25..C-28. get_mixed_composition_status ────────────────────────────────
-- Sigue autenticado como el capitán de HBA, que no integra MXA.
select is(
  (select public.get_mixed_composition_status('f3c00000-0000-0000-0000-00000000000a')),
  '{"applies": true, "enforced": true, "ok": true}'::jsonb,
  'C-25: a quien no integra el equipo sólo se le dice si cumple');

select is(
  (select public.get_mixed_composition_status('f3c00000-0000-0000-0000-0000000000c1')),
  '{"applies": false, "enforced": true, "ok": true}'::jsonb,
  'C-26: un equipo que no es MIXTO no tiene regla');
select tests.clear_auth();

select tests.authenticate_as_profile('f3a00000-0000-0000-0000-000000000003');
select is(
  (select public.get_mixed_composition_status('f3c00000-0000-0000-0000-00000000000a', 'FUTBOL_5')
          - 'xCountsAsAny'),
  '{"applies": true, "enforced": true, "ok": true, "minPerGender": 2, "male": 2, "female": 2,
    "other": 1, "unset": 0, "missingMale": 0, "missingFemale": 0, "missingTotal": 0}'::jsonb,
  'C-27: a un integrante, las cantidades del plantel (nunca quién es quién)');
select tests.clear_auth();

select throws_ok(
  $$ select public.get_mixed_composition_status('f3c00000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'C-28: sin sesión, no responde');


-- ── C-29. Las internas no se exponen ────────────────────────────────────────
select is(
  (select array_agg(f order by f) from unnest(array[
     'public.mixed_composition_eval(uuid[], team_format)',
     'public.mixed_composition_applies(uuid)',
     'public.assert_mixed_roster(uuid, team_format, boolean)',
     'public.assert_ranking_same_category(uuid, uuid)']) f
    where has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('anon', f, 'execute')),
  null,
  'C-29: ni anon ni authenticated pueden llamar a las funciones internas');

select * from finish();
rollback;
