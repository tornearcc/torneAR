-- ============================================================
-- TUTORIAL DE ONBOARDING (Instagram Highlights) — SEED SOLO LOCAL
-- ------------------------------------------------------------
-- ⚠️ SOLO PARA LA BASE LOCAL (`npx supabase start`). JAMÁS contra producción:
--    nada de `--linked`, `db push`, SQL editor del dashboard ni MCP.
--    Hay una guarda al principio que aborta si la base tiene usuarios con mail
--    real (lo que tiene producción), pero la primera barrera sos vos.
--
-- Qué hace: BORRA todos los datos de dominio de la base local (perfiles,
-- equipos, partidos, mercado, chats, notificaciones, usuarios de auth, predios)
-- y arma desde cero una liga amateur creíble de CABA/GBA con todo lo que hace
-- falta para grabar cada flujo de la app desde cada punto de vista. Es
-- re-ejecutable: cada corrida vuelve todo al estado inicial (así se "resetean"
-- los pasos de una sola vez, como aceptar una solicitud).
--
-- Cómo se corre (desde tornear/):
--   1. npx supabase db reset                                  (opcional si ya está limpia)
--   2. node supabase/demo-data/tutorial-shields.mjs           (sube los escudos PNG al bucket local)
--   3. docker exec -i supabase_db_tornear psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--        < supabase/demo-data/tutorial-onboarding-local.sql
--   Para re-grabar algo: repetir sólo el paso 3 (los escudos sobreviven).
--   Si no subiste los escudos, los equipos caen en un escudo de ui-avatars.com.
--
-- Cuentas: contraseña 123456, mails @tutorial.local. Guion de grabación:
--   knowledge/guiones/tutorial-onboarding-grabacion.md
--
-- Cómo respeta la máquina de estados:
--   · Los partidos jugados se insertan EN_VIVO y se cierran cargando los DOS
--     resultados: el trigger resolve_match → apply_match_outcome calcula ELO,
--     elo_history, team_rankings, stats de temporada y Fair Play, en orden
--     cronológico. Después sólo se corren las fechas hacia atrás.
--   · Desafíos, aceptaciones, propuestas, confirmaciones, check-ins, votos de
--     disputa, pedidos de cancelación, referidos, inscripción de embajador,
--     «¿Quién los invitó?» y el barrido de premios pasan por las RPC reales,
--     con la identidad del usuario en request.jwt.claims.
--   · Las notificaciones que en la app inserta el cliente (desafío recibido,
--     postulación, solicitud de unión, cancelación) se insertan con el mismo
--     tipo, título, cuerpo y payload que el cliente.
--
-- Después de correr esto, los tests pgTAP no pasan hasta el próximo
-- `npx supabase db reset` (usan los UUID del seed de testing).
-- ============================================================

\set ON_ERROR_STOP on
\pset pager off
set client_min_messages = warning;

begin;

-- ------------------------------------------------------------
-- 0. GUARDA: sólo base local
-- ------------------------------------------------------------
do $$
begin
  if (select count(*) from auth.users where email not like '%.local') > 3 then
    raise exception 'GUARDA: esta base tiene usuarios con mail real. Este seed es SOLO para la base local.';
  end if;
  if not exists (select 1 from public.seasons) then
    raise exception 'GUARDA: no hay temporadas; corré primero `npx supabase db reset` en local.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. LIMPIEZA TOTAL DEL DOMINIO (local)
-- ------------------------------------------------------------
truncate table public.profiles, public.teams, public.matches, public.challenges,
               public.conversations, public.notifications, public.app_logs
  cascade;
delete from auth.users;
delete from public.venues;

-- ------------------------------------------------------------
-- 2. AJUSTES
-- ------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('ambassador_program_enabled', 1, 'Interruptor del programa de embajadores: 0 apagado, 1 prendido.'),
  ('ambassador_program_start_epoch', extract(epoch from now() - interval '1 day'),
   'Arranque del programa (epoch en segundos): sólo cuentan partidos finalizados desde ahí.'),
  -- Que no salte el pedido de reseña de la tienda en medio de una toma.
  ('review_prompt_enabled', 0, 'Pedido de reseña in-app (apagado en el tutorial local).')
on conflict (key) do update set value = excluded.value;

-- Helpers de sesión (viven sólo en esta conexión).
create or replace function pg_temp.act_as(p_username text) returns void
language plpgsql as $$
declare v_auth uuid;
begin
  select auth_user_id into v_auth from public.profiles where username = p_username;
  if v_auth is null then raise exception 'act_as: no existe %', p_username; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.act_clear() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.h01(p text) returns float8
language sql immutable as $$
  select ('x' || substr(md5(p), 1, 8))::bit(32)::bigint / 4294967296.0
$$;

create or replace function pg_temp.pid(p_username text) returns uuid
language sql stable as $$ select id from public.profiles where username = p_username $$;

create or replace function pg_temp.tid(p_idx int) returns uuid
language sql immutable as $$ select ('7a330000-0000-4000-8000-' || lpad(p_idx::text, 12, '0'))::uuid $$;

create or replace function pg_temp.vid(p_idx int) returns uuid
language sql immutable as $$ select ('7a440000-0000-4000-8000-' || lpad(p_idx::text, 12, '0'))::uuid $$;

-- Hora local de Buenos Aires → timestamptz. p_days = días desde hoy (negativo = pasado).
create or replace function pg_temp.art(p_days int, p_time time) returns timestamptz
language sql stable as $$
  select (((now() at time zone 'America/Argentina/Buenos_Aires')::date + p_days) + p_time)
         at time zone 'America/Argentina/Buenos_Aires'
$$;

-- ------------------------------------------------------------
-- 3. ZONAS Y PREDIOS (predios reales de Google Maps, mismo catálogo que prod)
-- ------------------------------------------------------------
insert into public.zones (name, slug)
select z.name, z.slug
  from (values ('Colegiales','colegiales'), ('Villa Urquiza','villa-urquiza'), ('Saavedra','saavedra'),
               ('Vicente López','vicente-lopez'), ('Avellaneda','avellaneda'), ('Ramos Mejía','ramos-mejia'),
               ('Boedo','boedo'), ('Liniers','liniers'), ('Coghlan','coghlan'), ('Chacarita','chacarita'),
               ('San Isidro','san-isidro'), ('Lanús','lanus'), ('Villa Devoto','villa-devoto')) z(name, slug)
 where not exists (select 1 from public.zones x where x.slug = z.slug);

insert into public.venues (id, name, address, zone_id, lat, lng, phone, formats, is_active) values
  (pg_temp.vid(1),  'Los Amigos Fútbol 5 Palermo', 'Av. Dorrego 2898',              (select id from zones where slug='palermo'),       -34.5740318, -58.4311332, '011 6656-0011', array['FUTBOL_5','FUTBOL_6','FUTBOL_7']::team_format[], true),
  (pg_temp.vid(2),  'Fútbol & Paddle',             'Güemes 4270',                   (select id from zones where slug='palermo'),       -34.5837530, -58.4209619, '011 4833-1729', array['FUTBOL_5','FUTBOL_6']::team_format[], true),
  (pg_temp.vid(3),  'Area Fútbol',                 'Serrano 721',                   (select id from zones where slug='villa-crespo'),  -34.5947789, -58.4397070, '011 4517-9613', array['FUTBOL_5','FUTBOL_7']::team_format[], true),
  (pg_temp.vid(4),  'Fútbol Cabrera 5',            'José A. Cabrera 3544',          (select id from zones where slug='almagro'),       -34.5968613, -58.4162769, '011 4963-4418', array['FUTBOL_5']::team_format[], true),
  (pg_temp.vid(5),  'Open Fútbol Sede Núñez',      'Comodoro Martín Rivadavia 1350',(select id from zones where slug='nunez'),         -34.5396939, -58.4610499, '011 4836-1772', array['FUTBOL_5','FUTBOL_7','FUTBOL_8']::team_format[], true),
  (pg_temp.vid(6),  'La Canchita Papi Fútbol',     'Av. Olazábal 1784',             (select id from zones where slug='belgrano'),      -34.5566979, -58.4523412, '011 15-6272-4732', array['FUTBOL_5','FUTBOL_7']::team_format[], true),
  (pg_temp.vid(7),  'Copa Norte Fútbol',           'Cap. Gral. Ramón Freire 761',   (select id from zones where slug='colegiales'),    -34.5765929, -58.4494190, '011 15-4409-2413', array['FUTBOL_5','FUTBOL_6','FUTBOL_7']::team_format[], true),
  (pg_temp.vid(8),  'Village Fútbol Club',         'Tandil 2650',                   (select id from zones where slug='flores'),        -34.6358384, -58.4635803, '011 15-3059-1721', array['FUTBOL_5','FUTBOL_7']::team_format[], true),
  (pg_temp.vid(9),  'Urquiza Fútbol',              'Franklin D. Roosevelt 5170',    (select id from zones where slug='villa-urquiza'), -34.5742647, -58.4880352, '011 3296-0346', array['FUTBOL_5','FUTBOL_6']::team_format[], true),
  (pg_temp.vid(10), 'Norte Fútbol 5',              'San Pedro de Jujuy 101',        (select id from zones where slug='recoleta'),      -34.5740565, -58.3968657, '011 3673-4866', array['FUTBOL_5']::team_format[], true),
  (pg_temp.vid(11), 'Canchas de Fútbol 5 Puán',    'Puán 374',                      (select id from zones where slug='caballito'),     -34.6217043, -58.4487164, null,            array['FUTBOL_5']::team_format[], true);

-- Temporada activa (la deja seed_testing: «Clausura 2026»).
do $$
begin
  if not exists (select 1 from public.seasons where is_active) then
    insert into public.seasons (name, slug, starts_at, ends_at, is_active)
    values ('Clausura 2026', 'clausura-2026', '2026-07-01', '2026-12-31', true);
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. EQUIPOS
-- ------------------------------------------------------------
create temp table tt (
  idx int primary key, slug text, name text, category team_category, zone text,
  fmt team_format, code text, created timestamptz, fillers int, color text
) on commit drop;

insert into tt values
  ( 1, 'deportivo-dorrego',        'Deportivo Dorrego',           'HOMBRES', 'Palermo',       'FUTBOL_5', 'DORREGO5', now() - interval '130 days', 5, '0B6E4F'),
  ( 2, 'atletico-villa-crespo',    'Atlético Villa Crespo',       'HOMBRES', 'Villa Crespo',  'FUTBOL_5', 'VCRESPO7', now() - interval '210 days', 6, 'B3001B'),
  ( 3, 'muchachos-almagro',        'Los Muchachos de Almagro',    'HOMBRES', 'Almagro',       'FUTBOL_5', 'ALMAGRO3', now() - interval '190 days', 7, '1D3557'),
  ( 4, 'real-caballito',           'Real Caballito',              'HOMBRES', 'Caballito',     'FUTBOL_5', 'REALCAB4', now() - interval '200 days', 7, '5B2A86'),
  ( 5, 'sportivo-nunez',           'Sportivo Núñez',              'HOMBRES', 'Núñez',         'FUTBOL_5', 'NUNEZ555', now() - interval '180 days', 6, 'E85D04'),
  ( 6, 'juventud-belgrano',        'Juventud Belgrano',           'HOMBRES', 'Belgrano',      'FUTBOL_5', 'JUVEBEL6', now() - interval '220 days', 7, '0077B6'),
  ( 7, 'colegiales-fc',            'Colegiales FC',               'HOMBRES', 'Colegiales',    'FUTBOL_5', 'COLEFC77', now() - interval '170 days', 7, '2B9348'),
  ( 8, 'flores-unidos',            'Flores Unidos',               'HOMBRES', 'Flores',        'FUTBOL_5', 'FLORES88', now() - interval '160 days', 7, 'C1121F'),
  ( 9, 'la-12-de-urquiza',         'La 12 de Urquiza',            'HOMBRES', 'Villa Urquiza', 'FUTBOL_5', 'URQUIZA9', now() - interval '175 days', 7, 'FFD60A'),
  (10, 'recoleta-athletic',        'Recoleta Athletic',           'HOMBRES', 'Recoleta',      'FUTBOL_5', 'RECOLETA', now() - interval '165 days', 7, '14213D'),
  (11, 'saavedra-juniors',         'Saavedra Juniors',            'HOMBRES', 'Saavedra',      'FUTBOL_5', 'SAAVEDRA', now() - interval '160 days', 6, '6A040F'),
  (12, 'defensores-vicente-lopez', 'Defensores de Vicente López', 'HOMBRES', 'Vicente López', 'FUTBOL_5', 'DEFVLOPZ', now() - interval '150 days', 7, '023E8A'),
  (13, 'las-pibas-caballito',      'Las Pibas de Caballito',      'MUJERES', 'Caballito',     'FUTBOL_5', 'PIBASCAB', now() - interval '120 days', 7, 'D62F7F'),
  (14, 'leonas-belgrano',          'Leonas de Belgrano',          'MUJERES', 'Belgrano',      'FUTBOL_5', 'LEONAS14', now() - interval '115 days', 7, '7B2CBF'),
  (15, 'social-avellaneda',        'Club Social Avellaneda',      'HOMBRES', 'Avellaneda',    'FUTBOL_7', 'SOCIAL15', now() - interval '140 days', 9, '9D0208'),
  (16, 'ramos-mejia-fc',           'Ramos Mejía FC',              'HOMBRES', 'Ramos Mejía',   'FUTBOL_7', 'RAMOS716', now() - interval '135 days', 9, '1B4332'),
  -- Equipos que trajo el embajador (creados en las últimas 24 h).
  (17, 'unidos-de-boedo',          'Unidos de Boedo',             'HOMBRES', 'Boedo',         'FUTBOL_5', 'BOEDO517', now() - interval '20 hours', 6, '3A0CA3'),
  (18, 'la-banda-de-liniers',      'La Banda de Liniers',         'HOMBRES', 'Liniers',       'FUTBOL_5', 'LINIERS8', now() - interval '19 hours', 6, 'F48C06'),
  (19, 'furia-de-coghlan',         'Furia de Coghlan',            'HOMBRES', 'Coghlan',       'FUTBOL_5', 'COGHLAN9', now() - interval '6 hours',  3, '212529'),
  -- Equipo chico para grabar «pasar la capitanía y salir».
  (20, 'viernes-fc',               'Viernes FC',                  'HOMBRES', 'Caballito',     'FUTBOL_5', 'VIERNES0', now() - interval '40 days',  4, '0096C7');

insert into public.teams (id, name, category, zone, preferred_format, shield_url, invite_code, created_at)
select pg_temp.tid(t.idx), t.name, t.category, t.zone, t.fmt,
       case when exists (select 1 from storage.objects o
                          where o.bucket_id = 'shields' and o.name = 'tutorial/' || t.slug || '.png')
            then 'tutorial/' || t.slug || '.png'
            else 'https://ui-avatars.com/api/?name=' || replace(t.name, ' ', '+') || '&background=' || t.color
                 || '&color=fff&size=256&bold=true&rounded=true'
       end,
       t.code, t.created
  from tt t;

-- ------------------------------------------------------------
-- 5. PERSONAS (auth.users + identities + profiles)
-- ------------------------------------------------------------
create temp table tp (
  n int primary key, email text, username text, full_name text, gender text, dob date,
  pos player_position, zone text, foot text, fav text, avatar text,
  team int, role team_role, joined timestamptz, created timestamptz, tyc text default '11 de Septiembre, 2026'
) on commit drop;

-- Cuentas con punto de vista (POV) y jugadores con nombre propio.
insert into tp (n, email, username, full_name, gender, dob, pos, zone, foot, fav, avatar, team, role, joined, created, tyc) values
  ( 1, 'capitan@tutorial.local',    'tomiferreyra', 'Tomás Ferreyra',     'M', '1995-04-18', 'DELANTERO',     'Palermo',      'RIGHT', 'River Plate',      'https://randomuser.me/api/portraits/men/32.jpg', 1,  'CAPITAN',          now() - interval '130 days', now() - interval '300 days', default),
  ( 2, 'subcapitan@tutorial.local', 'lucasbenitez', 'Lucas Benítez',      'M', '1997-09-02', 'MEDIOCAMPISTA', 'Villa Crespo', 'BOTH',  'Boca Juniors',     'https://randomuser.me/api/portraits/men/45.jpg', 1,  'SUBCAPITAN',       now() - interval '128 days', now() - interval '140 days', default),
  ( 3, 'dt@tutorial.local',         'tano_russo',   'Carlos «Tano» Russo','M', '1972-01-23', 'CUALQUIERA',    'Palermo',      'RIGHT', 'San Lorenzo',      'https://randomuser.me/api/portraits/men/71.jpg', 1,  'DIRECTOR_TECNICO', now() - interval '125 days', now() - interval '135 days', default),
  ( 4, 'jugador@tutorial.local',    'facurios',     'Facundo Ríos',       'M', '1999-12-10', 'DEFENSOR',      'Colegiales',   'LEFT',  'Racing Club',      'https://randomuser.me/api/portraits/men/22.jpg', 1,  'JUGADOR',          now() - interval '120 days', now() - interval '132 days', default),
  ( 5, 'libre@tutorial.local',      'juliacosta',   'Julián Acosta',      'M', '1998-06-30', 'DELANTERO',     'Caballito',    'RIGHT', 'Independiente',    'https://randomuser.me/api/portraits/men/52.jpg', null, null, null,                         now() - interval '250 days', default),
  ( 6, 'refuerzo@tutorial.local',   'kevinmedina',  'Kevin Medina',       'M', '2001-03-14', 'MEDIOCAMPISTA', 'Almagro',      'RIGHT', 'Huracán',          'https://randomuser.me/api/portraits/men/61.jpg', null, null, null,                         now() - interval '20 days',  default),
  ( 7, 'rival@tutorial.local',      'sebapaz',      'Sebastián Paz',      'M', '1994-08-08', 'MEDIOCAMPISTA', 'Villa Crespo', 'RIGHT', 'Vélez Sarsfield',  'https://randomuser.me/api/portraits/men/11.jpg', 2,  'CAPITAN',          now() - interval '210 days', now() - interval '215 days', default),
  ( 8, 'rival2@tutorial.local',     'gonzaibarra',  'Gonzalo Ibarra',     'M', '1993-02-27', 'DEFENSOR',      'Núñez',        'LEFT',  'River Plate',      'https://randomuser.me/api/portraits/men/15.jpg', 5,  'CAPITAN',          now() - interval '180 days', now() - interval '185 days', default),
  ( 9, 'embajador@tutorial.local',  'nachoromero',  'Nacho Romero',       'M', '1996-11-05', 'MEDIOCAMPISTA', 'Saavedra',     'RIGHT', 'Platense',         'https://randomuser.me/api/portraits/men/36.jpg', 11, 'CAPITAN',          now() - interval '160 days', now() - interval '170 days', default),
  (10, 'capitan2@tutorial.local',   'leangomez',    'Leandro Gómez',      'M', '1990-05-19', 'DEFENSOR',      'Caballito',    'RIGHT', 'Otro / No tengo',  'https://randomuser.me/api/portraits/men/8.jpg',  20, 'CAPITAN',          now() - interval '40 days',  now() - interval '60 days',  default),
  (11, 'legales@tutorial.local',    'ezedominguez', 'Ezequiel Domínguez', 'M', '1992-07-07', 'ARQUERO',       'Flores',       'RIGHT', 'Lanús',            'https://randomuser.me/api/portraits/men/27.jpg', null, null, null,                         now() - interval '90 days',  '15 de Agosto, 2026'),
  -- Agentes libres con nombre (postulantes y solicitudes).
  (12, 'brunososa@tutorial.local',     'brunososa',     'Bruno Sosa',      'M', '2000-01-25', 'ARQUERO',       'Palermo',      'RIGHT', 'Boca Juniors',  'https://randomuser.me/api/portraits/men/41.jpg', null, null, null, now() - interval '30 days', default),
  (13, 'ramiquiroga@tutorial.local',   'ramiquiroga',   'Ramiro Quiroga',  'M', '1996-10-03', 'ARQUERO',       'Villa Crespo', 'LEFT',  'San Lorenzo',   'https://randomuser.me/api/portraits/men/57.jpg', null, null, null, now() - interval '45 days', default),
  (14, 'thiagocorrea@tutorial.local',  'thiagocorrea',  'Thiago Correa',   'M', '2002-04-12', 'DEFENSOR',      'Palermo',      'RIGHT', 'River Plate',   'https://randomuser.me/api/portraits/men/68.jpg', null, null, null, now() - interval '12 days', default),
  (15, 'matiluna@tutorial.local',      'matiluna',      'Matías Luna',     'M', '1997-08-21', 'MEDIOCAMPISTA', 'Colegiales',   'BOTH',  'Racing Club',   'https://randomuser.me/api/portraits/men/74.jpg', null, null, null, now() - interval '25 days', default),
  (16, 'crisojeda@tutorial.local',     'crisojeda',     'Cristian Ojeda',  'M', '1991-12-30', 'ARQUERO',       'Almagro',      'RIGHT', 'Huracán',       'https://randomuser.me/api/portraits/men/83.jpg', null, null, null, now() - interval '60 days', default);


-- Relleno: los planteles. Nombres y apellidos argentinos, avatares reales.
insert into tp (n, email, username, full_name, gender, dob, pos, zone, foot, fav, avatar, team, role, joined, created)
select 1000 + t.idx * 20 + g,
       null, null,
       case when t.category = 'MUJERES'
            then (array['Camila','Sofía','Valentina','Lucía','Martina','Agustina','Florencia','Micaela','Julieta','Rocío','Milagros','Antonella'])[1 + (t.idx * 5 + g * 7) % 12]
            else (array['Martín','Nicolás','Matías','Federico','Gastón','Pablo','Hernán','Maximiliano','Ignacio','Agustín','Santiago','Franco',
                        'Emiliano','Lautaro','Joaquín','Rodrigo','Diego','Cristian','Damián','Mariano','Germán','Alejandro','Ramiro','Nahuel',
                        'Valentín','Iván','Marcos','Esteban','Walter','Claudio','Leonel','Ariel','Brian','Elías','Axel','Dylan'])[1 + (t.idx * 11 + g * 13) % 36]
       end || ' ' ||
       (array['González','Rodríguez','Fernández','López','Martínez','Pérez','García','Sánchez','Romero','Sosa','Álvarez','Torres',
              'Ruiz','Ramírez','Flores','Acosta','Medina','Herrera','Suárez','Aguirre','Giménez','Gutiérrez','Pereyra','Rojas',
              'Molina','Castro','Ortiz','Silva','Núñez','Juárez','Cabrera','Morales','Godoy','Ledesma','Vega','Figueroa',
              'Cáceres','Vázquez','Ponce','Villalba','Bustos','Maidana','Arias','Peralta','Carrizo','Lucero','Coronel','Barrios'])[1 + (t.idx * 17 + g * 5) % 48],
       case when t.category = 'MUJERES' then 'F' else 'M' end,
       ('1984-03-01'::date + (((t.idx * 397 + g * 811) % 7000) || ' days')::interval)::date,
       case when g = 1 and t.idx not in (1, 2, 5, 11, 20) then 'ARQUERO'::player_position
            else (array['DEFENSOR','MEDIOCAMPISTA','DELANTERO','DEFENSOR','MEDIOCAMPISTA','DELANTERO','CUALQUIERA','ARQUERO','MEDIOCAMPISTA'])[1 + (g + t.idx) % 9]::player_position end,
       t.zone,
       (array['RIGHT','RIGHT','LEFT','RIGHT','BOTH'])[1 + (g + t.idx) % 5],
       (array['Boca Juniors','River Plate','Racing Club','Independiente','San Lorenzo','Huracán','Vélez Sarsfield','Lanús','Estudiantes de La Plata','Argentinos Juniors'])[1 + (t.idx + g * 3) % 10],
       case when t.category = 'MUJERES'
            then 'https://randomuser.me/api/portraits/women/' || ((t.idx * 13 + g * 9) % 100) || '.jpg'
            else 'https://randomuser.me/api/portraits/men/' || ((t.idx * 29 + g * 17 + 5) % 100) || '.jpg' end,
       t.idx,
       case when g = 1 and t.idx not in (1, 2, 5, 11, 20) then 'CAPITAN'::team_role
            when (g = 2 and t.idx not in (1, 2, 5, 11, 20)) or (g = 1 and t.idx in (2, 5, 11)) then 'SUBCAPITAN'::team_role
            else 'JUGADOR'::team_role end,
       -- Los equipos traídos se arman en las horas posteriores a su creación.
       case when t.idx in (17, 18, 19)
            then t.created + ((g * 35) || ' minutes')::interval
            when t.idx = 20 then t.created + ((g * 3) || ' days')::interval
            else least(t.created + ((g * 3) || ' days')::interval, now() - interval '100 days')
       end,
       case when t.idx in (17, 18, 19) then t.created - interval '1 hour'
            else t.created - ((10 + g) || ' days')::interval end
  from tt t
  cross join lateral generate_series(1, t.fillers) g;

-- Equipos sin POV: el capitán relleno entra primero (no puede entrar después que sus jugadores).
update tp p set joined = t.created
  from tt t
 where p.team = t.idx and p.role = 'CAPITAN' and p.n >= 1000;
-- Equipos traídos: el capitán entra al crearlo (antes que el resto).
update tp p set joined = t.created
  from tt t where p.team = t.idx and t.idx in (17, 18, 19) and p.role = 'CAPITAN';
-- Los planteles históricos ya estaban completos antes de la primera fecha (73 días).
update tp set joined = least(joined, now() - interval '80 days') where team between 1 and 16 and n >= 1000;

-- Usernames: nombre+apellido sin tildes; si se repite, se le agrega un número.
with base as (
  select n, translate(lower(replace(split_part(full_name, ' ', 1) || split_part(full_name, ' ', 2), ' ', '')),
                      'áéíóúüñ', 'aeiouun') as b
    from tp where username is null
), numbered as (
  select n, b, row_number() over (partition by b order by n) rn from base
)
update tp set username = case when nb.rn = 1 then nb.b else nb.b || nb.rn end,
              email    = (case when nb.rn = 1 then nb.b else nb.b || nb.rn end) || '@tutorial.local'
  from numbered nb where tp.n = nb.n;

-- auth.users + identities (login con 123456) + constancia legal vigente.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
       ('7a110000-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', p.email,
       crypt('123456', gen_salt('bf')), p.created,
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('accepted_tyc', true, 'accepted_privacy', true,
                          'legal_acceptance_date', to_char(p.created at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                          'tyc_version', p.tyc, 'privacy_version', '21 de Octubre, 2026'),
       p.created, p.created, '', '', '', ''
  from tp p;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', null, u.created_at, u.created_at
  from auth.users u;

insert into public.profiles (id, auth_user_id, username, full_name, zone, preferred_position,
                             gender, date_of_birth, avatar_url, favorite_team, strong_foot, created_at)
select ('7a220000-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid,
       ('7a110000-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid,
       p.username, p.full_name, p.zone, p.pos, p.gender, p.dob, p.avatar, p.fav, p.foot, p.created
  from tp p;

-- Membresías: el trigger open_team_stint abre la trayectoria desde joined_at.
insert into public.team_members (team_id, profile_id, role, joined_at)
select pg_temp.tid(p.team), ('7a220000-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid, p.role, p.joined
  from tp p where p.team is not null
 order by p.joined;

-- Trayectoria: ciclos cerrados (como los deja close_team_stint).
insert into public.team_stints (profile_id, team_id, team_name, shield_url, started_at, ended_at,
                                leave_reason, last_role, stats, stats_computed_at)
select pg_temp.pid(s.username), pg_temp.tid(s.team), t.name, t.shield_url,
       now() - (s.st || ' days')::interval, now() - (s.en || ' days')::interval,
       s.reason::stint_leave_reason, s.last_role::team_role,
       jsonb_build_object(
         'total', jsonb_build_object('pj_ranking', s.pjr, 'pj_amistoso', s.pja, 'goals', s.gl, 'mvps', s.mv,
                                     'clean_sheets', 0, 'wins', s.w, 'draws', s.d, 'losses', s.l),
         'by_season', jsonb_build_array(jsonb_build_object(
             'season_id', null, 'season_name', 'Apertura 2026', 'pj_ranking', s.pjr, 'pj_amistoso', s.pja,
             'goals', s.gl, 'mvps', s.mv, 'clean_sheets', 0, 'wins', s.w, 'draws', s.d, 'losses', s.l)),
         'computed_at', (now() - (s.en || ' days')::interval)::text),
       now() - (s.en || ' days')::interval
  from (values
    ('tomiferreyra', 6, 215, 131, 'TRANSFERENCIA', 'JUGADOR', 14, 6, 11, 3, 9, 4, 7),
    ('juliacosta',   8, 155, 45,  'ABANDONO',      'JUGADOR',  9, 3,  6, 1, 5, 2, 5),
    ('ezedominguez', 4, 195, 70,  'TRANSFERENCIA', 'SUBCAPITAN', 11, 2, 0, 1, 6, 3, 4)
  ) s(username, team, st, en, reason, last_role, pjr, pja, gl, mv, w, d, l)
  join public.teams t on t.id = pg_temp.tid(s.team);

-- Referidos (badge «Reclutador» = 3+ referidos): 3 compañeros entraron con el
-- código de Tomás. Por la RPC real, como lo hace el onboarding.
do $$
declare r record;
begin
  for r in select p.username from public.profiles p
             join public.team_members m on m.profile_id = p.id
            where m.team_id = pg_temp.tid(1) and p.username not in ('tomiferreyra','lucasbenitez','tano_russo','facurios')
            order by p.username limit 3
  loop
    perform pg_temp.act_as(r.username);
    perform public.set_referral('tomiferreyra');
  end loop;
  perform pg_temp.act_clear();
end $$;

-- ------------------------------------------------------------
-- 6. MOTOR DE PARTIDOS
-- ------------------------------------------------------------
-- Inserta un partido EN_VIVO con check-ins y convocados, y carga los dos
-- resultados: resolve_match decide FINALIZADO (o EN_DISPUTA si p_b_claims
-- difiere) y apply_match_outcome aplica ELO y stats. Si terminó, corre las
-- fechas al horario real del partido.
create or replace function pg_temp.play_match(
  p_a int, p_b int, p_at timestamptz, p_type match_type, p_fmt team_format, p_venue int,
  p_ga int, p_gb int, p_code text,
  p_star_goals int default null,      -- goles de Tomás (sólo partidos de Dorrego)
  p_star_mvp boolean default false,
  p_b_claim_ga int default null,      -- lo que carga B si no coincide (disputa)
  p_b_claim_gb int default null,
  p_backdate boolean default true
) returns uuid
language plpgsql as $$
declare
  v_id     uuid := gen_random_uuid();
  v_season uuid := (select id from public.seasons where is_active limit 1);
  v_need   int  := case p_fmt when 'FUTBOL_7' then 7 else 5 end;
  v_star   uuid := pg_temp.pid('tomiferreyra');
  v_side   record;
  v_team   int;
  v_goals  int;
  v_parts  uuid[];
  v_pool   uuid[];
  v_counts jsonb;
  v_scorers jsonb;
  v_mvp    uuid;
  v_cap    uuid;
  v_k      int;
  v_pick   uuid;
  v_rest   int;
  v_fin    timestamptz := p_at + interval '70 minutes';
begin
  insert into public.matches (id, team_a_id, team_b_id, season_id, status, match_type, format,
                              scheduled_at, duration_minutes, venue_id, location,
                              checkin_team_a_at, checkin_team_b_at, started_at, unique_code, created_at)
  values (v_id, pg_temp.tid(p_a), pg_temp.tid(p_b), v_season, 'EN_VIVO', p_type, p_fmt,
          p_at, 60, pg_temp.vid(p_venue), (select name from public.venues where id = pg_temp.vid(p_venue)),
          p_at - interval '12 minutes', p_at - interval '9 minutes', p_at, p_code, p_at - interval '6 days');

  for v_side in select * from (values (p_a, p_ga, 1), (p_b, p_gb, 2)) s(team, goals, ord) order by ord loop
    v_team := v_side.team;
    -- Convocados: Dorrego siempre con Tomás, Lucas y Facu; el resto rota.
    if v_team = 1 then
      select array_agg(id order by rk) into v_parts from (
        select p.id, case p.username when 'tomiferreyra' then 0 when 'lucasbenitez' then 1 when 'facurios' then 2
                     else 3 + (abs(hashtext(p.username || p_code)) % 100) end as rk
          from public.team_members m join public.profiles p on p.id = m.profile_id
         where m.team_id = pg_temp.tid(1) and m.role <> 'DIRECTOR_TECNICO'
         order by rk limit v_need) x;
    else
      select array_agg(id order by rk) into v_parts from (
        select p.id, case m.role when 'CAPITAN' then -1 else abs(hashtext(p.username || p_code)) % 1000 end as rk
          from public.team_members m join public.profiles p on p.id = m.profile_id
         where m.team_id = pg_temp.tid(v_team) and m.role <> 'DIRECTOR_TECNICO'
           and m.joined_at <= p_at
         order by rk limit v_need) x;
    end if;

    insert into public.match_participants (match_id, profile_id, team_id, did_checkin, checkin_at,
                                           is_result_loader, lineup_role)
    select v_id, u, pg_temp.tid(v_team), true, p_at - interval '15 minutes' + (i || ' minutes')::interval,
           true, 'TITULAR'
      from unnest(v_parts) with ordinality as x(u, i);

    -- Goleadores: pesos por puesto (el 9 hace más goles que el arquero).
    v_goals := v_side.goals;
    v_counts := '{}'::jsonb;
    v_rest := v_goals;
    if v_team = 1 and p_star_goals is not null then
      if p_star_goals > 0 then v_counts := jsonb_build_object(v_star::text, p_star_goals); end if;
      v_rest := v_goals - p_star_goals;
    end if;
    select array_agg(p.id) into v_pool
      from unnest(v_parts) u join public.profiles p on p.id = u
      cross join lateral generate_series(1, case p.preferred_position when 'DELANTERO' then 4 when 'MEDIOCAMPISTA' then 2
                                                                      when 'CUALQUIERA' then 2 when 'DEFENSOR' then 1 else 0 end) w
     where not (v_team = 1 and p_star_goals is not null and p.id = v_star);
    if v_pool is null then v_pool := v_parts; end if;
    for v_k in 1 .. greatest(v_rest, 0) loop
      v_pick := v_pool[1 + floor(pg_temp.h01(p_code || v_team || 'g' || v_k) * array_length(v_pool, 1))::int];
      v_counts := v_counts || jsonb_build_object(v_pick::text, coalesce((v_counts ->> v_pick::text)::int, 0) + 1);
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('profile_id', key, 'goals', value::int) order by value::int desc), '[]'::jsonb)
      into v_scorers from jsonb_each_text(v_counts);

    if v_team = 1 and p_star_mvp then
      v_mvp := v_star;
    elsif v_team = 1 and p_star_goals is not null then
      -- Partidos de Dorrego donde Tomás no fue la figura: el mejor del resto.
      select (key)::uuid into v_mvp from jsonb_each_text(v_counts) where key <> v_star::text
       order by value::int desc, key limit 1;
      v_mvp := coalesce(v_mvp, v_parts[2]);
    else
      select (key)::uuid into v_mvp from jsonb_each_text(v_counts) order by value::int desc, key limit 1;
      v_mvp := coalesce(v_mvp, v_parts[1 + floor(pg_temp.h01(p_code || v_team || 'mvp') * array_length(v_parts, 1))::int]);
    end if;

    select m.profile_id into v_cap from public.team_members m
     where m.team_id = pg_temp.tid(v_team) and m.role in ('CAPITAN','SUBCAPITAN')
     order by (m.role = 'CAPITAN') desc limit 1;

    insert into public.match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id, submitted_at)
    values (v_id, pg_temp.tid(v_team), v_cap,
            case when v_side.ord = 2 and p_b_claim_gb is not null then p_b_claim_gb else v_side.goals end,
            case when v_side.ord = 1 then p_gb when p_b_claim_ga is not null then p_b_claim_ga else p_ga end,
            v_scorers, v_mvp, case when p_backdate then v_fin else now() end);
  end loop;

  if p_backdate and (select status from public.matches where id = v_id) = 'FINALIZADO' then
    update public.matches set finished_at = v_fin, updated_at = v_fin where id = v_id;
    update public.elo_history set created_at = v_fin where match_id = v_id;
  end if;
  return v_id;
end $$;

-- ------------------------------------------------------------
-- 7. HISTORIAL DE LA TEMPORADA (≈ 70 partidos, en orden cronológico)
-- ------------------------------------------------------------
-- Liga de fútbol 5 (equipos 1..12), todos contra todos con el método del
-- círculo: 10 fechas, una por semana. El orden de rivales de Dorrego está
-- elegido para que en los últimos 30 días no haya jugado de ranking contra
-- los equipos con los que hay flujos en vivo (2, 5, 6, 7, 9 y 10): si no,
-- send_challenge los frenaría por el anti-amaño de 30 días.
create temp table sched (
  seq serial, at timestamptz, a int, b int, mtype match_type, fmt team_format, venue int,
  ga int, gb int, code text, star_goals int, star_mvp boolean
) on commit drop;

with ord as (select array[2,5,6,7,9,10,3,12,8,11,4] o),
pairs as (
  select r, 0 as i, 1 as a, (select o from ord)[r + 1] as b from generate_series(0, 9) r
  union all
  select r, i, (select o from ord)[((r + i) % 11) + 1], (select o from ord)[((r - i + 11) % 11) + 1]
    from generate_series(0, 9) r, generate_series(1, 5) i
),
strength(t, s) as (
  select * from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12],
                       array[0.85,0.9,0.5,0.45,0.75,0.6,0.35,0.3,0.4,0.55,0.32,0.22]::float8[])
),
dorrego(b, ga, gb, sg, mvp) as (values
  (2, 3, 4, 2, false), (5, 5, 2, 2, true), (6, 2, 2, 1, false), (7, 6, 3, 3, true), (9, 2, 3, 1, false),
  (10, 3, 1, 1, false), (3, 4, 2, 2, true), (12, 7, 2, 3, true), (8, 3, 2, 1, false), (11, 1, 2, 0, false)
),
venue_by_zone(zone, v) as (values
  ('Palermo', 1), ('Villa Crespo', 3), ('Almagro', 4), ('Caballito', 11), ('Núñez', 5), ('Belgrano', 6),
  ('Colegiales', 7), ('Flores', 8), ('Villa Urquiza', 9), ('Recoleta', 10), ('Saavedra', 9), ('Vicente López', 5)
)
insert into sched (at, a, b, mtype, fmt, venue, ga, gb, code, star_goals, star_mvp)
select pg_temp.art(-(73 - 7 * p.r) + (p.i / 4), (time '19:00' + ((p.i % 4) || ' hours')::interval)::time),
       case when p.r % 2 = 0 then p.a else p.b end,
       case when p.r % 2 = 0 then p.b else p.a end,
       case when (p.a = 1 and p.b = 8) or (p.a <> 1 and pg_temp.h01('t' || p.r || p.i) < 0.15)
            then 'AMISTOSO'::match_type else 'RANKING'::match_type end,
       'FUTBOL_5',
       (select v from venue_by_zone where zone = (select zone from tt where idx = case when p.r % 2 = 0 then p.a else p.b end)),
       -- Goles: Dorrego con guion; el resto según la fuerza de cada equipo.
       case when p.a = 1 then (case when p.r % 2 = 0 then d.ga else d.gb end)
            else floor(pg_temp.h01('ga' || p.r || p.i) * (1.2 + 5.2 * (select s from strength where t = case when p.r % 2 = 0 then p.a else p.b end)))::int end,
       case when p.a = 1 then (case when p.r % 2 = 0 then d.gb else d.ga end)
            else floor(pg_temp.h01('gb' || p.r || p.i) * (1.2 + 5.2 * (select s from strength where t = case when p.r % 2 = 0 then p.b else p.a end)))::int end,
       'H' || lpad(p.r::text, 2, '0') || p.i || upper(substr(md5(p.r || '-' || p.i), 1, 2)),
       case when p.a = 1 then d.sg end,
       case when p.a = 1 then d.mvp else false end
  from pairs p
  left join dorrego d on p.a = 1 and d.b = p.b;

-- Femenino y fútbol 7: tres cruces cada uno.
insert into sched (at, a, b, mtype, fmt, venue, ga, gb, code) values
  (pg_temp.art(-60, '20:00'), 13, 14, 'RANKING', 'FUTBOL_5', 11, 2, 1, 'FEM001'),
  (pg_temp.art(-39, '20:00'), 14, 13, 'RANKING', 'FUTBOL_5', 6,  3, 3, 'FEM002'),
  (pg_temp.art(-18, '21:00'), 13, 14, 'RANKING', 'FUTBOL_5', 11, 1, 4, 'FEM003'),
  (pg_temp.art(-55, '15:00'), 15, 16, 'RANKING', 'FUTBOL_7', 8,  3, 2, 'F7A001'),
  (pg_temp.art(-34, '15:00'), 16, 15, 'RANKING', 'FUTBOL_7', 8,  1, 1, 'F7A002'),
  (pg_temp.art(-13, '16:00'), 15, 16, 'RANKING', 'FUTBOL_7', 8,  2, 4, 'F7A003');

-- El último partido de Dorrego (hace 3 días): 4-3 a Real Caballito, triplete y figura de Tomás.
insert into sched (at, a, b, mtype, fmt, venue, ga, gb, code, star_goals, star_mvp) values
  (pg_temp.art(-3, '21:00'), 1, 4, 'RANKING', 'FUTBOL_5', 1, 4, 3, 'DOR4R3', 3, true);

-- Mientras se carga la historia no se avisa a nadie (eran ~1.400 notificaciones).
alter table public.matches disable trigger trg_notify_match_status;

do $$
declare s record;
begin
  for s in select * from sched order by at, seq loop
    perform pg_temp.play_match(s.a, s.b, s.at, s.mtype, s.fmt, s.venue, s.ga, s.gb, s.code,
                               s.star_goals, coalesce(s.star_mvp, false));
  end loop;
end $$;

alter table public.matches enable trigger trg_notify_match_status;

-- ------------------------------------------------------------
-- 8. PROGRAMA DE EMBAJADORES (RPC reales + barrido real)
-- ------------------------------------------------------------
do $$
declare v text;
begin
  perform pg_temp.act_as('nachoromero');
  v := public.upsert_ambassador('nacho.romero.f5', true, true, true);
  if v <> 'created' then raise exception 'upsert_ambassador: %', v; end if;
  v := public.set_ambassador_payout_alias('nacho.romero.mp');
  if v <> 'applied' then raise exception 'set_ambassador_payout_alias: %', v; end if;
  perform pg_temp.act_clear();
end $$;

-- Se inscribió ayer (antes de que jugaran sus equipos) y TorneAR ya verificó
-- que sigue a @tornear.app (eso lo hace un admin desde el dashboard).
update public.ambassadors
   set accepted_at = now() - interval '23 hours', created_at = now() - interval '23 hours',
       own_team_set_at = now() - interval '23 hours',
       follow_verified_at = now() - interval '21 hours'
 where profile_id = pg_temp.pid('nachoromero');

-- Los capitanes de los equipos traídos entraron con el código de Nacho y lo
-- cargaron en «¿Quién los invitó?».
do $$
declare r record; v text;
begin
  for r in select p.username, m.team_id from public.team_members m join public.profiles p on p.id = m.profile_id
            where m.role = 'CAPITAN' and m.team_id in (pg_temp.tid(17), pg_temp.tid(18), pg_temp.tid(19))
  loop
    perform pg_temp.act_as(r.username);
    perform public.set_referral('nachoromero');
    v := public.set_team_ambassador(r.team_id, 'nachoromero');
    if v <> 'applied' then raise exception 'set_team_ambassador(%): %', r.username, v; end if;
  end loop;
  perform pg_temp.act_clear();
end $$;

-- Primeros partidos de los traídos (después de inscribirse Nacho):
--   Saavedra Juniors (equipo propio de Nacho) vs Unidos de Boedo → TEAM_BROUGHT + DEBUT.
--   Flores Unidos vs La Banda de Liniers → TEAM_BROUGHT.
-- Furia de Coghlan todavía no jugó (3 de 5 integrantes): queda «esperando».
alter table public.matches disable trigger trg_notify_match_status;
select pg_temp.play_match(11, 17, now() - interval '7 hours', 'RANKING', 'FUTBOL_5', 9, 3, 3, 'EMB001');
select pg_temp.play_match(8, 18, now() - interval '5 hours', 'RANKING', 'FUTBOL_5', 8, 2, 4, 'EMB002');
alter table public.matches enable trigger trg_notify_match_status;

-- Toda la historia queda sin avisos viejos: la bandeja se arma más abajo.
delete from public.notifications;

select public.sweep_ambassador_rewards() as premios_generados;

-- El premio de Unidos de Boedo ya se pagó (lo marca un admin desde el dashboard).
update public.ambassador_rewards
   set status = 'PAGADO', paid_at = now() - interval '1 hour', note = 'Transferido a nacho.romero.mp'
 where kind = 'TEAM_BROUGHT' and team_id = pg_temp.tid(17);

-- ------------------------------------------------------------
-- 9. FLUJOS EN VIVO DE DORREGO (todo por RPC)
-- ------------------------------------------------------------
create temp table ids (k text primary key, id uuid) on commit drop;

do $$
declare
  v_res   json;
  v_ch    uuid;
  v_match uuid;
  v_prop  uuid;
  v_at    timestamptz;
  r       record;
begin
  -- 9.1 HOY: Dorrego vs Atlético Villa Crespo (ranking, 1.º contra 2.º).
  --     Desafío de Seba → Tomás acepta → Seba propone → Tomás confirma.
  perform pg_temp.act_as('sebapaz');
  v_res := public.send_challenge(pg_temp.tid(2), pg_temp.tid(1), 'RANKING');
  v_ch := (v_res ->> 'challengeId')::uuid;
  perform pg_temp.act_as('tomiferreyra');
  v_res := public.accept_challenge(v_ch);
  v_match := (v_res ->> 'matchId')::uuid;
  insert into ids values ('hoy', v_match), ('hoy_chat', (v_res ->> 'conversationId')::uuid);

  v_at := date_trunc('hour', now()) + interval '2 hours';
  perform pg_temp.act_as('sebapaz');
  insert into public.match_proposals (match_id, proposed_by, from_team_id, format, match_type, scheduled_at,
                                      duration_minutes, location, venue_id, signal_amount, total_cost)
  values (v_match, pg_temp.pid('sebapaz'), pg_temp.tid(2), 'FUTBOL_5', 'RANKING', v_at, 60,
          'Los Amigos Fútbol 5 Palermo', pg_temp.vid(1), 10000, 48000)
  returning id into v_prop;
  perform pg_temp.act_as('tomiferreyra');
  perform public.confirm_match_proposal(v_prop, v_match);
  -- El recordatorio de 24 h ya «salió» (se inserta a mano más abajo): así el
  -- cron enqueue-match-reminders no manda otro igual.
  update public.matches set unique_code = 'VCD721', reminder_24h_sent_at = now() - interval '3 hours' where id = v_match;

  -- Villa Crespo ya llegó (4 check-ins = quórum de F5, queda sellado). De
  -- Dorrego ya están 3: el check-in de Tomás es el que completa el quórum y
  -- pone el partido EN VIVO.
  for r in select p.username from public.team_members m join public.profiles p on p.id = m.profile_id
            where m.team_id = pg_temp.tid(2) order by (m.role = 'CAPITAN') desc, p.username limit 4 loop
    perform pg_temp.act_as(r.username);
    perform public.checkin_team(v_match, pg_temp.tid(2), -34.5740100, -58.4311000);
  end loop;
  for r in select p.username from public.team_members m join public.profiles p on p.id = m.profile_id
            where m.team_id = pg_temp.tid(1)
              and p.username not in ('tomiferreyra','lucasbenitez','tano_russo','facurios')
            order by p.username limit 3 loop
    perform pg_temp.act_as(r.username);
    perform public.checkin_team(v_match, pg_temp.tid(1), -34.5741000, -58.4312500);
  end loop;

  -- 9.2 PENDIENTE con propuesta para aceptar: vs Juventud Belgrano.
  perform pg_temp.act_as((select p.username from public.team_members m join public.profiles p on p.id = m.profile_id
                           where m.team_id = pg_temp.tid(6) and m.role = 'CAPITAN'));
  v_res := public.send_challenge(pg_temp.tid(6), pg_temp.tid(1), 'RANKING');
  v_ch := (v_res ->> 'challengeId')::uuid;
  perform pg_temp.act_as('tomiferreyra');
  v_res := public.accept_challenge(v_ch);
  v_match := (v_res ->> 'matchId')::uuid;
  insert into ids values ('propuesta', v_match), ('propuesta_chat', (v_res ->> 'conversationId')::uuid);
  perform pg_temp.act_as((select p.username from public.team_members m join public.profiles p on p.id = m.profile_id
                           where m.team_id = pg_temp.tid(6) and m.role = 'CAPITAN'));
  insert into public.match_proposals (match_id, proposed_by, from_team_id, format, match_type, scheduled_at,
                                      duration_minutes, location, venue_id, signal_amount, total_cost)
  values (v_match, (select m.profile_id from public.team_members m where m.team_id = pg_temp.tid(6) and m.role = 'CAPITAN'),
          pg_temp.tid(6), 'FUTBOL_5', 'RANKING', pg_temp.art(5, '20:00'), 60,
          'Fútbol & Paddle', pg_temp.vid(2), 8000, 40000)
  returning id into v_prop;
  insert into ids values ('propuesta_id', v_prop);

  -- 9.3 CONFIRMADO en 3 días vs La 12 de Urquiza, con pedido de cancelación del rival.
  perform pg_temp.act_as((select p.username from public.team_members m join public.profiles p on p.id = m.profile_id
                           where m.team_id = pg_temp.tid(9) and m.role = 'CAPITAN'));
  v_res := public.send_challenge(pg_temp.tid(9), pg_temp.tid(1), 'AMISTOSO');
  v_ch := (v_res ->> 'challengeId')::uuid;
  perform pg_temp.act_as('tomiferreyra');
  v_res := public.accept_challenge(v_ch);
  v_match := (v_res ->> 'matchId')::uuid;
  insert into ids values ('cancelacion', v_match);
  insert into public.match_proposals (match_id, proposed_by, from_team_id, format, match_type, scheduled_at,
                                      duration_minutes, location, venue_id, signal_amount, total_cost)
  values (v_match, pg_temp.pid('tomiferreyra'), pg_temp.tid(1), 'FUTBOL_5', 'AMISTOSO', pg_temp.art(3, '21:00'), 60,
          'Copa Norte Fútbol', pg_temp.vid(7), 6000, 36000)
  returning id into v_prop;
  perform pg_temp.act_as((select p.username from public.team_members m join public.profiles p on p.id = m.profile_id
                           where m.team_id = pg_temp.tid(9) and m.role = 'CAPITAN'));
  perform public.confirm_match_proposal(v_prop, v_match);
  perform public.request_match_cancellation(v_match, pg_temp.tid(9), 'CAMPO_NO_DISPONIBLE',
    'Nos avisaron del complejo que ese día cierran la cancha por mantenimiento. ¿Lo pasamos para la semana que viene?');

  -- 9.4 Desafíos esperando respuesta: uno de ranking (Sportivo Núñez, Gonzalo)
  --     y uno amistoso (Flores Unidos). Y uno que mandó Tomás a Colegiales.
  perform pg_temp.act_as('gonzaibarra');
  v_res := public.send_challenge(pg_temp.tid(5), pg_temp.tid(1), 'RANKING');
  insert into ids values ('desafio_nunez', (v_res ->> 'challengeId')::uuid);
  perform pg_temp.act_as((select p.username from public.team_members m join public.profiles p on p.id = m.profile_id
                           where m.team_id = pg_temp.tid(8) and m.role = 'CAPITAN'));
  v_res := public.send_challenge(pg_temp.tid(8), pg_temp.tid(1), 'AMISTOSO');
  insert into ids values ('desafio_flores', (v_res ->> 'challengeId')::uuid);
  perform pg_temp.act_as('tomiferreyra');
  v_res := public.send_challenge(pg_temp.tid(1), pg_temp.tid(7), 'RANKING');
  insert into ids values ('desafio_enviado', (v_res ->> 'challengeId')::uuid);

  perform pg_temp.act_clear();
end $$;

-- Fechas de los desafíos esparcidas (llegaron en distintos momentos).
update public.challenges set created_at = now() - interval '26 hours', updated_at = now() - interval '25 hours'
 where from_team_id = pg_temp.tid(2) and to_team_id = pg_temp.tid(1);
update public.challenges set created_at = now() - interval '3 hours' where id = (select id from ids where k = 'desafio_nunez');
update public.challenges set created_at = now() - interval '50 minutes' where id = (select id from ids where k = 'desafio_flores');
update public.challenges set created_at = now() - interval '1 day' where id = (select id from ids where k = 'desafio_enviado');

-- 9.5 EN DISPUTA (ayer vs Los Muchachos de Almagro): Dorrego cargó 4-3, Almagro 3-3.
--     resolve_match lo pasa a EN_DISPUTA (avisa a los dos planteles y descuenta Fair Play).
do $$
declare v_match uuid; r record;
begin
  v_match := pg_temp.play_match(1, 3, pg_temp.art(-1, '21:00'), 'RANKING', 'FUTBOL_5', 1, 4, 3, 'DOR4A3',
                                2, false, 3, 3, false);
  insert into ids values ('disputa', v_match);
  insert into public.conversations (type, match_id) values ('MATCH_CHAT', v_match);
  -- Votos ya emitidos: dos de Almagro y uno de Dorrego. Tomás, Lucas y Facu votan en cámara.
  for r in (select p.username, mp.team_id from public.match_participants mp join public.profiles p on p.id = mp.profile_id
             where mp.match_id = v_match and mp.did_checkin and mp.team_id = pg_temp.tid(3)
             order by p.username limit 2)
           union all
           (select p.username, mp.team_id from public.match_participants mp join public.profiles p on p.id = mp.profile_id
             where mp.match_id = v_match and mp.did_checkin and mp.team_id = pg_temp.tid(1)
               and p.username not in ('tomiferreyra','lucasbenitez','facurios')
             order by p.username limit 1) loop
    perform pg_temp.act_as(r.username);
    perform public.submit_dispute_vote(v_match, r.team_id);
  end loop;
  perform pg_temp.act_clear();
end $$;

-- ------------------------------------------------------------
-- 10. GESTIÓN DEL EQUIPO: solicitudes de unión
-- ------------------------------------------------------------
insert into public.team_join_requests (team_id, profile_id, status, created_at, updated_at) values
  (pg_temp.tid(1), pg_temp.pid('thiagocorrea'), 'PENDIENTE', now() - interval '5 hours', now() - interval '5 hours'),
  (pg_temp.tid(1), pg_temp.pid('matiluna'),     'PENDIENTE', now() - interval '2 hours', now() - interval '2 hours');

-- ------------------------------------------------------------
-- 11. MERCADO DE PASES
-- ------------------------------------------------------------
insert into public.market_team_posts (id, team_id, created_by, position_wanted, description, match_date, match_time,
                                      pitch_type, zone, complex, venue_id, is_active, created_at) values
  ('7a660000-0000-4000-8000-000000000001', pg_temp.tid(1), pg_temp.pid('tomiferreyra'), 'ARQUERO',
   'Buscamos arquero fijo para el Clausura. Jugamos a la noche en Palermo, buen nivel y mejor tercer tiempo.',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 2)::text, '21:00', 'FUTBOL_5', 'Palermo', 'Los Amigos Fútbol 5 Palermo', pg_temp.vid(1), true, now() - interval '2 days'),
  ('7a660000-0000-4000-8000-000000000002', pg_temp.tid(4), (select m.profile_id from team_members m where m.team_id = pg_temp.tid(4) and m.role = 'CAPITAN'), 'DELANTERO',
   'Se nos fue el 9 a jugar a Córdoba. Buscamos delantero con gol para el ranking.',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1)::text, '20:00', 'FUTBOL_5', 'Caballito', 'Canchas de Fútbol 5 Puán', pg_temp.vid(11), true, now() - interval '6 hours'),
  ('7a660000-0000-4000-8000-000000000003', pg_temp.tid(7), (select m.profile_id from team_members m where m.team_id = pg_temp.tid(7) and m.role = 'CAPITAN'), 'DEFENSOR',
   'Colegiales FC suma un central. Que sepa salir jugando y que no falte.',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 4)::text, '22:00', 'FUTBOL_5', 'Colegiales', 'Copa Norte Fútbol', pg_temp.vid(7), true, now() - interval '1 day'),
  ('7a660000-0000-4000-8000-000000000004', pg_temp.tid(10), (select m.profile_id from team_members m where m.team_id = pg_temp.tid(10) and m.role = 'CAPITAN'), 'MEDIOCAMPISTA',
   'Buscamos un 5 con pulmón para cerrar el plantel. Recoleta, a la tarde.',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 3)::text, '17:00', 'FUTBOL_5', 'Recoleta', 'Norte Fútbol 5', pg_temp.vid(10), true, now() - interval '3 days'),
  ('7a660000-0000-4000-8000-000000000005', pg_temp.tid(8), (select m.profile_id from team_members m where m.team_id = pg_temp.tid(8) and m.role = 'CAPITAN'), 'CUALQUIERA',
   'Nos falta uno para el amistoso. Cualquier puesto, buena onda.',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 2)::text, '20:30', 'FUTBOL_5', 'Flores', 'Village Fútbol Club', pg_temp.vid(8), true, now() - interval '9 hours');

insert into public.market_player_posts (id, profile_id, post_type, position, description, is_active, created_at) values
  ('7a660000-0000-4000-8000-000000000011', pg_temp.pid('juliacosta'), 'BUSCA_EQUIPO', 'DELANTERO',
   'Delantero, 27 años. Me quedé sin equipo después del Apertura. Zona Caballito/Almagro/Palermo, puedo entre semana.', true, now() - interval '1 day'),
  ('7a660000-0000-4000-8000-000000000012', pg_temp.pid('brunososa'), 'BUSCA_EQUIPO', 'ARQUERO',
   'Arquero con experiencia en torneos de F5. Busco equipo competitivo, zona norte.', true, now() - interval '4 days'),
  ('7a660000-0000-4000-8000-000000000013', pg_temp.pid('matiluna'), 'BUSCA_PARTIDO', 'MEDIOCAMPISTA',
   'Si les falta uno, me prendo. Mediocampista, juego de lo que haga falta.', true, now() - interval '7 hours'),
  ('7a660000-0000-4000-8000-000000000014', pg_temp.pid('thiagocorrea'), 'BUSCA_PARTIDO', 'DEFENSOR',
   'Disponible para partidos sueltos de lunes a jueves. Defensor rápido.', true, now() - interval '2 days'),
  ('7a660000-0000-4000-8000-000000000015', pg_temp.pid('ramiquiroga'), 'BUSCA_EQUIPO', 'ARQUERO',
   'Arquero zurdo, ataja todo lo que le tiren. Busco equipo para rankear.', true, now() - interval '5 days');

-- Postulaciones al aviso de Dorrego (para aceptar/rechazar en cámara).
insert into public.market_team_post_applications (post_id, profile_id, status, created_at) values
  ('7a660000-0000-4000-8000-000000000001', pg_temp.pid('brunososa'),   'PENDIENTE', now() - interval '20 hours'),
  ('7a660000-0000-4000-8000-000000000001', pg_temp.pid('ramiquiroga'), 'PENDIENTE', now() - interval '9 hours'),
  ('7a660000-0000-4000-8000-000000000001', pg_temp.pid('crisojeda'),   'PENDIENTE', now() - interval '3 hours');

-- Equipos que se postularon al aviso de Julián (el agente libre).
insert into public.market_player_post_applications (post_id, team_id, applicant_profile_id, status, created_at) values
  ('7a660000-0000-4000-8000-000000000011', pg_temp.tid(7),
   (select m.profile_id from team_members m where m.team_id = pg_temp.tid(7) and m.role = 'CAPITAN'), 'PENDIENTE', now() - interval '8 hours'),
  ('7a660000-0000-4000-8000-000000000011', pg_temp.tid(10),
   (select m.profile_id from team_members m where m.team_id = pg_temp.tid(10) and m.role = 'CAPITAN'), 'PENDIENTE', now() - interval '2 hours');

-- ------------------------------------------------------------
-- 12. CHATS
-- ------------------------------------------------------------
insert into public.conversations (id, type, player_id, team_id, created_at) values
  ('7a770000-0000-4000-8000-000000000001', 'MARKET_DM', pg_temp.pid('brunososa'), pg_temp.tid(1), now() - interval '19 hours'),
  ('7a770000-0000-4000-8000-000000000002', 'MARKET_DM', pg_temp.pid('juliacosta'), pg_temp.tid(7), now() - interval '7 hours');

insert into public.messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at) values
  ('7a770000-0000-4000-8000-000000000001', pg_temp.pid('brunososa'), null,
   'Buenas! Vi que buscan arquero. Atajé dos años en Juventud de Núñez, los jueves puedo siempre.', true, now() - interval '19 hours'),
  ('7a770000-0000-4000-8000-000000000001', pg_temp.pid('tomiferreyra'), pg_temp.tid(1),
   'Hola Bruno! Sí, seguimos buscando. Jugamos a las 21 en Los Amigos, Dorrego y Cabrera.', true, now() - interval '18 hours'),
  ('7a770000-0000-4000-8000-000000000001', pg_temp.pid('brunososa'), null,
   'Perfecto, me queda a 10 cuadras. Si quieren vengo este jueves a probar.', false, now() - interval '40 minutes'),
  ('7a770000-0000-4000-8000-000000000002', (select m.profile_id from team_members m where m.team_id = pg_temp.tid(7) and m.role = 'CAPITAN'), pg_temp.tid(7),
   'Julián, ¿cómo va? Nos postulamos a tu aviso. Nos falta un 9 para el ranking.', true, now() - interval '7 hours'),
  ('7a770000-0000-4000-8000-000000000002', pg_temp.pid('juliacosta'), null,
   '¡Buenísimo! ¿Qué días juegan?', true, now() - interval '6 hours'),
  ('7a770000-0000-4000-8000-000000000002', (select m.profile_id from team_members m where m.team_id = pg_temp.tid(7) and m.role = 'CAPITAN'), pg_temp.tid(7),
   'Lunes a las 22 en Copa Norte. Si te sirve, aceptá la postulación y te sumamos.', false, now() - interval '30 minutes');

insert into public.conversation_reads (profile_id, conversation_id, last_read_at) values
  (pg_temp.pid('tomiferreyra'), '7a770000-0000-4000-8000-000000000001', now() - interval '17 hours'),
  (pg_temp.pid('juliacosta'),   '7a770000-0000-4000-8000-000000000002', now() - interval '5 hours');

-- Chat del partido de hoy (sólo capitanes, subcapitanes y DT escriben).
insert into public.messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at)
select (select id from ids where k = 'hoy_chat'), m.sender, m.team, m.content, m.rd, now() - (m.mins || ' minutes')::interval
  from (values
    (pg_temp.pid('sebapaz'),      pg_temp.tid(2), 'Confirmado entonces, hoy en Los Amigos. Llevamos pelota.', true, 1380),
    (pg_temp.pid('tomiferreyra'), pg_temp.tid(1), 'Dale, ahí estamos. Pecheras tenemos nosotros.', true, 1370),
    (pg_temp.pid('sebapaz'),      pg_temp.tid(2), 'La seña ya está pagada, son 10 lucas. El resto lo dividimos en la cancha.', true, 300),
    (pg_temp.pid('lucasbenitez'), pg_temp.tid(1), 'Joya. ¿Árbitro ponemos o lo jugamos sin?', true, 290),
    (pg_temp.pid('sebapaz'),      pg_temp.tid(2), 'Sin árbitro como siempre. Ya estamos en la cancha, hagan el check-in cuando lleguen.', false, 12)
  ) m(sender, team, content, rd, mins);

-- Chat de la propuesta pendiente (Juventud Belgrano) y del partido en disputa.
insert into public.messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at)
select (select id from ids where k = 'propuesta_chat'), (select m.profile_id from team_members m where m.team_id = pg_temp.tid(6) and m.role = 'CAPITAN'),
       pg_temp.tid(6), 'Les mandé propuesta para el sábado a las 20 en Fútbol & Paddle. Si no les sirve, contrapropongan.', false,
       now() - interval '4 hours';

insert into public.messages (conversation_id, sender_profile_id, sender_team_id, content, is_read, created_at)
select c.id, x.sender, x.team, x.content, true, now() - (x.mins || ' minutes')::interval
  from public.conversations c,
       (values (pg_temp.pid('tomiferreyra'), pg_temp.tid(1), 'Che, fue 4 a 3. El último gol entró, la vio toda la cancha.', 900),
               ((select m.profile_id from team_members m where m.team_id = pg_temp.tid(3) and m.role = 'CAPITAN'), pg_temp.tid(3),
                'Para nosotros la pelota no entró. Que voten los que jugaron.', 880)) x(sender, team, content, mins)
 where c.match_id = (select id from ids where k = 'disputa');

-- ------------------------------------------------------------
-- 13. BANDEJA DE NOTIFICACIONES
-- ------------------------------------------------------------
-- Las automáticas ya están (confirmados, disputa, avisos de mercado y el
-- premio del embajador). Se agregan las que en la app inserta el cliente,
-- con el mismo formato.
insert into public.notifications (profile_id, type, title, body, data, is_read, created_at)
select m.profile_id, n.type::notification_type, n.title, n.body, n.data, n.rd, now() - (n.mins || ' minutes')::interval
  from public.team_members m
  cross join (values
    ('DESAFIO_RECIBIDO', '⚔️ Nuevo desafío recibido', 'Recibiste un desafío de ranking. ¡Aceptalo desde la pestaña de Ranking!',
       jsonb_build_object('challengeId', (select id from ids where k = 'desafio_nunez'), 'fromTeamId', pg_temp.tid(5), 'matchType', 'RANKING'), false, 180),
    ('DESAFIO_RECIBIDO', '⚔️ Nuevo desafío recibido', 'Recibiste un desafío amistoso. ¡Aceptalo desde la pestaña de Ranking!',
       jsonb_build_object('challengeId', (select id from ids where k = 'desafio_flores'), 'fromTeamId', pg_temp.tid(8), 'matchType', 'AMISTOSO'), false, 50),
    ('SOLICITUD_UNION_EQUIPO', 'Nueva solicitud de union', 'Thiago Correa envio una solicitud para unirse a Deportivo Dorrego.',
       jsonb_build_object('team_id', pg_temp.tid(1), 'team_name', 'Deportivo Dorrego', 'requester_profile_id', pg_temp.pid('thiagocorrea')), false, 300),
    ('SOLICITUD_UNION_EQUIPO', 'Nueva solicitud de union', 'Matías Luna envio una solicitud para unirse a Deportivo Dorrego.',
       jsonb_build_object('team_id', pg_temp.tid(1), 'team_name', 'Deportivo Dorrego', 'requester_profile_id', pg_temp.pid('matiluna')), false, 120),
    ('POSTULACION_RECIBIDA', '📩 Nueva postulación', 'Bruno Sosa se postuló a tu aviso de arquero.',
       jsonb_build_object('post_id', '7a660000-0000-4000-8000-000000000001'), true, 1200),
    ('POSTULACION_RECIBIDA', '📩 Nueva postulación', 'Ramiro Quiroga se postuló a tu aviso de arquero.',
       jsonb_build_object('post_id', '7a660000-0000-4000-8000-000000000001'), false, 540),
    ('POSTULACION_RECIBIDA', '📩 Nueva postulación', 'Cristian Ojeda se postuló a tu aviso de arquero.',
       jsonb_build_object('post_id', '7a660000-0000-4000-8000-000000000001'), false, 180),
    ('CANCELACION_SOLICITADA', '⚠️ Solicitud de cancelación', 'El equipo rival solicitó cancelar el partido. Revisá los detalles y respondé.',
       jsonb_build_object('matchId', (select id from ids where k = 'cancelacion'), 'match_id', (select id from ids where k = 'cancelacion')), false, 75),
    ('PARTIDO_FINALIZADO', 'Partido finalizado', 'Se cargó el resultado. Mirá las estadísticas del partido.',
       jsonb_build_object('match_id', (select id from public.matches where unique_code = 'DOR4R3')), true, 4200),
    ('TEMPORADA_INICIADA', '🏆 Arrancó el Clausura 2026', 'Los contadores de la temporada arrancan de cero. ¡A sumar en el ranking!',
       '{}'::jsonb, true, 120000)
  ) n(type, title, body, data, rd, mins)
 where m.team_id = pg_temp.tid(1) and m.role in ('CAPITAN','SUBCAPITAN');

-- Para Julián: los dos equipos que se postularon a su aviso.
insert into public.notifications (profile_id, type, title, body, data, is_read, created_at) values
  (pg_temp.pid('juliacosta'), 'POSTULACION_RECIBIDA', '📩 Un equipo se postuló', 'Colegiales FC se postuló a tu aviso de delantero.',
   jsonb_build_object('post_id', '7a660000-0000-4000-8000-000000000011'), false, now() - interval '8 hours'),
  (pg_temp.pid('juliacosta'), 'POSTULACION_RECIBIDA', '📩 Un equipo se postuló', 'Recoleta Athletic se postuló a tu aviso de delantero.',
   jsonb_build_object('post_id', '7a660000-0000-4000-8000-000000000011'), false, now() - interval '2 hours');

-- Recordatorio del partido de hoy para todo el plantel de Dorrego.
insert into public.notifications (profile_id, type, title, body, data, is_read, created_at)
select m.profile_id, 'RECORDATORIO_PARTIDO_24H', '⏰ Hoy jugás', 'Hoy juegan contra Atlético Villa Crespo en Los Amigos Fútbol 5 Palermo. No te olvides del check-in.',
       jsonb_build_object('match_id', (select id from ids where k = 'hoy')), false, now() - interval '3 hours'
  from public.team_members m where m.team_id = pg_temp.tid(1);

-- Los avisos automáticos nacieron todos «ahora»: se les pone la hora en que
-- habría pasado cada cosa (si no, la bandeja arranca con cinco avisos iguales).
update public.notifications n
   set created_at = m.created_at, is_read = m.is_read
  from public.messages m
 where n.type = 'MENSAJE_NUEVO'
   and n.body = case when length(m.content) > 80 then left(m.content, 77) || '...' else m.content end;
update public.notifications set created_at = now() - interval '23 hours', is_read = true
 where type = 'PARTIDO_CONFIRMADO' and data ->> 'match_id' = (select id::text from ids where k = 'hoy');
update public.notifications set created_at = now() - interval '20 hours', is_read = true
 where type = 'PARTIDO_CONFIRMADO' and data ->> 'match_id' = (select id::text from ids where k = 'cancelacion');
update public.notifications set created_at = now() - interval '14 hours'
 where type = 'RESULTADO_EN_DISPUTA';
update public.notifications set created_at = now() - interval '3 hours'
 where type = 'ANUNCIO' and data ->> 'kind' = 'ambassador_reward';

update public.challenges set created_at = now() - interval '2 days', updated_at = now() - interval '30 hours'
 where status = 'ACEPTADA' and from_team_id = pg_temp.tid(6);
update public.challenges set created_at = now() - interval '28 hours', updated_at = now() - interval '27 hours'
 where status = 'ACEPTADA' and from_team_id = pg_temp.tid(9);
update public.match_proposals set created_at = now() - interval '4 hours'
 where match_id = (select id from ids where k = 'propuesta');
update public.match_proposals set created_at = now() - interval '24 hours'
 where match_id in (select id from ids where k in ('hoy', 'cancelacion'));
update public.cancellation_requests set created_at = now() - interval '75 minutes'
 where match_id = (select id from ids where k = 'cancelacion');

-- Los avisos que generó el seed no tienen que salir como push.
update public.notifications set pushed_at = coalesce(pushed_at, created_at);

commit;

-- ------------------------------------------------------------
-- 14. RESUMEN
-- ------------------------------------------------------------
select 'cuentas' as que, count(*)::text as valor from auth.users
union all select 'equipos', count(*)::text from public.teams
union all select 'partidos finalizados', count(*)::text from public.matches where status = 'FINALIZADO'
union all select 'partido de hoy', status || ' · ' || to_char(scheduled_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ' ART · código ' || unique_code
  from public.matches where unique_code = 'VCD721'
union all select 'ambassador overview $', (select sum(amount)::text from public.ambassador_rewards where status <> 'RECHAZADO');

select row_number() over (order by tr.elo_score desc) as pos, t.name, tr.elo_score, tr.matches_played as pj,
       tr.wins as g, tr.draws as e, tr.losses as p
  from public.team_rankings tr join public.teams t on t.id = tr.team_id
 where tr.format = 'FUTBOL_5' and t.category = 'HOMBRES'
 order by tr.elo_score desc;
