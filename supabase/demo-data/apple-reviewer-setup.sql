-- ============================================================
-- CUENTA DE DEMO PARA EL REVISOR DE APPLE — SETUP
-- ------------------------------------------------------------
-- Se corre UNA vez contra producción, pegado en el SQL Editor del dashboard
-- de Supabase (o con `psql "$PROD_DB_URL" -f este-archivo.sql`).
--
-- Deja al usuario `revisor@tornear.com` con:
--   · Un equipo propio ("Apple FC") en La Tablada, con él como CAPITAN.
--   · Un rival ("Los Pibes del Barrio") con su propio capitán inventado.
--   · Un partido de RANKING CONFIRMADO con fecha futura  → "Próximos partidos".
--   · Un partido AMISTOSO ya jugado y resuelto 3-1        → historial y stats.
--
-- ── Lo que este script NO toca ──────────────────────────────────────────────
-- La fila de `auth.users` y la de `public.profiles` del revisor ya existen y se
-- gestionan aparte. Acá sólo se VERIFICAN (el script aborta con un mensaje
-- claro si falta alguna). El único usuario de auth que se crea es el capitán
-- inventado del equipo rival, porque `profiles.auth_user_id` es NOT NULL con FK
-- a `auth.users` y sin él el rival no puede tener plantel.
--
-- ── Por qué "CONFIRMADO con fecha futura" y no "PENDIENTE" ──────────────────
-- El enum `match_status` sí tiene un valor `PENDIENTE`, pero en el dominio de
-- torneAR significa otra cosa: es el estado en el que `accept_challenge` deja
-- al partido recién creado, cuando todavía no se acordó fecha, cancha ni
-- formato (`scheduled_at` en NULL). Un partido que el usuario ve en "Próximos
-- partidos" con su cuenta regresiva es un CONFIRMADO con `scheduled_at` a
-- futuro, que es lo que arma este script.
--
-- ── Idempotente ─────────────────────────────────────────────────────────────
-- Todos los IDs son fijos y los INSERT llevan ON CONFLICT DO NOTHING: volver a
-- correrlo no duplica nada ni vuelve a sumar estadísticas. Para empezar de
-- cero, correr antes `apple-reviewer-teardown.sql`.
-- ============================================================

begin;

-- pgcrypto (crypt/gen_salt) vive en el schema `extensions` en Supabase, y hay
-- que ver `auth` para poder escribir en auth.users. Mismo preámbulo que usa
-- supabase/seed.sql, por el mismo motivo: sin esto falla en el SQL Editor.
set local search_path = public, extensions, auth;

do $$
declare
  -- ── Identidades que YA existen (no se crean acá) ──────────────────────────
  k_reviewer_auth_id  constant uuid := '4bba271e-18f6-43d5-8011-4f664cadeb78';
  k_reviewer_profile  constant uuid := '47e89302-bd97-4d17-b4be-0a24a000f6f5';

  -- ── IDs fijos de todo lo que crea este script ────────────────────────────
  -- Fijos y no gen_random_uuid() a propósito: el teardown los referencia
  -- exactamente, sin depender de buscar por nombre.
  k_team_apple        constant uuid := 'a99a0000-0000-4000-8000-000000000001';
  k_team_rival        constant uuid := 'a99a0000-0000-4000-8000-000000000002';
  k_rival_auth_id     constant uuid := 'a99a0000-0000-4000-8000-000000000010';
  k_rival_profile     constant uuid := 'a99a0000-0000-4000-8000-000000000011';
  k_match_upcoming    constant uuid := 'a99a0000-0000-4000-8000-000000000021';
  k_match_played      constant uuid := 'a99a0000-0000-4000-8000-000000000022';

  k_zone              constant text := 'La Tablada';
  k_format            constant team_format := 'FUTBOL_5';

  v_season_id         uuid;
  v_venue_id          uuid;
  v_exists            boolean;
begin
  -- ══════════════════════════════════════════════════════════════════════════
  -- 0. VERIFICACIONES PREVIAS
  -- ══════════════════════════════════════════════════════════════════════════
  select exists (select 1 from auth.users where id = k_reviewer_auth_id) into v_exists;
  if not v_exists then
    raise exception 'No existe auth.users %. Creá la cuenta revisor@tornear.com antes de correr este script.', k_reviewer_auth_id;
  end if;

  select exists (
    select 1 from public.profiles
    where id = k_reviewer_profile and auth_user_id = k_reviewer_auth_id
  ) into v_exists;
  if not v_exists then
    raise exception 'No existe el profile % enganchado al auth user %. Revisá los datos del revisor.',
      k_reviewer_profile, k_reviewer_auth_id;
  end if;

  -- `teams.zone` y `profiles.zone` guardan el NOMBRE en texto plano, así que la
  -- zona tiene que existir tal cual en el catálogo o el equipo queda fuera de
  -- todos los filtros por zona.
  select exists (select 1 from public.zones where name = k_zone and is_active) into v_exists;
  if not v_exists then
    raise exception 'La zona "%" no existe (o está inactiva) en public.zones.', k_zone;
  end if;

  select id into v_season_id from public.seasons where is_active order by starts_at desc limit 1;
  if v_season_id is null then
    raise notice '[demo] No hay temporada activa: los partidos quedan sin season_id.';
  end if;

  -- Cancha del catálogo. `trg_matches_ranking_requires_venue` la exige para
  -- pasar un RANKING a CONFIRMADO, y sin ella el check-in con geofence no tiene
  -- contra qué medir. Se resuelve por nombre para no clavar un UUID de venues.
  select v.id into v_venue_id
  from public.venues v
  join public.zones z on z.id = v.zone_id
  where z.name = k_zone and v.name = 'Club A.y D. Almafuerte Tablada'
  limit 1;

  if v_venue_id is null then
    select v.id into v_venue_id
    from public.venues v
    join public.zones z on z.id = v.zone_id
    where z.name = k_zone
    order by v.name
    limit 1;
  end if;

  if v_venue_id is null then
    raise exception 'No hay ninguna cancha cargada en la zona "%": un partido de ranking no puede confirmarse sin venue.', k_zone;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. CAPITÁN INVENTADO DEL EQUIPO RIVAL
  -- ══════════════════════════════════════════════════════════════════════════
  -- Cuenta de relleno: nadie inicia sesión con ella. Existe sólo para que el
  -- rival tenga plantel (las pantallas de detalle de partido y de gestión leen
  -- `team_members`) y para poder firmar el resultado del rival, que necesita un
  -- `submitted_by` real.
  --
  -- El par auth.users + auth.identities es el mismo patrón que usa
  -- supabase/seed.sql: sin la identity el proveedor `email` no queda registrado
  -- y GoTrue se comporta distinto entre versiones.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', k_rival_auth_id,
    'authenticated', 'authenticated', 'demo.rival@tornear.com',
    crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Rodrigo Pereyra"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), k_rival_auth_id::text, k_rival_auth_id,
    jsonb_build_object(
      'sub', k_rival_auth_id::text,
      'email', 'demo.rival@tornear.com',
      'email_verified', true,
      'phone_verified', false
    ),
    'email', now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  insert into public.profiles (
    id, auth_user_id, username, full_name, zone, preferred_position,
    date_of_birth, gender, strong_foot
  ) values (
    k_rival_profile, k_rival_auth_id, 'demo_rival_capitan', 'Rodrigo Pereyra',
    k_zone, 'MEDIOCAMPISTA', '1996-04-12', 'M', 'RIGHT'
  )
  on conflict (id) do nothing;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. EQUIPOS
  -- ══════════════════════════════════════════════════════════════════════════
  -- `elo_rating` arranca en el default (1000) y las stats de temporada en 0: el
  -- partido jugado del bloque 5 las mueve solo, vía apply_match_outcome. Sembrar
  -- números a mano acá los dejaría peleados con el historial de partidos.
  insert into public.teams (id, name, category, zone, preferred_format, invite_code)
  values
    (k_team_apple, 'Apple FC',              'HOMBRES', k_zone, k_format, 'APPLEFC1'),
    (k_team_rival, 'Los Pibes del Barrio',  'HOMBRES', k_zone, k_format, 'PIBES001')
  on conflict (id) do nothing;

  insert into public.team_members (team_id, profile_id, role, joined_at)
  values
    (k_team_apple, k_reviewer_profile, 'CAPITAN', now() - interval '40 days'),
    (k_team_rival, k_rival_profile,    'CAPITAN', now() - interval '40 days')
  on conflict (team_id, profile_id) do nothing;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. PARTIDO 1 — PRÓXIMO (RANKING, CONFIRMADO, dentro de 5 días)
  -- ══════════════════════════════════════════════════════════════════════════
  -- `format` es obligatorio para entrar en CONFIRMADO (trg_matches_format_required)
  -- y `venue_id` lo es para un RANKING (assert_ranking_match_has_venue).
  insert into public.matches (
    id, team_a_id, team_b_id, season_id, status, match_type, format,
    scheduled_at, duration_minutes, venue_id, signal_amount, total_cost
  ) values (
    k_match_upcoming, k_team_apple, k_team_rival, v_season_id,
    'CONFIRMADO', 'RANKING', k_format,
    date_trunc('hour', now()) + interval '5 days' + interval '20 hours',
    60, v_venue_id, 5000, 20000
  )
  on conflict (id) do nothing;

  -- El chat del partido lo crea `accept_challenge` en el flujo real; acá se
  -- inserta a mano porque el partido no nació de un desafío.
  insert into public.conversations (type, match_id)
  select 'MATCH_CHAT', k_match_upcoming
  where not exists (
    select 1 from public.conversations where match_id = k_match_upcoming
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. PARTIDO 2 — JUGADO (AMISTOSO, hace 12 días)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Se inserta CONFIRMADO, no FINALIZADO: el estado terminal lo pone el motor
  -- real (`resolve_match`, disparado por el trigger `match_result_submitted` del
  -- bloque 5) cuando los dos resultados cruzan. Forzar FINALIZADO a mano dejaría
  -- las stats de los equipos sin actualizar, porque `apply_match_outcome` cuelga
  -- del UPDATE de estado.
  --
  -- AMISTOSO y no RANKING a propósito: un RANKING jugado hace 12 días activaría
  -- el cooldown de 30 días de `send_challenge` contra este mismo rival. Las
  -- estadísticas de temporada (partidos, goles, victorias) las suma igual —
  -- lo único exclusivo de RANKING es el ELO.
  insert into public.matches (
    id, team_a_id, team_b_id, season_id, status, match_type, format,
    scheduled_at, duration_minutes, venue_id,
    checkin_team_a_at, checkin_team_b_at, started_at
  ) values (
    k_match_played, k_team_apple, k_team_rival, v_season_id,
    'CONFIRMADO', 'AMISTOSO', k_format,
    now() - interval '12 days',
    60, v_venue_id,
    now() - interval '12 days' - interval '15 minutes',
    now() - interval '12 days' - interval '10 minutes',
    now() - interval '12 days'
  )
  on conflict (id) do nothing;

  insert into public.conversations (type, match_id)
  select 'MATCH_CHAT', k_match_played
  where not exists (
    select 1 from public.conversations where match_id = k_match_played
  );

  -- Planteles presentados. Alimentan la pantalla de estadísticas del jugador
  -- (`match_participants` es de donde sale "partidos jugados").
  insert into public.match_participants (
    match_id, profile_id, team_id, did_checkin, checkin_at, is_result_loader, lineup_role
  ) values
    (k_match_played, k_reviewer_profile, k_team_apple, true,
     now() - interval '12 days' - interval '15 minutes', true, 'TITULAR'),
    (k_match_played, k_rival_profile, k_team_rival, true,
     now() - interval '12 days' - interval '10 minutes', true, 'TITULAR')
  on conflict do nothing;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. RESULTADO DEL PARTIDO 2 — Apple FC 3 · 1 Los Pibes del Barrio
  -- ══════════════════════════════════════════════════════════════════════════
  -- Los dos resultados tienen que ser espejo (goals_scored de uno == goals_against
  -- del otro) o `resolve_match` manda el partido a EN_DISPUTA en vez de
  -- FINALIZADO.
  --
  -- `scorers` respeta la forma que proyecta `sync_match_goals_from_result`:
  -- [{ "profile_id": uuid, "goals": int > 0 }]
  if not exists (
    select 1 from public.match_results
    where match_id = k_match_played and team_id = k_team_apple
  ) then
    insert into public.match_results (
      match_id, team_id, submitted_by, goals_scored, goals_against,
      scorers, mvp_id, status, submitted_at
    ) values (
      k_match_played, k_team_apple, k_reviewer_profile, 3, 1,
      jsonb_build_array(jsonb_build_object('profile_id', k_reviewer_profile, 'goals', 2)),
      k_reviewer_profile, 'CARGADO', now() - interval '12 days' + interval '1 hour'
    );
  end if;

  -- Este INSERT es el que completa el par y dispara la resolución: el trigger
  -- `match_result_submitted` llama a resolve_match(), que pasa el partido a
  -- FINALIZADO, y el trigger `resolve_match` de `matches` aplica stats vía
  -- apply_match_outcome.
  if not exists (
    select 1 from public.match_results
    where match_id = k_match_played and team_id = k_team_rival
  ) then
    insert into public.match_results (
      match_id, team_id, submitted_by, goals_scored, goals_against,
      scorers, mvp_id, status, submitted_at
    ) values (
      k_match_played, k_team_rival, k_rival_profile, 1, 3,
      jsonb_build_array(jsonb_build_object('profile_id', k_rival_profile, 'goals', 1)),
      k_rival_profile, 'CARGADO', now() - interval '12 days' + interval '70 minutes'
    );
  end if;

  raise notice '[demo] Listo. Equipos: % (Apple FC) / % (rival). Partidos: % (próximo) / % (jugado). Cancha: %.',
    k_team_apple, k_team_rival, k_match_upcoming, k_match_played, v_venue_id;
end;
$$;

commit;


-- ============================================================
-- VERIFICACIÓN (opcional — correr después del COMMIT)
-- ============================================================
-- El partido jugado tiene que aparecer como FINALIZADO y Apple FC con
-- 1 partido jugado, 1 ganado y 3 goles a favor.
--
--   select m.id, m.status, m.match_type, m.scheduled_at
--     from public.matches m
--    where m.id in ('a99a0000-0000-4000-8000-000000000021',
--                   'a99a0000-0000-4000-8000-000000000022');
--
--   select name, matches_played, season_wins, season_losses,
--          season_goals_for, season_goals_against, elo_rating
--     from public.teams
--    where id in ('a99a0000-0000-4000-8000-000000000001',
--                 'a99a0000-0000-4000-8000-000000000002');
--
--   select * from public.match_goals
--    where match_id = 'a99a0000-0000-4000-8000-000000000022';
