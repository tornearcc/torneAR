-- ============================================================
-- 440-venues-google-cid — reconciliación de venues.google_cid (pgTAP)
-- ============================================================
-- Prueba 20260924130000_venues_google_cid_reconcile.sql: la columna y el
-- índice único parcial que producción ya tenía existen también en una base
-- creada desde las migraciones, y el índice se comporta igual:
-- único cuando está cargado, libre cuando es NULL.
-- ============================================================

begin;
select plan(5);

select has_column('public', 'venues', 'google_cid', 'venues tiene google_cid');
select col_type_is('public', 'venues', 'google_cid', 'text', 'google_cid es text');
select col_is_null('public', 'venues', 'google_cid', 'google_cid admite NULL');

-- Nombres y coordenadas propios del test; se descartan con el rollback.
insert into public.venues (name, lat, lng, google_cid) values ('__TEST CID A', -34.6, -58.4, '__test_cid_1');

select throws_ok(
  $$ insert into public.venues (name, lat, lng, google_cid) values ('__TEST CID B', -34.6, -58.4, '__test_cid_1') $$,
  '23505',
  null,
  'no se puede cargar dos veces el mismo CID (venues_google_cid_key)'
);

select lives_ok(
  $$ insert into public.venues (name, lat, lng, google_cid) values ('__TEST CID C', -34.6, -58.4, null),
                                                                ('__TEST CID D', -34.6, -58.4, null) $$,
  'varios complejos sin CID conviven (el índice es parcial)'
);

select * from finish();
rollback;
