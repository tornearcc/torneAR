import { Database } from '@/types/supabase';

/**
 * El perfil que muestra esta pantalla sale de la vista `profiles_public`, no
 * de la tabla `profiles`.
 *
 * Desde 20260819100000_privacy_and_age_compliance el rol `authenticated` tiene
 * SELECT sobre una lista explicita de columnas de la tabla base, no sobre la
 * tabla entera: un `select('*')` se expande igual a `date_of_birth` y
 * `expo_push_token` y Postgres responde 42501 (`permission denied for table
 * profiles`) — para cualquier perfil, incluido el propio.
 *
 * El generador de tipos marca todas las columnas de una vista como nullable
 * (Postgres no propaga los NOT NULL de la tabla base a traves de una vista),
 * pero `id`, `username`, `full_name` y `preferred_position` son NOT NULL en
 * `profiles` y la vista las expone tal cual — se re-angostan aca para no
 * obligar a la UI a defenderse de un `null` que no puede llegar.
 *
 * `age` queda afuera a proposito: viaja aparte en `ProfileStatsViewData`, que
 * es donde `StatsHeader` ya la espera.
 */
type PublicProfileView = Database['public']['Views']['profiles_public']['Row'];

export type PublicProfileRow = Omit<
  PublicProfileView,
  'id' | 'username' | 'full_name' | 'preferred_position' | 'age'
> & {
  id: string;
  username: string;
  full_name: string;
  preferred_position: Database['public']['Enums']['player_position'];
};

export type TeamRole = Database['public']['Enums']['team_role'];

export type ProfileStatsSummary = {
  matchesPlayed: number;
  goals: number;
  mvps: number;
  wins: number;
  avgGoals: string;
  winPercent: string;
};

export type RecentMatchResult = {
  id: string;
  scheduledAt: string | null;
  status: string;
  matchType: string;
  rivalName: string;
  /** Escudo del rival, ya resuelto a URL absoluta. `null` si el club no cargo uno. */
  rivalShieldUrl: string | null;
  /** team.id del rival: lo usa el visor de fotos para "Denunciar" el escudo. */
  rivalTeamId: string;
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: 'V' | 'E' | 'D' | null;
  /** Goles que convirtio ESTE jugador en el partido. 0 = no anoto. */
  playerGoals: number;
  /** El jugador fue elegido MVP del partido por su equipo. */
  isMvp: boolean;
  /**
   * Movimiento de Ranking del equipo en ese partido.
   *
   * `null` cuando no hubo (amistoso, partido sin cerrar) o cuando el historial
   * no se pudo leer: son casos distintos pero la UI hace lo mismo con los dos —
   * no pinta el badge. Un 0 explicito si se muestra: significa "no se movio".
   */
  rankDelta: number | null;
};

export type EarnedBadge = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string;
  criteriaDescription: string;
  earnedAt: string;
  isEarned: boolean;
};

export type TeamEntry = {
  id: string;
  name: string;
  prRating: number;
  shieldUrl: string | null;
  role: TeamRole;
};

export type ProfileStatsViewData = {
  profile: PublicProfileRow;
  /**
   * Viene ya calculada por la vista `profiles_public` (columna derivada), no
   * de `date_of_birth`: desde 20260819100000_privacy_and_age_compliance esa
   * columna no es legible por SELECT directo para ningún perfil.
   */
  age: number | null;
  stats: ProfileStatsSummary;
  recentMatches: RecentMatchResult[];
  badges: EarnedBadge[];
  teams: TeamEntry[];
};
