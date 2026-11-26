# Rediseño · Etapa 1: Inicio por estado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Inicio muestre un solo «próximo paso» según el estado de la persona (sin equipo, equipo incompleto, con partido o acción pendiente, listo para buscar rival) y una barra de 3 pasos, en lugar de los ~9 bloques actuales.

**Architecture:** Una función pura (`lib/home-next-step.ts`) decide el paso con los datos que `fetchHomeViewData` ya trae. `fetchSoloCaptainTeam` se generaliza a «equipo incompleto» (menos jugadores que su formato). La pantalla compone 4 componentes nuevos de `components/home/`. Todo lo que hoy se ve en Inicio sigue a un toque: lo pendiente que no es el paso principal queda en una lista corta debajo.

**Tech Stack:** Expo 57 / React Native 0.86, NativeWind 4, Vitest (proyecto `lib` en node y `ui` en jsdom con react-native-web).

**Spec:** `docs/superpowers/specs/2026-11-25-rediseno-design.md` (§5, §8.1–8.4, §10, §12 etapa 1).

## Global Constraints

- Solo JS, por OTA: nada nativo, nada en `app.json`, `eas.json` ni `.gitignore` (cuentan en el fingerprint).
- Mismos tokens de `tailwind.config.js`; solo `className`; sin `any`; imports con `@/`.
- Copy (literal):
  - barra: «1 · Tu equipo», «2 · Un rival», «3 · El partido suma»;
  - etiqueta de la tarjeta: «Tu próximo paso»;
  - sin equipo: «Sumate a un equipo» / «Sin equipo no aparecés en el ranking. Entrá al de un amigo o armá el tuyo.» / botones «Tengo un código» y «Armar el mío»;
  - equipo incompleto: «Completá {equipo}» / «Son {n} de {N}. Un F{N} necesita {N} para jugar.» / «Invitar a mis amigos» / «Código {código}» + «Copiar».
- Estados (§10): amarillo `warning-tertiary` = falta algo tuyo; celeste `info-secondary` = confirmado; verde = en vivo o hecho.
- Un solo botón verde lleno por pantalla: el del próximo paso.
- No se borra ninguna función: `MiniRankingCard`, `UpcomingMatchesSection`, `QuickActionsSection` y `HomeOnboardingTour` dejan de usarse en Inicio, pero sus archivos quedan hasta la etapa 6.

## Review Focus

1. **Varios equipos** (capitán de uno incompleto y jugador de otro con partido): manda la acción de partido; el equipo incompleto queda en «También tenés pendiente».
2. **Formato desconocido o `null`:** `playersNeeded` devuelve 5 y no rompe.
3. **Más jugadores que el formato** (11 en un F5): el equipo no cuenta como incompleto.
4. **Jugador que no es capitán con el equipo incompleto:** no ve «Invitar» como paso principal (no puede gestionar el equipo); ve «Buscá rival» o su partido.
5. **`pendingTransfers > 0` sin equipos** (lo aceptaron y falta confirmar): el aviso de traspaso sigue apareciendo arriba de «Sumate a un equipo».

---

### Task 1: `lib/home-next-step.ts`, la decisión

**Files:**
- Create: `lib/home-next-step.ts`
- Test: `lib/home-next-step.test.ts`

**Interfaces:**
- Consumes: `HomeViewData`, `PendingAction`, `HomeMatchEntry` (`components/home/types.ts`); `HomeIncompleteTeam` (Task 2, declarado en `types.ts` en esta misma task para que compile).
- Produces:
  - `playersNeeded(format: TeamFormat | null): number` → FUTBOL_5 5, FUTBOL_6 6, FUTBOL_7 7, FUTBOL_8 8, FUTBOL_9 9, FUTBOL_11 11, `null` 5.
  - `type HomeNextStep = { kind: 'JOIN_TEAM' } | { kind: 'MATCH_ACTION'; action: PendingAction } | { kind: 'NEXT_MATCH'; match: HomeMatchEntry } | { kind: 'TEAM_REQUEST'; action: PendingAction } | { kind: 'COMPLETE_TEAM'; team: HomeIncompleteTeam } | { kind: 'MARKET_APPLICATION'; action: PendingAction } | { kind: 'FIND_RIVAL' }`
  - `resolveHomeNextStep(data: Pick<HomeViewData, 'myTeams' | 'upcomingMatches' | 'pendingActions' | 'incompleteTeam'>): HomeNextStep`
  - `resolveJourney(data: same Pick): { step: 1 | 2 | 3; teamProgress: number }`: `teamProgress` va de 0 a 1 (members/needed del equipo incompleto; 1 si no hay incompleto; 0 sin equipo).
  - `otherPendingActions(data, next: HomeNextStep): PendingAction[]`: las acciones que no son el paso principal.

- [ ] **Step 1: Write the failing tests** in `lib/home-next-step.test.ts`:
  - `sin equipos → JOIN_TEAM`; `resolveJourney` → `{ step: 1, teamProgress: 0 }`.
  - Prioridad: con acciones `LIVE_RESULT`, `DISPUTE`, `MATCH_PROPOSAL`, `CANCELLATION_REQUEST` o `CHALLENGE_RECEIVED` → `MATCH_ACTION` con la primera de `pendingActions` (ya vienen ordenadas por `buildPendingActions`).
  - Sin acción de partido y con un `upcomingMatches[0]` en `PENDIENTE`, `CONFIRMADO` o `EN_VIVO` → `NEXT_MATCH`; journey `step: 3`.
  - Con `TEAM_REQUEST` y equipo incompleto → `TEAM_REQUEST` (gana a `COMPLETE_TEAM`).
  - Con `incompleteTeam = { members: 1, needed: 5, … }` y nada más → `COMPLETE_TEAM`; journey `{ step: 1, teamProgress: 0.2 }`.
  - Solo `MARKET_APPLICATION` → `MARKET_APPLICATION`.
  - Equipo completo sin nada → `FIND_RIVAL`; journey `{ step: 2, teamProgress: 1 }`.
  - Review Focus 1: incompleto + `MATCH_PROPOSAL` → `MATCH_ACTION`, y `otherPendingActions` no incluye esa acción.
  - Review Focus 2 y 3: `playersNeeded(null) === 5`; `playersNeeded('FUTBOL_11') === 11`.

- [ ] **Step 2: Run to verify it fails.** Run: `npm test` (desde PowerShell). Expected: FAIL «Cannot find module './home-next-step'».

- [ ] **Step 3: Implement the four exports** in `lib/home-next-step.ts`. El orden de prioridad es el de la lista de tests (MATCH_ACTION > NEXT_MATCH > TEAM_REQUEST > COMPLETE_TEAM > MARKET_APPLICATION > FIND_RIVAL).

- [ ] **Step 4: Run the tests.** Run: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(home): decidir el próximo paso de Inicio (rediseño etapa 1)`.

### Task 2: equipo incompleto en `home-data`

**Files:**
- Modify: `components/home/types.ts` (`HomeSoloTeam` → `HomeIncompleteTeam`; `soloTeam?` → `incompleteTeam?`)
- Modify: `lib/home-data.ts:544-600` (`fetchSoloCaptainTeam` → `fetchIncompleteCaptainTeam`)
- Test: `lib/home-data.test.ts`

**Interfaces:**
- Produces:
  - `interface HomeIncompleteTeam { id: string; name: string; inviteCode: string; shieldUrl: string | null; members: number; needed: number; format: TeamFormat | null }`
  - `fetchIncompleteCaptainTeam(profileId: string, captainTeamIds: string[]): Promise<HomeIncompleteTeam | null>`
- Consumes: `playersNeeded` (Task 1).

- [ ] **Step 1: Write the failing tests** (mismo estilo de mocks de Supabase que el archivo):
  - Un equipo con 3 miembros y `preferred_format: 'FUTBOL_5'` → `{ members: 3, needed: 5 }`.
  - Con 5 o más miembros en F5 → `null` (Review Focus 3).
  - Equipo `is_active = false` → `null`.
  - Un error de Supabase → `null` y un `Logger.warn` (como hoy).
  - Con varios incompletos, devuelve el que tiene menos lugares por llenar.
  - Review Focus 4: con `captainTeamIds = []` (el usuario es solo `JUGADOR`) → `null` sin consultar.

- [ ] **Step 2: Run to verify it fails.** `npm test` → FAIL.

- [ ] **Step 3: Implement.**
  - Una consulta de `team_members` para los `captainTeamIds`.
  - Una consulta de `teams` con `id, name, invite_code, is_active, preferred_format, shield_url` para los candidatos.
  - El escudo, con `getSupabaseStorageUrl('shields', …)`, como `myTeams`.
  - `fetchHomeViewData` devuelve `incompleteTeam`.
  - Se borran el tipo y el fetch viejos.

- [ ] **Step 4: Run.** `npm test` y `npx tsc --noEmit` → PASS y 0 errores (tsc marca los usos viejos de `soloTeam` en `index.tsx`: se arreglan en la Task 4, así que en esta task se renombra solo la referencia, sin cambiar la UI).

- [ ] **Step 5: Commit** `feat(home): equipo incompleto según su formato`.

### Task 3: componentes nuevos de Inicio

**Files:**
- Create:
  - `components/home/JourneyBar.tsx`: `({ step, teamProgress }: { step: 1 | 2 | 3; teamProgress: number })`, 3 columnas; la activa en `brand-primary`, la parcial con el relleno `teamProgress`.
  - `components/home/NextStepCard.tsx`: `({ next, teamName, onAction }: { next: HomeNextStep; teamName?: string; onAction: (target: NextStepTarget) => void })`.
  - `components/home/TeamSummaryRow.tsx`: `({ team, onPress }: { team: HomeTeamSnapshot; onPress: () => void })`, una línea con escudo, nombre y «{rol} · {G}G {E}E {P}P».
  - `components/home/OtherPendingList.tsx`: `({ actions, onPress }: { actions: PendingAction[]; onPress: (a: PendingAction) => void })`, título «También tenés pendiente»; no renderiza nada si está vacío.
- Test: `components/home/NextStepCard.test.tsx` (proyecto `ui`).

**Interfaces:**
- Produces: `type NextStepTarget = 'join_code' | 'team_create' | 'invite' | 'copy_code' | 'pending' | 'match' | 'find_rival'`.
- Consumes: `HomeNextStep` (Task 1).

**Contenido de `NextStepCard` por `kind`:**

| kind | Título | Texto | Botón verde (→ target) | Secundario |
|---|---|---|---|---|
| JOIN_TEAM | «Sumate a un equipo» | copy de Global Constraints | «Tengo un código» (`join_code`) | «Armar el mío» (`team_create`) |
| COMPLETE_TEAM | «Completá {nombre}» | «Son {n} de {N}…» + {N} círculos ({n} llenos, el resto «+») | «Invitar a mis amigos» (`invite`) | fila «Código {code}» + «Copiar» (`copy_code`) |
| MATCH_ACTION / TEAM_REQUEST / MARKET_APPLICATION | `action.label` | — | «Ver» (`pending`) | — |
| NEXT_MATCH | «Lo próximo» + estado (Pendiente en amarillo, Confirmado en celeste, En vivo en verde) | escudos vs + fecha (`formatMatchDate`) | «Ver el partido» (`match`) | — |
| FIND_RIVAL | «Buscá rival» | «Tu equipo está listo. Desafiá a uno de tu zona.» | «Buscar rival» (`find_rival`) | — |

- [ ] **Step 1: Write the failing tests:**
  - `JOIN_TEAM` muestra «Sumate a un equipo»; tocar «Tengo un código» llama `onAction('join_code')`.
  - `COMPLETE_TEAM` con 2 de 7 muestra «Son 2 de 7. Un F7 necesita 7 para jugar.» y 5 «+».
  - `FIND_RIVAL` → `onAction('find_rival')`.

- [ ] **Step 2: Run to verify it fails.** `npm test` → FAIL.

- [ ] **Step 3: Implement the four components** con los tokens y el estilo de las maquetas (tarjeta del paso: `bg` verde oscuro `#1E2A21` como `bg-brand-primary/10` sobre `surface-base` y `border-brand-primary/35`, radio 20; etiqueta «Tu próximo paso» en mayúsculas chicas verdes).

- [ ] **Step 4: Run.** `npm test` → PASS; `npm run lint` → 0 errores.

- [ ] **Step 5: Commit** `feat(home): tarjeta del próximo paso, barra de 3 pasos y fila del equipo`.

### Task 4: componer Inicio

**Files:**
- Modify: `app/(tabs)/index.tsx` (render, desde la línea ~540)
- Modify: `components/home/HomeOnboardingState.tsx` (pasa a usar `JourneyBar` + `NextStepCard` `JOIN_TEAM`; conserva el aviso de traspaso y suma la fila «Mirá el ranking de tu zona» → `/(tabs)/ranking` y el censo)
- Modify: `lib/share-team-invite.ts` (surface `'home_solo_card'` → `'home_next_step'`)

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: Componer** en este orden:
  1. `GlobalHeader`;
  2. `JourneyBar`;
  3. `NextStepCard` (el `onAction` de cada target: `join_code` → `/team-join`, `team_create` → `/team-create`, `invite` → `shareTeamInvite`, `copy_code` → portapapeles + aviso «Código copiado», `pending` → el destino que hoy usa `PendingActionsCard` para ese tipo, `match` → `/match-detail?matchId=`, `find_rival` → `/(tabs)/ranking?mode=rivales`);
  4. `OtherPendingList`;
  5. `TeamSummaryRow` por cada equipo → `/team-manage?teamId=`;
  6. `SuggestedRivalsCard` (solo si el paso es `FIND_RIVAL` o `NEXT_MATCH`);
  7. `CensusEntryCard` compacta.

  Dejan de renderizarse `PendingActionsCard`, `SoloTeamInviteCard`, `MiniRankingCard`, `UpcomingMatchesSection`, `MyTeamsRankingSection`, `QuickActionsSection` y `HomeOnboardingTour`.

- [ ] **Step 2: Verify.** `npx tsc --noEmit` → 0 errores; `npm run lint` → 0 errores; `npm test` → todo en verde; `node scripts/check-native-fingerprint.mjs` y `--platform android` → «El nativo no cambió».

- [ ] **Step 3: Ver en web** (`npx expo start --web`). Recorrer los 4 estados con cuentas reales:
  - Agustín, con su cuenta;
  - sin equipo, con una cuenta nueva de prueba suya, nunca las de demo de Apple.

  Capturas de cada estado para él.

- [ ] **Step 4: Commit** `feat(home): Inicio por estado (rediseño etapa 1)`. PR a `develop` con la sección «Pendientes fuera de este PR» (etapas 2–6). Sale por OTA con el OK de Agustín, y después el PR `develop → main`.
