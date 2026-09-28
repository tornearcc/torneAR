-- ============================================================
-- DENUNCIAS CON CONTEXTO — columnas nuevas y RPC de alta
-- 2026-09-11
-- ------------------------------------------------------------
-- Segunda mitad de 20260911140000 (ver ahí por qué van separadas).
--
-- ── El problema que cierra ──────────────────────────────────────────────────
-- `content_reports` guarda `reported_entity_id` y nada más. Para un perfil
-- alcanzaba —el dashboard resuelve el usuario con un SELECT— pero para un
-- mensaje o una publicación no: la cola mostraría un uuid pelado y el
-- moderador tendría que ir a buscar el texto a mano, cuando el compromiso que
-- asumimos en los Términos es resolver en 24 horas. Peor todavía: si el autor
-- edita o borra el contenido, la denuncia queda sin objeto.
--
-- Por eso se congela el texto al momento de denunciar (`content_snapshot`) y
-- se guarda el autor ya resuelto (`reported_profile_id`), que es a quien hay
-- que suspender si la denuncia prospera.
--
-- ── Por qué RPC y no seguir con el INSERT directo ───────────────────────────
-- Esos dos campos NO los puede completar el cliente: si el snapshot y el autor
-- vinieran por parámetro, cualquiera podría denunciar un mensaje inventándose
-- el texto y atribuírselo a otra persona. Se resuelven del lado del servidor
-- leyendo la fila real.
--
-- La policy de INSERT anterior queda en pie: hay clientes viejos en la calle
-- que siguen usando el INSERT directo y tienen que seguir funcionando. Esas
-- denuncias llegan sin contexto, que es exactamente lo que llega hoy.
-- ============================================================

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS content_snapshot text,
  ADD COLUMN IF NOT EXISTS reported_profile_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.content_reports.content_snapshot IS
  'Texto denunciado, congelado al momento de la denuncia. Si el autor lo edita o lo borra, la cola de moderación sigue pudiendo juzgar qué se denunció.';
COMMENT ON COLUMN public.content_reports.reported_profile_id IS
  'Autor del contenido, resuelto en el servidor. Es a quien se suspende si la denuncia prospera; para MATCH queda NULL porque un partido no tiene un autor único.';

CREATE INDEX IF NOT EXISTS content_reports_reported_profile_id_idx
  ON public.content_reports (reported_profile_id)
  WHERE reported_profile_id IS NOT NULL;

-- El dashboard lee la cola con la sesión del admin y la policy de SELECT ya
-- contempla is_admin, así que no hace falta tocar RLS. Sí el grant de las
-- columnas nuevas para el INSERT vía RPC, que corre como owner.


CREATE OR REPLACE FUNCTION public.submit_content_report(
  p_entity_type public.report_entity_type,
  p_entity_id   uuid,
  p_reason      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_me       uuid := public.current_profile_id();
  v_author   uuid;
  v_snapshot text;
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_id       uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no hay sesión activa';
  END IF;

  IF char_length(v_reason) < 1 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'INVALID_REASON: el motivo es obligatorio';
  END IF;

  -- Autor y texto se leen de la fila real. Si la entidad no existe, la
  -- denuncia se rechaza en vez de guardarse apuntando a la nada.
  CASE p_entity_type
    WHEN 'USER' THEN
      SELECT p.id, coalesce(p.full_name, '') || ' (@' || coalesce(p.username, '') || ')'
        INTO v_author, v_snapshot
      FROM public.profiles p WHERE p.id = p_entity_id;

    WHEN 'MESSAGE' THEN
      -- Además de existir, el denunciante tiene que ser parte de la
      -- conversación. Sin esto se podría llenar la cola con mensajes que
      -- nunca se vieron, probando uuid al azar.
      SELECT m.sender_profile_id, m.content INTO v_author, v_snapshot
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = p_entity_id
        AND (
          c.player_id = v_me
          OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = c.team_id AND tm.profile_id = v_me
          )
        );

    WHEN 'MARKET_TEAM_POST' THEN
      SELECT tp.created_by, coalesce(tp.description, '(publicación sin descripción)')
        INTO v_author, v_snapshot
      FROM public.market_team_posts tp WHERE tp.id = p_entity_id;

    WHEN 'MARKET_PLAYER_POST' THEN
      SELECT pp.profile_id, coalesce(pp.description, '(publicación sin descripción)')
        INTO v_author, v_snapshot
      FROM public.market_player_posts pp WHERE pp.id = p_entity_id;

    WHEN 'TEAM' THEN
      -- Un equipo no tiene un autor único: el nombre y el escudo los puede
      -- haber puesto cualquiera de sus capitanes. Se deja el autor en NULL y
      -- moderación decide sobre el equipo, no sobre una persona.
      SELECT NULL::uuid, t.name INTO v_author, v_snapshot
      FROM public.teams t WHERE t.id = p_entity_id;

    WHEN 'MATCH' THEN
      SELECT NULL::uuid, 'Partido ' || coalesce(m.unique_code, p_entity_id::text)
        INTO v_author, v_snapshot
      FROM public.matches m WHERE m.id = p_entity_id;

    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_ENTITY: tipo de entidad no soportado';
  END CASE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTITY_NOT_FOUND: el contenido denunciado no existe o no es visible para vos';
  END IF;

  IF v_author = v_me THEN
    RAISE EXCEPTION 'INVALID_TARGET: no podés denunciar tu propio contenido';
  END IF;

  INSERT INTO public.content_reports (
    reporter_id, reported_entity_type, reported_entity_id, reason,
    content_snapshot, reported_profile_id
  )
  VALUES (
    v_me, p_entity_type, p_entity_id, v_reason,
    -- Se recorta porque el texto de un mensaje no tiene el techo de 500 del
    -- motivo y la cola no necesita el mensaje entero para decidir.
    left(coalesce(v_snapshot, ''), 2000), v_author
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_content_report(public.report_entity_type, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_content_report(public.report_entity_type, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.submit_content_report(public.report_entity_type, uuid, text) IS
  'Alta de denuncia con contexto. Resuelve autor y snapshot del contenido en el servidor — si vinieran del cliente, cualquiera podría inventar un texto y atribuírselo a otra persona. Reemplaza al INSERT directo, que sigue habilitado para los clientes ya publicados.';
