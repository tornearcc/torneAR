import type { LeaderboardStat, RankingFiltersState } from '@/components/ranking/types';

/**
 * Params de ruta del ranking: el contexto con el que llega la pestaña desde la
 * Home y la pantalla "Ver tabla completa".
 *
 * Los valores se validan contra los conocidos en vez de castearse: van derecho
 * como argumento enum de `get_team_ranking` / `get_player_leaderboard`, y un
 * valor basura (deep link a mano, param viejo) haría fallar la RPC y dejaría la
 * pantalla en error. Lo que no reconocemos vale null = "sin filtro".
 */

export const TEAM_CATEGORIES = ['HOMBRES', 'MUJERES', 'MIXTO'] as const;
export const TEAM_FORMATS = [
  'FUTBOL_5', 'FUTBOL_6', 'FUTBOL_7', 'FUTBOL_8', 'FUTBOL_9', 'FUTBOL_11',
] as const;
export const LEADERBOARD_STATS: readonly LeaderboardStat[] = [
  'goals', 'mvps', 'matches', 'clean_sheets', 'win_rate',
];

export type RouteParam = string | string[] | undefined;

/** Un param vacío es "sin filtro", no un filtro por string vacío. */
export function paramToNullable(value: RouteParam): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function parseCategoryParam(value: RouteParam): RankingFiltersState['category'] {
  const raw = paramToNullable(value);
  return TEAM_CATEGORIES.find((category) => category === raw) ?? null;
}

export function parseFormatParam(value: RouteParam): RankingFiltersState['format'] {
  const raw = paramToNullable(value);
  return TEAM_FORMATS.find((format) => format === raw) ?? null;
}

/** Stat desconocido o ausente = goleadores, la vista por defecto de la pestaña. */
export function parseLeaderboardStatParam(value: RouteParam): LeaderboardStat {
  const raw = paramToNullable(value);
  return LEADERBOARD_STATS.find((stat) => stat === raw) ?? 'goals';
}

// ── "Ver tabla completa" ─────────────────────────────────────────────────────

export type RankingFullKind = 'teams' | 'players';

export interface RankingFullContext {
  kind: RankingFullKind;
  filters: RankingFiltersState;
  stat: LeaderboardStat;
}

export type RankingFullParams = {
  kind: RankingFullKind;
  zone?: string;
  category?: string;
  format?: string;
  ideales?: '1';
  stat?: LeaderboardStat;
};

/**
 * Params para abrir la tabla completa con los mismos filtros que la pestaña.
 * Sólo viajan los filtros activos: expo-router serializa `undefined` como
 * ausente, y un param ausente se lee como "sin filtro".
 */
export function buildRankingFullParams(context: RankingFullContext): RankingFullParams {
  const { kind, filters, stat } = context;
  return {
    kind,
    ...(filters.zone ? { zone: filters.zone } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.format ? { format: filters.format } : {}),
    ...(kind === 'teams' && filters.rivalesIdeales ? { ideales: '1' as const } : {}),
    ...(kind === 'players' ? { stat } : {}),
  };
}

export function parseRankingFullParams(params: {
  kind?: RouteParam;
  zone?: RouteParam;
  category?: RouteParam;
  format?: RouteParam;
  ideales?: RouteParam;
  stat?: RouteParam;
}): RankingFullContext {
  return {
    kind: paramToNullable(params.kind) === 'players' ? 'players' : 'teams',
    filters: {
      zone: paramToNullable(params.zone),
      category: parseCategoryParam(params.category),
      format: parseFormatParam(params.format),
      rivalesIdeales: paramToNullable(params.ideales) === '1',
    },
    stat: parseLeaderboardStatParam(params.stat),
  };
}
