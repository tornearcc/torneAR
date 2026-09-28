-- ============================================================
-- 520-sweep-orphan-shields — barrido de huérfanos de shields (pgTAP)
-- ============================================================
-- Cubre 20260928220000 (P2-10). Objetos de storage insertados a mano, con
-- fechas controladas, en la carpeta de Leones (L) y en la de un equipo
-- disuelto (D, sin fila en teams):
--   L/shield-1.jpg  es el escudo actual de Leones, 48 h        → NO
--   D/shield-2.jpg  lo usa season_standings, 48 h             → NO
--   D/shield-3.jpg  lo usa team_stints, 48 h                  → NO
--   D/shield-4.jpg  no lo usa nadie, 48 h (equipo disuelto)   → candidato
--   L/shield-5.jpg  no lo usa nadie, 48 h (escudo reemplazado)→ candidato
--   D/shield-6.jpg  no lo usa nadie, 1 h (margen de 24 h)     → NO
--
--   S-1      El dry-run lista exactamente los candidatos.
--   S-2      El dry-run no encola ni registra nada.
--   S-3      El umbral sale de app_settings.
--   S-4..S-6 La corrida real encola el DELETE de los candidatos (y de nada
--            más) y registra shield.orphan_sweep con los números.
--   S-7      Sin secreto no encola nada y deja el aviso.
--   S-8      anon y authenticated no pueden ejecutarla.
-- Todo en BEGIN…ROLLBACK.
-- ============================================================

begin;
select plan(9);

insert into storage.buckets (id, name, public) values ('shields', 'shields', true) on conflict (id) do nothing;

update teams set shield_url = '22222222-2222-2222-2222-222222222221/shield-1.jpg'
where id = '22222222-2222-2222-2222-222222222221';

insert into season_standings (season_id, team_id, team_name, zone, category, preferred_format,
  in_ranking, is_active, elo_rating, fair_play_score, wins, draws, losses, goals_for, goals_against, points,
  shield_url)
values ((select id from seasons where is_active = true limit 1), 'd1d1d1d1-0000-0000-0000-000000000001',
  'Disuelto', 'Palermo', 'HOMBRES', 'FUTBOL_5', true, false, 1000, 100, 0, 0, 0, 0, 0, 0,
  'd1d1d1d1-0000-0000-0000-000000000001/shield-2.jpg');

insert into team_stints (profile_id, team_id, team_name, shield_url, started_at, ended_at)
values ('33333333-3333-3333-3333-000000000001', 'd1d1d1d1-0000-0000-0000-000000000001', 'Disuelto',
  'd1d1d1d1-0000-0000-0000-000000000001/shield-3.jpg', now() - interval '60 days', now() - interval '30 days');

insert into storage.objects (bucket_id, name, created_at, metadata) values
  ('shields', '22222222-2222-2222-2222-222222222221/shield-1.jpg', now() - interval '48 hours', '{"size": 1000}'),
  ('shields', 'd1d1d1d1-0000-0000-0000-000000000001/shield-2.jpg', now() - interval '48 hours', '{"size": 1000}'),
  ('shields', 'd1d1d1d1-0000-0000-0000-000000000001/shield-3.jpg', now() - interval '48 hours', '{"size": 1000}'),
  ('shields', 'd1d1d1d1-0000-0000-0000-000000000001/shield-4.jpg', now() - interval '48 hours', '{"size": 1000}'),
  ('shields', '22222222-2222-2222-2222-222222222221/shield-5.jpg', now() - interval '48 hours', '{"size": 500}'),
  ('shields', 'd1d1d1d1-0000-0000-0000-000000000001/shield-6.jpg', now() - interval '1 hour',   '{"size": 1000}');

create temp view s_mine as
  select objeto from sweep_orphan_shields(true)
  where objeto like '22222222-2222-2222-2222-222222222221/%'
     or objeto like 'd1d1d1d1-0000-0000-0000-000000000001/%';

-- ── Dry-run ─────────────────────────────────────────────────────────────────
select results_eq(
  $$ select objeto from s_mine order by 1 $$,
  $$ values ('22222222-2222-2222-2222-222222222221/shield-5.jpg'),
            ('d1d1d1d1-0000-0000-0000-000000000001/shield-4.jpg') $$,
  'S-1: el dry-run lista el escudo reemplazado y el del equipo disuelto, y respeta equipos, historial y margen');

select is(
  (select count(*)::int from net.http_request_queue where url like '%/storage/v1/object/shields/%')
  + (select count(*)::int from app_logs where message like 'shield.%'),
  0,
  'S-2: el dry-run no encola ni registra nada');

update app_settings set value = 1000 where key = 'sweep_orphan_shields_min_age_hours';
select is(
  (select count(*)::int from s_mine),
  0,
  'S-3: el umbral sale de app_settings');
update app_settings set value = 24 where key = 'sweep_orphan_shields_min_age_hours';

-- ── Sin secreto ─────────────────────────────────────────────────────────────
select count(*) from sweep_orphan_shields();
select ok(
  (select count(*) from net.http_request_queue where url like '%/storage/v1/object/shields/%') = 0
  and exists (select 1 from app_logs where message = 'shield.file_deletion_skipped'),
  'S-7: sin el secreto no encola nada y deja shield.file_deletion_skipped');
delete from app_logs where message like 'shield.%';

-- ── Corrida real, con secreto ───────────────────────────────────────────────
select vault.create_secret('clave-de-prueba', 'storage_service_role_key');
select count(*) from sweep_orphan_shields();

select results_eq(
  $$ select replace(url, public.storage_shields_object_url(), '') from net.http_request_queue
      where method = 'DELETE' and url like '%/storage/v1/object/shields/%'
        and (url like '%22222222-2222-2222-2222-222222222221/%' or url like '%d1d1d1d1-0000-0000-0000-000000000001/%')
      order by 1 $$,
  $$ values ('22222222-2222-2222-2222-222222222221/shield-5.jpg'),
            ('d1d1d1d1-0000-0000-0000-000000000001/shield-4.jpg') $$,
  'S-4: encola el DELETE de los candidatos y de nada más');

select ok(
  (select (details->>'candidatos')::int >= 2 and (details->>'pedidos_de_borrado')::int = (details->>'candidatos')::int
          and (details->>'min_age_hours')::numeric = 24
     from app_logs where message = 'shield.orphan_sweep'),
  'S-5: registra la corrida con candidatos, pedidos y umbral');

select is(
  (select count(*)::int from app_logs where message = 'shield.file_deletion_requested'
    and details->>'scope' = 'sweep_orphan_shields'),
  1,
  'S-6: y el detalle de paths queda en shield.file_deletion_requested');

-- ── Permisos ────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.sweep_orphan_shields(boolean, integer)', 'EXECUTE'),
  'S-8: anon no puede ejecutarla');
select ok(
  not has_function_privilege('authenticated', 'public.sweep_orphan_shields(boolean, integer)', 'EXECUTE'),
  'S-8: authenticated no puede ejecutarla');

select * from finish();
rollback;
