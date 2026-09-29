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

/**
 * Fila del mini-ranking de la Home: el top 3 del formato que juega el equipo
 * del usuario. Es un recorte de `RankingTeamEntry` — sólo lo que entra en la
 * tarjeta, para no arrastrar zona/categoría/fair play que acá no se muestran.
 */
export interface MiniRankingEntry {
  rankPosition: number;
  teamId: string;
  teamName: string;
  shieldUrl: string | null;
  eloRating: number;
  isMyTeam: boolean;
}

/**
 * Los tres filtros que definen QUÉ ranking está mirando el usuario.
 *
 * Es el contrato que mantiene honesta a la tarjeta: la misma terna se usa para
 * consultar el top 3, para pintar los chips de la cabecera y para navegar a la
 * tab Ranking. Antes la Home consultaba sólo por formato mientras la tab
 * arrancaba filtrada por zona + categoría + formato del equipo activo, así que
 * "Ver la tabla completa" llevaba a una lista que no era la del widget.
 */
export interface MiniRankingContext {
  zone: string | null;
  category: Database['public']['Enums']['team_category'] | null;
  format: TeamFormat | null;
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
  /**
   * Equipo que el usuario capitanea (o subcapitanea) y todavía tiene un solo
   * integrante (Tanda 7). La Home muestra la tarjeta para invitar. `null` si no
   * hay ninguno o si no se pudo calcular: la tarjeta es un extra y no frena la
   * Home. Opcional para no tocar cada armado de `HomeViewData` en los tests.
   */
  soloTeam?: HomeSoloTeam | null;
}

export interface HomeSoloTeam {
  id: string;
  name: string;
  inviteCode: string;
}
