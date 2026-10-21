# Programa de embajadores v2 (por persona) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Escrito el 21/10/2026 (tercera versión del mismo día). **Reemplaza** a `2026-10-13-programa-embajadores.md` (modelo por equipo, descartado). Método elegido: **subagentes**. Juani respondió el 21/10 (sin registro externo, sin retenciones, follow obligatorio OK, ranking con montos OK, fin = tope de 100, rechazos OK, privacidad la escribimos nosotros). **No arrancar sin el OK explícito de Agustín.** Explicación para no técnicos: `knowledge/planes/2026-10-21-programa-embajadores-explicado.html` (https://claude.ai/artifact/1hmj71ym1M59FxKXjCTxcb); si cambian reglas, actualizar las dos cosas. Antes de ejecutar: verificar que los nombres de tablas y archivos sigan iguales (`npx supabase migration list --linked`, `git log` de los dos repos) y copiar este archivo a `tornear/docs/superpowers/plans/`.

**Goal:** Pagarle a una persona embajadora $5.000 por cada equipo que traiga a la app y juegue su primer partido válido contra cualquier equipo, más $5.000 extra si el primer partido de su propio equipo es contra un equipo que trajo, más $5.000 al llegar a 5 equipos y otros $5.000 al llegar a 10, hasta 100 equipos traídos pagos, con inscripción y ganancias en la app, bases y ranking en la web, y pagos gestionados desde el dashboard.

**Architecture:** Todo lo que decide quién cobra vive en Postgres: tabla `ambassadors` (inscripción, equipo propio opcional), columna `teams.ambassador_profile_id` (qué equipos trajo cada embajador), tabla `ambassador_rewards` que llena un cron, y RPCs para la app, la web pública y el dashboard. La app suma una pantalla «Embajadores» y un campo en «Crear equipo». La web suma `/embajadores` y una variante del link `/i/<usuario>`. Se prende con un interruptor en `app_settings`.

**Tech Stack:** Supabase (Postgres, pg_cron, pgTAP), Expo React Native + expo-router + vitest (`tornear/`), Next.js App Router (`dashboard/`, repo `tornearcc/torneAR-web`).

**Spec:** propuesta de Agustín y su socio (21/10/2026) y respuestas del mismo día. Explicación para no técnicos: `knowledge/planes/2026-10-21-programa-embajadores-explicado.html`.

## Global Constraints

- **Embajador** = persona con cuenta que se inscribe desde la app. Requisitos: **Instagram obligatorio**, confirmar «Soy mayor de 18», aceptar las bases y seguir a **@tornear.app**. **El equipo propio es opcional**: sólo hace falta para el extra de debut.
- **Seguir a @tornear.app es obligatorio** y lo verifica TorneAR a mano (`ambassadors.follow_verified_at`). Sin verificación no se paga: el premio queda generado pero el dashboard no deja marcarlo `PAGADO`.
- **Equipo traído** = equipo nuevo cuyo capitán carga el **usuario del embajador** en «¿Quién los invitó?» al crearlo, hasta **24 h** después de creado y mientras no tenga partidos `FINALIZADO`; después queda fijo. El embajador **no puede traer un equipo del que es o fue integrante** (`set_team_ambassador` → `noop_ambassador_member`), y un equipo traído no cobra si el embajador está en su plantel al `finished_at`.
- **Premios** (`ambassador_reward_amount = 5000` para los dos tipos):
  - **`TEAM_BROUGHT` — $5.000** cuando un equipo traído juega su **primer partido válido contra cualquier equipo** de la app. Una sola vez por equipo traído.
  - **`DEBUT` — $5.000 extra**, una sola vez por embajador, **sólo si el primer partido válido de su equipo propio** (contado desde que lo eligió y desde el arranque del programa) **es contra un equipo traído por él**. Si ese primer partido es contra cualquier otro equipo, el debut se pierde para siempre. → el caso típico: José arma su equipo, su primer partido es contra un equipo que él trajo y que también debuta = **$10.000**.
  - **`BONUS_5` — $5.000** cuando el embajador llega a **5** `TEAM_BROUGHT` no rechazados, y **`BONUS_10` — $5.000** cuando llega a **10**. Una vez cada uno por embajador (`ambassador_bonus_5_amount = 5000`, `ambassador_bonus_10_amount = 5000`). Si se rechaza un `TEAM_BROUGHT` y el conteo baja del umbral, el bono todavía `PENDIENTE` se rechaza junto (nota «Bajó de N equipos»); uno ya `PAGADO` se mantiene. Si después vuelve a llegar, se genera de nuevo.
- **Tope:** 100 premios `TEAM_BROUGHT` no rechazados (`ambassador_max_paid_teams = 100`); es también el **fin del programa** (sin fecha). Un premio `RECHAZADO` libera su lugar. Los bonos y el debut no ocupan lugar, pero con el tope alcanzado no se generan premios de ningún tipo salvo un `BONUS_*` disparado por el `TEAM_BROUGHT` número 100. Gasto: $500.000 fijos (100 traídos) + debuts + bonos; máximo teórico $1.000.000 (100 embajadores con 1 equipo y debut, sin bonos); bonos como mucho $100.000. Sin tope por embajador.
- **TyC sin cambios** (cambiarlos obliga a todos a re-aceptar). Las **bases** son un documento propio (`/legal/embajadores`) que se acepta al inscribirse. La **Política de Privacidad** suma Instagram, alias/CBU y ranking público opcional, sin re-aceptación (mismo criterio que el 10/10: `needsLegalAcceptance` sólo mira TyC). Textos escritos por nosotros (Juani, 21/10).
- **Partido válido** (para cualquiera de los dos tipos): `status = 'FINALIZADO'`; `checkin_team_a_at` y `checkin_team_b_at` no nulos; `finished_at >= to_timestamp(ambassador_program_start_epoch)`; ningún equipo en `ambassador_exclusions` (demo de Apple, D-52); **los dos equipos** tienen al menos los **titulares del formato del partido** (`matches.format`) como integrantes vigentes al `finished_at` (`team_stints` con `started_at <= finished_at` y `ended_at` nulo o posterior), sin cuentas eliminadas (`username LIKE 'usuario\_eliminado\_%'`). Sin `format` → no válido. Para el `DEBUT`, además, el embajador es integrante de su equipo propio al `finished_at`.
- **Titulares por formato:** `FUTBOL_5` 5 · `FUTBOL_6` 6 · `FUTBOL_7` 7 · `FUTBOL_8` 8 · `FUTBOL_9` 9 · `FUTBOL_11` 11.
- **Un jugador suma para un solo equipo por embajador:** para contar los integrantes de un equipo traído se descartan el propio embajador, los integrantes de su equipo propio al `finished_at` y los ya contados en un `TEAM_BROUGHT` anterior del mismo embajador (`counted_profile_ids`). Si sin ellos no llega al mínimo, ese partido no paga (puede pagar uno posterior).
- **Equipo propio (automático):** al inscribirse, si el embajador está en **un solo** equipo elegible, ese queda como propio sin preguntar. Si no tiene ninguno, el **primero que cree o al que se sume** después queda como propio automáticamente. Sólo si está en **2 o más** equipos elegibles la app le pregunta una vez cuál es (por defecto, aquel donde es `CAPITAN`). Se puede cambiar mientras no tuvo su primer partido válido (`ambassadors.own_team_first_match_id` nulo); con ese partido procesado (haya ganado el debut o no) queda fijo. Elegible = es integrante, no es un equipo traído, no está excluido y no es el propio de otro embajador.
- Interruptor `ambassador_program_enabled` (0/1, arranca en 0). Versión de bases `ambassador_terms_version` (arranca en 1).
- Mayoría de edad: ya la garantiza `enforce_minimum_signup_age`; la casilla es declarativa.
- Datos: nombre (`profiles.full_name`) y mail (`auth.users`) de la cuenta; Instagram obligatorio (`^[a-z0-9._]{1,30}$`, sin `@`, en minúsculas); ranking público opcional (default **no**); **alias o CBU** recién cuando tiene un premio.
- Pago: transferencia o Mercado Pago al alias del embajador dentro de los 7 días de generado el premio y verificado el follow.
- **Sin bonos por partidos jugados** en esta versión (v3).
- La insignia actual «Embajador» (slug `embajador`, 3 jugadores invitados) pasa a llamarse **«Reclutador»**. El slug **no cambia** (lo usan la app 1.0.0 y `constants/podium.ts`).
- Zona pública de la web: no importa `lib/supabase` (regla de `app/(public)/layout.tsx`). El ranking llega por un route handler propio.
- Cron en minuto :00/:15/:30/:45 (test `600-cron-disk-io`).
- Textos en español rioplatense, sin «ELO». Gancho: «¿Querés ganar plata jugando al fútbol?».
- La app sale por **OTA** (sólo JS): `node scripts/check-native-fingerprint.mjs` (iOS y `--platform android`) en verde. No agregar rutas al AASA.

## Review Focus

- El equipo propio de José juega su **primer partido contra un equipo cualquiera** y recién el segundo contra uno que trajo → no hay debut nunca, pero el traído cobra sus $5.000 si era su primer partido. → test T-9 en Task 2.
- El primer partido del equipo propio es contra un equipo traído que **ya había jugado antes** (ya cobró sus $5.000) → se paga sólo el debut ($5.000), no otro `TEAM_BROUGHT`. → test T-8 en Task 2.
- Un equipo traído armado **con los mismos amigos** del equipo propio o de otro traído → los repetidos no cuentan y, si no llega al mínimo, no paga. → test T-11 en Task 2.
- Se llega a los **100 equipos** en medio de una corrida → se crean hasta el 100 exacto, ningún debut después, y queda un aviso en `app_logs`. → test T-12 en Task 2.
- Se intenta marcar **pagado** un premio de un embajador sin follow verificado → el dashboard lo rechaza (`FOLLOW_NOT_VERIFIED`). → test T-16 en Task 3.
- Se rechaza uno de los 5 equipos de un embajador que ya tenía el `BONUS_5` pendiente → el bono se rechaza junto; si suma otro equipo válido, vuelve a generarse una vez. → test T-16 en Task 3.

---

## Mapa de archivos

**Base y app (`tornear/`, repo `tornearcc/torneAR`)**
- Create `supabase/migrations/<ts>_ambassador_program_v2.sql` — settings, `ambassadors`, `ambassador_exclusions`, `teams.ambassador_profile_id`, `ambassador_rewards`, RPCs, cron, canal `embajador` de `/d/`, rename de la insignia.
- Create `supabase/tests/640-ambassador-program.spec.sql` — pgTAP.
- Create `lib/ambassador-data.ts` (+ `.test.ts`), `lib/schemas/ambassador.ts`.
- Create `app/ambassador.tsx`, `components/ambassador/{types.ts, AmbassadorSignupForm.tsx, AmbassadorEarningsHeader.tsx, AmbassadorTeamsList.tsx, AmbassadorShareCard.tsx, AmbassadorPayoutCard.tsx, AmbassadorFollowCard.tsx, AmbassadorDebutCard.tsx}`.
- Modify `app/team-create.tsx`, `components/profile/ProfileInviteCard.tsx` (acceso + copy «Reclutador»), `types/supabase.ts`, `components/legal/privacyContent.ts` (espejo de la privacidad, en Task 6).

**Web (`dashboard/`, repo `tornearcc/torneAR-web`)**
- Create `app/(public)/embajadores/page.tsx`, `components/embajadores/{EarningsCalculator,AmbassadorBoard,MinimumsTable,Faq}.tsx`, `app/(public)/legal/embajadores/page.tsx`, `app/api/embajadores/tablero/route.ts`.
- Modify `app/(public)/i/[username]/page.tsx` (variante `?emb=1`), `lib/legal/privacyContent.ts` (sección embajadores + fecha).
- Create `app/(admin)/dashboard/ambassadors/page.tsx`, `components/admin/{AmbassadorRewardsTable,AmbassadorsTable}.tsx`.
- Modify `lib/admin-actions.ts`, `components/admin/nav-items.ts`, `types/supabase.ts`.

**Conocimiento (fuera de git):** D-66 en `knowledge/04-decisiones.md`, P3-14 en `knowledge/11-roadmap-backlog.md`, cron en `knowledge/10-edge-functions-cron-triggers.md`, `~/.claude/instagram/voice.md`, Trello 7eQ8rKTC.

---

### Task 1: Base — inscripción, equipo propio y equipos traídos

**Files:**
- Create: `tornear/supabase/migrations/<ts>_ambassador_program_v2.sql` (primera parte)
- Create: `tornear/supabase/tests/640-ambassador-program.spec.sql` (T-1 a T-6)

**Interfaces:**
- Produces:
  - Settings (`INSERT … ON CONFLICT DO NOTHING`): `ambassador_program_enabled` 0, `ambassador_program_start_epoch` 0, `ambassador_reward_amount` 5000, `ambassador_bonus_5_amount` 5000, `ambassador_bonus_10_amount` 5000, `ambassador_max_paid_teams` 100, `ambassador_terms_version` 1.
  - Tabla `public.ambassadors(profile_id uuid PK → profiles ON DELETE CASCADE, own_team_id uuid NULL → teams ON DELETE SET NULL, own_team_set_at timestamptz NULL, own_team_first_match_id uuid NULL → matches ON DELETE SET NULL, instagram text NOT NULL CHECK (instagram ~ '^[a-z0-9._]{1,30}$'), show_in_ranking boolean NOT NULL DEFAULT false, follow_verified_at timestamptz NULL, follow_verified_by uuid NULL → profiles, payout_alias text NULL CHECK (length(payout_alias) BETWEEN 6 AND 40), terms_version int NOT NULL, accepted_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'ACTIVO' CHECK IN ('ACTIVO','SUSPENDIDO'), created_at timestamptz NOT NULL DEFAULT now())` + índice único parcial `(own_team_id) WHERE own_team_id IS NOT NULL`. RLS prendida y `REVOKE ALL` a `anon, authenticated`.
  - Tabla `public.ambassador_exclusions(team_id uuid PK, note text NOT NULL)` con Apple FC y Los Pibes del Barrio (D-52). RLS + `REVOKE ALL`.
  - Columna `public.teams.ambassador_profile_id uuid NULL → profiles ON DELETE SET NULL` (= «a este equipo lo trajo tal embajador») + índice parcial.
  - `public.upsert_ambassador(p_instagram text, p_show_in_ranking boolean, p_accept_terms boolean, p_confirm_adult boolean) RETURNS text` → `'created' | 'updated' | 'noop_disabled' | 'noop_terms' | 'noop_instagram' | 'noop_suspended'`. Crear exige las dos casillas; actualizar cambia Instagram y ranking. Instagram: quitar `@`, `lower(btrim())`; vacío o inválido → `noop_instagram`. Si cambia el Instagram, `follow_verified_at` vuelve a NULL.
  - `public.set_ambassador_own_team(p_team_id uuid) RETURNS text` (`p_team_id` NULL = sacar el equipo propio) → `'applied' | 'noop_disabled' | 'noop_not_ambassador' | 'noop_not_member' | 'noop_team_brought' | 'noop_team_taken' | 'noop_excluded' | 'noop_locked'`. `noop_locked` = `own_team_first_match_id` no nulo. Pone `own_team_set_at = now()`.
  - Asignación automática: `upsert_ambassador` al crear (`'created'`) pone `own_team_id` si hay exactamente un equipo elegible. Trigger `AFTER INSERT ON team_members` (`trg_ambassador_auto_own_team`): si el perfil es embajador `ACTIVO` con `own_team_id` nulo y ahora tiene exactamente un equipo elegible, lo asigna (`own_team_set_at = now()`). Nunca pisa un `own_team_id` ya cargado.
  - `public.set_ambassador_payout_alias(p_alias text) RETURNS text` → `'applied' | 'noop_not_ambassador' | 'noop_invalid'`.
  - `public.set_team_ambassador(p_team_id uuid, p_username text) RETURNS text` → `'applied' | 'noop_disabled' | 'noop_not_captain' | 'noop_invalid' | 'noop_self' | 'noop_already_set' | 'noop_too_late' | 'noop_excluded' | 'noop_is_own_team'`. `noop_invalid` = el usuario no existe o no es embajador `ACTIVO`; `noop_self` = el que llama es ese embajador; `noop_is_own_team` = el equipo es el propio de algún embajador. Compara `lower(btrim(username))`, acepta con o sin `@`.
  - `public.get_team_create_ambassador_prefill() RETURNS text` → username del `profiles.referred_by` del que llama si es embajador `ACTIVO` y el programa está prendido; si no, NULL.
  - Rename de la insignia: `UPDATE … SET name = 'Reclutador' WHERE slug = 'embajador'` (tabla y columna reales en `20260817181000_embajador_badge.sql`).
  - Todas las RPCs `SECURITY DEFINER`, `SET search_path TO 'public'`, `REVOKE … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`.

- [ ] **Step 1: Escribir los tests** (equipos y perfiles de `seed_testing.sql`; IDs con `grep -n "0c000000" supabase/seed_testing.sql`)
  - **T-1:** programa apagado → `upsert_ambassador`, `set_ambassador_own_team` y `set_team_ambassador` devuelven `noop_disabled` y no crean filas.
  - **T-2:** `upsert_ambassador('@Juan.Perez', true, true, true)` de un perfil sin equipos → `'created'`, `instagram = 'juan.perez'`, `own_team_id` NULL, `follow_verified_at` NULL. Ese perfil crea un equipo (insert en `team_members`) → `own_team_id` queda en ese equipo; se suma a un segundo → no cambia. Otro perfil que ya está en un solo equipo al inscribirse → `own_team_id` asignado; uno que está en dos → NULL. Instagram vacío → `noop_instagram`. Casilla en false → `noop_terms`. Cambiar el Instagram deja `follow_verified_at` en NULL.
  - **T-3:** `set_ambassador_own_team`: equipo donde no es integrante → `noop_not_member`; propio OK → `applied`; otro embajador con el mismo equipo → `noop_team_taken`; un equipo traído → `noop_team_brought`; con `own_team_first_match_id` cargado → `noop_locked`; NULL antes del primer partido → `applied` y queda sin equipo.
  - **T-4:** `set_team_ambassador` desde el capitán de un equipo creado hace 2 h, con el usuario del embajador en mayúsculas y con `@` → `applied`. Usuario no inscripto o embajador `SUSPENDIDO` → `noop_invalid`. El propio embajador → `noop_self`. Jugador no capitán → `noop_not_captain`. Segunda carga → `noop_already_set`. Sobre el equipo propio de un embajador → `noop_is_own_team`.
  - **T-5:** equipo creado hace 25 h → `noop_too_late`; equipo de 2 h con un partido `FINALIZADO` → `noop_too_late`; equipo demo → `noop_excluded`.
  - **T-6:** prefill: username si `referred_by` es embajador activo; NULL si no, o con el programa apagado. `anon` no ejecuta ninguna (`has_function_privilege`) ni lee `ambassadors`. La insignia `embajador` se llama `Reclutador`.
- [ ] **Step 2: Correr y ver que falla.** `npx supabase start; npx supabase db reset; npx supabase test db` → FAIL en 640.
- [ ] **Step 3: Escribir la primera parte de la migración.** Cabecera: «Programa de embajadores v2 (P3-14, D-66) — por persona».
- [ ] **Step 4: Correr los tests.** Expected: PASS en 640 y en los anteriores.
- [ ] **Step 5: Commit**
```bash
git switch develop && git pull && git switch -c feat/programa-embajadores
git add supabase/migrations/*_ambassador_program_v2.sql supabase/tests/640-ambassador-program.spec.sql
git commit -m "feat(embajadores): inscripción, equipo propio y equipos traídos"
```

---

### Task 2: Base — premios, tope y cron (`sweep_ambassador_rewards`)

**Files:**
- Modify: migración y test 640 (T-7 a T-13)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Tabla `public.ambassador_rewards(id uuid PK, ambassador_profile_id uuid NOT NULL → profiles ON DELETE CASCADE, kind text NOT NULL CHECK IN ('TEAM_BROUGHT','DEBUT','BONUS_5','BONUS_10'), team_id uuid NOT NULL → teams ON DELETE CASCADE (TEAM_BROUGHT: el equipo traído; DEBUT: el equipo traído rival; BONUS_*: el traído que llevó al umbral), match_id uuid NOT NULL → matches ON DELETE CASCADE, amount numeric NOT NULL, counted_profile_ids uuid[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'PENDIENTE' CHECK IN ('PENDIENTE','PAGADO','RECHAZADO'), created_at, paid_at, paid_by uuid → profiles, note text)`. Índices únicos parciales: `(team_id) WHERE kind = 'TEAM_BROUGHT' AND status <> 'RECHAZADO'` y `(ambassador_profile_id, kind) WHERE kind IN ('DEBUT','BONUS_5','BONUS_10') AND status <> 'RECHAZADO'`. RLS + `REVOKE ALL`.
  - `public.ambassador_required_members(p_format team_format) RETURNS int IMMUTABLE` (tabla de Global Constraints; NULL si no la conoce).
  - `public.sweep_ambassador_rewards() RETURNS integer` (premios creados). Sin `GRANT`.
  - Cron `ambassador-rewards-sweep` en `30 * * * *`.
- Algoritmo (recorre partidos válidos en orden de `finished_at`, después `matches.id`, con `pg_advisory_xact_lock(hashtext('sweep_ambassador_rewards'))`; programa apagado o `start_epoch = 0` → 0):
  1. **Traídos.** Por cada lado B del partido con `B.ambassador_profile_id = E` (E `ACTIVO`) y sin `TEAM_BROUGHT` no rechazado: contar los integrantes de B vigentes al `finished_at` sin eliminados, **menos** E, **menos** los integrantes del equipo propio de E al `finished_at`, **menos** la unión de `counted_profile_ids` de los `TEAM_BROUGHT` no rechazados de E. Si quedan ≥ titulares y hay lugar (`v_used < max_paid_teams`): insertar `TEAM_BROUGHT` con esos integrantes, `v_used + 1`. Si no llega, saltear (otro partido posterior de B puede pagar).
  2. **Debut.** Por cada lado A del partido que sea `own_team_id` de E (`ACTIVO`) con `own_team_first_match_id` nulo y `finished_at >= own_team_set_at`, y E integrante de A al `finished_at`: poner `own_team_first_match_id = M` (queda fijo). Si el otro lado es un equipo con `ambassador_profile_id = E`, no hay `DEBUT` no rechazado de E y hay lugar: insertar `DEBUT` (con `team_id` = el traído rival). Si no, el debut se pierde.
  3. **Bonos.** Después de cada `TEAM_BROUGHT` nuevo: si el embajador tiene ≥ 5 `TEAM_BROUGHT` no rechazados y no tiene `BONUS_5` no rechazado, insertar `BONUS_5` (`ambassador_bonus_5_amount`); igual con 10 y `BONUS_10`.
  4. Una notificación por embajador y partido con lo que sumó en ese partido (incluye «+ bono por 5 equipos» cuando corresponde).
  5. Si se alcanzó el tope: un único `app_logs` `warn` con `details->>'event' = 'ambassador.slots_exhausted'`.
- Notificación al embajador (patrón de `nudge_solo_team_captains`, `20260930120000_team_solo_nudge.sql`), tipo `ANUNCIO`: título «¡Sumaste $10.000!» o «¡Sumaste $5.000!»; cuerpo «{B} jugó su primer partido en TorneAR.» o «Tu equipo debutó contra {B}, el equipo que trajiste.»; si falta alias, « Cargá tu alias para cobrar.»; si falta el follow, « Recordá seguir a @tornear.app.»; `data` con `kind = 'ambassador_reward'` y `url = 'tornear://ambassador'`.

- [ ] **Step 1: Tests**
  - **T-7:** caso de $10.000: E con equipo propio A (7, incluido E) juega F7 contra un traído B nuevo (7 distintos), dos check-ins → `sweep` = 2 (`TEAM_BROUGHT` de B + `DEBUT`), una notificación con «$10.000», `own_team_first_match_id` cargado. Correr de nuevo → 0.
  - **T-8:** un traído C ya cobró su `TEAM_BROUGHT` jugando contra un tercero X; después el primer partido de A es contra C → sólo `DEBUT` ($5.000).
  - **T-9:** el primer partido válido de A es contra X (no traído) → 0 premios para E y `own_team_first_match_id` cargado; después A vs un traído nuevo D → sólo `TEAM_BROUGHT` de D, sin `DEBUT`.
  - **T-10:** embajador **sin equipo propio**: su traído B juega contra un equipo cualquiera X (los dos con 7 en F7) → 1 `TEAM_BROUGHT` ($5.000). Un segundo partido de B → 0.
  - **T-11:** B con 7 integrantes, 3 también en el equipo propio de E → 0 (quedan 4). C con 7, 2 contados en el `TEAM_BROUGHT` de B → 0; C suma 2 nuevos y juega otro partido válido → 1, sin los repetidos en `counted_profile_ids`. E como integrante de B no cuenta.
  - **T-12:** `ambassador_max_paid_teams = 2` y tres traídos de embajadores distintos que califican → 2 `TEAM_BROUGHT`, un solo `ambassador.slots_exhausted`, y un debut que llega después del tope no se crea. Rechazar un `TEAM_BROUGHT` y correr → paga el tercero.
  - **T-12b:** un embajador sin equipo con 5 traídos que debutan contra equipos cualquiera → 5 `TEAM_BROUGHT` + 1 `BONUS_5` ($30.000); al décimo → `BONUS_10` ($5.000 más, total $60.000). Correr de nuevo → 0. Otro embajador con 4 → sin bono.
  - **T-13:** rival con 6 integrantes en F7, sin check-in de un equipo, equipo excluido, `WO_A`, `EN_DISPUTA`, sin `format`, partido antes de `start_epoch`, embajador `SUSPENDIDO` → 0 (y el partido inválido no cuenta como primero del equipo propio). Un `TEAM_BROUGHT` con 7 que después pierde 2 sigue `PENDIENTE`. `ambassador_required_members` = 5, 6, 7, 8, 9, 11. `anon`/`authenticated` no ejecutan el sweep ni leen la tabla. El cron existe con `30 * * * *`.
  - (Verificar columnas obligatorias de `matches` y `team_stints` con `\d`; `team_stints` se llena por trigger al insertar en `team_members`.)
- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr los tests.** Expected: PASS, `600-cron-disk-io` incluido.
- [ ] **Step 5: Commit** `feat(embajadores): premios por equipo traído y debut, con tope de 100`.

---

### Task 3: Base — lecturas para la app, la web y el dashboard

**Files:**
- Modify: migración y test 640 (T-14 a T-17)

**Interfaces:**
- Produces:
  - `public.get_my_ambassador_overview() RETURNS jsonb` (authenticated):
    ```json
    { "enabled": true, "registered": true, "status": "ACTIVO",
      "username": "jose", "instagram": "jose.fc", "show_in_ranking": false,
      "follow_verified": false, "has_payout_alias": false,
      "own_team": { "team_id": "…", "name": "Los Pibes", "format": "FUTBOL_7", "members_now": 8, "members_needed": 7 },
      "eligible_own_teams": [ { "team_id": "…", "name": "…" } ],
      "debut_state": "DISPONIBLE",
      "teams_counted": 3, "next_bonus_at": 5, "bonus_5_earned": false, "bonus_10_earned": false,
      "earned_total": 10000, "paid_total": 0, "slots_left": 99,
      "brought_teams": [ { "team_id": "…", "name": "Rimini CF", "format": "FUTBOL_7",
                           "members_now": 5, "members_needed": 7,
                           "state": "ESPERANDO", "amount": null } ] }
    ```
    `debut_state`: `SIN_EQUIPO` (no eligió) · `DISPONIBLE` (eligió y todavía no jugó) · `GANADO` · `PERDIDO`. `own_team` es null sin equipo. `state` de cada traído: `ESPERANDO` · `PENDIENTE` · `PAGADO` · `RECHAZADO`. `members_needed` sale de `teams.format` (orientativo). Sin inscripción → `registered: false`.
  - `public.public_ambassador_board(p_limit int DEFAULT 50) RETURNS jsonb` (**anon y authenticated**): `{ "enabled", "slots_total", "slots_used", "ranking": [ { "username", "avatar_url", "teams", "earned" } ] }`. Sólo `ACTIVO` con `show_in_ranking` y al menos un premio no rechazado; `earned` = `PENDIENTE` + `PAGADO`; orden `earned desc, username`. Sin nombre, mail ni Instagram.
  - `public.dashboard_ambassadors() RETURNS TABLE(profile_id uuid, username text, full_name text, email text, instagram text, follow_verified_at timestamptz, payout_alias text, own_team_name text, debut_state text, show_in_ranking boolean, status text, accepted_at timestamptz, teams_brought int, earned numeric, paid numeric)` — `email` desde `auth.users`.
  - `public.dashboard_ambassador_rewards() RETURNS TABLE(id uuid, ambassador_profile_id uuid, ambassador_username text, ambassador_full_name text, instagram text, follow_verified boolean, payout_alias text, kind text, team_name text, rival_team_name text, match_id uuid, finished_at timestamptz, format text, counted_members int, amount numeric, status text, created_at timestamptz, paid_at timestamptz, note text)` — pendientes primero.
  - `public.dashboard_ambassador_summary() RETURNS TABLE(enabled boolean, slots_total int, slots_used int, committed numeric, paid numeric, ambassadors int, pending_follow_checks int)`.
  - `public.admin_set_ambassador_reward_status(p_id uuid, p_status text, p_note text DEFAULT NULL) RETURNS void` — `'PAGADO'` exige `follow_verified_at` no nulo (`FOLLOW_NOT_VERIFIED`) y pone `paid_at`/`paid_by`; `'RECHAZADO'` exige nota (`NOTE_REQUIRED`); un `PAGADO` no cambia (`ALREADY_PAID`). Al rechazar un `TEAM_BROUGHT`: si los no rechazados del embajador bajan de 10 (o de 5), su `BONUS_10` (o `BONUS_5`) `PENDIENTE` pasa a `RECHAZADO` con nota «Bajó de N equipos»; el `DEBUT` del mismo partido también se rechaza.
  - `public.admin_verify_ambassador_follow(p_profile_id uuid, p_verified boolean) RETURNS void`.
  - `public.admin_set_ambassador_status(p_profile_id uuid, p_status text, p_note text) RETURNS void` — `ACTIVO`/`SUSPENDIDO`.
  - Las `dashboard_*`/`admin_*` exigen `is_admin` con el bloque de `dashboard_link_clicks` (`NOT_AUTHORIZED: se requiere is_admin`); reusar un `require_admin()` si existe.
  - Canal `embajador` para `/d/<canal>` (mismo cambio que `20261012120000` hizo para `meta`).

- [ ] **Step 1: Tests** — **T-14:** overview de un no inscripto (`registered = false`), de un embajador sin equipo (`debut_state = 'SIN_EQUIPO'`), y de E después de T-7 (`earned_total = 10000`, `debut_state = 'GANADO'`, B `PENDIENTE`) y de T-9 (`PERDIDO`). **T-15:** el tablero muestra a E sólo con `show_in_ranking = true`, sin claves `full_name`/`email`/`instagram`; `anon` lo ejecuta. **T-16:** no admin → `NOT_AUTHORIZED` en las seis; `PAGADO` sin follow → `FOLLOW_NOT_VERIFIED`; con follow → `paid_at`; rechazo sin nota → `NOTE_REQUIRED`; `PAGADO → RECHAZADO` → `ALREADY_PAID`; con 5 traídos y `BONUS_5` pendiente, rechazar uno → `BONUS_5` `RECHAZADO`; un sexto traído válido → el sweep crea un `BONUS_5` nuevo. **T-17:** `610-anon-dml` sigue pasando (actualizar su lista blanca si enumera funciones de anon).
- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr `npx supabase test db`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(embajadores): lecturas para la app, el tablero público y el dashboard`.

---

### Task 4: App — pantalla «Embajadores»

**Files:**
- Create: `tornear/lib/ambassador-data.ts` (+ `.test.ts`), `tornear/lib/schemas/ambassador.ts`, `tornear/app/ambassador.tsx`, `tornear/components/ambassador/*`
- Modify: `tornear/components/profile/ProfileInviteCard.tsx`, `tornear/types/supabase.ts` (`npx supabase gen types typescript --local > types/supabase.ts`)

**Interfaces:**
- Consumes: RPCs de Tasks 1 y 3.
- Produces (`lib/ambassador-data.ts`):
  - `type AmbassadorOverview = z.infer<typeof ambassadorOverviewSchema>` (forma del JSON de `get_my_ambassador_overview`).
  - `fetchAmbassadorOverview(): Promise<AmbassadorOverview | null>` (null ante error o forma rota, con `Logger.warn`).
  - `upsertAmbassador(input: { instagram: string; showInRanking: boolean; acceptTerms: boolean; confirmAdult: boolean }): Promise<UpsertAmbassadorOutcome>` (valores de Task 1 + `'rpc_error'`).
  - `setAmbassadorOwnTeam(teamId: string | null): Promise<OwnTeamOutcome>` (valores de Task 1 + `'rpc_error'`).
  - `setAmbassadorPayoutAlias(alias: string): Promise<'applied' | 'noop_not_ambassador' | 'noop_invalid' | 'rpc_error'>`.
  - `buildAmbassadorInviteMessage(username: string): string` → incluye `https://tornear.vercel.app/i/<username>?emb=1` y «Creá tu equipo y en "¿Quién los invitó?" poné mi usuario <username>».
  - Nunca tiran; registran `event: 'ambassador.<acción>'` (criterio de `lib/referral-data.ts`).
- Pantalla `app/ambassador.tsx` (una carga con `fetchAmbassadorOverview`, `useFocusEffect`, `GlobalLoader`, `useCustomAlert`):
  - `enabled = false` → «El programa todavía no arrancó».
  - `registered = false` → `AmbassadorSignupForm`: nombre y mail de la cuenta (sólo lectura), **Instagram (obligatorio)**, interruptor «Quiero aparecer en el ranking de la web», casillas «Soy mayor de 18» y «Leí y acepto las bases» (link a `https://tornear.vercel.app/legal/embajadores`), bloque «Seguí a @tornear.app: es obligatorio para cobrar» con botón al perfil de Instagram. «Quiero ser embajador» se habilita con Instagram y las dos casillas.
  - Inscripto → `AmbassadorEarningsHeader` (ganado, pagado, lugares que quedan, y barra «3 de 5 equipos para el bono de $5.000» / «7 de 10» / «Ganaste los dos bonos») · `AmbassadorFollowCard` (si `follow_verified = false`) · `AmbassadorPayoutCard` (si `has_payout_alias = false` y hay premios) · `AmbassadorShareCard` («Invitá a un equipo», `Share.share` + `trackShareIntent` `content_type: 'ambassador'`) · `AmbassadorDebutCard` según `debut_state`: `SIN_EQUIPO` → si `eligible_own_teams` tiene 2 o más: «¿Cuál es tu equipo?» con la lista (preseleccionado el que capitanea) y botón confirmar; si está vacía: «Sumá $5.000 extra: armá tu equipo y que su primer partido sea contra uno que trajiste» + botón a Crear equipo (al crearlo queda asignado solo); `DISPONIBLE` → «Tu equipo: {nombre}. Si su primer partido es contra un equipo que trajiste, sumás $5.000 extra» (botón cambiar); `GANADO` → «Ganaste el extra de debut»; `PERDIDO` → «Tu equipo ya debutó» · `AmbassadorTeamsList` (traídos: estado; si `ESPERANDO`: «Falta que jueguen su primer partido» y, si les falta gente, «Tienen 5 de 7 integrantes» en `warning-tertiary`).
- `ProfileInviteCard`: si `enabled`, fila «Sé embajador: ganá $5.000 por equipo» a `/ambassador`. Copy de la insignia: «Ya sos Reclutador…» / «…ganás la insignia Reclutador.»

- [ ] **Step 1: Tests de `lib/ambassador-data.test.ts`** (mocks como `lib/referral-data.test.ts`): parsea un overview válido (con y sin `own_team`); forma rota → `null` + `warn`; `upsertAmbassador` manda `p_instagram` sin `@` y devuelve el estado; `setAmbassadorOwnTeam(null)` manda `p_team_id: null`; error de red → `rpc_error`; `buildAmbassadorInviteMessage('jose')` contiene `/i/jose?emb=1`.
- [ ] **Step 2: Correr y ver que falla.** `npx vitest run lib/ambassador-data.test.ts`.
- [ ] **Step 3: Implementar** (NativeWind y tokens; skill `nativewind-component` para los componentes).
- [ ] **Step 4: Correr** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. Probar en el emulador contra la base local.
- [ ] **Step 5: Commit** `feat(embajadores): pantalla de inscripción y ganancias`.

---

### Task 5: App — «¿Quién los invitó?» al crear el equipo

**Files:**
- Modify: `tornear/lib/ambassador-data.ts` (+ test), `tornear/app/team-create.tsx`

**Interfaces:**
- Produces: `fetchAmbassadorProgramEnabled(): Promise<boolean>` (lee `app_settings`, false ante error); `fetchTeamCreateAmbassadorPrefill(): Promise<string | null>`; `setTeamAmbassador(teamId: string, username: string): Promise<TeamAmbassadorOutcome>` (valores de `set_team_ambassador` + `'rpc_error'`; vacío → `'noop_invalid'` sin llamar).
- En `team-create.tsx`: si el programa está prendido, debajo de «Formato principal»: «¿Quién los invitó? (opcional)», `TextInput` prellenado con el prefill, `autoCapitalize="none"`, placeholder «Usuario del embajador», ayuda «Si un embajador te pasó TorneAR, poné su usuario. Sólo se puede cargar ahora.» Después de `createTeam(...)`, si hay texto: `setTeamAmbassador`; si no es `applied`, el aviso «Equipo creado» suma «No encontramos un embajador con ese usuario.» (`noop_invalid`) o «No se pudo vincular al embajador.» (resto). El equipo se crea siempre.

- [ ] **Step 1: Tests** (programa false ante error; prefill null ante error; vacío no llama; pasa el username y devuelve el estado).
- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** vitest, tsc, lint. Probar: cuenta nueva por `/i/<embajador>?emb=1` → crear equipo → campo prellenado → `teams.ambassador_profile_id` cargado.
- [ ] **Step 5: Commit** `feat(embajadores): vincular el equipo traído al crearlo`.

---

### Task 6: Web — `/embajadores`, bases, tablero y link

**Files (repo `tornearcc/torneAR-web`):** los de la sección Web del mapa salvo el dashboard.

**Interfaces:**
- Consumes: `public_ambassador_board`, `StoreButtons`, `CopyCodeButton`, `/d/embajador`.
- `GET /api/embajadores/tablero` → JSON de `public_ambassador_board(50)` vía `fetch` a `{SUPABASE_URL}/rest/v1/rpc/public_ambassador_board` con la anon key (sin `lib/supabase`), `export const revalidate = 600`. Ante error → `{ enabled: false, slots_total: 100, slots_used: 0, ranking: [] }` con 200.
- `/embajadores` (estática), en orden:
  1. Hero «¿Querés ganar plata jugando al fútbol?» · «$5.000 por cada equipo que traigas a TorneAR y juegue su primer partido» · botón «Bajate la app y anotate» (`/d/embajador`) · «Quedan N de 100 lugares».
  2. Cómo funciona: «Anotate en la app con tu Instagram» · «Pasale tu link a otros equipos» · «Cuando juegan su primer partido, cobrás $5.000 por cada uno».
  3. Extra de debut: «¿Tenés equipo? Si su primer partido es contra un equipo que trajiste, sumás $5.000 más: ese partido te deja $10.000».
  4. Bonos: «Llegá a 5 equipos y sumás $5.000 más. Llegá a 10 y sumás otros $5.000».
  5. `EarningsCalculator` (client): slider de 1 a 20 equipos traídos + interruptor «mi equipo debuta contra uno de ellos» → total (`5000 × n + (debut ? 5000 : 0) + (n >= 5 ? 5000 : 0) + (n >= 10 ? 5000 : 0)`) en grande, con el desglose.
  6. «Dónde cargan tu usuario»: captura de «Crear equipo» con el campo marcado.
  7. `MinimumsTable`: qué es un partido válido + tabla de titulares + «cada jugador cuenta para un solo equipo».
  8. Requisitos: Instagram y seguir a @tornear.app (con botón), mayor de 18, alias para cobrar.
  9. `AmbassadorBoard` (client, `fetch('/api/embajadores/tablero')`). Vacío → «Todavía nadie cobró. Podés ser el primero».
  10. `Faq` (¿cuándo cobro? · ¿tengo que jugar en los equipos que traigo? (no) · ¿necesito tener equipo? (no, sólo para el extra) · ¿puedo usar mis mismos jugadores? · ¿qué pasa si se van jugadores? · ¿hasta cuándo?).
  11. Letra chica visible + link a `/legal/embajadores`.
- `/legal/embajadores`: bases v1 con fecha, con el «Borrador de bases» de `knowledge/planes/2026-10-21-programa-embajadores-explicado.html`.
- **Política de Privacidad** (web `/legal/privacidad` y los dos espejos de `privacyContent.ts`, app y web, con `PRIVACY_LAST_UPDATED` nuevo; sin re-aceptación): sumar una sección «Programa de embajadores» con qué datos (Instagram, alias/CBU, ranking opcional con usuario, foto, equipos traídos y monto), para qué (contacto, verificar el follow, pagar, mostrar el ranking si lo elige), base (consentimiento al inscribirse), cuánto se guardan (mientras dure el programa y lo que exijan los registros de pago) y cómo pedir la baja (tornearcc@gmail.com o salir del ranking desde la app). Texto redactado por nosotros; Agustín lo revisa antes del merge. **Los TyC no se tocan.** El espejo de la app sale en la OTA de Task 8.
- `/i/[username]?emb=1`: «{username} te invita a TorneAR», «Creá tu equipo y en "¿Quién los invitó?" poné **{username}**», `CopyCodeButton`, `StoreButtons` a `/d/embajador`. Sin `emb`, igual que hoy (la app 1.0.0 depende de esta ruta).

- [ ] **Step 1:** route handler; `curl -s localhost:3100/api/embajadores/tablero` con base local y con URL rota (fallback).
- [ ] **Step 2:** páginas y componentes. `grep -rn "lib/supabase" "app/(public)" components/embajadores` → vacío.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npm run build`; capturas a 390 px y escritorio con Playwright.
- [ ] **Step 4: Commit** `feat(embajadores): página pública, bases y tablero`.

---

### Task 7: Dashboard — «Embajadores»

**Files (repo web):** los del dashboard en el mapa.

**Interfaces:**
- Consumes: las RPCs `dashboard_*`/`admin_*` de Task 3.
- Produces: `setAmbassadorRewardStatusAction({ id, status: 'PAGADO' | 'RECHAZADO', note? })`, `verifyAmbassadorFollowAction({ profileId, verified: boolean })`, `setAmbassadorStatusAction({ profileId, status: 'ACTIVO' | 'SUSPENDIDO', note })`, todas `Promise<ActionResult>` con el patrón de `updateSettingAction`.
- Página: tanteador (lugares usados de 100, comprometido, pagado, inscriptos, **follows por verificar**, prendido/apagado) · **embajadores** (usuario, nombre, mail, Instagram como link a `instagram.com/<handle>`, «Sigue ✓ / Verificar», equipo propio y estado del debut, alias con copiar, traídos, ganado, pagado, «Suspender») · **premios** (pendientes primero: embajador, tipo «Equipo traído» / «Debut», equipo y rival, partido, formato, integrantes contados, monto, estado, «Marcar pagado» deshabilitado sin follow verificado, «Rechazar» con nota). Estilo de `ReportsQueue.tsx`. Entrada «Embajadores» debajo de Crecimiento. Interruptor, arranque y montos desde Configuración.

- [ ] **Step 1:** server actions.
- [ ] **Step 2:** página y tablas.
- [ ] **Step 3:** `tsc`, `lint`, `build`; capturas con el mock local.
- [ ] **Step 4: Commit** `feat(embajadores): gestión de embajadores, follows y pagos`.

---

### Task 8: Lanzamiento

- [ ] **Step 1:** PR app → `develop` (CI verde). Migración a producción (`npx supabase migration list --linked`, `npx supabase db push --linked --yes`). Programa **apagado**.
- [ ] **Step 2:** OTA al 10 % (fingerprints en verde), 24 h de `app_logs`, después 100 %. PR `develop → main` de la app para Agustín.
- [ ] **Step 3:** web: PR → `develop` → `main`. Verificar en producción `/embajadores`, `/legal/embajadores`, `/api/embajadores/tablero`, `/i/<usuario>?emb=1` y `/i/<usuario>` sin cambios.
- [ ] **Step 4:** Agustín revisa en producción las bases y la Política de Privacidad nueva. Sin su OK no se prende.
- [ ] **Step 5:** día del lanzamiento, desde Configuración: `ambassador_program_start_epoch` = `extract(epoch from now())` y `ambassador_program_enabled` = 1. Agustín se inscribe primero como prueba real. Se publica el reel (lo graban Agustín y su socio).
- [ ] **Step 6:** documentación: D-66 en `knowledge/04-decisiones.md` (reemplaza la del 13/10), P3-14 en `knowledge/11-roadmap-backlog.md`, cron en `knowledge/10-edge-functions-cron-triggers.md`, `~/.claude/instagram/voice.md`, comentario en Trello 7eQ8rKTC con «Registro: P3-14». Regenerar `paquete-claude-nube/`.

---

## Después de esto

- **Tutorial de onboarding para destacados de IG**, con estas pantallas en producción (capítulo «Crear equipo» con el campo nuevo + capítulo «Embajadores»).
- **Bonos v3:** por equipo que llega a X partidos.
