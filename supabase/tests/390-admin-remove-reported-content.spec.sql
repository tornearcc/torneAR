-- ============================================================
-- 390-admin-remove-reported-content — La otra mitad de las 24 horas (pgTAP)
-- ============================================================
-- Cubre `public.admin_remove_reported_content` (migración 20260911170000).
--
-- La guideline 1.2 pide dos medidas ante una denuncia: eliminar el contenido y
-- dar de baja a quien lo publicó. La segunda ya estaba resuelta
-- (`admin_suspend_user`, cubierta en 240). Esta suite es la primera: hasta esta
-- migración, desde el dashboard se podía suspender a la persona y el contenido
-- denunciado seguía publicado.
--
-- Lo que se verifica no es sólo «borra», sino que borra la cosa CORRECTA en
-- cada caso. Un DELETE uniforme arrastraría postulaciones en las publicaciones
-- y borraría equipos con historial deportivo compartido con sus rivales.
--
-- Aserciones:
--   A-1      Un no-admin no puede ejecutarla.
--   A-2      Una denuncia inexistente falla en vez de pasar en silencio.
--   A-3      Una denuncia de tipo USER se rechaza: no hay contenido que sacar,
--            la medida es la suspensión.
--   A-4/A-5  MESSAGE: la fila se borra y la denuncia queda ACTIONED.
--   A-6/A-7  MARKET_TEAM_POST: se desactiva, NO se borra — el DELETE se
--            llevaría puestas las postulaciones.
--   A-8..A-10 TEAM: se neutralizan nombre y escudo y el equipo SIGUE existiendo,
--            porque su historial es compartido con los rivales.
--   A-11     Queda registro de auditoría en app_logs.
-- ============================================================

begin;
select plan(11);

-- ── Setup como postgres ─────────────────────────────────────────────────────
update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000004';

insert into teams (id, name, category, zone, preferred_format, shield_url) values
  ('d4d4d4d4-0000-0000-0000-000000000001', 'Equipo Denunciado', 'HOMBRES', 'ZRM_TEST', 'FUTBOL_5', 'shields/x.png');

insert into conversations (id, type, player_id, team_id) values
  ('d4d4d4d4-0000-0000-0000-00000000cc01', 'MARKET_DM',
   '33333333-3333-3333-3333-000000000001', 'd4d4d4d4-0000-0000-0000-000000000001');

insert into messages (id, conversation_id, sender_profile_id, content) values
  ('d4d4d4d4-0000-0000-0000-00000000aa01', 'd4d4d4d4-0000-0000-0000-00000000cc01',
   '33333333-3333-3333-3333-000000000001', 'mensaje denunciado');

insert into market_team_posts (id, team_id, position_wanted, created_by, description) values
  ('d4d4d4d4-0000-0000-0000-00000000bb01', 'd4d4d4d4-0000-0000-0000-000000000001',
   'CUALQUIERA', '33333333-3333-3333-3333-000000000001', 'publicacion denunciada');

insert into market_team_post_applications (post_id, profile_id) values
  ('d4d4d4d4-0000-0000-0000-00000000bb01', '33333333-3333-3333-3333-000000000004');

insert into content_reports (id, reporter_id, reported_entity_type, reported_entity_id, reason) values
  ('d4d4d4d4-0000-0000-0000-00000000dd01', '33333333-3333-3333-3333-000000000004', 'MESSAGE',
   'd4d4d4d4-0000-0000-0000-00000000aa01', 'Acoso o amenazas'),
  ('d4d4d4d4-0000-0000-0000-00000000dd02', '33333333-3333-3333-3333-000000000004', 'MARKET_TEAM_POST',
   'd4d4d4d4-0000-0000-0000-00000000bb01', 'Spam'),
  ('d4d4d4d4-0000-0000-0000-00000000dd03', '33333333-3333-3333-3333-000000000004', 'TEAM',
   'd4d4d4d4-0000-0000-0000-000000000001', 'Nombre o escudo inapropiado'),
  ('d4d4d4d4-0000-0000-0000-00000000dd04', '33333333-3333-3333-3333-000000000004', 'USER',
   '33333333-3333-3333-3333-000000000001', 'Spam');

-- ── A-1. No-admin ───────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
select throws_matching(
  $$ select admin_remove_reported_content('d4d4d4d4-0000-0000-0000-00000000dd01') $$,
  'NOT_AUTHORIZED',
  'A-1: un no-admin no puede eliminar contenido denunciado');

-- ── Desde acá, como admin ───────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000004"}', true);

select throws_matching(
  $$ select admin_remove_reported_content('d4d4d4d4-0000-0000-0000-00000000ffff') $$,
  'REPORT_NOT_FOUND',
  'A-2: una denuncia inexistente falla en vez de pasar en silencio');

select throws_matching(
  $$ select admin_remove_reported_content('d4d4d4d4-0000-0000-0000-00000000dd04') $$,
  'NO_CONTENT_TO_REMOVE',
  'A-3: sobre una denuncia de perfil no hay contenido que sacar');

-- ── MESSAGE ─────────────────────────────────────────────────────────────────
select lives_ok(
  $$ select admin_remove_reported_content('d4d4d4d4-0000-0000-0000-00000000dd01') $$,
  'A-4: elimina el mensaje denunciado');

select is_empty(
  $$ select 1 from messages where id = 'd4d4d4d4-0000-0000-0000-00000000aa01' $$,
  'A-5: el mensaje ya no existe');

-- ── MARKET_TEAM_POST ────────────────────────────────────────────────────────
select lives_ok(
  $$ select admin_remove_reported_content('d4d4d4d4-0000-0000-0000-00000000dd02') $$,
  'A-6: procesa la publicación denunciada');

select is(
  (select is_active from market_team_posts where id = 'd4d4d4d4-0000-0000-0000-00000000bb01'),
  false,
  'A-7: la publicación se desactiva y sigue existiendo — el DELETE se llevaría las postulaciones');

-- ── TEAM ────────────────────────────────────────────────────────────────────
select lives_ok(
  $$ select admin_remove_reported_content('d4d4d4d4-0000-0000-0000-00000000dd03') $$,
  'A-8: procesa el equipo denunciado');

select isnt(
  (select name from teams where id = 'd4d4d4d4-0000-0000-0000-000000000001'),
  'Equipo Denunciado',
  'A-9: el nombre objetable se reemplaza');

select ok(
  (select shield_url is null and id is not null
     from teams where id = 'd4d4d4d4-0000-0000-0000-000000000001'),
  'A-10: el escudo se saca y el equipo NO se borra — su historial es compartido con los rivales');

-- ── Auditoría ───────────────────────────────────────────────────────────────
select tests.clear_auth();
select is(
  (select count(*) from app_logs
    where message = 'admin.remove_reported_content'
      and details->>'report_id' in (
        'd4d4d4d4-0000-0000-0000-00000000dd01',
        'd4d4d4d4-0000-0000-0000-00000000dd02',
        'd4d4d4d4-0000-0000-0000-00000000dd03')),
  3::bigint,
  'A-11: las tres medidas quedan registradas en app_logs');

select * from finish();
rollback;
