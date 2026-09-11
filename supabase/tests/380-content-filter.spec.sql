-- ============================================================
-- 380-content-filter — Filtro de contenido objetable (pgTAP)
-- ============================================================
-- Cubre `public.banned_words`, `normalize_for_filter` y `contains_banned_word`
-- (migración 20260911160000), la precaución de filtrado que exige la guideline
-- 1.2 de la App Store.
--
-- El riesgo de este módulo NO es sólo dejar pasar un insulto: es rechazar texto
-- legítimo. En una app de fútbol argentino, «concha» es un apellido, «pajero»
-- es un modelo de camioneta y «negro» es un apodo corriente y un color de
-- camiseta. Un filtro que los bloquea rompe el uso normal todos los días, y eso
-- no se nota en una demo. Por eso las aserciones negativas son la mitad del
-- archivo y no un agregado.
--
-- Aserciones:
--   A-1      La lista no es legible por `authenticated` — sería el índice de
--            qué escribir para evadir el filtro.
--   A-2      El CHECK rechaza entradas con metacaracteres: una entrada así se
--            interpola en el regex y rompe el filtro entero.
--   A-3      Normaliza acentos y mayúsculas.
--   A-4      Colapsa repeticiones largas («putoooo») pero NO los dobles
--            legítimos del español («perro» no puede quedar «pero»).
--   A-5..A-7 Bloquea: palabra suelta, expresión compuesta y separada con signos.
--   A-8..A-12 NO bloquea texto legítimo con colisiones conocidas.
--   A-13     El trigger rechaza el INSERT de un mensaje sucio.
--   A-14     …y deja pasar uno limpio — control positivo, sin esto A-13 se
--            cumpliría igual con un filtro que bloquea todo.
-- ============================================================

begin;
select plan(14);

-- ── Exposición de la lista ──────────────────────────────────────────────────
select is_empty(
  $$ select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'banned_words'
        and grantee in ('anon', 'authenticated') $$,
  'A-1: banned_words no tiene grants para el cliente');

select throws_ok(
  $$ insert into public.banned_words (word) values ('.*') $$,
  '23514',
  null,
  'A-2: el CHECK rechaza metacaracteres de regex en la lista');

-- ── Normalización ───────────────────────────────────────────────────────────
select is(
  public.normalize_for_filter('PELOTÚDO'),
  'pelotudo',
  'A-3: baja a minúsculas y pliega acentos');

select is(
  public.normalize_for_filter('putoooo perro'),
  'puto perro',
  'A-4: colapsa 3+ repeticiones y respeta los dobles del español');

-- ── Casos que deben bloquear ────────────────────────────────────────────────
select ok(public.contains_banned_word('sos un pelotudo'),
  'A-5: bloquea el insulto como palabra suelta');

select ok(public.contains_banned_word('andá, hijo de puta'),
  'A-6: bloquea la expresión compuesta escrita normal');

select ok(public.contains_banned_word('h.i.j.o d.e p.u.t.a'),
  'A-7: bloquea la expresión separada con signos');

-- ── Casos que NO deben bloquear ─────────────────────────────────────────────
select ok(not public.contains_banned_word('Buscamos arquero para el sábado'),
  'A-8: deja pasar una publicación normal del Mercado');

select ok(not public.contains_banned_word('Mi apellido es Concha'),
  'A-9: «Concha» como apellido no es contenido objetable');

select ok(not public.contains_banned_word('Vamos en la Pajero hasta la cancha'),
  'A-10: «Pajero» es un modelo de camioneta');

select ok(not public.contains_banned_word('El negro juega de 9 y la rompe'),
  'A-11: «negro» suelto es un apodo corriente, no un insulto');

select ok(not public.contains_banned_word('Cómputo de goles de la fecha'),
  'A-12: la comparación condensada no cruza fronteras de palabra');

-- ── El trigger, no sólo la función ──────────────────────────────────────────
-- Se arma una conversación mínima propia en vez de reusar datos del seed: si el
-- seed cambia, el test tiene que seguir diciendo lo mismo.
insert into public.conversations (id, type, player_id, team_id)
select '11111111-1111-4111-8111-111111111111', 'MARKET_DM', p.id, tm.team_id
from public.profiles p
join public.team_members tm on tm.profile_id = p.id
limit 1;

select throws_ok(
  $$ insert into public.messages (conversation_id, sender_profile_id, content)
     select '11111111-1111-4111-8111-111111111111', c.player_id, 'sos un pelotudo'
     from public.conversations c
     where c.id = '11111111-1111-4111-8111-111111111111' $$,
  'P0001',
  'CONTENT_BLOCKED: el texto contiene lenguaje que no permitimos',
  'A-13: el trigger rechaza el mensaje sucio');

select lives_ok(
  $$ insert into public.messages (conversation_id, sender_profile_id, content)
     select '11111111-1111-4111-8111-111111111111', c.player_id, 'Nos vemos el sábado, traé pechera'
     from public.conversations c
     where c.id = '11111111-1111-4111-8111-111111111111' $$,
  'A-14: el trigger deja pasar el mensaje limpio');

select * from finish();
rollback;
