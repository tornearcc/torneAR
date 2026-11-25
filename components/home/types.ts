import type { Database } from '@/types/supabase';

type TeamRole = Database['public']['Enums']['team_role'];
type MatchStatus = Database['public']['Enums']['match_status'];
type MatchType = Database['public']['Enums']['match_type'];
type TeamFormat = Database['public']['Enums']['team_format'];

export interface HomeTeamSnapshot {
  id: string;
  name: string;
  shieldUrl: string | null;
  /**
   * Puntaje del MEJOR formato del equipo, el mismo criterio que el widget de
   * Top 3 y la tab Ranking. Ver `lib/team-ranking-format`.
   */
  eloRating: number;
  /**
   * Formato al que pertenece ese puntaje. `null` cuando el equipo nunca jugó un
   * partido de ranking y la cifra es el ELO global de arranque: ahí no hay
   * formato que rotular.
   */
  rankingFormat: TeamFormat | null;
  fairPlayScore: number;
  seasonWins: number;
  seasonDraws: number;
  seasonLosses: number;
  role: TeamRole;
}

export interface HomeMatchEntry {
  id: string;
  status: MatchStatus;
  matchType: MatchType;
  scheduledAt: string | null;
  format: TeamFormat | null;
  teamA: { id: string; name: string; shieldUrl: string | null; eloRating: number };
  teamB: { id: string; name: string; shieldUrl: string | null; eloRating: number };
  myTeamId: string;
}

/**
 * D12 — Las señales de la bandeja "Requieren tu atención".
 *
 * Las tres primeras son las originales. Las cuatro siguientes son las que
 * faltaban, y no por casualidad: **todas tienen vencimiento real**. Una
 * propuesta sin responder termina cancelada por `sweep_stale_matches`, una
 * solicitud de cancelación sin responder deja el partido comprometido, un
 * `EN_VIVO` sin resultado se cierra sin computar a las 24 h, y una postulación
 * sin mirar envejece hasta que el aviso se cierra. Eran justo las acciones que
 * más caro salía no ver.
 */
export type PendingActionType =
  | 'TEAM_REQUEST'
  | 'CHALLENGE_RECEIVED'
  | 'DISPUTE'
  | 'MATCH_PROPOSAL'
  | 'CANCELLATION_REQUEST'
  | 'LIVE_RESULT'
  | 'MARKET_APPLICATION';

export interface PendingAction {
  type: PendingActionType;
  count: number;
  label: string;
  /**
   * Partido al que apunta la tarjeta, cuando la acción es de UNO solo. Con
   * varios queda `null` y la navegación cae en la lista. Sin esto, "1 propuesta
   * esperando tu respuesta" obligaba a buscar cuál a mano.
   */
  matchId?: string | null;
}

export interface HomeViewData {
  myTeams: HomeTeamSnapshot[];
  upcomingMatches: HomeMatchEntry[];
  pendingActions: PendingAction[];
  /**
   * Solicitudes ACEPTADAS por un equipo que todavía esperan que el jugador
   * confirme el traspaso. Se calcula incluso sin equipos: ése es justamente el
   * caso del jugador recién aceptado que aún no entró a ningún plantel.
   */
  pendingTransfers: number;
  /** Ver `HomeIncompleteTeam`. Opcional para no tocar cada armado de `HomeViewData` en los tests. */
  incompleteTeam?: HomeIncompleteTeam | null;
}

/**
 * Equipo que el usuario capitanea (o subcapitanea) con menos jugadores que los
 * que pide su formato (rediseño, etapa 1). Inicio lo muestra como «Completá tu
 * equipo · n de N».
 */
export interface HomeIncompleteTeam {
  id: string;
  name: string;
  inviteCode: string;
  shieldUrl: string | null;
  members: number;
  needed: number;
  format: TeamFormat | null;
}
