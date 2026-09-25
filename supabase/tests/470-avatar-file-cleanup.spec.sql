-- ============================================================
-- 470-avatar-file-cleanup — borrado de archivos de avatars (pgTAP)
-- ============================================================
-- Cubre 20260925130000. Las requests de pg_net salen recién después del
-- COMMIT, así que acá (BEGIN…ROLLBACK) se verifica lo que queda ENCOLADO en
-- net.http_request_queue; el borrado real contra Storage lo prueba
-- scripts/verify-avatar-file-cleanup.mjs en el stack local.
--
--   P-1..P-4 avatar_object_path: path, URL pública nuestra, URL externa, NULL.
--   C-1/C-2  Sin el secreto en Vault: el cambio de foto funciona igual y queda
--            un warn en app_logs.
--   C-3      Con el secreto: se encola el DELETE de la foto anterior.
--   C-4      No se encola nada si la foto anterior es evidencia de una
--            denuncia USER PENDING…
--   C-5      …ni si es de otra carpeta…
--   C-6      …ni si la "anterior" es la misma que la nueva.
--   D-1..D-3 delete_own_account encola TODOS los archivos de la carpeta de la
--            persona (también la evidencia de una denuncia) y la baja termina.
--
-- Perfil de prueba: P1 (auth …0001). Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(13);

-- ── P. Normalización de paths ───────────────────────────────────────────────
select is(public.avatar_object_path('abc/avatar-1.jpg'), 'abc/avatar-1.jpg', 'P-1: un path queda igual');
select is(
  public.avatar_object_path('https://x.supabase.co/storage/v1/object/public/avatars/abc/avatar-1.jpg?t=1'),
  'abc/avatar-1.jpg',
  'P-2: de la URL pública del bucket sale el path, sin query string');
select is(public.avatar_object_path('https://i.pravatar.cc/300?img=1'), null, 'P-3: una URL externa no es un archivo nuestro');
select is(public.avatar_object_path(null), null, 'P-4: sin foto, nada');

-- ── C-1/C-2. Sin secreto ────────────────────────────────────────────────────
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-a.jpg'
where id = '33333333-3333-3333-3333-000000000001';

select lives_ok(
  $$ update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-b.jpg'
     where id = '33333333-3333-3333-3333-000000000001' $$,
  'C-1: sin el secreto, el cambio de foto no se rompe');

select is(
  (select details->'paths'->>0 from app_logs where message = 'avatar.file_deletion_skipped'
    order by created_at desc limit 1),
  'aaaaaaaa-0000-0000-0000-000000000001/avatar-a.jpg',
  'C-2: y queda un warn con la foto que no se pudo borrar');

-- ── C-3..C-6. Con secreto ───────────────────────────────────────────────────
select vault.create_secret('clave-de-prueba', 'storage_service_role_key');

update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-c.jpg'
where id = '33333333-3333-3333-3333-000000000001';

select is(
  (select count(*)::int from net.http_request_queue
    where method = 'DELETE' and url = public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000001/avatar-b.jpg'),
  1,
  'C-3: al cambiar la foto se encola el DELETE de la anterior');

-- C-4: la foto actual (avatar-c) queda como evidencia de una denuncia abierta.
insert into content_reports (reporter_id, reported_entity_type, reported_entity_id, reason) values
  ('33333333-3333-3333-3333-000000000004', 'USER', '33333333-3333-3333-3333-000000000001', 'Foto de perfil inapropiada');
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-d.jpg'
where id = '33333333-3333-3333-3333-000000000001';

select is(
  (select count(*)::int from net.http_request_queue
    where url = public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000001/avatar-c.jpg'),
  0,
  'C-4: la foto denunciada en una denuncia abierta NO se borra: es evidencia');

-- C-5: un avatar_url que apunta a otra carpeta no es de esta persona.
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000007/ajena.jpg'
where id = '33333333-3333-3333-3333-000000000001';
update profiles set avatar_url = 'aaaaaaaa-0000-0000-0000-000000000001/avatar-e.jpg'
where id = '33333333-3333-3333-3333-000000000001';

select is(
  (select count(*)::int from net.http_request_queue
    where url = public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000007/ajena.jpg'),
  0,
  'C-5: nunca se borra un archivo de otra carpeta');

-- C-6: misma foto con otro formato (URL pública del mismo path).
update profiles
set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/aaaaaaaa-0000-0000-0000-000000000001/avatar-e.jpg'
where id = '33333333-3333-3333-3333-000000000001';

select is(
  (select count(*)::int from net.http_request_queue
    where url = public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000001/avatar-e.jpg'),
  0,
  'C-6: si la "anterior" es el mismo archivo, no se borra');

-- ── D. Baja de cuenta ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/vieja-1.jpg'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/vieja-2.jpg'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/avatar-c.jpg'),
  ('avatars', 'aaaaaaaa-0000-0000-0000-000000000007/de-otro.jpg');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
select lives_ok($$ select delete_own_account() $$, 'D-1: la baja termina');

select results_eq(
  $$ select replace(url, public.storage_avatars_object_url(), '') from net.http_request_queue
      where method = 'DELETE'
        and url in (public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000001/vieja-1.jpg',
                    public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000001/vieja-2.jpg',
                    public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000001/avatar-c.jpg')
      group by url order by 1 $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001/avatar-c.jpg'),
            ('aaaaaaaa-0000-0000-0000-000000000001/vieja-1.jpg'),
            ('aaaaaaaa-0000-0000-0000-000000000001/vieja-2.jpg') $$,
  'D-2: encola todos los archivos de la persona, también la evidencia de una denuncia');

select is(
  (select count(*)::int from net.http_request_queue
    where url = public.storage_avatars_object_url() || 'aaaaaaaa-0000-0000-0000-000000000007/de-otro.jpg'),
  0,
  'D-3: y ninguno de otra persona');

select * from finish();
rollback;
