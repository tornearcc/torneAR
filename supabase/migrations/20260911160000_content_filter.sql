-- ============================================================
-- FILTRO DE CONTENIDO OBJETABLE (App Store 1.2)
-- 2026-09-11
-- ------------------------------------------------------------
-- Guideline 1.2 pide «a method for filtering objectionable content». No había
-- ninguno: `sanitizeMarketDescription` sólo recorta espacios. Rechazo del
-- 11/09/2026, submission f80970f0.
--
-- ── Por qué en la base y no en el cliente ───────────────────────────────────
-- Un filtro que vive en la app se saltea con cualquier proxy, y el reviewer lo
-- puede comprobar. Además la lista no se expone: si viajara al cliente, sería
-- el índice de qué escribir para evadirlo.
--
-- ── Alcance honesto de lo que hace ──────────────────────────────────────────
-- Esto ataja el uso liso y llano, incluido el alargado de vocales
-- («putoooo») y, para las entradas marcadas, la separación con signos
-- («h.i.j.o d.e p.u.t.a»). NO pretende atajar a alguien decidido a evadirlo con
-- sustituciones creativas: contra eso están la denuncia y el bloqueo, que son
-- las otras dos precauciones que pide la misma guideline. Un filtro que intenta
-- atajar todo termina rechazando texto legítimo, que en una app de fútbol
-- argentino es un problema real y frecuente.
--
-- ── Nada de `unaccent` ──────────────────────────────────────────────────────
-- La extensión no está instalada en el proyecto y agregarla obligaría a
-- habilitarla en cada entorno. El plegado de acentos se hace con `translate`,
-- que cubre el alfabeto español y es IMMUTABLE sin depender de nada externo.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. LISTA
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.banned_words (
  -- Ya normalizada: minúsculas, sin acentos y sin repeticiones largas. El
  -- CHECK la acota a letras y dígitos, lo que además la hace segura de
  -- interpolar dentro del regex de `contains_banned_word` — sin esto, una
  -- entrada con metacaracteres rompería el filtro entero o lo volvería
  -- impredecible.
  word            text PRIMARY KEY CHECK (word ~ '^[a-z0-9]{3,40}$'),
  /*
   * `true` sólo para expresiones largas e inequívocas.
   *
   * La comparación condensada borra todo lo que no sea letra o dígito antes de
   * buscar, así que atrapa «p.u.t.a» pero también cruza fronteras de palabra:
   * con una entrada corta como `puto`, «cómputo» daría positivo. Por eso el
   * default es `false` y sólo se activa donde la secuencia es tan larga que no
   * puede aparecer por accidente.
   */
  match_condensed boolean NOT NULL DEFAULT false,
  /** Para qué está en la lista. Lo lee quien la mantenga, no el código. */
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

-- Sin grants para el cliente: la lista no se publica. La mantiene el equipo
-- desde el dashboard de Supabase (service_role) o, más adelante, desde una
-- pantalla de admin con una policy `is_admin` dedicada.
REVOKE ALL ON public.banned_words FROM anon, authenticated;

COMMENT ON TABLE public.banned_words IS
  'Lista de bloqueo de contenido objetable (App Store 1.2). Sin grants ni policies: no se expone al cliente, porque sería el índice de qué escribir para evadirla. Se mantiene desde el dashboard.';


-- ════════════════════════════════════════════════════════════
-- 2. NORMALIZACIÓN Y BÚSQUEDA
-- ════════════════════════════════════════════════════════════

-- Minúsculas, sin acentos y con las repeticiones largas colapsadas.
--
-- El colapso es de 3 o más caracteres iguales a UNO solo, no de 2: bajar los
-- dobles rompería palabras legítimas del español —«perro» quedaría «pero»— y
-- generaría falsos positivos donde hoy no hay ninguno. Con 3+ alcanza para
-- «putooooo» y no toca nada válido.
CREATE OR REPLACE FUNCTION public.normalize_for_filter(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    translate(
      lower(coalesce(p_text, '')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc'
    ),
    '(.)\1{2,}', '\1', 'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.contains_banned_word(p_text text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH normalized AS (
    SELECT public.normalize_for_filter(p_text) AS txt
  ),
  condensed AS (
    SELECT regexp_replace((SELECT txt FROM normalized), '[^a-z0-9]', '', 'g') AS txt
  )
  SELECT EXISTS (
    SELECT 1 FROM public.banned_words b
    WHERE
      -- Palabra completa: `\m` y `\M` son los límites de palabra de Postgres.
      -- Sin ellos, «asado» daría positivo por contener una entrada corta.
      (SELECT txt FROM normalized) ~ ('\m' || b.word || '\M')
      OR (
        b.match_condensed
        AND (SELECT txt FROM condensed) LIKE '%' || b.word || '%'
      )
  );
$$;

-- SECURITY DEFINER porque `banned_words` no tiene grants: los triggers corren
-- con el rol del usuario que escribe y sin esto no podrían leer la lista.
REVOKE EXECUTE ON FUNCTION public.contains_banned_word(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contains_banned_word(text) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 3. TRIGGER GENÉRICO
-- ════════════════════════════════════════════════════════════
-- Una sola función para todas las tablas, con las columnas a revisar pasadas
-- como argumentos del trigger. La alternativa —una función por tabla— serían
-- seis copias del mismo RAISE que se desincronizan en cuanto cambie el
-- mensaje de error, que es justo lo que el cliente mapea.
CREATE OR REPLACE FUNCTION public.enforce_clean_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_column text;
  v_value  text;
BEGIN
  FOREACH v_column IN ARRAY TG_ARGV LOOP
    EXECUTE format('SELECT ($1).%I::text', v_column) INTO v_value USING NEW;

    IF public.contains_banned_word(v_value) THEN
      -- El prefijo es contrato con el cliente: `getGenericSupabaseErrorMessage`
      -- (lib/auth-error-messages.ts) lo busca para mostrar un mensaje
      -- entendible en vez del error crudo de Postgres.
      RAISE EXCEPTION 'CONTENT_BLOCKED: el texto contiene lenguaje que no permitimos';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_clean_text() FROM PUBLIC, anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 4. DÓNDE SE APLICA
-- ════════════════════════════════════════════════════════════
-- Las cinco superficies de contenido libre. `UPDATE OF <columna>` y no UPDATE a
-- secas para no re-evaluar el filtro en cada cambio de estado de la fila.

DROP TRIGGER IF EXISTS messages_clean_text ON public.messages;
CREATE TRIGGER messages_clean_text
  BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clean_text('content');

DROP TRIGGER IF EXISTS market_team_posts_clean_text ON public.market_team_posts;
CREATE TRIGGER market_team_posts_clean_text
  BEFORE INSERT OR UPDATE OF description ON public.market_team_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clean_text('description');

DROP TRIGGER IF EXISTS market_player_posts_clean_text ON public.market_player_posts;
CREATE TRIGGER market_player_posts_clean_text
  BEFORE INSERT OR UPDATE OF description ON public.market_player_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clean_text('description');

DROP TRIGGER IF EXISTS teams_clean_text ON public.teams;
CREATE TRIGGER teams_clean_text
  BEFORE INSERT OR UPDATE OF name ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clean_text('name');

DROP TRIGGER IF EXISTS profiles_clean_text ON public.profiles;
CREATE TRIGGER profiles_clean_text
  BEFORE INSERT OR UPDATE OF full_name, username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_clean_text('full_name', 'username');


-- ════════════════════════════════════════════════════════════
-- 5. SEMILLA
-- ════════════════════════════════════════════════════════════
-- ⚠️ DELIBERADAMENTE CORTA. Qué se considera objetable es una decisión de
-- producto, no técnica, y una lista larga y torpe rompe el uso normal sin
-- aportar nada frente a Apple.
--
-- El criterio de esta semilla es incluir sólo lo inequívoco. Quedan AFUERA a
-- propósito términos que en el Río de la Plata son de uso corriente y no
-- constituyen agresión («boludo»), y palabras con significado legítimo que
-- darían falsos positivos: «concha» es apellido y topónimo, «pajero» es un
-- modelo de camioneta, «negro» es un apodo habitual y un color de camiseta.
--
-- Para ampliarla, desde el SQL Editor del dashboard:
--   INSERT INTO public.banned_words (word, match_condensed, note)
--   VALUES ('<ya normalizada>', <true sólo si es larga e inequívoca>, '<motivo>');
-- La forma normalizada se obtiene con: SELECT public.normalize_for_filter('...');
--
-- Lo que aparezca repetido en la cola de moderación es la fuente natural para
-- decidir qué agregar.
INSERT INTO public.banned_words (word, match_condensed, note) VALUES
  ('pelotudo',          false, 'Insulto directo'),
  ('pelotuda',          false, 'Insulto directo'),
  ('pelotudos',         false, 'Insulto directo'),
  ('forrodemierda',     true,  'Insulto compuesto'),
  ('hijodeputa',        true,  'Insulto compuesto'),
  ('hijadeputa',        true,  'Insulto compuesto'),
  ('hijosdeputa',       true,  'Insulto compuesto'),
  ('conchadetumadre',   true,  'Insulto compuesto'),
  ('conchatumadre',     true,  'Insulto compuesto'),
  ('andateacagar',      true,  'Agresión'),
  ('tevoyamatar',       true,  'Amenaza explícita'),
  ('tevoyacagarapalos', true,  'Amenaza explícita'),
  ('putodemierda',      true,  'Insulto discriminatorio'),
  ('negrodemierda',     true,  'Insulto discriminatorio'),
  ('muertodehambre',    true,  'Insulto discriminatorio'),
  ('muertosdehambre',   true,  'Insulto discriminatorio')
ON CONFLICT (word) DO NOTHING;
