-- ============================================================
-- «Buscan rival» y «Rival sugerido» (P3-19, D-76)
-- 2026-11-25
-- ------------------------------------------------------------
-- Por qué: de los 24 desafíos a equipos activos, 8 fueron al #1 del ranking y
-- 10 a alguno de los tres primeros; el #1 rechazó 6. El que se registra
-- desafía al primero de la tabla, que no necesariamente está para jugar.
--
-- Dos piezas, las dos de solo lectura para el desafío (send_challenge no
-- cambia):
--
--   1. rival_posts: una vidriera. Un equipo publica que está para jugar
--      (formato, días y franjas o una fecha, zona, cancha opcional, mensaje).
--      Aparece en Mercado › Buscan rival; tocar la tarjeta abre la ficha del
--      equipo y el desafío sale por el camino de siempre. Una publicación por
--      equipo (PK team_id): publicar de nuevo la reemplaza. Vence sola a los 7
--      días (o al terminar el día de la fecha elegida): la vigencia se resuelve
--      al leer, sin cron.
--
--   2. get_suggested_rivals: a quién proponerle partido según cercanía de las
--      canchas, nivel, actividad, plantel y formato, con un extra grande para
--      los que publicaron en «Buscan rival» y un descuento para los que acumulan
--      desafíos sin responder (así el #1 deja de llevárselos todos).
--
-- Aviso: al publicar (no al editar una publicación vigente), los capitanes y
-- subcapitanes de equipos cercanos con formato compatible reciben un ANUNCIO
-- con kind 'rival_post' y url a la ficha del equipo. Topes en app_settings.
--
-- Las zonas no tienen coordenadas: el centro de una zona es el promedio de sus
-- canchas activas (mismo criterio que lib/market-distance.ts).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. TABLAS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rival_posts (
  team_id          uuid        PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  format           public.team_format NOT NULL,
  -- 0 = domingo … 6 = sábado (Date.getDay() de JS).
  days             smallint[]  NOT NULL DEFAULT '{}',
  time_slots       text[]      NOT NULL DEFAULT '{}',
  match_date       date,
  match_time       time,
  zone             text        NOT NULL,
  venue_id         uuid        REFERENCES public.venues(id) ON DELETE SET NULL,
  match_type_pref  text        NOT NULL DEFAULT 'AMBOS',
  note             text,
  published_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  closed_at        timestamptz,
  alerted_count    integer     NOT NULL DEFAULT 0,
  CONSTRAINT rival_posts_days_check
    CHECK (days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  CONSTRAINT rival_posts_slots_check
    CHECK (time_slots <@ ARRAY['MANANA','TARDE','NOCHE']::text[]),
  CONSTRAINT rival_posts_when_check
    CHECK (cardinality(days) > 0 OR match_date IS NOT NULL),
  CONSTRAINT rival_posts_match_type_check
    CHECK (match_type_pref IN ('AMISTOSO', 'RANKING', 'AMBOS')),
  CONSTRAINT rival_posts_note_check
    CHECK (note IS NULL OR char_length(note) <= 140)
);

COMMENT ON TABLE public.rival_posts IS
  '«Buscan rival» (P3-19, D-76): un equipo publica que está para jugar. Una fila por equipo; vigente si closed_at es null y expires_at > now(). Se escribe y se lee sólo por RPC (publish_rival_post, close_rival_post, get_rival_posts).';

CREATE INDEX IF NOT EXISTS rival_posts_active_idx
  ON public.rival_posts (expires_at) WHERE closed_at IS NULL;

ALTER TABLE public.rival_posts ENABLE ROW LEVEL SECURITY;
-- Sin policies: todo pasa por funciones SECURITY DEFINER.
REVOKE ALL ON public.rival_posts FROM anon, authenticated;

DROP TRIGGER IF EXISTS rival_posts_clean_text ON public.rival_posts;
CREATE TRIGGER rival_posts_clean_text
  BEFORE INSERT OR UPDATE OF note ON public.rival_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clean_text('note');


-- Registro de avisos mandados, para los topes (1 por equipo cada 24 h; el
-- mismo equipo no le vuelve a avisar al mismo rival en 7 días).
CREATE TABLE IF NOT EXISTS public.rival_post_alerts (
  recipient_team_id uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  source_team_id    uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  sent_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rival_post_alerts IS
  'Avisos de «Buscan rival» mandados (alert_rival_post, 20261125120000). Sirve para los topes por equipo.';

CREATE INDEX IF NOT EXISTS rival_post_alerts_recipient_idx
  ON public.rival_post_alerts (recipient_team_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS rival_post_alerts_source_idx
  ON public.rival_post_alerts (source_team_id, recipient_team_id, sent_at DESC);

ALTER TABLE public.rival_post_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rival_post_alerts FROM anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 2. PARÁMETROS
-- ════════════════════════════════════════════════════════════

INSERT INTO public.app_settings (key, value, description) VALUES
  ('rival_alert_radius_km', 25,
   'Buscan rival: radio en km de los equipos que reciben el aviso de una publicación nueva.'),
  ('rival_alert_max_teams', 30,
   'Buscan rival: máximo de equipos avisados por publicación (los más cercanos).'),
  ('rival_suggest_max_km', 60,
   'Rival sugerido: distancia máxima en km entre los centros de las zonas.'),
  ('rival_post_days', 7,
   'Buscan rival: días que queda visible una publicación sin fecha.')
ON CONFLICT (key) DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- 3. HELPERS
-- ════════════════════════════════════════════════════════════

-- Distancia en km entre dos puntos (haversine). Null si falta alguno.
CREATE OR REPLACE FUNCTION public.geo_distance_km(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL THEN NULL
    ELSE (6371 * acos(least(1.0, greatest(-1.0,
      cos(radians(p_lat1)) * cos(radians(p_lat2)) * cos(radians(p_lng2) - radians(p_lng1)) +
      sin(radians(p_lat1)) * sin(radians(p_lat2))
    ))))::numeric
  END
$$;

-- Centro de cada zona: promedio de sus canchas activas con coordenadas.
CREATE OR REPLACE FUNCTION public.zone_centroids()
RETURNS TABLE (zone_name text, lat numeric, lng numeric)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT z.name, avg(v.lat), avg(v.lng)
    FROM public.zones z
    JOIN public.venues v ON v.zone_id = z.id
   WHERE v.is_active AND v.lat IS NOT NULL AND v.lng IS NOT NULL
   GROUP BY z.name
$$;

-- 0 = mismo formato, 1 = vecino (F5↔F6, F7↔F8…), más = lejos.
CREATE OR REPLACE FUNCTION public.format_gap(p_a public.team_format, p_b public.team_format)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT abs(
    array_position(enum_range(NULL::public.team_format), p_a) -
    array_position(enum_range(NULL::public.team_format), p_b)
  )
$$;

-- «sáb y dom · tarde», «lun, mié y vie · noche», «sáb 05/12 · 18:00».
CREATE OR REPLACE FUNCTION public.rival_post_when(
  p_days smallint[], p_slots text[], p_match_date date, p_match_time time
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_names  text[] := ARRAY['dom','lun','mar','mié','jue','vie','sáb'];
  v_parts  text[];
  v_slots  text[];
  v_when   text;
  v_d      smallint;
BEGIN
  IF p_match_date IS NOT NULL THEN
    v_when := v_names[extract(dow FROM p_match_date)::int + 1] || ' ' || to_char(p_match_date, 'DD/MM');
    IF p_match_time IS NOT NULL THEN
      RETURN v_when || ' · ' || to_char(p_match_time, 'HH24:MI');
    END IF;
  ELSE
    IF cardinality(p_days) = 7 THEN
      v_when := 'todos los días';
    ELSE
      -- Lunes primero, domingo al final.
      FOREACH v_d IN ARRAY ARRAY[1,2,3,4,5,6,0]::smallint[] LOOP
        IF v_d = ANY (p_days) THEN
          v_parts := v_parts || v_names[v_d + 1];
        END IF;
      END LOOP;
      v_when := CASE
        WHEN cardinality(v_parts) = 1 THEN v_parts[1]
        ELSE array_to_string(v_parts[1:cardinality(v_parts) - 1], ', ') || ' y ' || v_parts[cardinality(v_parts)]
      END;
    END IF;
  END IF;

  IF cardinality(p_slots) BETWEEN 1 AND 2 THEN
    SELECT array_agg(CASE s WHEN 'MANANA' THEN 'mañana' WHEN 'TARDE' THEN 'tarde' ELSE 'noche' END
                     ORDER BY array_position(ARRAY['MANANA','TARDE','NOCHE'], s))
      INTO v_slots
      FROM unnest(p_slots) s;
    RETURN v_when || ' · ' || array_to_string(v_slots, ' y ');
  END IF;

  RETURN v_when;
END;
$$;

REVOKE ALL ON FUNCTION public.geo_distance_km(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.zone_centroids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.format_gap(public.team_format, public.team_format) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rival_post_when(smallint[], text[], date, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.geo_distance_km(numeric, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zone_centroids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.format_gap(public.team_format, public.team_format) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rival_post_when(smallint[], text[], date, time) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 4. AVISO A EQUIPOS CERCANOS
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.alert_rival_post(p_team_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_post    rival_posts%rowtype;
  v_name    text;
  v_cat     team_category;
  v_lat     numeric;
  v_lng     numeric;
  v_radius  numeric := coalesce((SELECT value FROM app_settings WHERE key = 'rival_alert_radius_km'), 25);
  v_max     integer := coalesce((SELECT value FROM app_settings WHERE key = 'rival_alert_max_teams'), 30)::integer;
  v_when    text;
  v_teams   integer := 0;
  v_row     record;
BEGIN
  SELECT * INTO v_post FROM rival_posts WHERE team_id = p_team_id;
  IF NOT FOUND OR v_post.closed_at IS NOT NULL OR v_post.expires_at <= now() THEN
    RETURN 0;
  END IF;

  SELECT name, category INTO v_name, v_cat FROM teams WHERE id = p_team_id;

  -- Origen: la cancha elegida o, si no hay, el centro de la zona.
  SELECT lat, lng INTO v_lat, v_lng FROM venues WHERE id = v_post.venue_id AND lat IS NOT NULL;
  IF v_lat IS NULL THEN
    SELECT lat, lng INTO v_lat, v_lng FROM zone_centroids() WHERE zone_name = v_post.zone;
  END IF;
  IF v_lat IS NULL THEN
    RETURN 0;
  END IF;

  v_when := replace(v_post.format::text, 'FUTBOL_', 'F') || ' · ' ||
            rival_post_when(v_post.days, v_post.time_slots, v_post.match_date, v_post.match_time);

  FOR v_row IN
    SELECT t.id AS team_id,
           geo_distance_km(v_lat, v_lng, zc.lat, zc.lng) AS km
      FROM teams t
      JOIN zone_centroids() zc ON zc.zone_name = t.zone
     WHERE t.is_active
       AND t.id <> p_team_id
       AND t.category = v_cat
       AND format_gap(t.preferred_format, v_post.format) <= 1
       AND geo_distance_km(v_lat, v_lng, zc.lat, zc.lng) <= v_radius
       -- Nadie juega contra un equipo en el que también está.
       AND NOT EXISTS (
         SELECT 1 FROM team_members a JOIN team_members b ON b.profile_id = a.profile_id
          WHERE a.team_id = t.id AND b.team_id = p_team_id)
       -- Tope: 1 aviso de «Buscan rival» por equipo cada 24 h.
       AND NOT EXISTS (
         SELECT 1 FROM rival_post_alerts ra
          WHERE ra.recipient_team_id = t.id AND ra.sent_at > now() - interval '24 hours')
       -- El mismo equipo no le vuelve a avisar al mismo rival en 7 días.
       AND NOT EXISTS (
         SELECT 1 FROM rival_post_alerts ra
          WHERE ra.recipient_team_id = t.id AND ra.source_team_id = p_team_id
            AND ra.sent_at > now() - interval '7 days')
     ORDER BY 2, t.id
     LIMIT v_max
  LOOP
    INSERT INTO notifications (profile_id, type, title, body, data)
    SELECT tm.profile_id,
           'ANUNCIO',
           v_name || ' busca rival cerca tuyo',
           v_when || ' · ' ||
             CASE WHEN v_row.km < 1 THEN 'a menos de 1 km' ELSE 'a ' || round(v_row.km)::text || ' km' END ||
             '. Mirá su ficha y desafialos.',
           jsonb_build_object(
             'kind', 'rival_post',
             'teamId', p_team_id,
             'viewerTeamId', v_row.team_id,
             'url', 'tornear://team-stats?teamId=' || p_team_id || '&viewerTeamId=' || v_row.team_id
           )
      FROM team_members tm
     WHERE tm.team_id = v_row.team_id
       AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks ub
          WHERE (ub.blocker_profile_id = tm.profile_id AND ub.blocked_profile_id = v_post.created_by)
             OR (ub.blocker_profile_id = v_post.created_by AND ub.blocked_profile_id = tm.profile_id));

    IF FOUND THEN
      INSERT INTO rival_post_alerts (recipient_team_id, source_team_id) VALUES (v_row.team_id, p_team_id);
      v_teams := v_teams + 1;
    END IF;
  END LOOP;

  RETURN v_teams;
END;
$$;

COMMENT ON FUNCTION public.alert_rival_post(uuid) IS
  'Avisa (ANUNCIO kind rival_post + push) a capitanes y subcapitanes de equipos activos de la misma categoría a rival_alert_radius_km o menos y de formato igual o vecino. Topes: rival_alert_max_teams por publicación, 1 aviso por equipo cada 24 h, 7 días entre avisos del mismo equipo al mismo rival. Devuelve cuántos equipos avisó.';

REVOKE ALL ON FUNCTION public.alert_rival_post(uuid) FROM PUBLIC, anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 5. PUBLICAR Y CERRAR
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.publish_rival_post(
  p_team_id         uuid,
  p_format          public.team_format,
  p_zone            text,
  p_days            smallint[] DEFAULT '{}',
  p_time_slots      text[]     DEFAULT '{}',
  p_match_date      date       DEFAULT NULL,
  p_match_time      time       DEFAULT NULL,
  p_venue_id        uuid       DEFAULT NULL,
  p_match_type_pref text       DEFAULT 'AMBOS',
  p_note            text       DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_active     boolean;
  v_today      date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_days_live  integer := coalesce((SELECT value FROM app_settings WHERE key = 'rival_post_days'), 7)::integer;
  v_expires    timestamptz;
  v_was_live   boolean;
  v_note       text := nullif(btrim(p_note), '');
  v_alerted    integer := 0;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: iniciá sesión';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
     WHERE team_id = p_team_id AND profile_id = v_profile_id AND role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán puede publicar que el equipo busca rival';
  END IF;

  SELECT is_active INTO v_active FROM teams WHERE id = p_team_id;
  IF NOT coalesce(v_active, false) THEN
    RAISE EXCEPTION 'TEAM_INACTIVE: tu equipo está dado de baja. Reactivalo desde la gestión del equipo.';
  END IF;

  IF p_format IS NULL THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: elegí el formato';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM zones WHERE name = p_zone AND is_active) THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: elegí una zona de la lista';
  END IF;

  IF p_venue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM venues WHERE id = p_venue_id AND is_active) THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: esa cancha ya no está disponible';
  END IF;

  IF coalesce(cardinality(p_days), 0) = 0 AND p_match_date IS NULL THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: elegí al menos un día o una fecha';
  END IF;

  IF p_match_date IS NOT NULL AND (p_match_date < v_today OR p_match_date > v_today + 30) THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: la fecha tiene que ser entre hoy y dentro de 30 días';
  END IF;

  IF p_match_date IS NOT NULL AND p_match_date = v_today AND p_match_time IS NOT NULL
     AND p_match_time <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::time THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: ese horario ya pasó';
  END IF;

  IF NOT (coalesce(p_days, '{}') <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
     OR NOT (coalesce(p_time_slots, '{}') <@ ARRAY['MANANA','TARDE','NOCHE']::text[]) THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: días o franjas inválidos';
  END IF;

  IF coalesce(p_match_type_pref, 'AMBOS') NOT IN ('AMISTOSO', 'RANKING', 'AMBOS') THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: tipo de partido inválido';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 140 THEN
    RAISE EXCEPTION 'RIVAL_POST_INVALID: el mensaje puede tener hasta 140 caracteres';
  END IF;

  -- Con fecha: hasta el final de ese día. Sin fecha: rival_post_days días.
  v_expires := CASE
    WHEN p_match_date IS NOT NULL
      THEN least(now() + make_interval(days => v_days_live),
                 ((p_match_date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'))
    ELSE now() + make_interval(days => v_days_live)
  END;

  SELECT closed_at IS NULL AND expires_at > now() INTO v_was_live
    FROM rival_posts WHERE team_id = p_team_id;

  INSERT INTO rival_posts AS rp (
    team_id, created_by, format, days, time_slots, match_date, match_time,
    zone, venue_id, match_type_pref, note, published_at, expires_at, closed_at, alerted_count
  ) VALUES (
    p_team_id, v_profile_id, p_format, coalesce(p_days, '{}'), coalesce(p_time_slots, '{}'),
    p_match_date, CASE WHEN p_match_date IS NULL THEN NULL ELSE p_match_time END,
    p_zone, p_venue_id, coalesce(p_match_type_pref, 'AMBOS'), v_note, now(), v_expires, NULL, 0
  )
  ON CONFLICT (team_id) DO UPDATE SET
    created_by      = EXCLUDED.created_by,
    format          = EXCLUDED.format,
    days            = EXCLUDED.days,
    time_slots      = EXCLUDED.time_slots,
    match_date      = EXCLUDED.match_date,
    match_time      = EXCLUDED.match_time,
    zone            = EXCLUDED.zone,
    venue_id        = EXCLUDED.venue_id,
    match_type_pref = EXCLUDED.match_type_pref,
    note            = EXCLUDED.note,
    -- Editar una publicación vigente no la sube ni reinicia el contador.
    published_at    = CASE WHEN coalesce(v_was_live, false) THEN rp.published_at ELSE now() END,
    expires_at      = EXCLUDED.expires_at,
    closed_at       = NULL,
    alerted_count   = CASE WHEN coalesce(v_was_live, false) THEN rp.alerted_count ELSE 0 END;

  -- Avisar sólo al publicar (o republicar una vencida o cerrada), no al editar.
  IF NOT coalesce(v_was_live, false) THEN
    v_alerted := alert_rival_post(p_team_id);
    UPDATE rival_posts SET alerted_count = v_alerted WHERE team_id = p_team_id;
  END IF;

  RETURN json_build_object(
    'expiresAt', v_expires,
    'alerted',   v_alerted,
    'isNew',     NOT coalesce(v_was_live, false)
  );
END;
$$;

COMMENT ON FUNCTION public.publish_rival_post(uuid, public.team_format, text, smallint[], text[], date, time, uuid, text, text) IS
  'Publica (o edita) que el equipo busca rival. Capitán o subcapitán. Al publicar avisa a los equipos cercanos (alert_rival_post); al editar una publicación vigente, no.';

REVOKE ALL ON FUNCTION public.publish_rival_post(uuid, public.team_format, text, smallint[], text[], date, time, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_rival_post(uuid, public.team_format, text, smallint[], text[], date, time, uuid, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.close_rival_post(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
     WHERE tm.team_id = p_team_id AND p.auth_user_id = auth.uid()
       AND tm.role IN ('CAPITAN', 'SUBCAPITAN')
  ) THEN
    RAISE EXCEPTION 'No autorizado: solo el capitán o subcapitán puede sacar la publicación';
  END IF;

  UPDATE rival_posts SET closed_at = now() WHERE team_id = p_team_id AND closed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.close_rival_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_rival_post(uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 6. LECTURA: LA VIDRIERA
-- ════════════════════════════════════════════════════════════
-- p_viewer_team_id: el equipo activo de quien mira (para la distancia y para
-- marcar la propia). Sin equipo, la distancia sale de la zona del perfil.
-- p_only_team_id: la publicación de un solo equipo (ficha del equipo).

CREATE OR REPLACE FUNCTION public.get_rival_posts(
  p_viewer_team_id uuid DEFAULT NULL,
  p_zone           text DEFAULT NULL,
  p_format         public.team_format DEFAULT NULL,
  p_only_team_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  team_id          uuid,
  team_name        text,
  shield_url       text,
  team_zone        text,
  category         public.team_category,
  format           public.team_format,
  days             smallint[],
  time_slots       text[],
  match_date       date,
  match_time       time,
  when_label       text,
  post_zone        text,
  venue_id         uuid,
  venue_name       text,
  match_type_pref  text,
  note             text,
  published_at     timestamptz,
  expires_at       timestamptz,
  alerted_count    integer,
  distance_km      numeric,
  elo_rating       integer,
  matches_played   integer,
  member_count     integer,
  is_own           boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_origin     text;
  v_category   team_category;
  v_lat        numeric;
  v_lng        numeric;
BEGIN
  SELECT p.id, p.zone INTO v_profile_id, v_origin FROM profiles p WHERE p.auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: iniciá sesión';
  END IF;

  -- Con equipo, la vidriera muestra su categoría (igual que el aviso y los
  -- sugeridos). Sin equipo, todas.
  IF p_viewer_team_id IS NOT NULL THEN
    SELECT t.zone, t.category INTO v_origin, v_category FROM teams t WHERE t.id = p_viewer_team_id;
  END IF;
  SELECT zc.lat, zc.lng INTO v_lat, v_lng FROM zone_centroids() zc WHERE zc.zone_name = v_origin;

  RETURN QUERY
  WITH zc AS (SELECT * FROM zone_centroids())
  SELECT
    rp.team_id, t.name, t.shield_url, t.zone, t.category, rp.format,
    rp.days, rp.time_slots, rp.match_date, rp.match_time,
    rival_post_when(rp.days, rp.time_slots, rp.match_date, rp.match_time),
    rp.zone, rp.venue_id, v.name, rp.match_type_pref, rp.note,
    rp.published_at, rp.expires_at, rp.alerted_count,
    round(geo_distance_km(v_lat, v_lng, coalesce(v.lat, pz.lat), coalesce(v.lng, pz.lng)), 1),
    coalesce(tr.elo_score, t.elo_rating),
    coalesce(tr.matches_played, 0),
    (SELECT count(*)::integer FROM team_members m WHERE m.team_id = rp.team_id),
    (p_viewer_team_id IS NOT NULL AND rp.team_id = p_viewer_team_id)
  FROM rival_posts rp
  JOIN teams t ON t.id = rp.team_id
  LEFT JOIN venues v ON v.id = rp.venue_id
  LEFT JOIN zc pz ON pz.zone_name = rp.zone
  LEFT JOIN team_rankings tr ON tr.team_id = rp.team_id AND tr.format = rp.format
  WHERE rp.closed_at IS NULL
    AND rp.expires_at > now()
    AND t.is_active
    AND (p_only_team_id IS NULL OR rp.team_id = p_only_team_id)
    AND (p_only_team_id IS NOT NULL OR v_category IS NULL
         OR t.category = v_category OR rp.team_id = p_viewer_team_id)
    AND (p_zone IS NULL OR rp.zone = p_zone)
    AND (p_format IS NULL OR rp.format = p_format)
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks ub
       WHERE ub.blocker_profile_id = v_profile_id AND ub.blocked_profile_id = rp.created_by)
  ORDER BY
    (p_viewer_team_id IS NOT NULL AND rp.team_id = p_viewer_team_id) DESC,
    geo_distance_km(v_lat, v_lng, coalesce(v.lat, pz.lat), coalesce(v.lng, pz.lng)) ASC NULLS LAST,
    rp.published_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rival_posts(uuid, text, public.team_format, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rival_posts(uuid, text, public.team_format, uuid) TO authenticated;


-- Los ids de los equipos con publicación vigente (punto verde del ranking).
CREATE OR REPLACE FUNCTION public.get_rival_post_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT rp.team_id FROM rival_posts rp JOIN teams t ON t.id = rp.team_id
   WHERE rp.closed_at IS NULL AND rp.expires_at > now() AND t.is_active
$$;

REVOKE ALL ON FUNCTION public.get_rival_post_team_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rival_post_team_ids() TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 7. RIVAL SUGERIDO
-- ════════════════════════════════════════════════════════════
-- Puntaje (0 a ~1,5):
--   0,35 cercanía      exp(-km / 15) entre centros de zona (misma zona = 1)
--   0,25 actividad     último uso de la app de algún integrante: ≤2 días 1,
--                      ≤7 días 0,8, ≤30 días 0,4, nada 0,1
--   0,20 nivel         1 - |ΔELO| / 400
--   0,10 plantel       llega al mínimo para confirmar 1, 2 o más 0,4, solo 0
--   0,10 formato       igual 1, vecino 0,5, otro 0,1
--   +0,50              tiene «Buscan rival» vigente
--   -0,30              3 o más desafíos recibidos en 60 días sin aceptar ninguno
-- Fuera: el propio, inactivos, otra categoría, más de rival_suggest_max_km,
-- con jugadores en común, con desafío o partido abierto entre los dos, o con
-- un bloqueo entre integrantes.

CREATE OR REPLACE FUNCTION public.get_suggested_rivals(p_team_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE (
  team_id         uuid,
  team_name       text,
  shield_url      text,
  zone            text,
  preferred_format public.team_format,
  elo_rating      integer,
  matches_played  integer,
  member_count    integer,
  distance_km     numeric,
  has_rival_post  boolean,
  rival_post_when text,
  last_active_at  timestamptz,
  score           numeric,
  reasons         text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_me       teams%rowtype;
  v_lat      numeric;
  v_lng      numeric;
  v_max_km   numeric := coalesce((SELECT value FROM app_settings WHERE key = 'rival_suggest_max_km'), 60);
  v_slots    integer := greatest(coalesce((SELECT value FROM app_settings WHERE key = 'confirm_guest_slots'), 1)::integer, 0);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm JOIN profiles p ON p.id = tm.profile_id
     WHERE tm.team_id = p_team_id AND p.auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'No autorizado: no sos parte de este equipo';
  END IF;

  SELECT * INTO v_me FROM teams WHERE id = p_team_id;
  SELECT zc.lat, zc.lng INTO v_lat, v_lng FROM zone_centroids() zc WHERE zc.zone_name = v_me.zone;

  RETURN QUERY
  WITH zc AS (SELECT * FROM zone_centroids()),
  base AS (
    SELECT t.*,
           CASE WHEN t.zone = v_me.zone THEN 0::numeric
                ELSE geo_distance_km(v_lat, v_lng, z.lat, z.lng) END AS km
      FROM teams t
      LEFT JOIN zc z ON z.zone_name = t.zone
     WHERE t.is_active
       AND t.id <> p_team_id
       AND t.category = v_me.category
  ),
  cand AS (
    SELECT b.*,
           (SELECT count(*)::integer FROM team_members m WHERE m.team_id = b.id) AS members,
           (SELECT max(l.created_at) FROM app_logs l
              JOIN team_members m ON m.team_id = b.id
              JOIN profiles p ON p.id = m.profile_id
             WHERE l.user_id = p.auth_user_id
               AND l.created_at > now() - interval '30 days') AS last_log,
           (SELECT max(m.joined_at) FROM team_members m WHERE m.team_id = b.id) AS last_join,
           (SELECT max(c.created_at) FROM challenges c WHERE c.from_team_id = b.id) AS last_challenge,
           rp.team_id IS NOT NULL AS has_post,
           CASE WHEN rp.team_id IS NOT NULL
                THEN rival_post_when(rp.days, rp.time_slots, rp.match_date, rp.match_time) END AS post_when,
           (SELECT count(*) FROM challenges c
             WHERE c.to_team_id = b.id AND c.created_at > now() - interval '60 days') AS recv,
           (SELECT count(*) FROM challenges c
             WHERE c.to_team_id = b.id AND c.created_at > now() - interval '60 days'
               AND c.status = 'ACEPTADA') AS recv_ok,
           fr.min_players_to_start AS min_players
      FROM base b
      LEFT JOIN rival_posts rp ON rp.team_id = b.id AND rp.closed_at IS NULL AND rp.expires_at > now()
      LEFT JOIN format_rules fr ON fr.format = b.preferred_format
     WHERE (b.km IS NOT NULL AND b.km <= v_max_km)
       AND NOT EXISTS (
         SELECT 1 FROM team_members a JOIN team_members x ON x.profile_id = a.profile_id
          WHERE a.team_id = b.id AND x.team_id = p_team_id)
       AND NOT EXISTS (
         SELECT 1 FROM challenges c
          WHERE c.status = 'ENVIADA'
            AND ((c.from_team_id = b.id AND c.to_team_id = p_team_id)
              OR (c.from_team_id = p_team_id AND c.to_team_id = b.id)))
       AND NOT EXISTS (
         SELECT 1 FROM matches mt
          WHERE mt.status IN ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA')
            AND ((mt.team_a_id = b.id AND mt.team_b_id = p_team_id)
              OR (mt.team_a_id = p_team_id AND mt.team_b_id = b.id)))
       AND NOT EXISTS (
         SELECT 1 FROM team_members a
           JOIN team_members x ON x.team_id = p_team_id
           JOIN user_blocks ub
             ON (ub.blocker_profile_id = a.profile_id AND ub.blocked_profile_id = x.profile_id)
             OR (ub.blocker_profile_id = x.profile_id AND ub.blocked_profile_id = a.profile_id)
          WHERE a.team_id = b.id)
  ),
  scored AS (
    SELECT c.*,
           greatest(c.last_log, c.last_join, c.last_challenge) AS last_active,
           abs(coalesce(c.elo_rating, 1000) - coalesce(v_me.elo_rating, 1000)) AS elo_gap,
           format_gap(c.preferred_format, v_me.preferred_format) AS fgap,
           (c.members >= greatest(coalesce(c.min_players, 1) - v_slots, 1)) AS squad_ok
      FROM cand c
  ),
  final AS (
    SELECT s.*,
      round((
          0.35 * exp(-s.km / 15.0)
        + 0.25 * CASE
                   WHEN s.last_active > now() - interval '2 days'  THEN 1.0
                   WHEN s.last_active > now() - interval '7 days'  THEN 0.8
                   WHEN s.last_active > now() - interval '30 days' THEN 0.4
                   ELSE 0.1 END
        + 0.20 * greatest(0, 1 - s.elo_gap / 400.0)
        + 0.10 * CASE WHEN s.squad_ok THEN 1.0 WHEN s.members >= 2 THEN 0.4 ELSE 0 END
        + 0.10 * CASE s.fgap WHEN 0 THEN 1.0 WHEN 1 THEN 0.5 ELSE 0.1 END
        + CASE WHEN s.has_post THEN 0.5 ELSE 0 END
        - CASE WHEN s.recv >= 3 AND s.recv_ok = 0 THEN 0.3 ELSE 0 END
      )::numeric, 4) AS pts
    FROM scored s
  )
  SELECT f.id, f.name, f.shield_url, f.zone, f.preferred_format, f.elo_rating, f.matches_played,
         f.members, round(f.km, 1), f.has_post, f.post_when, f.last_active, f.pts,
         array_remove(ARRAY[
           CASE WHEN f.has_post THEN 'Busca rival · ' || f.post_when END,
           CASE WHEN f.elo_gap <= 100 THEN 'Nivel parecido' END,
           CASE WHEN f.last_active > now() - interval '2 days' THEN 'Activo hoy'
                WHEN f.last_active > now() - interval '7 days' THEN 'Activo esta semana' END,
           CASE WHEN f.squad_ok THEN 'Plantel completo' END,
           CASE WHEN f.fgap = 0 THEN 'Mismo formato' END
         ], NULL)
    FROM final f
   ORDER BY f.pts DESC, f.km ASC, f.id
   LIMIT least(greatest(coalesce(p_limit, 10), 1), 30);
END;
$$;

COMMENT ON FUNCTION public.get_suggested_rivals(uuid, integer) IS
  'Rival sugerido (P3-19, D-76): equipos para desafiar ordenados por cercanía, actividad, nivel, plantel y formato, con extra para «Buscan rival» y descuento para quien acumula desafíos sin aceptar. Devuelve los motivos para mostrarlos como etiquetas. Sólo para integrantes del equipo.';

REVOKE ALL ON FUNCTION public.get_suggested_rivals(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_suggested_rivals(uuid, integer) TO authenticated;
