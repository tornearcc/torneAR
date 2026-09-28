-- ============================================================
-- BLOQUEO DE USUARIOS (App Store 1.2)
-- 2026-09-11
-- ------------------------------------------------------------
-- Apple exige, para apps con contenido generado por usuarios, «a mechanism for
-- users to block abusive users (blocking should also notify the developer of
-- the inappropriate content and should remove it from the user's feed
-- instantly)». Rechazo del 11/09/2026, submission f80970f0.
--
-- Las tres partes de esa frase se resuelven así:
--   · bloquear            → tabla user_blocks + RPCs block_user/unblock_user.
--   · avisar al developer → block_user inserta además una fila en
--                           content_reports, que es lo que alimenta la cola de
--                           moderación del dashboard.
--   · desaparecer YA      → policies RESTRICTIVE sobre los feeds y patch del
--                           RPC del inbox. Server-side, no un filter en el
--                           cliente: si se pudiera saltear desde la app, la
--                           precaución no existe.
--
-- ── Decisiones de diseño ────────────────────────────────────────────────────
--
-- SIMÉTRICO. Si A bloquea a B, ninguno de los dos ve al otro. La alternativa
-- —que el bloqueado siga viendo al que lo bloqueó— le deja abrir chats nuevos y
-- postularse a sus publicaciones, y el bloqueador se entera recién cuando le
-- llega la notificación. Eso no es «remove it from the feed instantly».
--
-- POR AUTOR, NO POR EQUIPO. `conversations` es jugador ↔ EQUIPO, y las ofertas
-- de equipo las publica una persona (`created_by`). El bloqueo es entre
-- personas, así que las publicaciones de equipo se filtran por quien las
-- publicó. Bloquear al capitán oculta sus publicaciones, no las de todos los
-- que compartan equipo con él.
--
-- RESTRICTIVE Y NO REESCRIBIR LAS POLICIES EXISTENTES. `market_*_select_all`
-- son `USING (true)`. Tocarlas para meterles el filtro obligaría a reescribir
-- policies que hoy funcionan; una policy RESTRICTIVE se combina con AND y deja
-- las permisivas intactas. Si algo sale mal, se borra la restrictiva y todo
-- vuelve al estado anterior.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. TABLA
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Motivo opcional que el usuario elige en el diálogo. Viaja a la denuncia
  -- automática para que moderación sepa por qué, no sólo que pasó.
  reason             text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 300),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_profile_id, blocked_profile_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_profile_id <> blocked_profile_id)
);

-- La PK ya cubre las consultas «¿a quién bloqueé?». Este índice cubre la
-- dirección inversa, «¿quién me bloqueó?», que es la mitad simétrica que
-- evalúa `blocks_exist_between` en CADA fila de los feeds. Sin él, esa mitad
-- sería un seq scan por fila.
CREATE INDEX IF NOT EXISTS user_blocks_blocked_profile_id_idx
  ON public.user_blocks (blocked_profile_id, blocker_profile_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
REVOKE UPDATE ON public.user_blocks FROM anon, authenticated;

-- Sólo mis propios bloqueos. Que alguien pueda averiguar quién lo bloqueó
-- sería contraproducente: el sentido del bloqueo es cortar el contacto, no
-- notificar a la otra parte.
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_profile_id = (SELECT public.current_profile_id()));

CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_profile_id = (SELECT public.current_profile_id()));

CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE TO authenticated
  USING (blocker_profile_id = (SELECT public.current_profile_id()));

COMMENT ON TABLE public.user_blocks IS
  'Bloqueos entre usuarios (App Store 1.2). El efecto es simétrico en visibilidad aunque la fila sea direccional: los filtros miran las dos direcciones. Ver la migración 20260911130000.';


-- ════════════════════════════════════════════════════════════
-- 2. HELPERS
-- ════════════════════════════════════════════════════════════

-- SECURITY DEFINER y no una subconsulta suelta dentro de cada policy: la RLS de
-- `user_blocks` sólo deja ver las filas donde yo soy el BLOQUEADOR, así que una
-- subconsulta común vería nada más la mitad de la relación y el bloqueo dejaría
-- de ser simétrico. La función corre como owner y ve las dos.
CREATE OR REPLACE FUNCTION public.blocks_exist_between(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_profile_id = p_a AND b.blocked_profile_id = p_b)
       OR (b.blocker_profile_id = p_b AND b.blocked_profile_id = p_a)
  );
$$;

-- Azúcar para las policies: el otro lado contra el usuario de la sesión.
-- `current_profile_id()` va envuelto en un SELECT para que Postgres lo evalúe
-- una vez como InitPlan y no una vez por fila (mismo criterio que
-- 20260714144056_rls_performance_optimization.sql).
CREATE OR REPLACE FUNCTION public.has_block_with(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT public.blocks_exist_between((SELECT public.current_profile_id()), p_other);
$$;

REVOKE EXECUTE ON FUNCTION public.blocks_exist_between(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_block_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blocks_exist_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_block_with(uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 3. RPCs
-- ════════════════════════════════════════════════════════════

-- Bloquear + denunciar en un solo acto.
--
-- La denuncia automática NO es opcional: es la parte «blocking should also
-- notify the developer» del requisito. Se materializa como una fila en
-- content_reports para que aparezca en la misma cola de moderación del
-- dashboard que el resto de las denuncias, sin construir un canal paralelo.
CREATE OR REPLACE FUNCTION public.block_user(p_blocked_profile_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_me     uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no hay sesión activa';
  END IF;

  IF p_blocked_profile_id IS NULL OR p_blocked_profile_id = v_me THEN
    RAISE EXCEPTION 'INVALID_TARGET: no se puede bloquear a ese usuario';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_blocked_profile_id) THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: el usuario no existe';
  END IF;

  INSERT INTO public.user_blocks (blocker_profile_id, blocked_profile_id, reason)
  VALUES (v_me, p_blocked_profile_id, v_reason)
  ON CONFLICT (blocker_profile_id, blocked_profile_id) DO NOTHING;

  -- Aviso a moderación. El guard de duplicados evita que un ciclo de
  -- bloquear/desbloquear/bloquear llene la cola con la misma denuncia: mientras
  -- la anterior siga PENDING no se agrega otra.
  IF NOT EXISTS (
    SELECT 1 FROM public.content_reports r
    WHERE r.reporter_id = v_me
      AND r.reported_entity_type = 'USER'
      AND r.reported_entity_id = p_blocked_profile_id
      AND r.status = 'PENDING'
  ) THEN
    INSERT INTO public.content_reports (reporter_id, reported_entity_type, reported_entity_id, reason)
    VALUES (
      v_me,
      'USER',
      p_blocked_profile_id,
      left('Bloqueo de usuario' || coalesce(': ' || v_reason, ''), 500)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_me uuid := public.current_profile_id();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no hay sesión activa';
  END IF;

  -- La denuncia generada por el bloqueo NO se borra: es un hecho que ocurrió y
  -- moderación tiene que poder verlo aunque el usuario se arrepienta.
  DELETE FROM public.user_blocks
  WHERE blocker_profile_id = v_me
    AND blocked_profile_id = p_blocked_profile_id;
END;
$$;

-- Listado para la pantalla «Usuarios bloqueados» de Preferencias. Va como RPC
-- porque necesita datos de `profiles` de gente con la que el usuario ya no
-- tiene ninguna relación visible, y devolver sólo los uuid obligaría a una
-- segunda consulta que la RLS de profiles podría no permitir.
CREATE OR REPLACE FUNCTION public.list_my_blocks()
RETURNS TABLE (
  profile_id uuid,
  username   text,
  full_name  text,
  avatar_url text,
  reason     text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.id, p.username, p.full_name, p.avatar_url, b.reason, b.created_at
  FROM public.user_blocks b
  JOIN public.profiles p ON p.id = b.blocked_profile_id
  WHERE b.blocker_profile_id = (SELECT public.current_profile_id())
  ORDER BY b.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.block_user(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unblock_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_my_blocks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_blocks() TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 4. DESAPARECER DEL FEED
-- ════════════════════════════════════════════════════════════
-- Todas RESTRICTIVE: se combinan con AND sobre las permisivas existentes, que
-- quedan sin tocar. Van `TO authenticated` porque el bloqueo es una relación
-- entre usuarios y `anon` no tiene perfil con el cual tenerla.

-- Publicaciones de jugadores que buscan equipo.
DROP POLICY IF EXISTS market_player_posts_hide_blocked ON public.market_player_posts;
CREATE POLICY market_player_posts_hide_blocked ON public.market_player_posts
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.has_block_with(profile_id));

-- Ofertas de equipo, filtradas por quien las publicó (ver decisiones arriba).
DROP POLICY IF EXISTS market_team_posts_hide_blocked ON public.market_team_posts;
CREATE POLICY market_team_posts_hide_blocked ON public.market_team_posts
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.has_block_with(created_by));

-- Mensajes: se filtra por remitente y no por conversación. Mirar la
-- conversación entera obligaría a recorrer sus mensajes en cada fila, o sea
-- O(n²) sobre el chat. Por remitente es una búsqueda por índice por fila, y el
-- efecto visible es el mismo: los mensajes de quien bloqueé desaparecen.
DROP POLICY IF EXISTS messages_hide_blocked ON public.messages;
CREATE POLICY messages_hide_blocked ON public.messages
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.has_block_with(sender_profile_id));

-- Postulaciones al Mercado: el capitán deja de ver las de quien bloqueó. El
-- propio postulante sigue viendo las suyas —`has_block_with` de uno mismo es
-- falso por el CHECK que impide autobloquearse—, que es lo correcto: no hay que
-- borrarle su historial por haber bloqueado a alguien.
DROP POLICY IF EXISTS market_applications_hide_blocked ON public.market_team_post_applications;
CREATE POLICY market_applications_hide_blocked ON public.market_team_post_applications
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.has_block_with(profile_id));


-- ════════════════════════════════════════════════════════════
-- 5. NO PODER ESCRIBIR
-- ════════════════════════════════════════════════════════════
-- Ocultar no alcanza: si el bloqueado puede seguir mandando mensajes, el
-- bloqueador no los ve pero el otro cree que está hablando con alguien. Y
-- además las notificaciones push salen del trigger de `messages`, así que sin
-- este corte el bloqueador seguiría recibiendo el aviso.

CREATE OR REPLACE FUNCTION public.enforce_message_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_conv RECORD;
BEGIN
  SELECT c.player_id, c.team_id INTO v_conv
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Contra el jugador de la conversación.
  IF public.blocks_exist_between(NEW.sender_profile_id, v_conv.player_id) THEN
    RAISE EXCEPTION 'USER_BLOCKED: no podés escribirle a este usuario';
  END IF;

  -- Contra quienes manejan el equipo del otro lado. Son los únicos que pueden
  -- contestar por el equipo, así que son la contraparte real de un MARKET_DM.
  IF v_conv.team_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = v_conv.team_id
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      AND public.blocks_exist_between(NEW.sender_profile_id, tm.profile_id)
  ) THEN
    RAISE EXCEPTION 'USER_BLOCKED: no podés escribirle a este usuario';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_enforce_block ON public.messages;
CREATE TRIGGER messages_enforce_block
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_block();

-- Postularse a una oferta abre un chat, así que es otra vía de contacto.
CREATE OR REPLACE FUNCTION public.enforce_application_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.market_team_posts p
    JOIN public.team_members tm ON tm.team_id = p.team_id
    WHERE p.id = NEW.post_id
      AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      AND public.blocks_exist_between(NEW.profile_id, tm.profile_id)
  ) THEN
    RAISE EXCEPTION 'USER_BLOCKED: no podés postularte a esta publicación';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_applications_enforce_block ON public.market_team_post_applications;
CREATE TRIGGER market_applications_enforce_block
  BEFORE INSERT ON public.market_team_post_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_application_block();

-- Las funciones de trigger no se invocan por RPC. Mismo criterio que
-- 20260818130000_f4_security_hardening.sql.
REVOKE EXECUTE ON FUNCTION public.enforce_message_block() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_application_block() FROM PUBLIC, anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 6. INBOX
-- ════════════════════════════════════════════════════════════
-- `get_market_inbox` es SECURITY DEFINER, así que las policies de arriba NO la
-- alcanzan: sin este patch la conversación seguiría apareciendo en la bandeja
-- con su último mensaje, que es justo lo que el reviewer va a mirar.
--
-- Se re-declara entera —y no con un ALTER— porque es la forma de que el archivo
-- de migración muestre el cuerpo vigente. Respecto de la versión anterior
-- (20260711011226_c2_market_inbox_idor_guard) el único cambio es el filtro de
-- bloqueo en `user_convos`; el guard de IDOR queda intacto.
CREATE OR REPLACE FUNCTION public.get_market_inbox(p_profile_id uuid)
RETURNS TABLE (
  id               uuid,
  type             text,
  player_id        uuid,
  team_id          uuid,
  created_at       timestamptz,
  player_full_name text,
  player_avatar    text,
  team_name        text,
  team_shield      text,
  last_msg_content text,
  last_msg_at      timestamptz,
  last_msg_sender  uuid,
  last_read_at     timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  with caller as (
    -- Perfil real del usuario autenticado. Si es anon, auth.uid() es null
    -- y este CTE queda vacío => el guard de abajo nunca matchea.
    select pr.id
    from profiles pr
    where pr.auth_user_id = auth.uid()
  ),
  managed_teams as (
    select tm.team_id
    from team_members tm
    where tm.profile_id = p_profile_id
      and tm.role in ('CAPITAN', 'SUBCAPITAN')
  ),
  user_convos as (
    select c.*
    from conversations c
    where c.type = 'MARKET_DM'
      -- IDOR guard: sólo el propio perfil del caller puede leer su inbox.
      and p_profile_id = (select id from caller)
      and (
        c.player_id = p_profile_id
        or c.team_id in (select team_id from managed_teams)
      )
      -- Bloqueo: contra el jugador de la conversación, y contra cualquiera que
      -- haya escrito en ella. Lo segundo cubre el lado equipo, donde la
      -- contraparte no es una columna sino quien haya contestado.
      and not blocks_exist_between(p_profile_id, c.player_id)
      and not exists (
        select 1 from messages m
        where m.conversation_id = c.id
          and blocks_exist_between(p_profile_id, m.sender_profile_id)
      )
  ),
  last_messages as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.content      as last_msg_content,
      m.created_at   as last_msg_at,
      m.sender_profile_id as last_msg_sender
    from messages m
    where m.conversation_id in (select id from user_convos)
    order by m.conversation_id, m.created_at desc
  )
  select
    uc.id,
    uc.type::text,
    uc.player_id,
    uc.team_id,
    uc.created_at,
    p.full_name      as player_full_name,
    p.avatar_url     as player_avatar,
    t.name           as team_name,
    t.shield_url     as team_shield,
    lm.last_msg_content,
    lm.last_msg_at,
    lm.last_msg_sender,
    cr.last_read_at
  from user_convos uc
  left join profiles p on p.id = uc.player_id
  left join teams t on t.id = uc.team_id
  left join last_messages lm on lm.conversation_id = uc.id
  left join conversation_reads cr
    on cr.conversation_id = uc.id
    and cr.profile_id = p_profile_id
  order by coalesce(lm.last_msg_at, uc.created_at) desc;
$$;

COMMENT ON FUNCTION public.get_market_inbox(uuid) IS
  'Bandeja de chats del Mercado. SECURITY DEFINER con guard de IDOR (20260711011226) y filtro de usuarios bloqueados (20260911130000) — las policies RESTRICTIVE de messages no alcanzan a esta función, de ahí que el filtro se repita acá.';
