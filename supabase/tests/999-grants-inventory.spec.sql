-- TEMPORAL (P2-7): imprime los grants de la base efímera del CI para
-- compararlos con producción. No se mergea.
begin;
select plan(1);
select diag(format('ACL|%s|%s|%s|%s', c.relkind, c.relname,
  coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type) from aclexplode(c.relacl) a where a.grantee = 'anon'::regrole), ''),
  coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type) from aclexplode(c.relacl) a where a.grantee = 'authenticated'::regrole), '')))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v','m','p')
order by c.relkind, c.relname;
select diag(format('COL|%s|%s|%s|%s', c.relname, att.attname,
  coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type) from aclexplode(att.attacl) a where a.grantee = 'anon'::regrole), ''),
  coalesce((select string_agg(distinct a.privilege_type, ',' order by a.privilege_type) from aclexplode(att.attacl) a where a.grantee = 'authenticated'::regrole), '')))
from pg_attribute att join pg_class c on c.oid = att.attrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and att.attacl is not null and att.attnum > 0
order by c.relname, att.attname;
select pass('inventario impreso');
select * from finish();
rollback;
