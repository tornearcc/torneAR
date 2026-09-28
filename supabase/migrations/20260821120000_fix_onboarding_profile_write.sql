-- ============================================================
-- Fix 42501 al guardar el perfil en el onboarding — 2026-08-21
-- ------------------------------------------------------------
-- SÍNTOMA (QA del MVP): `onboarding.onSubmit` falla con
--   42501 permission denied for table profiles
--   HINT: Grant the required privileges to the current role with:
--         GRANT SELECT ON public.profiles TO authenticated;
-- y el usuario queda con sesión pero sin fila en `profiles`, dando vueltas
-- en /onboarding para siempre.
--
-- ── El diagnóstico NO es el obvio ───────────────────────────────────────
-- El pedido inicial fue `GRANT INSERT, UPDATE ON public.profiles TO
-- authenticated`. Verificado contra la base de producción antes de escribir
-- una línea: `authenticated` YA TIENE esos dos privilegios.
--
--   · INSERT  → a nivel TABLA (20260719120500_fix_core_tables_grants)
--   · UPDATE  → por COLUMNA, con id/created_at/is_admin fuera
--               (20260719130000_restore_hotfix_column_lockdown)
--
-- El privilegio que falta es SELECT a nivel TABLA, y falta A PROPÓSITO:
-- 20260819100000_privacy_and_age_compliance lo revocó y lo re-otorgó
-- columna por columna para esconder `date_of_birth` y `expo_push_token`.
--
-- ¿Por qué un guardado necesita SELECT? Porque
-- `supabase.from('profiles').upsert(...)` no genera un INSERT: genera
--
--     INSERT INTO profiles (...) VALUES (...)
--       ON CONFLICT (id) DO UPDATE SET ...
--
-- y Postgres exige SELECT sobre la TABLA para cualquier
-- `ON CONFLICT ... DO UPDATE` (necesita poder leer la fila en conflicto).
-- Reproducido en una transacción revertida contra producción, con el
-- usuario real que quedó trabado en el onboarding:
--
--     SET LOCAL ROLE authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"<uid sin perfil>", ...}';
--     INSERT INTO profiles (...) VALUES (...);                  -- OK
--     INSERT INTO profiles (...) ON CONFLICT (id) DO UPDATE ...; -- 42501
--
-- El INSERT pelado pasa. El upsert no. La RLS no tiene nada que ver:
-- `profiles_insert_own` existe y su WITH CHECK es
-- `(SELECT auth.uid()) = auth_user_id`, que la fila cumple.
--
-- ── Por qué NO se arregla con el GRANT pedido ───────────────────────────
--   · `GRANT INSERT`  → no-op, ya está.
--   · `GRANT UPDATE`  → a nivel TABLA sería la MISMA regresión de seguridad
--     que 20260719130000 vino a cerrar: devuelve a cualquier usuario la
--     capacidad de escribir su propio `is_admin`. Verificado explotable en
--     su momento ("UPDATE 1 en local", 19-jul).
--   · `GRANT SELECT`  → el único que apagaría el 42501, y es exactamente lo
--     que 20260819100000 revocó: reabre `date_of_birth` (fecha exacta) y
--     `expo_push_token` de CUALQUIER perfil vía API directa.
--
-- Ninguna de las tres sirve. La salida es no hacer el upsert desde el
-- cliente: se escribe con una RPC SECURITY DEFINER, exactamente el mismo
-- patrón que `get_own_profile()` — la contraparte de LECTURA que la propia
-- 20260819100000 creó por este mismo motivo. Esta es la de ESCRITURA.
--
-- BONUS que arregla de paso: el `ON CONFLICT (id)` del upsert era el
-- arbitrador equivocado. `id` es `uuid_generate_v4()` y el cliente nunca lo
-- manda, así que jamás podía haber conflicto por `id`: un re-envío del
-- onboarding sobre un perfil ya existente no actualizaba nada, chocaba
-- contra `profiles_auth_user_id_key` y salía por 23505. El arbitrador
-- correcto es `auth_user_id`, y es el que usa la RPC.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Grants explícitos (idempotentes) — se re-afirma lo que YA debe estar
-- ════════════════════════════════════════════════════════════
-- No cambia nada en una base sana; existe para que el estado quede escrito
-- en una migración en vez de depender de la arqueología de tres archivos, y
-- para que una base recreada desde cero converja al mismo ACL.
--
-- ⚠️ El UPDATE va por COLUMNA, NUNCA a nivel tabla. `id`, `created_at`,
-- `is_admin` y `referred_by` quedan fuera a propósito:
--   · is_admin   → escalada de privilegios directa.
--   · referred_by→ se escribe sólo vía `set_referral()` (SECURITY DEFINER),
--                  que valida que el referente exista y no sea uno mismo.
--   · id/created_at → inmutables por diseño.
--
-- ⚠️ NO se toca el SELECT. El lockdown por columna de 20260819100000 queda
-- intacto: `date_of_birth` y `expo_push_token` siguen sin ser legibles.
GRANT INSERT ON public.profiles TO authenticated;

GRANT UPDATE (
  auth_user_id,
  full_name,
  username,
  zone,
  preferred_position,
  date_of_birth,
  gender,
  strong_foot,
  favorite_team,
  avatar_url,
  expo_push_token,
  updated_at
) ON public.profiles TO authenticated;

-- `anon` conserva INSERT/DELETE de tabla heredados de 20260719120500. Hoy no
-- son explotables (la RLS los frena: `auth.uid()` es NULL sin sesión), pero
-- son privilegios que nadie usa y que sólo esperan a una policy mal escrita.
-- Mismo criterio de "defensa en profundidad" que 20260820194846.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;


-- ════════════════════════════════════════════════════════════
-- 2. La policy de INSERT — se re-afirma, no se cambia
-- ════════════════════════════════════════════════════════════
-- Ya existía (20260714144056_rls_performance_optimization, A10) y su
-- WITH CHECK es correcto: un usuario sólo puede insertar SU propia fila.
-- Se re-declara idempotente porque es la garantía de la que depende que la
-- RPC de abajo no necesite validar nada extra del lado del cliente.
--
-- `(SELECT auth.uid())` y no `auth.uid()` a secas: es el envoltorio que
-- 20260714144056 aplicó a TODAS las policies para que el planner lo evalúe
-- una sola vez por query (InitPlan) en vez de una vez por fila.
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = auth_user_id);

-- Idem para UPDATE: `USING` sin `WITH CHECK` deja que la fila migre a otro
-- dueño (Postgres usa USING como WITH CHECK sólo por defecto cuando NO hay
-- ninguno declarado; declararlo explícito documenta la intención y sobrevive
-- a que alguien agregue un WITH CHECK parcial en el futuro).
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = auth_user_id)
  WITH CHECK ((SELECT auth.uid()) = auth_user_id);


-- ════════════════════════════════════════════════════════════
-- 3. save_own_profile — la escritura del onboarding y del profile-edit
-- ════════════════════════════════════════════════════════════
-- Contraparte de escritura de `get_own_profile()`. SECURITY DEFINER: corre
-- con los privilegios del owner, así que el `ON CONFLICT DO UPDATE` tiene el
-- SELECT que `authenticated` no tiene — sin devolverle ese SELECT a nadie.
--
-- Superficie de ataque: NULA respecto de la tabla. No hay ningún parámetro
-- que pueda apuntar a otro perfil (`auth_user_id` sale de `auth.uid()`, no
-- de un argumento) y las columnas sensibles ni figuran en el INSERT ni en el
-- SET — `is_admin`, `id`, `created_at` y `referred_by` son intocables desde
-- acá, igual que con los grants por columna.
--
-- Los triggers SIGUEN corriendo (un SECURITY DEFINER no los saltea), así que
-- `trg_profiles_minimum_age_insert/update` -> `enforce_minimum_signup_age()`
-- sigue siendo la última palabra sobre la mayoría de edad. Y los UNIQUE
-- siguen levantando 23505 con el nombre de la constraint en el mensaje, que
-- es lo que `onboarding.onSubmit` matchea para mandar al usuario de vuelta
-- al paso 1 cuando el username está tomado.
CREATE OR REPLACE FUNCTION public.save_own_profile(
  p_full_name          text,
  p_username           text,
  p_zone               text,
  p_preferred_position public.player_position,
  p_date_of_birth      date,
  p_gender             text,
  p_strong_foot        text,
  p_favorite_team      text DEFAULT NULL,
  p_expo_push_token    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  -- Un SECURITY DEFINER sin este chequeo es una puerta abierta: sin sesión,
  -- `auth.uid()` es NULL y el INSERT fallaría recién por el NOT NULL, con un
  -- error que no dice nada. 42501 es el código correcto y el que el cliente
  -- ya sabe traducir (`getGenericSupabaseErrorMessage`).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'save_own_profile requiere una sesión activa'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles AS p (
    auth_user_id,
    full_name,
    username,
    zone,
    preferred_position,
    date_of_birth,
    gender,
    strong_foot,
    favorite_team,
    expo_push_token,
    updated_at
  )
  VALUES (
    v_uid,
    p_full_name,
    p_username,
    p_zone,
    p_preferred_position,
    p_date_of_birth,
    p_gender,
    p_strong_foot,
    NULLIF(btrim(p_favorite_team), ''),
    p_expo_push_token,
    now()
  )
  -- `auth_user_id` y no `id`: es la unique que de verdad identifica "el
  -- perfil de este usuario". Ver el BONUS de la cabecera.
  ON CONFLICT (auth_user_id) DO UPDATE SET
    full_name          = excluded.full_name,
    username           = excluded.username,
    zone               = excluded.zone,
    preferred_position = excluded.preferred_position,
    date_of_birth      = excluded.date_of_birth,
    gender             = excluded.gender,
    strong_foot        = excluded.strong_foot,
    favorite_team      = excluded.favorite_team,
    -- El token de push sólo se pisa si el cliente mandó uno. Un dispositivo
    -- que rechazó el permiso manda NULL, y sin este COALESCE borraría el
    -- token válido que había dejado otro dispositivo del mismo usuario.
    expo_push_token    = COALESCE(excluded.expo_push_token, p.expo_push_token),
    updated_at         = now()
  RETURNING p.id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$;

-- `RETURNS uuid` y no `RETURNS public.profiles` a propósito.
--
-- Una función que devuelve un COMPUESTO (como `get_own_profile()`) produce
-- SIEMPRE exactamente una fila, incluso cuando no hay datos: esa fila es un
-- registro de NULLs, y PostgREST la serializa como un OBJETO
-- `{ "id": null, ... }`, no como `null`. Ése es el origen del 22P02 gemelo de
-- este lote (`tabs.index.loadData` mandando el TEXTO 'null' como uuid). No se
-- toca la firma de `get_own_profile()` —cambiarla a `SETOF` convertiría su
-- respuesta en un array y rompería el tipo `Profile` en decenas de pantallas—
-- pero ninguna función NUEVA repite el patrón.
REVOKE EXECUTE ON FUNCTION public.save_own_profile(
  text, text, text, public.player_position, date, text, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_own_profile(
  text, text, text, public.player_position, date, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.save_own_profile(
  text, text, text, public.player_position, date, text, text, text, text
) IS
  'Crea o actualiza el perfil del caller (upsert por auth_user_id). Contraparte de escritura de get_own_profile(): existe porque un upsert desde el cliente necesita SELECT de TABLA sobre profiles, que 20260819100000 revocó para esconder date_of_birth/expo_push_token. Nunca escribe is_admin, id, created_at ni referred_by, y auth_user_id sale de auth.uid(), nunca de un argumento.';
