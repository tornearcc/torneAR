# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the `tornear/` directory.

```bash
npm start            # Start Expo dev server (opens QR + menu for Android/iOS/Web)
npm run android      # Launch on Android emulator
npm run ios          # Launch on iOS simulator
npm run web          # Launch in browser
npm run lint         # Run ESLint
npm test             # Run Vitest once (tests live in lib/**/*.test.ts)
npm run test:watch   # Run Vitest in watch mode
```

Database tests (pgTAP, `supabase/tests/`; need Docker Desktop running):
```bash
npx supabase start      # local stack with every migration + supabase/seed_testing.sql
npx supabase db reset   # re-apply migrations and seed after adding one
npx supabase test db    # run every pgTAP suite
```

TypeScript type-checking (no emit):
```bash
npx tsc --noEmit
```

## Development Workflow

Branching, CI/CD and Supabase environments are documented in
[`docs/WORKFLOW.md`](docs/WORKFLOW.md). In short:
- **Ramas (D-58, desde el 27/09/2026):** `develop` es donde se trabaja; `main` es el espejo de producción. Todo sale de `develop` y vuelve a `develop` por PR. Después de cada release (build o `eas update` a producción) se abre un PR `develop → main` con merge commit. Detalle en `docs/WORKFLOW.md` §1.
- **Los builds de EAS nunca son automáticos:** `eas-build.yml` y `eas-build-preview.yml` corren sólo a mano desde la pestaña Actions. Mergear a `main` no compila nada.
- **OTA (`eas update`):** empaqueta el checkout local. Partir del `gitCommitHash` de la build vigente (`eas build:list --platform ios --limit 1 --json`), sin cambios sin commitear, con `--environment production` y rollout inicial al 10%. Sólo JS: nada nativo ni cambios en `app.json`.
- Los PRs hacia `main`/`develop` corren CI (`.github/workflows/ci.yml`): `tsc`, `eslint`, Vitest, los tests pgTAP sobre un stack efímero y la comparación del fingerprint nativo contra la base del PR.
- ⚠️ Single-project (Free Tier): todas las ramas **comparten la base de Producción**. No hay Staging; validá cambios de schema en local (`supabase start`) antes de `db push`. Las migraciones de las RPCs `dashboard_*` de la web también viven acá. Detalle en `docs/WORKFLOW.md`.

## Architecture

### Tech Stack
- **Expo 57 + React Native 0.86 (React 19.2)** with Expo Router (file-based routing)
- **Supabase** — PostgreSQL, Auth, Storage, real-time subscriptions
- **NativeWind 4** — Tailwind CSS for React Native (no `StyleSheet.create`)
- **Zustand 5** — client state (active team selection)
- **React Context** — global auth session (`AuthContext`)
- **React Hook Form + Zod 4** — form management and validation
- **TypeScript strict mode** — no `any` allowed

### Folder Structure
| Path | Purpose |
|------|---------|
| `app/` | Screens and routing. Main tabs at `app/(tabs)/`, modals at `app/(modals)/` |
| `components/ui/` | Base, reusable, domain-agnostic components (buttons, inputs, icons) |
| `components/[domain]/` | Feature-specific components (e.g. `market/`, `profile/`, `team-manage/`) |
| `lib/` | Data Access Layer — Supabase client, API functions, Zod schemas |
| `stores/` | Zustand stores (e.g. `teamStore.ts`) |
| `context/` | Global React Context providers (`AuthContext.tsx`) |
| `hooks/` | Custom global hooks |
| `constants/` | Design tokens (`theme.ts`) |
| `types/` | TypeScript types — `supabase.ts` is auto-generated from the DB schema |

### Navigation & Auth Flow
`app/_layout.tsx` gates routing based on auth state from `AuthContext`:
- No session → `/login`
- Session + incomplete profile → `/onboarding`
- Session + complete profile → `/(tabs)`

The five main tabs, in tab-bar order: Home (index), Ranking, Matches, Market, Profile.

### State Management
- **`AuthContext`** (`context/AuthContext.tsx`) — Supabase session + loaded user profile. Access via `useAuth()`.
- **`useTeamStore`** (`stores/teamStore.ts`) — Zustand store for the user's team list and their currently selected active team.
- Everything else is local component state or derived from Supabase queries.

### Data Access Layer
All Supabase queries live in `lib/`. Components never query Supabase directly.
- `lib/supabase.ts` — client initialization
- `lib/*-api.ts` files — CRUD for each domain (market, chat, etc.)
- `lib/profile-data.ts`, `lib/profile-detailed-stats.ts` — profile queries
- `lib/team-helpers.ts` — team utility functions
- `lib/schemas/` — Zod schemas; use `z.infer<typeof schema>` for TypeScript types

### Database Domain Model (key tables)
`profiles` → `team_members` → `teams` → `matches` → `match_participants` / `match_results`
`challenges` → `match_proposals` → `matches` · `wo_claims` · `team_rankings` (rating per format) · `seasons`
`market_team_posts` | `market_player_posts` (each with its `*_applications`)
`conversations` (`MATCH_CHAT` | `MARKET_DM`) → `messages`

Team member roles: `CAPITAN`, `SUBCAPITAN`, `JUGADOR`, `DIRECTOR_TECNICO`
Match statuses: `PENDIENTE`, `CONFIRMADO`, `EN_VIVO`, `FINALIZADO`, `EN_DISPUTA`, `WO_A`, `WO_B`, `CANCELADO` (flow in `knowledge/07-flujo-estados-partido.md`, outside this repo)

## Tab Screen Pattern (follow profile.tsx as the reference)

Every new tab screen must follow this structure:

**Screen file** (`app/(tabs)/[name].tsx`) stays thin — it only orchestrates:
1. Data loading via a single `fetch[Domain]ViewData(profile)` function from `lib/`
2. Navigation handlers passed as props
3. Loading/error/empty states

**Data shape** — define a `[Domain]ViewData` type in `components/[domain]/types.ts` and fetch it all in one call.

**Refresh on focus** — always use `useFocusEffect` + `useCallback` to reload when the tab is re-entered.

**Sections** — extract each visual block into its own component in `components/[domain]/`. The screen just composes them:
```tsx
<GlobalHeader />
<ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 114 }}>
  <DomainHeaderSection data={viewData.header} />
  <DomainStatsSection  stats={viewData.stats} />
  <DomainXyzSection   items={viewData.xyz} onPress={...} />
</ScrollView>
{AlertComponent}
```

**States pattern:**
```tsx
if (loading) return <GlobalLoader label="..." />;
if (!data)   return <View ...><Text>No disponible</Text>{AlertComponent}</View>;
return <View className="flex-1 bg-surface-base">...</View>;
```

**Errors** — always use `useCustomAlert` + `getGenericSupabaseErrorMessage`, never `Alert.alert`.

## Development Rules

1. **TypeScript:** Never use `any`. Infer types with `z.infer<typeof schema>` or from Supabase-generated types in `types/supabase.ts`.
2. **Styling:** Only NativeWind `className` props. Never `StyleSheet.create`. Use the design tokens below.
3. **Supabase errors:** Always return formatted error objects; use the `getGenericSupabaseErrorMessage` helper.
4. **Imports:** Use `@/` absolute aliases — `import { supabase } from '@/lib/supabase'`.
5. **Component size:** Extract complex logic out of UI components into `lib/` or hooks. Keep components short and readable.
6. **New screens:** Go in `app/`. New modals go in `app/(modals)/`.

## Color Palette (tailwind.config.js)

| Token | Usage |
|-------|-------|
| `brand-primary` (#53E076) | Primary green accent |
| `brand-primary-container` (#1DB954) | Darker green for filled elements |
| `surface-lowest` (#0E0E0E) | Darkest background |
| `surface-base` (#131313) | Default screen background |
| `surface-container` (#201F1F) | Card backgrounds |
| `surface-high` (#2A2A2A) | Elevated surfaces |
| `neutral-on-surface` (#E5E2E1) | Primary text |
| `neutral-on-surface-variant` (#BCCBB9) | Secondary/muted text |
| `neutral-outline` (#869585) | Borders and dividers |
| `info-secondary` (#8CCDFF) | Info/secondary actions |
| `warning-tertiary` (#FABD32) | Warnings |
| `danger-error` (#FFB4AB) | Errors |

Custom shadows: `shadow-ambient-sm`, `shadow-ambient-lg`, `shadow-glow-primary`.

Custom fonts: `font-ui`, `font-uiBold`, `font-uiBlack` (Inter), `font-display`, `font-displayBlack` (Barlow Condensed), `font-epic` (Epilogue).
