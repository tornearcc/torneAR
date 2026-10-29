-- ============================================================
-- 660-ambassador-bases-v2 — reglas de las bases v2 del programa (pgTAP)
-- ============================================================
-- Cubre 20261029120000_ambassador_bases_v2.sql. Perfiles propios (p1..p40,
-- 0c660000-…), equipos de 5 en F5. Rival común R (p2..p6).
--
--   V-1  un amistoso no paga; el mismo traído cobra después en un partido por
--        ranking (sus amistosos previos no lo descalifican).
--   V-2  un traído con un integrante que ya jugó con otro equipo no paga.
--   V-3  ídem si ese partido lo jugó como invitado del otro equipo.
--   V-4  embajador con las bases v1: no genera premios hasta aceptar la v2;
--        accept_ambassador_terms y terms_outdated en el resumen.
--   V-5  accept_ambassador_terms sin ser embajador.
--   V-6  permisos de las funciones nuevas y versión vigente de las bases.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(19);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
create function pg_temp.p(n int) returns uuid language sql immutable
  as $$ select ('0c660000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.a(n int) returns uuid language sql immutable
  as $$ select ('0b660000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.t(n int) returns uuid language sql immutable
  as $$ select ('0d660000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.m(n int) returns uuid language sql immutable
  as $$ select ('0e660000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', pg_temp.a(g),
       'authenticated', 'authenticated', 'bv2.' || g || '@test.local', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from generate_series(1, 40) g;
insert into public.profiles (id, auth_user_id, username, full_name, zone)
select pg_temp.p(g), pg_temp.a(g), 'bv2_' || g, 'Jugador ' || g, 'Palermo'
  from generate_series(1, 40) g;

-- Equipo de F5 con sus integrantes desde hace 30 días. p_amb = embajador que lo trajo.
create function pg_temp.team(p_team int, p_name text, p_players int[], p_amb int default null)
returns void language plpgsql as $$
begin
  insert into public.teams (id, name, category, zone, preferred_format, created_at, ambassador_profile_id)
  values (pg_temp.t(p_team), p_name, 'HOMBRES', 'Palermo', 'FUTBOL_5', now() - interval '40 days',
          case when p_amb is null then null else pg_temp.p(p_amb) end);
  insert into public.team_members (team_id, profile_id, role, joined_at)
  select pg_temp.t(p_team), pg_temp.p(u.x),
         (case when u.ord = 1 then 'CAPITAN' else 'JUGADOR' end)::team_role, now() - interval '30 days'
    from unnest(p_players) with ordinality as u(x, ord);
end $$;

create function pg_temp.match(p_id int, p_a int, p_b int, p_hours_ago int, p_type match_type default 'RANKING')
returns void language sql as $$
  insert into public.matches (id, team_a_id, team_b_id, status, format, finished_at,
                              checkin_team_a_at, checkin_team_b_at, match_type)
  values (pg_temp.m(p_id), pg_temp.t(p_a), pg_temp.t(p_b), 'FINALIZADO', 'FUTBOL_5',
          now() - make_interval(hours => p_hours_ago),
          now() - make_interval(hours => p_hours_ago + 2),
          now() - make_interval(hours => p_hours_ago + 2), p_type);
$$;

create function pg_temp.rewards(p_team int) returns int language sql as $$
  select count(*)::int from public.ambassador_rewards
   where team_id = pg_temp.t(p_team) and kind = 'TEAM_BROUGHT' and status <> 'RECHAZADO';
$$;

update public.app_settings set value = 1 where key = 'ambassador_program_enabled';
update public.app_settings set value = floor(extract(epoch from now() - interval '15 days'))
 where key = 'ambassador_program_start_epoch';

-- E (p1): embajador con las bases vigentes, sin equipo propio.
insert into public.ambassadors (profile_id, instagram, terms_version)
values (pg_temp.p(1), 'bv2.e', (select value::int from public.app_settings where key = 'ambassador_terms_version'));
select pg_temp.team(1, 'Rival R', array[2, 3, 4, 5, 6]);

-- ── V-1: amistoso no; ranking sí ────────────────────────────────────────────
select pg_temp.team(2, 'Traído T1', array[7, 8, 9, 10, 11], 1);
select pg_temp.match(1, 2, 1, 100, 'AMISTOSO');
select is(public.sweep_ambassador_rewards(), 0, 'V-1: el primer partido de T1 es un amistoso → no paga');
select pg_temp.match(2, 2, 1, 90);
select is(public.sweep_ambassador_rewards(), 1, 'V-1: después juega por ranking → paga');
select is((select match_id from public.ambassador_rewards where team_id = pg_temp.t(2)), pg_temp.m(2),
  'V-1: el premio es del partido por ranking, aunque antes jugó un amistoso');

-- ── V-2: un integrante ya jugó con otro equipo ──────────────────────────────
-- p16 está en O (no traído), que jugó contra R antes del primer partido de T2.
select pg_temp.team(3, 'Otro O', array[17, 18, 19, 20, 16]);
select pg_temp.match(3, 3, 1, 80);
select pg_temp.team(4, 'Traído T2', array[12, 13, 14, 15, 16], 1);
select pg_temp.match(4, 4, 1, 70);
select is(public.sweep_ambassador_rewards(), 0, 'V-2: T2 tiene a p16, que ya jugó con O → no paga');
select is(pg_temp.rewards(4), 0, 'V-2: T2 sin premio');
select ok(public.ambassador_played_with_other_team(pg_temp.p(16), pg_temp.t(4), now()),
  'V-2: p16 jugó con otro equipo');

-- ── V-3: ídem, como invitado ────────────────────────────────────────────────
-- p25 no es integrante de O, pero jugó para O como invitado.
select pg_temp.match(5, 3, 1, 65);
insert into public.match_participants (match_id, profile_id, team_id, is_guest)
values (pg_temp.m(5), pg_temp.p(25), pg_temp.t(3), true);
select pg_temp.team(5, 'Traído T3', array[21, 22, 23, 24, 25], 1);
select pg_temp.match(6, 5, 1, 60);
select is(public.sweep_ambassador_rewards(), 0, 'V-3: T3 tiene a p25, que jugó como invitado de O → no paga');
select is(pg_temp.rewards(5), 0, 'V-3: T3 sin premio');

-- ── V-4: bases v1 sin aceptar la v2 ─────────────────────────────────────────
insert into public.ambassadors (profile_id, instagram, terms_version) values (pg_temp.p(31), 'bv2.f', 1);
select pg_temp.team(6, 'Traído T5', array[32, 33, 34, 35, 36], 31);
select pg_temp.match(7, 6, 1, 50);
select is(public.sweep_ambassador_rewards(), 0, 'V-4: el embajador tiene las bases v1 → no paga');

select tests.authenticate_as_profile(pg_temp.a(31));
select is((public.get_my_ambassador_overview()->>'terms_outdated')::boolean, true,
  'V-4: el resumen avisa que falta aceptar las bases');
select is(public.accept_ambassador_terms(), 'applied', 'V-4: accept_ambassador_terms → applied');
select is(public.accept_ambassador_terms(), 'noop_already_current', 'V-4: aceptar de nuevo → noop_already_current');
select is((public.get_my_ambassador_overview()->>'terms_outdated')::boolean, false,
  'V-4: después de aceptar, terms_outdated = false');
select tests.clear_auth();

select is((select terms_version from public.ambassadors where profile_id = pg_temp.p(31)), 2,
  'V-4: queda guardada la versión 2');
select is(public.sweep_ambassador_rewards(), 1, 'V-4: con la v2 aceptada, el mismo partido ya paga');

-- ── V-5: no embajador ───────────────────────────────────────────────────────
select tests.authenticate_as_profile(pg_temp.a(37));
select is(public.accept_ambassador_terms(), 'noop_not_ambassador', 'V-5: sin ser embajador → noop_not_ambassador');
select tests.clear_auth();

-- ── V-6: permisos y versión ─────────────────────────────────────────────────
select ok(has_function_privilege('authenticated', 'public.accept_ambassador_terms()', 'execute')
          and not has_function_privilege('anon', 'public.accept_ambassador_terms()', 'execute'),
  'V-6: accept_ambassador_terms sólo para authenticated');
select ok(not has_function_privilege('authenticated', 'public.ambassador_played_with_other_team(uuid, uuid, timestamptz)', 'execute')
          and not has_function_privilege('anon', 'public.ambassador_played_with_other_team(uuid, uuid, timestamptz)', 'execute'),
  'V-6: ambassador_played_with_other_team es interna');
select is((select value::int from public.app_settings where key = 'ambassador_terms_version'), 2,
  'V-6: la versión vigente de las bases es la 2');

select * from finish();
rollback;
