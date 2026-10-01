-- ============================================================
-- 610-anon-dml — anon no escribe en public salvo app_logs (pgTAP)
-- ============================================================
-- Cubre 20260929190000 (P2-11). Grants literales, como 550-grants-parity:
-- nunca comparar contra otra tabla del mismo entorno.
--
--   A-1  ninguna tabla ni vista de public da INSERT/UPDATE/DELETE a anon,
--        salvo INSERT en app_logs.
--   A-2  anon sigue pudiendo registrar errores en app_logs (el Logger de la
--        app escribe antes del login).
--   A-3  una tabla nueva de public nace sin escritura para anon.
--   A-4  anon sigue leyendo lo público (zones, para el registro).
-- ============================================================

begin;
select plan(4);

select is_empty(
  $$ select c.relname, a.privilege_type
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and a.grantee = 'anon'::regrole
        and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
        and not (c.relname = 'app_logs' and a.privilege_type = 'INSERT') $$,
  'A-1: anon no tiene INSERT/UPDATE/DELETE en public, salvo INSERT en app_logs');

select ok(
  has_table_privilege('anon', 'public.app_logs', 'INSERT'),
  'A-2: anon sigue pudiendo registrar en app_logs');

create table public.__anon_dml_probe (id int);
select ok(
  not has_table_privilege('anon', 'public.__anon_dml_probe', 'INSERT')
  and not has_table_privilege('anon', 'public.__anon_dml_probe', 'UPDATE')
  and not has_table_privilege('anon', 'public.__anon_dml_probe', 'DELETE'),
  'A-3: una tabla nueva de public nace sin escritura para anon');

select ok(
  has_table_privilege('anon', 'public.zones', 'SELECT'),
  'A-4: anon sigue leyendo zones');

select * from finish();
rollback;
