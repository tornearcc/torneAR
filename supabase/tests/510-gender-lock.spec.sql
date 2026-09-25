-- ============================================================
-- 510-gender-lock — F3: género bloqueado y fuera de la vista pública (pgTAP)
-- ============================================================
-- Cubre 20260925160000_mixed_composition (secciones 4, 5, 6 y 7).
--
--   G-1..G-4   UPDATE directo del cliente: cambiar el género se rechaza; el
--              mismo valor, y NULL → valor (onboarding), pasan.
--   G-5..G-6   save_own_profile trae el mismo control.
--   G-7..G-10  nadie lee el género de otro: la vista devuelve NULL, la columna
--              de la tabla ya no se puede leer, y el perfil propio lo trae.
--   G-11..G-16 soporte: admin_get_profile_gender / admin_set_profile_gender
--              (autorización, validaciones, cambio real y registro).
--   G-17       delete_own_account sigue pudiendo anonimizar el género.
-- ============================================================

begin;
select plan(17);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
-- 01 → M ya registrado. 02 → perfil a medio completar, sin género.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('f3a10000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       'authenticated', 'authenticated', 'f3.gl' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 2) g;

insert into profiles (id, auth_user_id, username, full_name, zone, gender) values
  ('f3b10000-0000-0000-0000-000000000001', 'f3a10000-0000-0000-0000-000000000001',
   '__f3_gl1', 'F3 GL 1', 'Palermo', 'M'),
  ('f3b10000-0000-0000-0000-000000000002', 'f3a10000-0000-0000-0000-000000000002',
   '__f3_gl2', 'F3 GL 2', 'Palermo', null);


-- ── G-1..G-4. UPDATE directo ────────────────────────────────────────────────
select tests.authenticate_as_profile('f3a10000-0000-0000-0000-000000000001');

select throws_ok(
  $$ update profiles set gender = 'F' where id = 'f3b10000-0000-0000-0000-000000000001' $$,
  'GENDER_LOCKED: el género se elige al registrarte. Para corregirlo, escribinos a tornearcc@gmail.com',
  'G-1: el usuario no puede cambiar su género');

-- Es lo que manda «Editar perfil» en la app instalada: todos los campos,
-- el género incluido aunque no cambie.
select lives_ok(
  $$ update profiles set full_name = 'F3 GL 1 bis', gender = 'M'
      where id = 'f3b10000-0000-0000-0000-000000000001' $$,
  'G-2: guardar el perfil con el mismo género pasa');
select tests.clear_auth();

select is(
  (select full_name || '/' || gender from profiles where id = 'f3b10000-0000-0000-0000-000000000001'),
  'F3 GL 1 bis/M',
  'G-3: y el resto de los cambios se guarda');

select tests.authenticate_as_profile('f3a10000-0000-0000-0000-000000000002');
select lives_ok(
  $$ update profiles set gender = 'F' where id = 'f3b10000-0000-0000-0000-000000000002' $$,
  'G-4: un perfil sin género lo elige (NULL → valor)');
select tests.clear_auth();


-- ── G-5..G-6. save_own_profile ──────────────────────────────────────────────
select tests.authenticate_as_profile('f3a10000-0000-0000-0000-000000000001');

select throws_like(
  $$ select public.save_own_profile('F3 GL 1', '__f3_gl1', 'Palermo', 'DELANTERO',
                                    '1990-01-01', 'X', 'RIGHT') $$,
  'GENDER_LOCKED:%',
  'G-5: save_own_profile tampoco deja cambiarlo');

select lives_ok(
  $$ select public.save_own_profile('F3 GL 1', '__f3_gl1', 'Palermo', 'DELANTERO',
                                    '1990-01-01', 'M', 'RIGHT') $$,
  'G-6: con el mismo género, save_own_profile guarda');


-- ── G-7..G-10. Visibilidad ──────────────────────────────────────────────────
select is(
  (select count(*)::int from profiles_public where gender is not null),
  0,
  'G-7: profiles_public ya no expone el género de nadie');

-- La columna sigue existiendo: la app instalada la nombra en un select.
select lives_ok(
  $$ select id, gender, age from profiles_public limit 1 $$,
  'G-8: el select de la app instalada sobre profiles_public sigue funcionando');

select throws_ok(
  $$ select gender from profiles where id = 'f3b10000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'G-9: authenticated ya no lee profiles.gender');

select is(
  (select (public.get_own_profile()).gender),
  'M',
  'G-10: el perfil propio sigue trayendo el género');
select tests.clear_auth();


-- ── G-11..G-16. Soporte ─────────────────────────────────────────────────────
select tests.authenticate_as_profile('f3a10000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.admin_set_profile_gender('f3b10000-0000-0000-0000-000000000001', 'F', 'x') $$,
  'NOT_AUTHORIZED: se requiere is_admin',
  'G-11: un usuario común no usa la vía de soporte');

select throws_ok(
  $$ select public.admin_get_profile_gender('f3b10000-0000-0000-0000-000000000001') $$,
  'NOT_AUTHORIZED: se requiere is_admin',
  'G-12: ni puede consultar el género de otro');
select tests.clear_auth();

-- admin_global del seed de testing.
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.admin_set_profile_gender('f3b10000-0000-0000-0000-000000000001', 'F', '  ') $$,
  'REASON_REQUIRED: indicá el motivo del cambio',
  'G-13: el cambio exige un motivo');

select throws_ok(
  $$ select public.admin_set_profile_gender('f3b10000-0000-0000-0000-000000000001', 'Z', 'correo') $$,
  'INVALID_GENDER: el género tiene que ser M, F o X',
  'G-14: sólo M, F o X');

select is(
  (select public.admin_set_profile_gender('f3b10000-0000-0000-0000-000000000001', 'F',
                                          'correo del titular del 25/09')),
  '{"profileId": "f3b10000-0000-0000-0000-000000000001", "previous": "M", "gender": "F", "changed": true}'::jsonb,
  'G-15: soporte cambia el género y devuelve el valor anterior');

select is(
  (select public.admin_get_profile_gender('f3b10000-0000-0000-0000-000000000001')
          || '|' || (select details->>'previous' || '>' || (details->>'gender') || '|' || (details->>'reason')
                       from app_logs
                      where message = 'admin.set_profile_gender'
                        and details->>'profile_id' = 'f3b10000-0000-0000-0000-000000000001')),
  'F|M>F|correo del titular del 25/09',
  'G-16: el cambio se ve desde soporte y queda registrado en app_logs');
select tests.clear_auth();


-- ── G-17. La baja de cuenta sigue anonimizando ──────────────────────────────
select tests.authenticate_as_profile('f3a10000-0000-0000-0000-000000000001');
select public.delete_own_account();
select tests.clear_auth();

select ok(
  (select gender is null from profiles where id = 'f3b10000-0000-0000-0000-000000000001'),
  'G-17: delete_own_account borra el género (el bloqueo no la frena)');

select * from finish();
rollback;
