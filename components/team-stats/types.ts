import { Database } from '@/types/supabase';

export type TeamCategory = Database['public']['Enums']['team_category'];
export type TeamFormat = Database['public']['Enums']['team_format'];
export type TeamRole = Database['public']['Enums']['team_role'];

export type TeamStatsHeader = {
  id: string;
  name: string;
  zone: string;
  category: TeamCategory;
  format: TeamFormat;
  shieldUrl: string | null;
  prRating: number;
  fairPlayScore: number;
  /**
   * Promedio de edad del plantel y sobre cuantos jugadores se calculo.
   *
   * `null` cuando ningun miembro cargo su fecha de nacimiento. `counted` viaja
   * junto al promedio porque `averageAge` ignora a quienes no la cargaron: sin
   * ese dato la UI no puede aclarar que el numero sale de una parte del plantel.
   */
  squadAge: { average: number; counted: number } | null;
};

/**
 * Cada campo es un dato atomico y ya formateado: la grilla de Temporada pinta
 * una `StatCard` por campo, sin combinar dos metricas en la misma caja.
 */
export type TeamSeasonRecord = {
  /** Partidos disputados en la temporada (V + E + D). */
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Diferencia de gol. Puede ser negativa; la UI le pone el signo. */
  goalDiff: number;
  winPercent: string;
  /** Promedio de goles a favor por partido. */
  avgGoals: string;
  /** Promedio de goles en contra por partido. */
  avgGoalsAgainst: string;
};

export type FormResult = 'V' | 'E' | 'D';

export type TeamRecentMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  matchType: string;
  rivalName: string;
  /** Escudo del rival, ya resuelto a URL absoluta. `null` si el club no cargo uno. */
  rivalShieldUrl: string | null;
  /** team.id del rival: lo usa el visor de fotos para "Denunciar" el escudo. */
  rivalTeamId: string;
  /**
   * MVP que eligio ESTE equipo en el partido. `null` cuando no se cargo (es
   * opcional al subir el resultado) o cuando el partido no termino.
   */
  mvpName: string | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: FormResult | null;
  prDelta: number | null;
};

export type TeamMemberStat = {
  profileId: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  position: string;
  role: TeamRole;
  /**
   * Edad ya calculada server-side (vista `profiles_public`), no
   * `date_of_birth` crudo: desde 20260819100000_privacy_and_age_compliance
   * la fecha exacta de un perfil ajeno no es legible desde el cliente.
   * Costo aceptado: queda fija al momento del fetch, no recalculada en vivo
   * si la pantalla sigue abierta al cruzar la medianoche del cumpleaños.
   */
  age: number | null;
  matchesPlayed: number;
  goals: number;
  presencePercent: string;
};

export type TeamBadgeItem = {
  id: string;
  slug: string;
  name: string;
  criteriaDescription: string;
  iconUrl: string;
  entityType: string;
  isEarned: boolean;
};

export type TeamEloPoint = {
  matchId: string;
  createdAt: string;
  elo: number;
};

export type TeamStatsViewData = {
  header: TeamStatsHeader;
  season: TeamSeasonRecord;
  form: FormResult[];
  recentMatches: TeamRecentMatch[];
  members: TeamMemberStat[];
  isOwnTeam: boolean;
  badges: TeamBadgeItem[];
  eloHistory: TeamEloPoint[];
};

export interface H2HMatch {
  matchId: string;
  scheduledAt: string;
  matchType: 'RANKING' | 'AMISTOSO';
  teamAId: string;
  teamAName: string;
  teamAGoals: number;
  teamBId: string;
  teamBName: string;
  teamBGoals: number;
  status: string;
}