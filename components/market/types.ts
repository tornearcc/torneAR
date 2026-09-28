import { MarketTeamPost, MarketPlayerPost, ManagedTeam } from '@/lib/market-api';

export type TabType = 'TEAMS_LOOKING' | 'PLAYERS_LOOKING';

export type MarketViewData = {
  teamPosts: MarketTeamPost[];
  playerPosts: MarketPlayerPost[];
  managedTeams: ManagedTeam[];
  myTeamIds: string[];
  myManagedTeamsMemberProfileIds: string[];
};

/**
 * Lo que el menú de moderación necesita saber de una publicación.
 *
 * Viaja armado desde la lista y no se reconstruye en la pantalla porque el
 * autor sale de una columna distinta según el feed —`created_by` en las ofertas
 * de equipo, `profile_id` en las de jugador— y ese detalle no tiene por qué
 * subir hasta el contenedor.
 */
export type MarketModerationTarget = {
  postId: string;
  entityType: 'MARKET_TEAM_POST' | 'MARKET_PLAYER_POST';
  authorProfileId: string;
  /** Nombre que ve el usuario: el del equipo o el del jugador. */
  authorName: string;
};

export type MarketSortBy = 'nearest' | 'recent';

export type MarketFilters = {
  zone: string | null;
  selectedDays: string[];
  sortBy: MarketSortBy;
};
