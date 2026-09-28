-- ============================================================
-- 420-review-prompts — Gate del pedido de valoración (pgTAP)
-- ============================================================
-- Cubre la migración *_review_prompts: la tabla `review_prompts`, la RPC
-- `claim_review_prompt` y los umbrales `review_prompt_*` de `app_settings`.
--
-- Lo que importa verificar acá no es "inserta una fila", sino lo contrario: que
-- el gate diga que NO en cada una de las situaciones en que pedir una
-- valoración sería un error. Un falso `true` se paga con el cupo del sistema
-- operativo (Apple concede 3 diálogos por año y no avisa si los gastó) o con
-- una reseña de una persona que acaba de perder un partido por WO.
--
-- Aserciones:
--   S-1..S-6   Estructura: tabla, PK, índice de apoyo, FK a profiles, RLS
--              activo y CERO policies (es lo que niega el acceso directo).
--   G-1..G-4   Permisos: ni anon ni authenticated tienen privilegios sobre la
--              tabla; sólo authenticated puede EJECUTAR la RPC.
--   A-1/A-2    Acceso directo negado de verdad, con el rol `authenticated`
--              puesto: si el cliente pudiera escribir la tabla, le alcanzaría
--              con borrar su fila para volver a pedir.
--   B-1..B-15  Comportamiento del gate: sin sesión, argumentos inválidos,
--              cuenta nueva, camino feliz, uno por versión, cooldown, tope
--              anual, interruptor de apagado y las dos señales negativas.
--
-- Identidades del seed (supabase/seed_testing.sql): perfil
-- 0b000000-…-000000000002 (auth 0a000000-…-000000000002), Capitán Alfa, que
-- juega el partido FINALIZADO 0d000000-…-000000000003 con Alfa
-- (0c000000-…-0000000000a0) como equipo A.
-- ============================================================

begin;
select plan(27);

-- ════════════════════════════════════════════════════════════════════════════
-- S — Estructura
-- ════════════════════════════════════════════════════════════════════════════
select has_table('public', 'review_prompts', 'S-1: existe la tabla review_prompts');

select col_is_pk('public', 'review_prompts', array['id'], 'S-2: review_prompts tiene PK (id)');

select has_index('public', 'review_prompts', 'review_prompts_profile_requested_idx',
  'S-3: índice (profile_id, requested_at desc) — las tres consultas del gate son por perfil y recientes primero');

select fk_ok('public', 'review_prompts', 'profile_id', 'public', 'profiles', 'id',
  'S-4: profile_id referencia profiles(id)');

select is(
  (select relrowsecurity from pg_class where oid = 'public.review_prompts'::regclass),
  true,
  'S-5: RLS habilitado');

-- RLS activo SIN policies niega todo por PostgREST. Que no haya ninguna es la
-- aserción, no un descuido: la tabla se escribe sólo por la RPC.
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'review_prompts'),
  0::bigint,
  'S-6: ninguna policy — el acceso es exclusivamente por claim_review_prompt');

-- ════════════════════════════════════════════════════════════════════════════
-- G — Permisos
-- ════════════════════════════════════════════════════════════════════════════
select table_privs_are('public', 'review_prompts', 'authenticated', array[]::text[],
  'G-1: authenticated no tiene ningún privilegio sobre la tabla');

select table_privs_are('public', 'review_prompts', 'anon', array[]::text[],
  'G-2: anon no tiene ningún privilegio sobre la tabla');

select function_privs_are('public', 'claim_review_prompt', array['text', 'text', 'text'],
  'authenticated', array['EXECUTE'],
  'G-3: authenticated puede ejecutar la RPC');

select function_privs_are('public', 'claim_review_prompt', array['text', 'text', 'text'],
  'anon', array[]::text[],
  'G-4: anon no puede ejecutar la RPC');

-- ════════════════════════════════════════════════════════════════════════════
-- Setup del comportamiento
-- ════════════════════════════════════════════════════════════════════════════
-- El seed crea los perfiles con created_at = now(), y el gate exige una cuenta
-- con días encima. Se envejece a mano el del sujeto de prueba.
update profiles
   set created_at = now() - interval '60 days'
 where id = '0b000000-0000-0000-0000-000000000002';

-- ── B-1. Sin sesión ─────────────────────────────────────────────────────────
-- Como postgres no hay claims, así que current_profile_id() devuelve null.
select is(
  claim_review_prompt('match_shared', 'ios', '1.1.0'),
  false,
  'B-1: sin perfil en la sesión no se pide nada');

-- ── Desde acá, con la sesión del Capitán Alfa ───────────────────────────────
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

-- ── B-2..B-4. Argumentos inválidos ──────────────────────────────────────────
-- Estos SÍ son excepción y no `false`: un disparador que no existe es un error
-- de programación del cliente, no una situación normal del usuario.
select throws_matching(
  $$ select claim_review_prompt('me_gusta_la_app', 'ios', '1.1.0') $$,
  'INVALID_TRIGGER',
  'B-2: un disparador desconocido falla en vez de registrarse');

select throws_matching(
  $$ select claim_review_prompt('match_shared', 'windows', '1.1.0') $$,
  'INVALID_PLATFORM',
  'B-3: una plataforma desconocida falla');

select throws_matching(
  $$ select claim_review_prompt('match_shared', 'ios', '   ') $$,
  'INVALID_APP_VERSION',
  'B-4: sin versión de app no se puede aplicar el tope por versión');

-- ── B-5. Cuenta nueva ───────────────────────────────────────────────────────
select tests.clear_auth();
update profiles set created_at = now() where id = '0b000000-0000-0000-0000-000000000002';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

select is(
  claim_review_prompt('match_shared', 'ios', '1.1.0'),
  false,
  'B-5: una cuenta de hoy todavía no vivió nada que valga una reseña');

select tests.clear_auth();
update profiles set created_at = now() - interval '60 days' where id = '0b000000-0000-0000-0000-000000000002';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

-- ── B-6..B-8. Camino feliz ──────────────────────────────────────────────────
select is(
  claim_review_prompt('match_shared', 'ios', '1.1.0'),
  true,
  'B-6: cuenta con antigüedad, sin pedidos previos ni señales negativas');

-- Verificar el contenido exige volver a postgres: con el rol `authenticated`
-- puesto, leer la tabla es exactamente lo que A-2 prueba que NO se puede.
select tests.clear_auth();

select is(
  (select count(*) from review_prompts where profile_id = '0b000000-0000-0000-0000-000000000002'),
  1::bigint,
  'B-7: el pedido queda registrado en el mismo acto');

select is(
  (select trigger_name || '|' || platform || '|' || app_version
     from review_prompts where profile_id = '0b000000-0000-0000-0000-000000000002'),
  'match_shared|ios|1.1.0',
  'B-8: guarda disparador, plataforma y versión tal como se pidieron');

select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

-- ── A-1/A-2. El cliente no puede tocar la tabla ─────────────────────────────
-- Con el rol `authenticated` puesto (lo hace authenticate_as_profile), no con
-- los claims solamente: si sólo se setearan los claims, seguiríamos corriendo
-- como postgres y las policies se bypasearían, dando un falso verde.
select throws_matching(
  $$ insert into review_prompts (profile_id, trigger_name, platform, app_version)
     values ('0b000000-0000-0000-0000-000000000002', 'match_shared', 'ios', '9.9.9') $$,
  'permission denied',
  'A-1: authenticated no puede insertar a mano');

select throws_matching(
  $$ select 1 from review_prompts $$,
  'permission denied',
  'A-2: authenticated no puede leer la tabla — no puede saber cuándo se le pidió');

-- ── B-9/B-10. Uno por versión, y cooldown ───────────────────────────────────
select is(
  claim_review_prompt('result_confirmed', 'ios', '1.1.0'),
  false,
  'B-9: en la misma versión no se pide dos veces');

select is(
  claim_review_prompt('result_confirmed', 'ios', '1.2.0'),
  false,
  'B-10: una versión nueva no saltea el cooldown');

-- ── B-11. Cooldown vencido ──────────────────────────────────────────────────
select tests.clear_auth();
update review_prompts
   set requested_at = now() - interval '150 days'
 where profile_id = '0b000000-0000-0000-0000-000000000002';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

select is(
  claim_review_prompt('result_confirmed', 'ios', '1.2.0'),
  true,
  'B-11: pasado el cooldown y con una versión nueva, vuelve a corresponder');

-- ── B-12. Tope anual ────────────────────────────────────────────────────────
-- Tres pedidos dentro de los últimos 365 días, todos fuera del cooldown: el
-- que corta es el tope anual, no el cooldown.
select tests.clear_auth();
update review_prompts
   set requested_at = now() - interval '150 days'
 where profile_id = '0b000000-0000-0000-0000-000000000002';
insert into review_prompts (profile_id, trigger_name, platform, app_version, requested_at)
values ('0b000000-0000-0000-0000-000000000002', 'result_confirmed', 'ios', '1.0.9',
        now() - interval '200 days');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

select is(
  claim_review_prompt('match_shared', 'ios', '1.3.0'),
  false,
  'B-12: con 3 pedidos en el último año no se pide un cuarto');

-- ── B-13. Interruptor de apagado ────────────────────────────────────────────
select tests.clear_auth();
delete from review_prompts where profile_id = '0b000000-0000-0000-0000-000000000002';
update app_settings set value = 0 where key = 'review_prompt_enabled';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

select is(
  claim_review_prompt('match_shared', 'ios', '1.3.0'),
  false,
  'B-13: el interruptor apaga el pedido para todos, sin OTA');

-- ── B-14. Partido en disputa ────────────────────────────────────────────────
select tests.clear_auth();
update app_settings set value = 1 where key = 'review_prompt_enabled';
update matches
   set disputed_at = now() - interval '1 day'
 where id = '0d000000-0000-0000-0000-000000000003';
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

select is(
  claim_review_prompt('match_shared', 'ios', '1.3.0'),
  false,
  'B-14: no se le pide una reseña a alguien que viene de un partido en disputa');

-- ── B-15. Denuncia propia reciente ──────────────────────────────────────────
select tests.clear_auth();
update matches set disputed_at = null where id = '0d000000-0000-0000-0000-000000000003';
insert into content_reports (reporter_id, reported_entity_type, reported_entity_id, reason)
values ('0b000000-0000-0000-0000-000000000002', 'USER',
        '0b000000-0000-0000-0000-000000000003', 'Insultos en el chat');
select tests.authenticate_as_profile('0a000000-0000-0000-0000-000000000002');

select is(
  claim_review_prompt('match_shared', 'ios', '1.3.0'),
  false,
  'B-15: denunciar algo es la declaración más explícita de que acá pasó algo malo');

select * from finish();
rollback;
