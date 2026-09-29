-- ============================================================
-- Contra-reclamo de WO: el equipo acusado da su versión (D-61)
-- 2026-09-29 · Registro P1-1 · Tanda 4 · tarjeta #16
-- ------------------------------------------------------------
-- Hasta ahora el equipo acusado no se enteraba de un reclamo de WO hasta que
-- el admin lo aprobaba ("Partido perdido por WO"), sin haber podido opinar.
-- D-61: el acusado responde, no reclama.
--
--   · claim_wo fija un plazo (`response_deadline`, 24 h por defecto,
--     app_settings.wo_response_window_hours) y avisa a todo el equipo acusado
--     (WO_RECLAMADO, que existía en el enum y no se usaba).
--   · respond_wo_claim(reclamo, texto, foto?) guarda UNA respuesta por reclamo,
--     dentro del plazo. Responde quien podría haber reclamado del otro lado:
--     capitán, subcapitán o un miembro con check-in en ese partido (la misma
--     regla que claim_wo y que la policy de subida a wo_evidences, así la foto
--     opcional se sube con el mismo permiso). Avisa al equipo que reclamó.
--   · resolve_wo_claim no deja APROBAR mientras el acusado todavía está en
--     plazo y no respondió (RESPONSE_PENDING). Rechazar se puede siempre: no
--     perjudica al acusado. No hay aprobación automática: con el plazo vencido
--     resuelve el admin con lo que hay.
--   · get_pending_wo_claims suma la respuesta, el plazo y el check-in de cada
--     equipo, para que el admin vea las dos versiones y el dato objetivo.
--   · get_match_detail suma la respuesta y el plazo al bloque wo_claim.
--   · sweep_orphan_wo_evidences cuenta también la foto de la respuesta: sin
--     esto la borraría a las 24 h por no estar en photo_url.
--
-- Los reclamos anteriores quedan con response_deadline NULL: sin plazo, el
-- admin los resuelve como antes (al 29/09 no hay ninguno en producción).
-- ============================================================


-- ── 1. Columnas ─────────────────────────────────────────────────────────────
ALTER TABLE public.wo_claims
  ADD COLUMN IF NOT EXISTS response_deadline  timestamptz,
  ADD COLUMN IF NOT EXISTS response_text      text,
  ADD COLUMN IF NOT EXISTS response_photo_url text,
  ADD COLUMN IF NOT EXISTS responded_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responded_at       timestamptz;

ALTER TABLE public.wo_claims DROP CONSTRAINT IF EXISTS wo_claims_response_text_len;
ALTER TABLE public.wo_claims ADD CONSTRAINT wo_claims_response_text_len
  CHECK (response_text IS NULL OR char_length(response_text) BETWEEN 1 AND 500);

CREATE INDEX IF NOT EXISTS wo_claims_responded_by_idx ON public.wo_claims (responded_by);

COMMENT ON COLUMN public.wo_claims.response_deadline IS
  'D-61. Hasta cuándo puede responder el equipo acusado. Lo fija claim_wo (app_settings.wo_response_window_hours). NULL en los reclamos anteriores a 20260929140000.';
COMMENT ON COLUMN public.wo_claims.response_text IS
  'D-61. Versión del equipo acusado (respond_wo_claim). Una sola por reclamo.';


-- ── 2. Plazo configurable ───────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description)
VALUES ('wo_response_window_hours', 24,
        'Horas que tiene el equipo acusado para dar su versión de un reclamo de WO (D-61). Aplica a los reclamos nuevos.')
ON CONFLICT (key) DO NOTHING;


-- ── 3. claim_wo: plazo y aviso al acusado ───────────────────────────────────
-- Cuerpo de 20260728210000 (D6) con dos agregados al final: el plazo en el
-- INSERT y el aviso al equipo acusado.
CREATE OR REPLACE FUNCTION public.claim_wo(
  p_match_id  uuid,
  p_team_id   uuid,
  p_reason    text,
  p_photo_url text,
  p_scorers   jsonb DEFAULT '[]'::jsonb,
  p_mvp_id    uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_profile_id    uuid;
  v_role          text;
  v_did_checkin   boolean;
  v_match         matches%rowtype;
  v_total_goals   int;
  v_scorer_count  int;
  v_claim_id      uuid;
  v_rival_team_id uuid;
  v_claiming_name text;
  v_window_hours  int;
begin
  select id into v_profile_id from profiles where auth_user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'No autenticado';
  end if;

  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'Partido no encontrado';
  end if;
  if p_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'El equipo no pertenece a este partido';
  end if;

  -- ── D6: guarda de estado ─────────────────────────────────────────────────
  -- Va ANTES de la autorizacion a proposito: el estado del partido es un hecho
  -- del dominio que no depende de quien pregunta, y asi el mensaje de error es
  -- el util ("el partido ya termino") en vez del generico de permisos.
  if v_match.status not in ('CONFIRMADO', 'EN_VIVO') then
    raise exception
      'INVALID_MATCH_STATUS: solo se puede reclamar un WO sobre un partido confirmado o en curso (estado actual: %)',
      v_match.status;
  end if;

  select role into v_role
    from team_members
   where team_id = p_team_id and profile_id = v_profile_id;

  select bool_or(did_checkin) into v_did_checkin
    from match_participants
   where match_id = p_match_id and team_id = p_team_id and profile_id = v_profile_id;

  -- coalesce de la comparacion de rol (v_role NULL para no-miembros).
  -- Ver 20260714180000_claim_wo_null_role_fix.sql.
  if not (coalesce(v_role in ('CAPITAN', 'SUBCAPITAN'), false)
          or coalesce(v_did_checkin, false)) then
    raise exception 'No autorizado para reclamar el WO de este equipo';
  end if;

  if not exists (
    select 1 from match_participants
    where match_id = p_match_id and team_id = p_team_id and did_checkin = true
  ) then
    raise exception 'Tu equipo no registró check-in en este partido';
  end if;

  v_scorer_count := jsonb_array_length(coalesce(p_scorers, '[]'::jsonb));
  if v_scorer_count > 3 then
    raise exception 'No se pueden cargar más de 3 goleadores';
  end if;

  select coalesce(sum((s->>'goals')::int), 0) into v_total_goals
    from jsonb_array_elements(coalesce(p_scorers, '[]'::jsonb)) s;
  if v_total_goals > 3 then
    raise exception 'Los goles cargados (%) superan el 3-0 del WO', v_total_goals;
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_scorers, '[]'::jsonb)) s
    where (s->>'goals')::int < 1
       or not exists (
         select 1 from match_participants mp
         where mp.match_id = p_match_id
           and mp.team_id  = p_team_id
           and mp.profile_id = (s->>'profile_id')::uuid
       )
  ) then
    raise exception 'Goleador inválido: debe pertenecer al equipo y tener al menos 1 gol';
  end if;

  if p_mvp_id is not null and not exists (
    select 1 from match_participants mp
    where mp.match_id = p_match_id and mp.team_id = p_team_id and mp.profile_id = p_mvp_id
  ) then
    raise exception 'El MVP debe pertenecer al equipo';
  end if;

  -- ── D-61: plazo para que responda el acusado ─────────────────────────────
  select coalesce((select value::int from app_settings where key = 'wo_response_window_hours'), 24)
    into v_window_hours;

  insert into wo_claims (
    match_id, claimed_by, claiming_team_id, photo_url, reason, status, scorers, mvp_id,
    response_deadline
  ) values (
    p_match_id, v_profile_id, p_team_id, p_photo_url, p_reason, 'PENDIENTE_REVISION',
    coalesce(p_scorers, '[]'::jsonb), p_mvp_id,
    now() + make_interval(hours => v_window_hours)
  )
  returning id into v_claim_id;

  -- ── D-61: aviso al equipo acusado ────────────────────────────────────────
  v_rival_team_id := case when p_team_id = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end;
  select name into v_claiming_name from teams where id = p_team_id;

  insert into notifications (profile_id, type, title, body, data, is_read)
  select tm.profile_id,
         'WO_RECLAMADO',
         '⚠️ Te reclamaron un WO',
         coalesce(v_claiming_name, 'El rival')
           || ' pidió que se le dé el partido por WO. Tenés ' || v_window_hours
           || ' h para dar tu versión desde el partido; después resuelve un administrador.',
         jsonb_build_object('match_id', p_match_id, 'claim_id', v_claim_id),
         false
  from team_members tm
  where tm.team_id = v_rival_team_id;

  return v_claim_id;
end;
$function$;


-- ── 4. Respuesta del acusado ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_wo_claim(
  p_claim_id  uuid,
  p_text      text,
  p_photo_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id    uuid;
  v_claim         wo_claims%rowtype;
  v_match         matches%rowtype;
  v_accused_id    uuid;
  v_role          text;
  v_did_checkin   boolean;
  v_text          text := btrim(coalesce(p_text, ''));
  v_photo         text := nullif(btrim(coalesce(p_photo_url, '')), '');
  v_accused_name  text;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: no hay sesión activa';
  END IF;

  SELECT * INTO v_claim FROM wo_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION 'CLAIM_NOT_FOUND: el reclamo no existe';
  END IF;
  IF v_claim.status <> 'PENDIENTE_REVISION' THEN
    RAISE EXCEPTION 'CLAIM_ALREADY_RESOLVED: el reclamo ya fue resuelto';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = v_claim.match_id;
  v_accused_id := CASE WHEN v_claim.claiming_team_id = v_match.team_a_id
                       THEN v_match.team_b_id ELSE v_match.team_a_id END;

  SELECT role INTO v_role
    FROM team_members WHERE team_id = v_accused_id AND profile_id = v_profile_id;
  SELECT bool_or(did_checkin) INTO v_did_checkin
    FROM match_participants
   WHERE match_id = v_match.id AND team_id = v_accused_id AND profile_id = v_profile_id;

  IF NOT (coalesce(v_role IN ('CAPITAN', 'SUBCAPITAN'), false) OR coalesce(v_did_checkin, false)) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: responde el capitán, el subcapitán o alguien del equipo con check-in en el partido';
  END IF;

  IF v_claim.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_RESPONDED: tu equipo ya dio su versión';
  END IF;

  IF v_claim.response_deadline IS NOT NULL AND now() > v_claim.response_deadline THEN
    RAISE EXCEPTION 'RESPONSE_WINDOW_CLOSED: el plazo para responder ya venció';
  END IF;

  IF v_text = '' THEN
    RAISE EXCEPTION 'RESPONSE_REQUIRED: contá qué pasó';
  END IF;
  IF char_length(v_text) > 500 THEN
    RAISE EXCEPTION 'RESPONSE_TOO_LONG: la respuesta puede tener hasta 500 caracteres';
  END IF;

  -- La foto sale del mismo bucket y con el mismo formato que la del reclamo
  -- (<partido>/<equipo>_<timestamp>.jpg), con el equipo acusado en el nombre.
  IF v_photo IS NOT NULL AND v_photo NOT LIKE v_match.id::text || '/' || v_accused_id::text || '\_%' THEN
    RAISE EXCEPTION 'INVALID_PHOTO_PATH: la foto no corresponde a este partido y equipo';
  END IF;

  UPDATE wo_claims SET
    response_text      = v_text,
    response_photo_url = v_photo,
    responded_by       = v_profile_id,
    responded_at       = now()
  WHERE id = p_claim_id;

  SELECT name INTO v_accused_name FROM teams WHERE id = v_accused_id;

  INSERT INTO notifications (profile_id, type, title, body, data, is_read)
  SELECT tm.profile_id,
         'WO_RECLAMADO',
         'El rival respondió tu reclamo de WO',
         coalesce(v_accused_name, 'El rival')
           || ' dio su versión. Un administrador va a revisar las dos y les avisa el veredicto.',
         jsonb_build_object('match_id', v_match.id, 'claim_id', p_claim_id),
         false
  FROM team_members tm
  WHERE tm.team_id = v_claim.claiming_team_id;
END;
$function$;

COMMENT ON FUNCTION public.respond_wo_claim(uuid, text, text) IS
  'D-61. Versión del equipo acusado de un reclamo de WO: una por reclamo, dentro de response_deadline, texto obligatorio (hasta 500) y foto opcional de wo_evidences. Avisa al equipo que reclamó (20260929140000).';


-- ── 5. resolve_wo_claim: no aprobar con el acusado en plazo ─────────────────
-- Cuerpo de 20260731000000 con una sola guarda nueva al principio de la rama
-- de aprobación.
CREATE OR REPLACE FUNCTION public.resolve_wo_claim(p_claim_id uuid, p_approve boolean, p_admin_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_profile uuid;
  v_claim         wo_claims%rowtype;
  v_match         matches%rowtype;
  v_new_status    match_status;
  v_rival_team_id uuid;
  v_claiming_name text;
  v_rival_name    text;
  v_notes_suffix  text := '';
begin
  -- Autorización: el caller debe ser admin (derivado de auth.uid()).
  select id into v_admin_profile
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin_profile is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  -- Claim válido y aún pendiente.
  select * into v_claim from wo_claims where id = p_claim_id;
  if v_claim.id is null then
    raise exception 'Reclamo no encontrado';
  end if;
  if v_claim.status <> 'PENDIENTE_REVISION' then
    raise exception 'El reclamo ya fue resuelto';
  end if;

  select * into v_match from matches where id = v_claim.match_id;
  if v_match.id is null then
    raise exception 'Partido no encontrado';
  end if;

  if v_claim.claiming_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'El equipo reclamante no pertenece al partido';
  end if;

  v_rival_team_id := case
    when v_claim.claiming_team_id = v_match.team_a_id then v_match.team_b_id
    else v_match.team_a_id
  end;

  select name into v_claiming_name from teams where id = v_claim.claiming_team_id;
  select name into v_rival_name    from teams where id = v_rival_team_id;

  if p_admin_notes is not null and btrim(p_admin_notes) <> '' then
    v_notes_suffix := ' Nota del admin: ' || btrim(p_admin_notes);
  end if;

  if p_approve then
    -- ── D-61: el acusado tiene derecho a responder ────────────────────────
    -- Aprobar antes de que responda o de que venza su plazo le sacaría ese
    -- derecho. Rechazar sí se puede siempre (rama de abajo).
    if v_claim.responded_at is null
       and v_claim.response_deadline is not null
       and now() < v_claim.response_deadline then
      raise exception 'RESPONSE_PENDING: el equipo acusado tiene hasta el % (hora argentina) para dar su versión. Esperá su respuesta o el vencimiento del plazo; rechazar sí se puede ya',
        to_char(v_claim.response_deadline at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI');
    end if;

    -- ── GUARDA TERMINAL (restaurada) ──────────────────────────────────────
    -- Nunca aplicar un WO sobre un partido que ya tiene desenlace. El literal
    -- 'estado terminal' lo verifica supabase/tests/120-rls-hotfix.spec.sql
    -- (H5a): no cambiar ese texto.
    if v_match.status in ('FINALIZADO', 'WO_A', 'WO_B', 'CANCELADO', 'EN_DISPUTA') then
      raise exception 'El partido ya está en estado terminal (%): rechazá el reclamo en su lugar', v_match.status;
    end if;

    -- Estado WO según el equipo ganador.
    if v_claim.claiming_team_id = v_match.team_a_id then
      v_new_status := 'WO_A';
    else
      v_new_status := 'WO_B';
    end if;

    -- Resultado 3-0 del ganador con los goleadores/MVP guardados en el claim.
    insert into match_results (match_id, team_id, submitted_by, goals_scored, goals_against, scorers, mvp_id)
    values (v_claim.match_id, v_claim.claiming_team_id, v_claim.claimed_by, 3, 0, v_claim.scorers, v_claim.mvp_id)
    on conflict (match_id, team_id) do update
      set goals_scored = 3, goals_against = 0, scorers = excluded.scorers, mvp_id = excluded.mvp_id;

    -- Setear el estado del partido -> dispara ELO/season stats + Fair Play.
    update matches set status = v_new_status where id = v_claim.match_id;

    update wo_claims
      set status      = 'APROBADO',
          resolved_at = now(),
          resolved_by = v_admin_profile,   -- auditoría (restaurada)
          admin_notes = p_admin_notes
      where id = p_claim_id;

    -- ── Aviso al equipo reclamante ────────────────────────────────────────
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'WO_APROBADO',
           '✅ Tu reclamo de WO fue aprobado',
           'Se te dio por ganado el partido contra ' || coalesce(v_rival_name, 'el rival')
             || ' por 3-0.' || v_notes_suffix,
           jsonb_build_object('match_id', v_match.id, 'claim_id', p_claim_id),
           false
    from team_members tm
    where tm.team_id = v_claim.claiming_team_id;

    -- ── Aviso al equipo señalado ──────────────────────────────────────────
    -- Hasta ahora ni se enteraba de que lo habían acusado de no presentarse,
    -- y el −15 de Fair Play le aparecía sin explicación.
    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'WO_APROBADO',
           '⚠️ Partido perdido por WO',
           coalesce(v_claiming_name, 'El rival')
             || ' reclamó un WO y la administración lo aprobó: el partido se dio 3-0 en contra.'
             || v_notes_suffix,
           jsonb_build_object('match_id', v_match.id, 'claim_id', p_claim_id),
           false
    from team_members tm
    where tm.team_id = v_rival_team_id;

  else
    update wo_claims
      set status      = 'RECHAZADO',
          resolved_at = now(),
          resolved_by = v_admin_profile,   -- auditoría (restaurada)
          admin_notes = p_admin_notes
      where id = p_claim_id;

    -- ── Anti callejón sin salida (D5, se conserva) ────────────────────────
    -- Antes, el rechazo dejaba el partido exactamente como estaba y el unique
    -- (match_id) impedía volver a reclamar: el partido quedaba vivo para
    -- siempre y sus convocados bloqueados para salir del equipo (ACTIVE_MATCH).
    if v_match.status = 'CONFIRMADO' then
      update matches set status = 'CANCELADO' where id = v_match.id;
    end if;
    -- EN_VIVO se respeta: hay partido en curso y todavía se puede cargar el
    -- resultado. Si nadie lo carga, lo levanta sweep_stale_matches().

    insert into notifications (profile_id, type, title, body, data, is_read)
    select tm.profile_id,
           'WO_RECHAZADO',
           '❌ Reclamo de WO rechazado',
           'La administración rechazó el reclamo de WO del partido '
             || coalesce(v_claiming_name, '') || ' vs ' || coalesce(v_rival_name, '') || '.'
             || case when v_match.status = 'CONFIRMADO'
                     then ' El partido queda cancelado.'
                     else '' end
             || v_notes_suffix,
           jsonb_build_object('match_id', v_match.id, 'claim_id', p_claim_id),
           false
    from team_members tm
    where tm.team_id in (v_claim.claiming_team_id, v_rival_team_id);
  end if;
end;
$function$;


-- ── 6. Cola del admin: las dos versiones y el check-in ──────────────────────
-- Cambia el tipo de retorno, así que va DROP + CREATE (y se vuelven a dar los
-- permisos de 20260714002506).
DROP FUNCTION IF EXISTS public.get_pending_wo_claims();
CREATE FUNCTION public.get_pending_wo_claims()
RETURNS TABLE(
  claim_id              uuid,
  match_id              uuid,
  created_at            timestamptz,
  scheduled_at          timestamptz,
  reason                text,
  photo_url             text,
  claiming_team_id      uuid,
  claiming_team_name    text,
  opponent_team_name    text,
  scorers               jsonb,
  mvp_id                uuid,
  mvp_name              text,
  response_deadline     timestamptz,
  response_text         text,
  response_photo_url    text,
  responded_at          timestamptz,
  responded_by_name     text,
  claiming_checkin_at   timestamptz,
  opponent_checkin_at   timestamptz,
  claiming_checkins     integer,
  opponent_checkins     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_admin uuid;
begin
  select id into v_admin
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  return query
    select
      wc.id,
      wc.match_id,
      wc.created_at,
      m.scheduled_at,
      wc.reason,
      wc.photo_url,
      wc.claiming_team_id,
      tc.name,
      topp.name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', s->>'profile_id',
          'goals', (s->>'goals')::int,
          'full_name', p.full_name
        ))
        from jsonb_array_elements(wc.scorers) s
        left join profiles p on p.id = (s->>'profile_id')::uuid
      ), '[]'::jsonb),
      wc.mvp_id,
      pm.full_name,
      wc.response_deadline,
      wc.response_text,
      wc.response_photo_url,
      wc.responded_at,
      pr.full_name,
      case when wc.claiming_team_id = m.team_a_id then m.checkin_team_a_at else m.checkin_team_b_at end,
      case when wc.claiming_team_id = m.team_a_id then m.checkin_team_b_at else m.checkin_team_a_at end,
      (select count(*)::int from match_participants mp
        where mp.match_id = wc.match_id and mp.team_id = wc.claiming_team_id and mp.did_checkin),
      (select count(*)::int from match_participants mp
        where mp.match_id = wc.match_id and mp.team_id = topp.id and mp.did_checkin)
    from wo_claims wc
    join matches m on m.id = wc.match_id
    join teams tc on tc.id = wc.claiming_team_id
    join teams topp on topp.id = case when wc.claiming_team_id = m.team_a_id then m.team_b_id else m.team_a_id end
    left join profiles pm on pm.id = wc.mvp_id
    left join profiles pr on pr.id = wc.responded_by
    where wc.status = 'PENDIENTE_REVISION'
    order by wc.created_at asc;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pending_wo_claims() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_pending_wo_claims() TO authenticated;


-- ── 7. Barrido de evidencias: la foto de la respuesta también cuenta ───────
CREATE OR REPLACE FUNCTION public.sweep_orphan_wo_evidences(
  p_dry_run boolean DEFAULT false,
  p_limit   integer DEFAULT 500
)
RETURNS TABLE (objeto text, subido_at timestamptz, request_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key   text;
  v_base  constant text := 'https://yusfykqimalghmmhlfdn.supabase.co/storage/v1/object/wo_evidences/';
  v_row   record;
  v_count integer := 0;
BEGIN
  IF NOT p_dry_run THEN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets
     WHERE name = 'storage_service_role_key';

    IF v_key IS NULL THEN
      INSERT INTO public.app_logs (level, message, details)
      VALUES (
        'warn',
        'Barrido de evidencias de WO omitido: falta el secreto storage_service_role_key en Vault',
        jsonb_build_object('scope', 'sweep_orphan_wo_evidences')
      );
      RETURN;
    END IF;
  END IF;

  FOR v_row IN
    SELECT o.name, o.created_at
      FROM storage.objects o
     WHERE o.bucket_id = 'wo_evidences'
       AND o.created_at < now() - interval '24 hours'
       AND NOT EXISTS (
         SELECT 1
           FROM public.wo_claims c
          WHERE c.photo_url = o.name
             -- Reclamos viejos con la URL pública completa guardada en vez del path.
             OR c.photo_url LIKE '%/wo_evidences/' || o.name
             -- D-61: la foto de la respuesta del acusado.
             OR c.response_photo_url = o.name
       )
     ORDER BY o.created_at
     LIMIT p_limit
  LOOP
    objeto     := v_row.name;
    subido_at  := v_row.created_at;
    request_id := NULL;

    IF NOT p_dry_run THEN
      request_id := net.http_delete(
        url     := v_base || v_row.name,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_key,
          'apikey',        v_key
        )
      );
    END IF;

    v_count := v_count + 1;
    RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run AND v_count > 0 THEN
    INSERT INTO public.app_logs (level, message, details)
    VALUES (
      'info',
      'Barrido de evidencias de WO sin reclamo',
      jsonb_build_object('scope', 'sweep_orphan_wo_evidences', 'objetos', v_count)
    );
  END IF;
END;
$fn$;


-- ── 8. Permisos ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.respond_wo_claim(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_wo_claim(uuid, text, text) TO authenticated;


-- ── 9. get_match_detail: la respuesta y el plazo en el bloque wo_claim ─────
-- Definición vigente en producción al 29/09 con cuatro campos más en wo_claim.
CREATE OR REPLACE FUNCTION public.get_match_detail(p_match_id uuid, p_team_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_result     json;
  v_roster     json;
BEGIN
  -- ── Resolver perfil del usuario ────────────────────────────────────────────
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado para el usuario actual';
  END IF;

  -- ── Autorización: miembro del equipo O anotado en este partido ─────────────
  -- La segunda rama es el invitado por código (join_match_as_guest) y también
  -- el jugador que un capitán convocó. Ambas quedan acotadas a la tripleta
  -- (partido, equipo, perfil): no hay lectura transversal.
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND profile_id = v_profile_id
  ) AND NOT EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id   = p_match_id
      AND team_id    = p_team_id
      AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos miembro ni invitado de este partido';
  END IF;

  -- ── Plantel de MI equipo (bug 4) ───────────────────────────────────────────
  -- UNION de dos fuentes disjuntas:
  --   1. team_members  → el plantel real, este o no convocado.
  --   2. match_participants con is_guest = true → invitados que entraron por
  --      unique_code (join_match_as_guest). No son miembros, pero jugaron y
  --      pueden haber convertido.
  -- La rama de invitados excluye explicitamente a quien ya es miembro para que
  -- el UNION no pueda emitir dos filas del mismo profile_id (difieren en
  -- is_guest/team_role, asi que la deduplicacion del UNION no las colapsaria).
  SELECT coalesce(json_agg(r ORDER BY r.in_squad DESC, r.full_name), '[]'::json)
    INTO v_roster
  FROM (
    SELECT
      tm.profile_id                                              AS profile_id,
      coalesce(pr.full_name, pr.username, 'Jugador')             AS full_name,
      coalesce(pr.username, '')                                  AS username,
      pr.avatar_url                                              AS avatar_url,
      p_team_id                                                  AS team_id,
      false                                                      AS is_guest,
      tm.role                                                    AS team_role,
      EXISTS (
        SELECT 1 FROM match_participants mp
        WHERE mp.match_id   = p_match_id
          AND mp.team_id    = p_team_id
          AND mp.profile_id = tm.profile_id
      )                                                          AS in_squad
    FROM team_members tm
    JOIN profiles pr ON pr.id = tm.profile_id
    WHERE tm.team_id = p_team_id

    UNION

    SELECT
      mp.profile_id,
      coalesce(pr.full_name, pr.username, 'Invitado'),
      coalesce(pr.username, ''),
      pr.avatar_url,
      mp.team_id,
      true,
      NULL::team_role,
      true                       -- un invitado existe solo si esta en la lista
    FROM match_participants mp
    JOIN profiles pr ON pr.id = mp.profile_id
    WHERE mp.match_id = p_match_id
      AND mp.team_id  = p_team_id
      AND mp.is_guest = true
      AND NOT EXISTS (
        SELECT 1 FROM team_members tm2
        WHERE tm2.team_id = p_team_id AND tm2.profile_id = mp.profile_id
      )
  ) r;

  -- ── Construir respuesta JSON ───────────────────────────────────────────────
  SELECT json_build_object(
    'id',                 m.id,
    'status',             m.status,
    'match_type',         m.match_type,
    'format',             m.format,
    'scheduled_at',       m.scheduled_at,
    'duration_minutes',   m.duration_minutes,
    'location',           m.location,
    'venue_id',           m.venue_id,
    'venue_name',         v.name,
    'venue_address',      v.address,
    'venue_lat',          v.lat,
    'venue_lng',          v.lng,
    'signal_amount',      m.signal_amount,
    'total_cost',         m.total_cost,
    'unique_code',        m.unique_code,
    'started_at',         m.started_at,
    'finished_at',        m.finished_at,
    'checkin_team_a_at',  m.checkin_team_a_at,
    'checkin_team_b_at',  m.checkin_team_b_at,
    'team_a', json_build_object(
      'id',         ta.id,
      'name',       ta.name,
      'shield_url', ta.shield_url,
      'elo_rating', ta.elo_rating
    ),
    'team_b', json_build_object(
      'id',         tb.id,
      'name',       tb.name,
      'shield_url', tb.shield_url,
      'elo_rating', tb.elo_rating
    ),
    'my_team_id', p_team_id,
    -- NULL para el invitado: no tiene rol en el club. La UI ya trata `myRole`
    -- nulo como "sin permisos de capitanía" (match-permissions.ts).
    'my_role', (
      SELECT tm.role
      FROM team_members tm
      JOIN profiles pr ON pr.id = tm.profile_id
      WHERE tm.team_id = p_team_id
        AND pr.auth_user_id = auth.uid()
      LIMIT 1
    ),
    'is_result_loader', (
      EXISTS (
        SELECT 1
        FROM match_participants mp
        JOIN profiles pr ON pr.id = mp.profile_id
        WHERE mp.match_id = m.id
          AND mp.team_id  = p_team_id
          AND mp.is_result_loader = true
          AND pr.auth_user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1
        FROM team_members tm
        JOIN profiles pr ON pr.id = tm.profile_id
        WHERE tm.team_id = p_team_id
          AND pr.auth_user_id = auth.uid()
          AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
      )
    ),
    'active_proposal', (
      SELECT json_build_object(
        'id',               p.id,
        'match_id',         p.match_id,
        'from_team_id',     p.from_team_id,
        'proposed_by_name', pr2.full_name,
        'format',           p.format,
        'match_type',       p.match_type,
        'scheduled_at',     p.scheduled_at,
        'duration_minutes', p.duration_minutes,
        'location',         p.location,
        'venue_id',         p.venue_id,
        'venue_name',       pv.name,
        'venue_address',    pv.address,
        'venue_lat',        pv.lat,
        'venue_lng',        pv.lng,
        'signal_amount',    p.signal_amount,
        'total_cost',       p.total_cost,
        'status',           p.status,
        'created_at',       p.created_at
      )
      FROM match_proposals p
      JOIN profiles pr2 ON pr2.id = p.proposed_by
      LEFT JOIN venues pv ON pv.id = p.venue_id
      WHERE p.match_id = m.id
        AND p.status = 'PENDIENTE'
      ORDER BY p.created_at DESC
      LIMIT 1
    ),
    'my_result', (
      SELECT json_build_object(
        'team_id',       r.team_id,
        'goals_scored',  r.goals_scored,
        'goals_against', r.goals_against,
        'submitted_at',  r.submitted_at,
        'scorers', (
          SELECT COALESCE(json_agg(
            json_build_object(
              'profile_id', sc->>'profile_id',
              'full_name',  sprof.full_name,
              'goals',      (sc->>'goals')::int
            )
          ), '[]'::json)
          FROM jsonb_array_elements(r.scorers) AS sc
          JOIN profiles sprof ON sprof.id = (sc->>'profile_id')::uuid
        ),
        'mvp', CASE WHEN r.mvp_id IS NOT NULL THEN json_build_object(
          'id',         mvppr.id,
          'full_name',  mvppr.full_name,
          'username',   mvppr.username,
          'avatar_url', mvppr.avatar_url
        ) ELSE NULL END
      )
      FROM match_results r
      LEFT JOIN profiles mvppr ON mvppr.id = r.mvp_id
      WHERE r.match_id = m.id
        AND r.team_id = p_team_id
      LIMIT 1
    ),
    'opponent_result', (
      SELECT json_build_object(
        'team_id',       r.team_id,
        'goals_scored',  r.goals_scored,
        'goals_against', r.goals_against,
        'submitted_at',  r.submitted_at,
        'scorers', (
          SELECT COALESCE(json_agg(
            json_build_object(
              'profile_id', sc->>'profile_id',
              'full_name',  sprof.full_name,
              'goals',      (sc->>'goals')::int
            )
          ), '[]'::json)
          FROM jsonb_array_elements(r.scorers) AS sc
          JOIN profiles sprof ON sprof.id = (sc->>'profile_id')::uuid
        ),
        'mvp', CASE WHEN r.mvp_id IS NOT NULL THEN json_build_object(
          'id',         mvppr.id,
          'full_name',  mvppr.full_name,
          'username',   mvppr.username,
          'avatar_url', mvppr.avatar_url
        ) ELSE NULL END
      )
      FROM match_results r
      LEFT JOIN profiles mvppr ON mvppr.id = r.mvp_id
      WHERE r.match_id = m.id
        AND r.team_id <> p_team_id
      LIMIT 1
    ),
    'participants', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'profile_id',       mp.profile_id,
          'full_name',        ppr.full_name,
          'username',         ppr.username,
          'avatar_url',       ppr.avatar_url,
          'team_id',          mp.team_id,
          'is_guest',         mp.is_guest,
          'did_checkin',      mp.did_checkin,
          'checkin_at',       mp.checkin_at,
          'is_result_loader', mp.is_result_loader
        )
      ), '[]'::json)
      FROM match_participants mp
      JOIN profiles ppr ON ppr.id = mp.profile_id
      WHERE mp.match_id = m.id
    ),
    -- ── (bug 4) ──────────────────────────────────────────────────────────────
    -- Plantel de MI equipo. `participants` sigue siendo la convocatoria (la
    -- usa CheckinSection para contar presentes); `team_roster` es la fuente
    -- correcta para el selector de goleadores/MVP.
    'team_roster', v_roster,
    'conversation_id', (
      SELECT c.id
      FROM conversations c
      WHERE c.match_id = m.id
        AND c.type = 'MATCH_CHAT'
      LIMIT 1
    ),
    'wo_claim', (
      SELECT json_build_object(
        'id',               wc.id,
        'claiming_team_id', wc.claiming_team_id,
        'reason',           wc.reason,
        'photo_url',        wc.photo_url,
        'status',           wc.status,
        'admin_notes',      wc.admin_notes,
        'created_at',       wc.created_at,
        -- D-61 (20260929140000): versión del acusado y plazo.
        'response_deadline',  wc.response_deadline,
        'response_text',      wc.response_text,
        'response_photo_url', wc.response_photo_url,
        'responded_at',       wc.responded_at
      )
      FROM wo_claims wc
      WHERE wc.match_id = m.id
      LIMIT 1
    ),
    'cancellation_request', (
      SELECT json_build_object(
        'id',                   cr.id,
        'requested_by_team_id', cr.requested_by_team_id,
        'reason',               cr.reason,
        'notes',                cr.notes,
        'status',               cr.status,
        'created_at',           cr.created_at,
        'is_late',              cr.is_late
      )
      FROM cancellation_requests cr
      WHERE cr.match_id = m.id
        AND cr.status = 'PENDIENTE'
      ORDER BY cr.created_at DESC
      LIMIT 1
    )
  )
  INTO v_result
  FROM matches m
  JOIN teams ta ON ta.id = m.team_a_id
  JOIN teams tb ON tb.id = m.team_b_id
  LEFT JOIN venues v ON v.id = m.venue_id
  WHERE m.id = p_match_id
    AND (m.team_a_id = p_team_id OR m.team_b_id = p_team_id);

  RETURN v_result;
END;
$function$;
