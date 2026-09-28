-- ============================================================
-- Snapshot de posiciones al cerrar temporada — 2026-09-14
-- ------------------------------------------------------------
-- `transition_season` (20260811131000) pone en cero `teams.season_*` y
-- `team_rankings.wins/draws/losses` SIN guardar nada antes. En cuanto un admin
-- abre la temporada siguiente se pierde la posición final de cada equipo, y la
-- posición POR ZONA no se puede reconstruir ni a mano: `teams.zone` es texto
-- libre, sin historial, y el capitán la cambia cuando quiere.
--
-- Esta migración escribe `season_standings` DENTRO de `transition_season`, en
-- la misma transacción y antes del reset: si el snapshot falla, el reset no
-- ocurre. La tabla la comparten dos features del backlog —el ranking de
-- barrios (historial de zona por equipo y temporada) y el Wrapped (posición
-- final)—, así que se diseña una sola vez.
--
-- ─── Qué posición se congela ─────────────────────────────────────────────────
-- La que VE el usuario: la de `get_team_ranking`, que alimenta la pestaña
-- Ranking y el Top 3 de la Home. NO la de `v_team_ranking`: esa vista no la lee
-- la app ni ninguna función, ordena por el ELO global y su `zone_rank` no tiene
-- desempate (con todos los equipos en 1000, el orden sería arbitrario).
--   · ELO POR FORMATO (`team_rankings.elo_score`). Sin formato, cada equipo
--     compite con su MEJOR formato — decisión deliberada de 20260811160000.
--   · Desempate por nombre, igual que la función. Se agrega `team_id` al final
--     sólo para que dos homónimos empatados no queden en orden arbitrario.
--   · Elegibles: `is_active`, igual que la función. `in_ranking` no filtra (la
--     función tampoco, y está siempre en true desde 20260330182020); se congela
--     igual. Los no elegibles tienen fila con todos sus hechos y posición NULL.
--   · Toda posición por zona particiona también por `category`.
--   · Sólo posición por ELO, sin posición por puntos. El ELO es la regla de
--     posición vigente; una tabla por puntos inventaría un ranking que el
--     producto nunca mostró. La posición por puntos se deduce entera de
--     columnas congeladas, con un desempate que no depende del nombre, así que
--     no hay nada que proteger. El ranking de barrios necesita los PUNTOS, y
--     esos sí quedan guardados. La posición por ELO se guarda porque desempata
--     por `team_name`, que la moderación puede cambiar después.
--
-- ─── Grano ───────────────────────────────────────────────────────────────────
--   season_standings          (season_id, team_id)          hechos globales +
--                                                            posición con el mejor formato
--   season_standings_formats  (season_id, team_id, format)  hechos y posición de
--                                                            cada formato
-- Descartado: una sola tabla con una fila global `format IS NULL`. Un
-- `SUM(points)` por zona que olvide filtrar esa fila cuenta doble, y es una
-- trampa que se dispara sola en una feature que todavía no existe. La hija no
-- copia nombre ni escudo: la moderación sólo tiene que tocar el padre.
--
-- ─── Final por construcción ──────────────────────────────────────────────────
-- Una fila de `season_standings` nunca hay que recalcularla. Con los bloqueos
-- de abajo tomados, todo resultado cae en uno de dos casos:
--   · se confirmó ANTES → está en el snapshot, que se lee con el bloqueo ya
--     tomado;
--   · se aplica DESPUÉS del commit → es un partido que estaba abierto, (d) ya
--     lo pasó a la temporada nueva y suma en los contadores nuevos.
-- Un partido terminal no se resuelve dos veces (guarda de `resolve_match_elo`).
-- Esta propiedad es la que justifica que la tabla sea inmutable.
--
-- Sin el bloqueo NO era cierto: `apply_match_outcome` escribe `teams` y
-- `team_rankings` sin tocar `seasons`, así que el `FOR UPDATE` de la temporada
-- no lo frena. Un resultado confirmado entre el INSERT del snapshot y el UPDATE
-- del reset quedaba fuera del snapshot y el reset lo ponía en cero. (Juntar
-- INSERT y UPDATE en una sola sentencia con una CTE tampoco alcanza: el UPDATE
-- vuelve a leer la fila que actualizó la otra transacción y la pone en cero.)
--
-- ─── Orden y modo de los bloqueos ────────────────────────────────────────────
--   1. matches             EXCLUSIVE
--   2. teams               SHARE ROW EXCLUSIVE
--   3. team_rankings       SHARE ROW EXCLUSIVE
-- ORDEN: es el que siguen todas las resoluciones. `resolve_match`,
-- `admin_resolve_dispute` y `sweep_disputed_matches` bloquean la fila de
-- `matches` (FOR UPDATE), la actualizan, y los triggers escriben `teams`
-- (`recalculate_team_fps`, que corre antes que `resolve_match_elo` porque los
-- triggers AFTER se disparan por orden alfabético) y después `team_rankings`
-- (`ensure_team_ranking_row`, `apply_match_outcome`). Crear un equipo o cambiar
-- `preferred_format` escribe `teams` y después `team_rankings`. Tomarlos en otro
-- orden arma un ciclo de deadlock con esas escrituras.
-- MODO DE matches: EXCLUSIVE, no SHARE ROW EXCLUSIVE. Las resoluciones toman un
-- FOR UPDATE de fila antes del UPDATE, y ese ROW SHARE convive con SHARE ROW
-- EXCLUSIVE: la resolución quedaría esperando `teams` con su fila tomada y la
-- transición esperando esa fila en el paso (d). EXCLUSIVE choca con ROW SHARE:
-- la transición espera a que termine la resolución en curso, y una resolución
-- nueva espera en su FOR UPDATE.
-- MODO DE teams Y team_rankings: SHARE ROW EXCLUSIVE alcanza (ninguna función
-- bloquea filas de esas tablas) y, a diferencia de EXCLUSIVE, no bloquea los
-- chequeos de FK de los INSERT hijos (team_members, match_proposals…), que si
-- no podrían armar un ciclo con el bloqueo de matches.
-- COSTO: mientras dura la transición no se escriben partidos ni equipos. Son
-- milisegundos, la transición es manual y ocurre dos veces por año.
-- RIESGO RESIDUAL, aceptado: borrar un equipo toma `teams` y después chequea la
-- FK de `matches` (ROW SHARE), en el orden inverso. Si coincide en el mismo
-- instante con una transición, Postgres aborta una de las dos y cualquiera se
-- puede reintentar. `lock_timeout` hace que la transición falle rápido y con un
-- mensaje claro en vez de quedarse colgada.
--
-- ─── Inmutabilidad, partida en dos ───────────────────────────────────────────
--   · HECHOS COMPETITIVOS (posiciones, puntos, ELO, G/E/P, goles, zona,
--     categoría, flags): no se editan nunca.
--   · CACHÉ DE PRESENTACIÓN (`team_name`, `shield_url`): la corrige
--     `admin_remove_reported_content` (D-40).
-- Cómo se sostiene:
--   · `team_id` SIN FK a `teams`, mismo molde que `team_stints`: un equipo
--     disuelto no evapora su historia y el teardown de la demo no choca.
--   · FK a `seasons` con ON DELETE RESTRICT.
--   · RLS con una sola policy de SELECT y ACL explícito = el de `team_stints`
--     en producción (`rxtm`: SELECT, REFERENCES, TRIGGER, MAINTAIN). Explícito
--     porque los default privileges de Supabase difieren entre entornos: en el
--     stack local `team_stints` además tiene TRUNCATE.
--   · SIN trigger que bloquee UPDATE/DELETE: bloquearía también al owner, y la
--     RPC de moderación necesita corregir la caché.
--   · Escribe `transition_season` (SECURITY DEFINER, owner). Límite asumido: el
--     owner puede editar por SQL. Lo que se impide es la edición por REST.
--
-- ─── Moderación ──────────────────────────────────────────────────────────────
-- La rama TEAM de `admin_remove_reported_content` sólo actualizaba `teams`. El
-- nombre denunciado seguía legible en `team_stints` para cualquier autenticado
-- por REST, y reaparecía si el equipo se disolvía. `season_standings` tendría el
-- mismo hueco. Ahora la RPC neutraliza las tres tablas, filtrando por
-- `reported_entity_id`: funciona aunque el equipo ya no exista. Sin backfill:
-- al 14/09 no hay nombres denunciados en `team_stints`.
--
-- Fuera de alcance: los índices duplicados de `seasons.is_active` y los grants
-- de `elo_history`.
--
-- Idempotente y forward-only.
-- ============================================================


-- ─── Snapshot global por equipo ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.season_standings (
  season_id        uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  team_id          uuid NOT NULL,                  -- sin FK, deliberado (ver header)
  team_name        text NOT NULL,                  -- caché de presentación: la corrige la moderación
  shield_url       text,                           -- ídem team_name
  zone             text NOT NULL,                  -- teams.zone tal cual, exista o no en el catálogo
  zone_id          uuid,                           -- zones.id por nombre exacto; NULL = zona huérfana
  category         public.team_category NOT NULL,
  preferred_format public.team_format NOT NULL,
  in_ranking       boolean NOT NULL,
  is_active        boolean NOT NULL,
  elo_rating       integer NOT NULL,               -- ELO global (continuo), NO el del ranking
  fair_play_score  numeric(5,2) NOT NULL,
  wins             integer NOT NULL,
  draws            integer NOT NULL,
  losses           integer NOT NULL,
  goals_for        integer NOT NULL,
  goals_against    integer NOT NULL,
  points           integer NOT NULL,               -- wins * 3 + draws, con la fórmula vigente al cierre
  best_format      public.team_format,             -- formato con el que rankea; NULL = sin filas en team_rankings
  rank_category    integer,                        -- posición en get_team_ranking(NULL, category, NULL)
  rank_zone        integer,                        -- posición en get_team_ranking(zone, category, NULL)
  captured_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, team_id),
  CHECK ((rank_category IS NULL) = (rank_zone IS NULL)),
  CHECK (rank_category IS NULL OR (rank_category >= 1 AND rank_zone >= 1))
);

COMMENT ON TABLE public.season_standings IS
  'Posición final de cada equipo al cerrar una temporada. La escribe transition_season antes del reset, en la misma transacción. Hechos competitivos inmutables; team_name/shield_url son caché que corrige la moderación. Posiciones con la semántica de get_team_ranking. Ver *_season_standings_snapshot.';
COMMENT ON COLUMN public.season_standings.team_id IS
  'Sin FK a propósito: la historia sobrevive a la disolución del club (molde team_stints).';
COMMENT ON COLUMN public.season_standings.team_name IS
  'Caché de presentación desnormalizada. Única parte de la fila que se reescribe: admin_remove_reported_content la neutraliza (D-40).';
COMMENT ON COLUMN public.season_standings.rank_category IS
  'Posición en get_team_ranking(NULL, category, NULL): mejor formato, ELO por formato, desempate por nombre. NULL = no elegible (is_active = false o sin filas en team_rankings).';
COMMENT ON COLUMN public.season_standings.rank_zone IS
  'Posición en get_team_ranking(zone, category, NULL). Particiona por zona Y categoría.';

CREATE INDEX IF NOT EXISTS season_standings_team_id_idx ON public.season_standings (team_id);


-- ─── Snapshot por formato ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.season_standings_formats (
  season_id     uuid NOT NULL,
  team_id       uuid NOT NULL,
  format        public.team_format NOT NULL,
  elo_score     integer NOT NULL,
  wins          integer NOT NULL,
  draws         integer NOT NULL,
  losses        integer NOT NULL,
  points        integer NOT NULL,
  rank_category integer,                           -- posición en get_team_ranking(NULL, category, format)
  rank_zone     integer,                           -- posición en get_team_ranking(zone, category, format)
  PRIMARY KEY (season_id, team_id, format),
  FOREIGN KEY (season_id, team_id)
    REFERENCES public.season_standings (season_id, team_id) ON DELETE RESTRICT,
  CHECK ((rank_category IS NULL) = (rank_zone IS NULL)),
  CHECK (rank_category IS NULL OR (rank_category >= 1 AND rank_zone >= 1))
);

COMMENT ON TABLE public.season_standings_formats IS
  'Hechos y posición de cada formato al cerrar una temporada (una fila por fila de team_rankings). Sin goles: team_rankings no los lleva. Sin nombre ni escudo: la presentación vive en season_standings.';


-- ─── RLS y privilegios: el molde de team_stints ──────────────────────────────
ALTER TABLE public.season_standings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_standings_formats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS season_standings_select_authenticated ON public.season_standings;
CREATE POLICY season_standings_select_authenticated ON public.season_standings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS season_standings_formats_select_authenticated ON public.season_standings_formats;
CREATE POLICY season_standings_formats_select_authenticated ON public.season_standings_formats
  FOR SELECT TO authenticated USING (true);

-- ACL final = el de team_stints en producción (`rxtm`). REVOKE ALL primero para
-- no heredar los default privileges del entorno (ver header).
REVOKE ALL ON public.season_standings, public.season_standings_formats FROM anon, authenticated;
GRANT SELECT, REFERENCES, TRIGGER, MAINTAIN
  ON public.season_standings, public.season_standings_formats TO anon, authenticated;


-- ─── transition_season: bloqueos + snapshot antes del reset ─────────────────
CREATE OR REPLACE FUNCTION public.transition_season(
  p_new_name  text,
  p_starts_at date,
  p_ends_at   date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET lock_timeout = '3s'
AS $$
declare
  v_admin  uuid;
  v_old    seasons%rowtype;
  v_new_id uuid;
  v_slug   text;
begin
  -- Autorización: admin derivado de auth.uid() (patrón resolve_wo_claim).
  select id into v_admin
  from profiles where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'No autorizado: se requiere rol de administrador';
  end if;

  -- Validaciones de entrada.
  if p_new_name is null or btrim(p_new_name) = '' then
    raise exception 'El nombre de la temporada es obligatorio';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at then
    raise exception 'Rango de fechas inválido (inicio: %, fin: %)', p_starts_at, p_ends_at;
  end if;

  -- Temporada activa, con lock: dos transiciones concurrentes se serializan
  -- y la segunda falla en la guarda de estado (además del índice único).
  select * into v_old from seasons where is_active = true limit 1 for update;
  if v_old.id is null then
    raise exception 'No hay temporada activa para cerrar';
  end if;

  v_slug := btrim(regexp_replace(lower(btrim(p_new_name)), '[^a-z0-9]+', '-', 'g'), '-');
  if exists (select 1 from seasons where slug = v_slug) then
    raise exception 'Ya existe una temporada con slug "%"', v_slug;
  end if;

  -- 0) Bloqueos, antes de leer nada para el snapshot. Orden y modos
  --    justificados en el header de *_season_standings_snapshot: matches primero y en
  --    EXCLUSIVE, porque las resoluciones bloquean su fila con FOR UPDATE antes
  --    de escribir teams y team_rankings.
  --
  --    El sub-bloque existe sólo para traducir el `lock_timeout` de la función
  --    a un error legible. Los locks tomados adentro siguen tomados al salir.
  begin
    lock table matches in exclusive mode;
    lock table teams, team_rankings in share row exclusive mode;
  exception
    when lock_not_available then
      raise exception 'No se pudo cerrar la temporada: hay partidos o equipos actualizándose en este momento. Reintentá en unos segundos.'
        using errcode = 'lock_not_available';
  end;

  -- 1) Snapshot de la temporada que cierra, antes de cualquier escritura.
  --    Sin WHERE a propósito: una fila por equipo aunque no haya jugado nada.
  --    Las posiciones replican get_team_ranking (ver header): mejor formato por
  --    DISTINCT ON con desempate por formato, orden por elo_score y nombre,
  --    elegibles = is_active. Los no elegibles caen en su propia partición y el
  --    CASE les deja la posición en NULL.
  insert into season_standings (
    season_id, team_id, team_name, shield_url, zone, zone_id, category,
    preferred_format, in_ranking, is_active, elo_rating, fair_play_score,
    wins, draws, losses, goals_for, goals_against, points,
    best_format, rank_category, rank_zone
  )
  with best as (
    select distinct on (tr.team_id) tr.team_id, tr.format, tr.elo_score
    from team_rankings tr
    order by tr.team_id, tr.elo_score desc, tr.format
  )
  select
    v_old.id, t.id, t.name, t.shield_url, t.zone, z.id, t.category,
    t.preferred_format, t.in_ranking, t.is_active, t.elo_rating, t.fair_play_score,
    t.season_wins, t.season_draws, t.season_losses,
    t.season_goals_for, t.season_goals_against,
    t.season_wins * 3 + t.season_draws,
    b.format,
    case when t.is_active and b.team_id is not null then row_number() over w_category end,
    case when t.is_active and b.team_id is not null then row_number() over w_zone end
  from teams t
  left join best  b on b.team_id = t.id
  left join zones z on z.name = t.zone          -- zones.name es UNIQUE: no duplica filas
  window
    w_category as (partition by (t.is_active and b.team_id is not null), t.category
                   order by b.elo_score desc, t.name, t.id),
    w_zone     as (partition by (t.is_active and b.team_id is not null), t.zone, t.category
                   order by b.elo_score desc, t.name, t.id);

  insert into season_standings_formats (
    season_id, team_id, format, elo_score, wins, draws, losses, points,
    rank_category, rank_zone
  )
  select
    v_old.id, tr.team_id, tr.format, tr.elo_score, tr.wins, tr.draws, tr.losses,
    tr.wins * 3 + tr.draws,
    case when t.is_active then row_number() over w_category end,
    case when t.is_active then row_number() over w_zone end
  from team_rankings tr
  join teams t on t.id = tr.team_id
  window
    w_category as (partition by t.is_active, tr.format, t.category
                   order by tr.elo_score desc, t.name, t.id),
    w_zone     as (partition by t.is_active, tr.format, t.zone, t.category
                   order by tr.elo_score desc, t.name, t.id);

  -- a) Cerrar la temporada vigente.
  update seasons set is_active = false where id = v_old.id;

  -- b) Crear y activar la nueva.
  insert into seasons (name, slug, starts_at, ends_at, is_active)
  values (btrim(p_new_name), v_slug, p_starts_at, p_ends_at, true)
  returning id into v_new_id;

  -- c) Contadores de temporada a 0. elo_rating y matches_played quedan
  --    INTACTOS por decisión de dominio (Rating continuo entre temporadas).
  --
  --    D3: el WHERE es obligatorio (pg_safeupdate) y además es el predicado
  --    correcto — un equipo con todos los contadores en cero no necesita que lo
  --    reescriban.
  update teams set
    season_wins          = 0,
    season_draws         = 0,
    season_losses        = 0,
    season_goals_for     = 0,
    season_goals_against = 0
  where season_wins          <> 0
     or season_draws         <> 0
     or season_losses        <> 0
     or season_goals_for     <> 0
     or season_goals_against <> 0;

  -- c.2) Ídem para el ranking POR FORMATO. `elo_score` y `matches_played` no
  --      se tocan, por el mismo criterio que en (c).
  update team_rankings set
    wins   = 0,
    draws  = 0,
    losses = 0
  where wins   <> 0
     or draws  <> 0
     or losses <> 0;

  -- d) Partidos abiertos: pasan a la temporada nueva (sus stats caerán en
  --    los contadores nuevos cuando terminen; los terminales no se tocan).
  update matches set season_id = v_new_id
   where status in ('PENDIENTE', 'CONFIRMADO', 'EN_VIVO', 'EN_DISPUTA');

  -- e) Auditoría: notificación a todos los admins.
  insert into notifications (profile_id, type, title, body, data, is_read)
  select
    p.id,
    'TEMPORADA_INICIADA',
    '🏁 Nueva temporada: ' || btrim(p_new_name),
    'Se cerró "' || v_old.name || '" y comenzó "' || btrim(p_new_name)
      || '". Los contadores de temporada fueron reseteados (Rating intacto).',
    jsonb_build_object('season_id', v_new_id, 'previous_season_id', v_old.id, 'executed_by', v_admin),
    false
  from profiles p
  where p.is_admin = true;

  return v_new_id;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_season(text, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transition_season(text, date, date) TO authenticated;

COMMENT ON FUNCTION public.transition_season(text, date, date) IS
  'Cierra la temporada activa y abre la nueva. Orden: validaciones → lock de seasons → locks de matches/teams/team_rankings → snapshot en season_standings(_formats) → reset de contadores → partidos abiertos a la temporada nueva → aviso a admins. Todo en una transacción. Ver *_season_standings_snapshot.';


-- ─── admin_remove_reported_content: la neutralización llega a la historia ────
CREATE OR REPLACE FUNCTION public.admin_remove_reported_content(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_auth_user_id uuid := auth.uid();
  v_report             public.content_reports%ROWTYPE;
  v_action             text;
  v_neutral_name       text;
  v_standings_rows     integer;
  v_stints_rows        integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = v_admin_auth_user_id AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: se requiere is_admin';
  END IF;

  SELECT * INTO v_report FROM public.content_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND: denuncia % no encontrada', p_report_id;
  END IF;

  CASE v_report.reported_entity_type
    WHEN 'MESSAGE' THEN
      DELETE FROM public.messages WHERE id = v_report.reported_entity_id;
      v_action := 'message_deleted';

    WHEN 'MARKET_TEAM_POST' THEN
      UPDATE public.market_team_posts SET is_active = false
      WHERE id = v_report.reported_entity_id;
      v_action := 'team_post_deactivated';

    WHEN 'MARKET_PLAYER_POST' THEN
      UPDATE public.market_player_posts SET is_active = false
      WHERE id = v_report.reported_entity_id;
      v_action := 'player_post_deactivated';

    WHEN 'TEAM' THEN
      -- El nombre nuevo lleva los primeros 8 caracteres del id para que dos
      -- equipos neutralizados no queden indistinguibles en el ranking.
      v_neutral_name := 'Equipo ' || left(replace(v_report.reported_entity_id::text, '-', ''), 8);

      UPDATE public.teams
      SET name = v_neutral_name,
          shield_url = NULL
      WHERE id = v_report.reported_entity_id;

      -- Las copias desnormalizadas (*_season_standings_snapshot). Se filtra por el id de la
      -- denuncia y no por `teams`: si el club ya se disolvió, la historia es
      -- el único lugar donde el nombre sigue publicado. Sólo se toca la caché
      -- de presentación; los hechos competitivos no se reescriben.
      UPDATE public.season_standings
      SET team_name = v_neutral_name,
          shield_url = NULL
      WHERE team_id = v_report.reported_entity_id;
      GET DIAGNOSTICS v_standings_rows = ROW_COUNT;

      UPDATE public.team_stints
      SET team_name = v_neutral_name,
          shield_url = NULL
      WHERE team_id = v_report.reported_entity_id;
      GET DIAGNOSTICS v_stints_rows = ROW_COUNT;

      v_action := 'team_name_and_shield_reset';

    ELSE
      RAISE EXCEPTION
        'NO_CONTENT_TO_REMOVE: una denuncia de tipo % no tiene contenido que eliminar; usá la suspensión de la cuenta',
        v_report.reported_entity_type;
  END CASE;

  UPDATE public.content_reports
  SET status = 'ACTIONED'
  WHERE id = p_report_id;

  -- Auditoría, con el mismo formato que `admin.suspend_user`: quién actuó, qué
  -- hizo y sobre qué. `warn` para que salte en /dashboard/health sin contar
  -- como error. En TEAM se suma cuántas copias históricas se corrigieron.
  INSERT INTO public.app_logs (level, message, details, user_id)
  VALUES (
    'warn',
    'admin.remove_reported_content',
    jsonb_build_object(
      'report_id', p_report_id,
      'entity_type', v_report.reported_entity_type,
      'entity_id', v_report.reported_entity_id,
      'reported_profile_id', v_report.reported_profile_id,
      'action', v_action
    ) || CASE WHEN v_report.reported_entity_type = 'TEAM' THEN
      jsonb_build_object(
        'season_standings_rows', v_standings_rows,
        'team_stints_rows', v_stints_rows
      )
    ELSE '{}'::jsonb END,
    v_admin_auth_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_reported_content(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_remove_reported_content(uuid) IS
  'Elimina el contenido de una denuncia y la marca ACTIONED (App Store 1.2). El significado de «eliminar» depende del tipo — ver el comentario de la migración 20260911170000. En TEAM neutraliza también las copias históricas de season_standings y team_stints (*_season_standings_snapshot). Para USER y MATCH no aplica: ahí la medida es admin_suspend_user.';

COMMENT ON TABLE public.team_stints IS
  'Ledger inmutable de ciclos jugador–equipo (trayectoria estilo Wikipedia). Escriben los triggers de team_members; admin_remove_reported_content sólo reescribe la caché team_name/shield_url. El cliente sólo lee.';


-- ─── v_team_ranking: señalizada ──────────────────────────────────────────────
COMMENT ON VIEW public.v_team_ranking IS
  'DEPRECADA (2026-09-14). No la lee la app ni ninguna función. Su zone_rank ordena por el ELO global y sin desempate, y NO es la posición que ve el usuario: esa sale de get_team_ranking (ELO por formato, mejor formato sin filtro) y es la que congela season_standings. No construir nada nuevo encima.';
