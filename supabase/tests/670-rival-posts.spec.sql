-- ============================================================
-- 670-rival-posts — «Buscan rival» y «Rival sugerido» (pgTAP)
-- ============================================================
-- Cubre 20261125120000 (P3-19, D-76). Datos propios en zonas inventadas de
-- la Patagonia, lejos de las canchas del seed (todas en CABA), así ningún
-- equipo del seed entra en los radios.
--
--   R-1..R-5   publicar: permisos y validaciones.
--   R-6..R-10  el aviso: a quién le llega, qué dice y a quién no.
--   R-11..R-12 editar una publicación vigente no vuelve a avisar.
--   R-13..R-16 la vidriera: get_rival_posts y get_rival_post_team_ids (R-14b:
--              sólo la categoría del equipo que mira).
--   R-17..R-19 cerrar, republicar y los topes de 24 h y 7 días.
--   R-20..R-21 vencimiento.
--   R-22..R-25 rival_post_when.
--   R-26..R-27 permisos de las tablas y funciones.
--   S-1..S-6   get_suggested_rivals.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(34);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
-- Zonas: Centro y Cerca (a ~5 km) y Lejos (a ~100 km).
insert into zones (id, name, slug, is_active) values
  ('0a670000-0000-0000-0000-000000000001', 'RZ Centro', 'rz-centro', true),
  ('0a670000-0000-0000-0000-000000000002', 'RZ Cerca',  'rz-cerca',  true),
  ('0a670000-0000-0000-0000-000000000003', 'RZ Lejos',  'rz-lejos',  true);

insert into venues (id, name, address, zone_id, lat, lng, formats, is_active) values
  ('0f670000-0000-0000-0000-000000000001', 'Cancha Centro', 'Calle 1', '0a670000-0000-0000-0000-000000000001', -45.8600, -67.4800, '{FUTBOL_7}', true),
  ('0f670000-0000-0000-0000-000000000002', 'Cancha Cerca',  'Calle 2', '0a670000-0000-0000-0000-000000000002', -45.9000, -67.5100, '{FUTBOL_7}', true),
  ('0f670000-0000-0000-0000-000000000003', 'Cancha Lejos',  'Calle 3', '0a670000-0000-0000-0000-000000000003', -46.8000, -67.4800, '{FUTBOL_7}', true);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('0b670000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'rp' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from generate_series(1, 12) g;

insert into profiles (id, auth_user_id, username, full_name, zone)
select ('0c670000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       ('0b670000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'rp_' || g, 'Rival ' || g, 'RZ Centro'
  from generate_series(1, 12) g;

-- T1 Centro F7: publica (capitán p1, jugador p9).
-- T2 Cerca  F7: capitán p2 + subcapitán p3 → recibe el aviso (2 filas).
-- T3 Lejos  F7: capitán p4 → fuera de radio.
-- T4 Centro F11: capitán p5 → formato lejano.
-- T5 Centro F8: capitán p6 → formato vecino, recibe.
-- T6 Cerca  F7: capitán p7, con p1 de jugador → comparte jugador con T1.
-- T7 Centro F7: capitán p8, que bloqueó a p1 → sin aviso.
-- T8 Centro F7 MUJERES: capitán p10 → otra categoría (sólo cuenta en S-*).
-- T9, T10 Cerca F7: capitanes p11, p12 → para comparar el descuento (S-5).
insert into teams (id, name, category, zone, preferred_format) values
  ('0d670000-0000-0000-0000-000000000001', 'RP Uno',    'HOMBRES', 'RZ Centro', 'FUTBOL_7'),
  ('0d670000-0000-0000-0000-000000000002', 'RP Dos',    'HOMBRES', 'RZ Cerca',  'FUTBOL_7'),
  ('0d670000-0000-0000-0000-000000000003', 'RP Tres',   'HOMBRES', 'RZ Lejos',  'FUTBOL_7'),
  ('0d670000-0000-0000-0000-000000000004', 'RP Cuatro', 'HOMBRES', 'RZ Centro', 'FUTBOL_11'),
  ('0d670000-0000-0000-0000-000000000005', 'RP Cinco',  'HOMBRES', 'RZ Centro', 'FUTBOL_8'),
  ('0d670000-0000-0000-0000-000000000006', 'RP Seis',   'HOMBRES', 'RZ Cerca',  'FUTBOL_7'),
  ('0d670000-0000-0000-0000-000000000007', 'RP Siete',  'HOMBRES', 'RZ Centro', 'FUTBOL_7'),
  ('0d670000-0000-0000-0000-000000000008', 'RP Ocho',   'MUJERES', 'RZ Centro', 'FUTBOL_7'),
  ('0d670000-0000-0000-0000-000000000009', 'RP Nueve',  'HOMBRES', 'RZ Cerca',  'FUTBOL_7'),
  ('0d670000-0000-0000-0000-000000000010', 'RP Diez',   'HOMBRES', 'RZ Cerca',  'FUTBOL_7');

insert into team_members (team_id, profile_id, role) values
  ('0d670000-0000-0000-0000-000000000001', '0c670000-0000-0000-0000-000000000001', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000001', '0c670000-0000-0000-0000-000000000009', 'JUGADOR'),
  ('0d670000-0000-0000-0000-000000000002', '0c670000-0000-0000-0000-000000000002', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000002', '0c670000-0000-0000-0000-000000000003', 'SUBCAPITAN'),
  ('0d670000-0000-0000-0000-000000000003', '0c670000-0000-0000-0000-000000000004', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000004', '0c670000-0000-0000-0000-000000000005', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000005', '0c670000-0000-0000-0000-000000000006', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000006', '0c670000-0000-0000-0000-000000000007', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000006', '0c670000-0000-0000-0000-000000000001', 'JUGADOR'),
  ('0d670000-0000-0000-0000-000000000007', '0c670000-0000-0000-0000-000000000008', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000008', '0c670000-0000-0000-0000-000000000010', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000009', '0c670000-0000-0000-0000-000000000011', 'CAPITAN'),
  ('0d670000-0000-0000-0000-000000000010', '0c670000-0000-0000-0000-000000000012', 'CAPITAN');

insert into user_blocks (blocker_profile_id, blocked_profile_id)
values ('0c670000-0000-0000-0000-000000000008', '0c670000-0000-0000-0000-000000000001');

create or replace function pg_temp.rp_notifs(p_team int)
returns bigint language sql as $$
  select count(*) from notifications n
    join team_members tm on tm.profile_id = n.profile_id
   where tm.team_id = ('0d670000-0000-0000-0000-' || lpad(p_team::text, 12, '0'))::uuid
     and n.type = 'ANUNCIO' and n.data->>'kind' = 'rival_post'
$$;

create or replace function tests.rp_publish_t1(p_days smallint[] default '{6,0}', p_date date default null)
returns json language sql as $$
  select public.publish_rival_post(
    p_team_id => '0d670000-0000-0000-0000-000000000001', p_format => 'FUTBOL_7', p_zone => 'RZ Centro',
    p_days => p_days, p_time_slots => '{TARDE}', p_match_date => p_date,
    p_venue_id => '0f670000-0000-0000-0000-000000000001', p_note => 'Tenemos cancha')
$$;
grant execute on function tests.rp_publish_t1(smallint[], date) to authenticated;


-- ── R-1..R-5. Publicar ──────────────────────────────────────────────────────
select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000009');
select throws_like(
  $$ select tests.rp_publish_t1() $$,
  'No autorizado%', 'R-1: un jugador sin rango no publica');

select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000001');
select throws_like(
  $$ select tests.rp_publish_t1('{}') $$,
  'RIVAL_POST_INVALID: elegí al menos un día%', 'R-2: hace falta un día o una fecha');

select throws_like(
  $$ select public.publish_rival_post(p_team_id => '0d670000-0000-0000-0000-000000000001',
       p_format => 'FUTBOL_7', p_zone => 'Zona Inventada', p_days => '{6}') $$,
  'RIVAL_POST_INVALID: elegí una zona%', 'R-3: la zona tiene que existir');

select throws_like(
  $$ select tests.rp_publish_t1('{}', ((now() at time zone 'America/Argentina/Buenos_Aires')::date - 1)) $$,
  'RIVAL_POST_INVALID: la fecha%', 'R-4: no acepta una fecha pasada');

select throws_like(
  $$ select public.publish_rival_post(p_team_id => '0d670000-0000-0000-0000-000000000001',
       p_format => 'FUTBOL_7', p_zone => 'RZ Centro', p_days => '{6}', p_note => repeat('x', 141)) $$,
  'RIVAL_POST_INVALID: el mensaje%', 'R-5: el mensaje tiene tope de 140 caracteres');


-- ── R-6..R-10. El aviso ─────────────────────────────────────────────────────
select is((tests.rp_publish_t1()->>'alerted')::int, 4,
  'R-6: publicar avisa a los cuatro equipos que corresponden (T2, T9 y T10 cerca; T5 de formato vecino)');

select tests.clear_auth();

select is(pg_temp.rp_notifs(2), 2::bigint, 'R-7: a T2 le llega al capitán y al subcapitán');
select is(pg_temp.rp_notifs(5), 1::bigint, 'R-8: a T5 (F8, vecino de F7) también le llega');

select is(
  pg_temp.rp_notifs(3) + pg_temp.rp_notifs(4) + pg_temp.rp_notifs(6) + pg_temp.rp_notifs(7) + pg_temp.rp_notifs(8),
  0::bigint,
  'R-9: no le llega al lejano, al de F11, al que comparte jugador, al que bloqueó ni a otra categoría');

select results_eq(
  $$ select n.title, n.body, n.data->>'url' from notifications n
      where n.profile_id = '0c670000-0000-0000-0000-000000000002' and n.data->>'kind' = 'rival_post' $$,
  $$ values ('RP Uno busca rival cerca tuyo',
             'F7 · sáb y dom · tarde · a 5 km. Mirá su ficha y desafialos.',
             'tornear://team-stats?teamId=0d670000-0000-0000-0000-000000000001&viewerTeamId=0d670000-0000-0000-0000-000000000002') $$,
  'R-10: título, texto y link a la ficha con el equipo de quien lo recibe');


-- ── R-11..R-12. Editar no vuelve a avisar ───────────────────────────────────
select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000001');
select is((tests.rp_publish_t1('{5,6}')::jsonb) - 'expiresAt',
  '{"alerted":0,"isNew":false}'::jsonb, 'R-11: editar una publicación vigente no avisa de nuevo');

select tests.clear_auth();
select is(pg_temp.rp_notifs(2), 2::bigint, 'R-12: T2 sigue con los mismos dos avisos');


-- ── R-13..R-16. La vidriera ─────────────────────────────────────────────────
select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000002');
select results_eq(
  $$ select team_name, when_label, venue_name, round(distance_km), member_count, is_own
       from public.get_rival_posts('0d670000-0000-0000-0000-000000000002') $$,
  $$ values ('RP Uno'::text, 'vie y sáb · tarde'::text, 'Cancha Centro'::text, 5::numeric, 2, false) $$,
  'R-13: T2 ve la publicación de T1 con la distancia desde su zona');

select is((select count(*) from public.get_rival_posts(null, 'RZ Lejos')), 0::bigint,
  'R-14: el filtro por zona deja afuera la publicación de otra zona');

select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000010');
select is(
  (select count(*) from public.get_rival_posts('0d670000-0000-0000-0000-000000000008'))
    || '/' || (select count(*) from public.get_rival_posts('0d670000-0000-0000-0000-000000000008', null, null, '0d670000-0000-0000-0000-000000000001')),
  '0/1',
  'R-14b: un equipo de otra categoría no la ve en la vidriera, pero sí en la ficha del equipo');
select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000002');

select ok('0d670000-0000-0000-0000-000000000001'::uuid in (select public.get_rival_post_team_ids()),
  'R-15: T1 aparece entre los equipos que buscan rival');

select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000001');
select is((select is_own from public.get_rival_posts('0d670000-0000-0000-0000-000000000001')), true,
  'R-16: el que publicó la ve marcada como propia');


-- ── R-17..R-19. Cerrar, republicar y topes ──────────────────────────────────
select public.close_rival_post('0d670000-0000-0000-0000-000000000001');
select is((select count(*) from public.get_rival_posts()), 0::bigint,
  'R-17: cerrada, deja de aparecer');

select is((tests.rp_publish_t1()->>'alerted')::int, 0,
  'R-18: republicar enseguida no avisa: esos equipos ya recibieron uno en las últimas 24 h');

select tests.clear_auth();
update rival_post_alerts set sent_at = now() - interval '8 days';
update rival_posts set closed_at = now() where team_id = '0d670000-0000-0000-0000-000000000001';
select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000001');
select is((tests.rp_publish_t1()->>'alerted')::int, 4,
  'R-19: pasados los topes, republicar vuelve a avisar');


-- ── R-20..R-21. Vencimiento ─────────────────────────────────────────────────
select tests.clear_auth();
update rival_posts set expires_at = now() - interval '1 minute'
 where team_id = '0d670000-0000-0000-0000-000000000001';
select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000002');
select is((select count(*) from public.get_rival_posts()), 0::bigint, 'R-20: vencida, no aparece');

select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000001');
select ok(
  (tests.rp_publish_t1('{}', ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 2))->>'expiresAt')::timestamptz
    = (((now() at time zone 'America/Argentina/Buenos_Aires')::date + 3)::timestamp at time zone 'America/Argentina/Buenos_Aires'),
  'R-21: con fecha, vence al terminar ese día');


-- ── R-22..R-25. rival_post_when ─────────────────────────────────────────────
select is(public.rival_post_when('{6,0}', '{TARDE}', null, null), 'sáb y dom · tarde', 'R-22: dos días y una franja');
select is(public.rival_post_when('{5,1,3}', '{NOCHE,MANANA}', null, null), 'lun, mié y vie · mañana y noche', 'R-23: tres días, ordenados de lunes a domingo');
select is(public.rival_post_when('{0,1,2,3,4,5,6}', '{MANANA,TARDE,NOCHE}', null, null), 'todos los días', 'R-24: todos los días y todo el día');
select is(public.rival_post_when('{}', '{}', '2026-12-05', '18:00'), 'sáb 05/12 · 18:00', 'R-25: fecha y hora');


-- ── R-26..R-27. Permisos ────────────────────────────────────────────────────
select tests.clear_auth();
select ok(
  not has_table_privilege('authenticated', 'public.rival_posts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.rival_posts', 'INSERT')
  and not has_table_privilege('authenticated', 'public.rival_post_alerts', 'SELECT'),
  'R-26: las tablas sólo se tocan por RPC');

select ok(
  not has_function_privilege('anon', 'public.publish_rival_post(uuid, team_format, text, smallint[], text[], date, time, uuid, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.alert_rival_post(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_suggested_rivals(uuid, integer)', 'EXECUTE'),
  'R-27: anon no publica ni pide sugeridos, y nadie dispara el aviso a mano');


-- ── S-1..S-6. Rival sugerido (para T2) ──────────────────────────────────────
-- T1 vuelve a tener publicación vigente (R-21). Desafío abierto T2 → T5.
-- T10 acumula 3 desafíos recibidos sin aceptar; T9 ninguno.
insert into challenges (from_team_id, to_team_id, created_by, match_type, status) values
  ('0d670000-0000-0000-0000-000000000002', '0d670000-0000-0000-0000-000000000005', '0c670000-0000-0000-0000-000000000002', 'AMISTOSO', 'ENVIADA'),
  ('0d670000-0000-0000-0000-000000000003', '0d670000-0000-0000-0000-000000000010', '0c670000-0000-0000-0000-000000000004', 'AMISTOSO', 'RECHAZADA'),
  ('0d670000-0000-0000-0000-000000000004', '0d670000-0000-0000-0000-000000000010', '0c670000-0000-0000-0000-000000000005', 'AMISTOSO', 'RECHAZADA'),
  ('0d670000-0000-0000-0000-000000000007', '0d670000-0000-0000-0000-000000000010', '0c670000-0000-0000-0000-000000000008', 'AMISTOSO', 'RECHAZADA');

select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000001');
select throws_like(
  $$ select * from public.get_suggested_rivals('0d670000-0000-0000-0000-000000000002') $$,
  'No autorizado%', 'S-1: sólo los integrantes del equipo piden sus sugeridos');

select tests.authenticate_as_profile('0b670000-0000-0000-0000-000000000002');
create temp table s_out on commit drop as
  select * from public.get_suggested_rivals('0d670000-0000-0000-0000-000000000002', 30);

select is(
  (select array_agg(team_name order by team_name) from s_out
    where team_name in ('RP Dos', 'RP Tres', 'RP Cinco', 'RP Ocho')),
  null::text[],
  'S-2: afuera el propio, el que está a más de 60 km, el que tiene un desafío abierto y el de otra categoría');

select is((select team_name from s_out order by score desc limit 1), 'RP Uno',
  'S-3: el que busca rival queda primero');

select ok((select reasons[1] from s_out where team_name = 'RP Uno') like 'Busca rival · %',
  'S-4: y el primer motivo lo dice');

select ok(
  (select score from s_out where team_name = 'RP Nueve') > (select score from s_out where team_name = 'RP Diez'),
  'S-5: con todo lo demás igual, baja el que acumula desafíos sin aceptar');

select ok((select distance_km from s_out where team_name = 'RP Nueve') = 0
  and (select 'Mismo formato' = any (reasons) from s_out where team_name = 'RP Nueve'),
  'S-6: misma zona = 0 km, y el formato igual aparece como motivo');

select * from finish();
rollback;
