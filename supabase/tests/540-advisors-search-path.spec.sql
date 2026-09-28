-- ============================================================
-- 540-advisors-search-path — search_path fijo (pgTAP)
-- ============================================================
-- Cubre 20260927122000: las tres funciones que marcaba el advisor
-- `function_search_path_mutable` tienen search_path vacío y siguen
-- devolviendo lo mismo.
-- ============================================================

begin;
select plan(6);

select ok(
  exists (select 1 from pg_proc p, unnest(p.proconfig) c
           where p.oid = 'public.avatar_object_path(text)'::regprocedure and c like 'search_path=%'),
  'avatar_object_path tiene search_path fijo');

select ok(
  exists (select 1 from pg_proc p, unnest(p.proconfig) c
           where p.oid = 'public.storage_avatars_object_url()'::regprocedure and c like 'search_path=%'),
  'storage_avatars_object_url tiene search_path fijo');

select ok(
  exists (select 1 from pg_proc p, unnest(p.proconfig) c
           where p.oid = 'public.normalize_for_filter(text)'::regprocedure and c like 'search_path=%'),
  'normalize_for_filter tiene search_path fijo');

select is(
  public.avatar_object_path('https://x.supabase.co/storage/v1/object/public/avatars/u1/a.jpg?t=1'),
  'u1/a.jpg',
  'avatar_object_path sigue extrayendo el path de una URL pública');

select is(
  public.normalize_for_filter('Ñandúúú'),
  'nandu',
  'normalize_for_filter sigue normalizando acentos y repeticiones');

select ok(
  public.storage_avatars_object_url() like '%/storage/v1/object/avatars/',
  'storage_avatars_object_url sigue devolviendo la base de la URL');

select * from finish();
rollback;
