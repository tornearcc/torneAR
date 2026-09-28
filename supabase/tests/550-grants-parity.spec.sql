-- ============================================================
-- 550-grants-parity — grants declarados (P2-7) (pgTAP)
-- ============================================================
-- Cubre 20260929020000. Afirma grants LITERALES, nunca comparando contra
-- otra tabla (regla que salió de PR #57).
--
--   P-1  ninguna tabla de public le da TRUNCATE a anon ni a authenticated.
--   P-2  una tabla nueva tampoco (defaults).
--   P-3..P-5  diferencias concretas que tenía el CI contra producción.
--   P-6  y lo que producción NO da sigue sin darse.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(6);

select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and a.privilege_type = 'TRUNCATE'
        and a.grantee in ('anon'::regrole, 'authenticated'::regrole) $$,
  'P-1: ninguna tabla de public da TRUNCATE a anon ni a authenticated');

create table public.__grants_probe (id int);
select ok(
  not has_table_privilege('authenticated', 'public.__grants_probe', 'TRUNCATE')
  and not has_table_privilege('anon', 'public.__grants_probe', 'TRUNCATE'),
  'P-2: una tabla nueva de public nace sin TRUNCATE para los roles cliente');

select ok(
  has_table_privilege('anon', 'public.team_stints', 'SELECT'),
  'P-3: anon lee team_stints, como en producción');

select ok(
  has_table_privilege('authenticated', 'public.zones', 'SELECT')
  and has_table_privilege('authenticated', 'public.notifications', 'UPDATE'),
  'P-4: authenticated lee zones y actualiza notifications, como en producción');

select ok(
  has_table_privilege('authenticated', 'public.match_proposals', 'INSERT')
  and has_table_privilege('authenticated', 'public.venues', 'SELECT'),
  'P-5: authenticated inserta propuestas y lee venues, como en producción');

select ok(
  not has_table_privilege('authenticated', 'public.season_standings', 'INSERT')
  and not has_table_privilege('anon', 'public.banned_words', 'SELECT')
  and not has_table_privilege('authenticated', 'public.apple_credentials', 'SELECT'),
  'P-6: lo que producción no da sigue sin darse');

select * from finish();
rollback;
