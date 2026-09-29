-- ============================================================
-- 580-wo-claim-response — el acusado responde un reclamo de WO (pgTAP)
-- ============================================================
-- Cubre 20260929140000 (D-61, P1-1). Leones (…221, capitán auth …0001, con
-- check-in) reclama contra Tigres (…222, capitán auth …0004). El perfil …0007
-- hace de admin sólo dentro de esta transacción.
--
--   R-1..R-2   claim_wo fija el plazo de 24 h y avisa al equipo acusado.
--   R-3        con el acusado en plazo y sin respuesta no se puede aprobar.
--   R-4..R-6   respond_wo_claim: quién responde, texto obligatorio, foto del
--              partido y equipo correctos.
--   R-7..R-10  la respuesta se guarda, avisa al que reclamó y es una sola.
--   R-11       get_pending_wo_claims trae la respuesta y el check-in.
--   R-12       get_match_detail trae la respuesta y el plazo.
--   R-13       con la respuesta, el admin aprueba.
--   R-14..R-15 con el plazo vencido no se responde, y el admin aprueba igual.
--   R-16       rechazar se puede aunque el acusado esté en plazo.
--   R-17       el barrido de evidencias no toca la foto de la respuesta.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(17);

-- ── Setup (postgres) ────────────────────────────────────────────────────────
update profiles set is_admin = true where id = '33333333-3333-3333-3333-000000000007';

insert into matches (id, team_a_id, team_b_id, match_type, status, format, scheduled_at) values
  ('58000000-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222221',
   '22222222-2222-2222-2222-222222222222', 'AMISTOSO', 'CONFIRMADO', 'FUTBOL_5', now() - interval '1 hour'),
  ('58000000-0000-0000-0000-0000000000c2', '22222222-2222-2222-2222-222222222221',
   '22222222-2222-2222-2222-222222222222', 'AMISTOSO', 'CONFIRMADO', 'FUTBOL_5', now() - interval '2 days'),
  ('58000000-0000-0000-0000-0000000000c3', '22222222-2222-2222-2222-222222222221',
   '22222222-2222-2222-2222-222222222222', 'AMISTOSO', 'CONFIRMADO', 'FUTBOL_5', now() - interval '1 hour');
insert into match_participants (match_id, profile_id, team_id, did_checkin) values
  ('58000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-000000000001',
   '22222222-2222-2222-2222-222222222221', true);

-- ── R-1..R-2. El reclamo ────────────────────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
create temp table r_claim on commit drop as
  select public.claim_wo('58000000-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222221',
                         'NO_PRESENTACION', '58000000-0000-0000-0000-0000000000c1/22222222-2222-2222-2222-222222222221_1.jpg') as id;
select tests.clear_auth();

select ok(
  (select response_deadline between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
     from wo_claims where id = (select id from r_claim)),
  'R-1: claim_wo fija un plazo de 24 h para responder');

select is(
  (select count(*)::int from notifications
    where type = 'WO_RECLAMADO' and data->>'claim_id' = (select id from r_claim)::text
      and profile_id in (select profile_id from team_members where team_id = '22222222-2222-2222-2222-222222222222')),
  (select count(*)::int from team_members where team_id = '22222222-2222-2222-2222-222222222222'),
  'R-2: todo el equipo acusado recibe WO_RECLAMADO');

-- ── R-3. No se aprueba con el acusado en plazo ──────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select throws_matching(
  format('select public.resolve_wo_claim(%L, true, null)', (select id from r_claim)),
  '^RESPONSE_PENDING',
  'R-3: con el acusado en plazo y sin respuesta, aprobar se rechaza');
select tests.clear_auth();

-- ── R-4..R-6. Validaciones de la respuesta ──────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000001');
select throws_matching(
  format('select public.respond_wo_claim(%L, %L)', (select id from r_claim), 'Soy el que reclamó'),
  '^NOT_AUTHORIZED',
  'R-4: el equipo que reclamó no puede responder su propio reclamo');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_matching(
  format('select public.respond_wo_claim(%L, %L)', (select id from r_claim), '   '),
  '^RESPONSE_REQUIRED',
  'R-5: la respuesta exige texto');

select throws_matching(
  format('select public.respond_wo_claim(%L, %L, %L)', (select id from r_claim), 'Fuimos',
         '58000000-0000-0000-0000-0000000000c1/22222222-2222-2222-2222-222222222221_9.jpg'),
  '^INVALID_PHOTO_PATH',
  'R-6: la foto tiene que ser del partido y del equipo acusado');

-- ── R-7..R-10. La respuesta ─────────────────────────────────────────────────
select lives_ok(
  format('select public.respond_wo_claim(%L, %L, %L)', (select id from r_claim),
         'Llegamos 20:50 y la cancha estaba ocupada',
         '58000000-0000-0000-0000-0000000000c1/22222222-2222-2222-2222-222222222222_2.jpg'),
  'R-7: el capitán acusado responde con texto y foto');
select tests.clear_auth();

select results_eq(
  format($q$ select response_text, response_photo_url, responded_by, responded_at is not null
               from wo_claims where id = %L $q$, (select id from r_claim)),
  $$ values ('Llegamos 20:50 y la cancha estaba ocupada',
             '58000000-0000-0000-0000-0000000000c1/22222222-2222-2222-2222-222222222222_2.jpg',
             '33333333-3333-3333-3333-000000000004'::uuid, true) $$,
  'R-8: la respuesta queda guardada con quién y cuándo');

select is(
  (select count(*)::int from notifications
    where type = 'WO_RECLAMADO' and title = 'El rival respondió tu reclamo de WO'
      and data->>'claim_id' = (select id from r_claim)::text
      and profile_id in (select profile_id from team_members where team_id = '22222222-2222-2222-2222-222222222221')),
  (select count(*)::int from team_members where team_id = '22222222-2222-2222-2222-222222222221'),
  'R-9: el equipo que reclamó recibe el aviso de la respuesta');

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_matching(
  format('select public.respond_wo_claim(%L, %L)', (select id from r_claim), 'Otra versión'),
  '^ALREADY_RESPONDED',
  'R-10: hay una sola respuesta por reclamo');
select tests.clear_auth();

-- ── R-11..R-12. Lo que ven el admin y la app ────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select results_eq(
  format($q$ select response_text, responded_by_name is not null, claiming_checkins, opponent_checkins
               from public.get_pending_wo_claims() where claim_id = %L $q$, (select id from r_claim)),
  $$ values ('Llegamos 20:50 y la cancha estaba ocupada', true, 1, 0) $$,
  'R-11: la cola del admin trae la respuesta y el check-in de cada equipo');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select results_eq(
  $$ select (d->'wo_claim'->>'response_text'), (d->'wo_claim'->>'response_deadline') is not null
       from (select public.get_match_detail('58000000-0000-0000-0000-0000000000c1',
                                            '22222222-2222-2222-2222-222222222222')::jsonb as d) x $$,
  $$ values ('Llegamos 20:50 y la cancha estaba ocupada', true) $$,
  'R-12: get_match_detail trae la respuesta y el plazo');
select tests.clear_auth();

-- ── R-13. Con la respuesta, se aprueba ──────────────────────────────────────
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select lives_ok(
  format('select public.resolve_wo_claim(%L, true, %L)', (select id from r_claim), 'vistas las dos versiones'),
  'R-13: con la respuesta del acusado, el admin aprueba');
select tests.clear_auth();

-- ── R-14..R-15. Plazo vencido ───────────────────────────────────────────────
insert into wo_claims (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status, response_deadline)
values ('58000000-0000-0000-0000-0000000000d2', '58000000-0000-0000-0000-0000000000c2',
        '33333333-3333-3333-3333-000000000001', '22222222-2222-2222-2222-222222222221',
        'x.jpg', 'NO_PRESENTACION', 'PENDIENTE_REVISION', now() - interval '1 minute');

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000004');
select throws_matching(
  $$ select public.respond_wo_claim('58000000-0000-0000-0000-0000000000d2', 'Tarde') $$,
  '^RESPONSE_WINDOW_CLOSED',
  'R-14: con el plazo vencido ya no se responde');
select tests.clear_auth();

select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select lives_ok(
  $$ select public.resolve_wo_claim('58000000-0000-0000-0000-0000000000d2', true, 'sin respuesta en plazo') $$,
  'R-15: con el plazo vencido y sin respuesta, el admin aprueba con lo que hay');

-- ── R-16. Rechazar con el acusado en plazo ──────────────────────────────────
select tests.clear_auth();
insert into wo_claims (id, match_id, claimed_by, claiming_team_id, photo_url, reason, status, response_deadline)
values ('58000000-0000-0000-0000-0000000000d3', '58000000-0000-0000-0000-0000000000c3',
        '33333333-3333-3333-3333-000000000001', '22222222-2222-2222-2222-222222222221',
        'y.jpg', 'NO_PRESENTACION', 'PENDIENTE_REVISION', now() + interval '10 hours');
select tests.authenticate_as_profile('aaaaaaaa-0000-0000-0000-000000000007');
select lives_ok(
  $$ select public.resolve_wo_claim('58000000-0000-0000-0000-0000000000d3', false, 'evidencia insuficiente') $$,
  'R-16: rechazar se puede aunque el acusado todavía esté en plazo');
select tests.clear_auth();

-- ── R-17. Barrido de evidencias ─────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('wo_evidences', 'wo_evidences', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name, created_at) values
  ('wo_evidences', '58000000-0000-0000-0000-0000000000c1/22222222-2222-2222-2222-222222222222_2.jpg', now() - interval '3 days'),
  ('wo_evidences', '58000000-0000-0000-0000-0000000000c1/huerfana.jpg', now() - interval '3 days');

select results_eq(
  $$ select objeto from public.sweep_orphan_wo_evidences(true)
      where objeto like '58000000-0000-0000-0000-0000000000c1/%' $$,
  $$ values ('58000000-0000-0000-0000-0000000000c1/huerfana.jpg') $$,
  'R-17: el barrido no toca la foto de la respuesta (sí la huérfana)');

select * from finish();
rollback;
