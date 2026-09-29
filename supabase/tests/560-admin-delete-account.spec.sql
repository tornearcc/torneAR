-- ============================================================
-- 560-admin-delete-account — baja de una cuenta desde el dashboard (pgTAP)
-- ============================================================
-- Cubre 20260929120000 (P1-9). El capitán de Tigres (auth …0004) hace de
-- admin sólo dentro de esta transacción; la cuenta a dar de baja es la del
-- seed …0007, y …0001 hace de usuario común.
--
--   A-1..A-4  permisos y guardas: is_admin, motivo, la propia cuenta, otro
--             admin.
--   A-5..A-9  la baja anonimiza el perfil, banea auth.users, borra la
--             credencial de Apple y encola los archivos de avatars.
--   A-10      deja admin.delete_account en app_logs, con el motivo y sin el
--             username.
--   A-11      una cuenta ya dada de baja se rechaza.
--   A-12..A-13 la función interna no se puede llamar desde la API, la de
--             admin sí (como authenticated).
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(13);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

insert into apple_credentials (auth_user_id, refresh_token)
values ('aaaaaaaa-0000-0000-0000-000000000007', 'rt-de-prueba');

-- Sin el secreto, request_avatar_file_deletion no encola nada (ver 470).
select vault.create_secret('clave-de-prueba', 'storage_service_role_key');
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000007/avatar-a.jpg'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000007/vieja.jpg');

-- ── A-1..A-4. Permisos y guardas ────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select throws_matching(
  $$ select public.admin_delete_account('33333333-3333-3333-3333-000000000007', 'Es menor de edad') $$,
  '^NOT_AUTHORIZED',
  'A-1: un usuario que no es admin no puede dar de baja otra cuenta');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_matching(
  $$ select public.admin_delete_account('33333333-3333-3333-3333-000000000007', '   ') $$,
  '^REASON_REQUIRED',
  'A-2: la baja exige motivo');

select throws_matching(
  $$ select public.admin_delete_account('33333333-3333-3333-3333-000000000004', 'prueba') $$,
  '^CANNOT_DELETE_SELF',
  'A-3: un admin no da de baja su propia cuenta por esta vía');
select tests.clear_auth();

update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000001';
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_matching(
  $$ select public.admin_delete_account('33333333-3333-3333-3333-000000000001', 'prueba') $$,
  '^TARGET_IS_ADMIN',
  'A-4: la cuenta de otro admin no se da de baja sin quitarle el rol antes');
select tests.clear_auth();
update profiles set is_admin = false where id = '33333333-3333-3333-3333-000000000001';

-- ── A-5..A-9. La baja ───────────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select lives_ok(
  $$ select public.admin_delete_account('33333333-3333-3333-3333-000000000007', 'Es menor de edad (lo dijo en el chat)') $$,
  'A-5: el admin da de baja la cuenta');
select tests.clear_auth();

select results_eq(
  $$ select username, full_name, avatar_url, date_of_birth, gender, expo_push_token
       from profiles where id = '33333333-3333-3333-3333-000000000007' $$,
  $$ values ('usuario_eliminado_33333333333333333333000000000007', 'Usuario eliminado',
             null::text, null::date, null::text, null::text) $$,
  'A-6: el perfil queda anonimizado igual que en la baja voluntaria');

select results_eq(
  $$ select banned_until > now() + interval '100 years', email
       from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000007' $$,
  $$ values (true, 'eliminado+33333333-3333-3333-3333-000000000007@deleted.tornear.app'::varchar) $$,
  'A-7: auth.users queda baneado y con el mail reescrito');

select is(
  (select count(*)::int from apple_credentials where auth_user_id = 'aaaaaaaa-0000-0000-0000-000000000007'),
  0,
  'A-8: la credencial de Apple se borra');

select is(
  (select count(distinct url)::int from net.http_request_queue
    where method = 'DELETE'
      and url in (public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000007/avatar-a.jpg',
                  public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000007/vieja.jpg')),
  2,
  'A-9: se encolan todos los archivos de la persona en avatars');

-- ── A-10. Registro ──────────────────────────────────────────────────────────
select results_eq(
  $$ select level, details->>'reason', details ? 'username', details ? 'deleted_username'
       from app_logs
      where message = 'admin.delete_account'
        and details->>'deleted_profile_id' = '33333333-3333-3333-3333-000000000007'
        and user_id = 'aaaaaaaa-0000-0000-0000-000000000004' $$,
  $$ values ('warn', 'Es menor de edad (lo dijo en el chat)', false, false) $$,
  'A-10: queda admin.delete_account en app_logs con el motivo y sin el username');

-- ── A-11. Dos veces ─────────────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_matching(
  $$ select public.admin_delete_account('33333333-3333-3333-3333-000000000007', 'otra vez') $$,
  '^ALREADY_DELETED',
  'A-11: una cuenta ya dada de baja se rechaza');
select tests.clear_auth();

-- ── A-12..A-13. Permisos de ejecución ───────────────────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.anonymize_account(uuid, uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.anonymize_account(uuid, uuid, text)', 'EXECUTE'),
  'A-12: anonymize_account no se puede llamar desde la API');

select ok(
  has_function_privilege('authenticated', 'public.admin_delete_account(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_delete_account(uuid, text)', 'EXECUTE'),
  'A-13: admin_delete_account queda para authenticated (chequea is_admin adentro)');

select * from finish();
rollback;
