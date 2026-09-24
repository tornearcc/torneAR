import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { resolveBestFormatRanking, type FormatRankingRow } from '@/lib/team-ranking-format';
import type { Database } from '@/types/supabase';
import type {
    RankingFiltersState, RankingTeamEntry, RivalTeamEntry,
    PlayerLeaderboardEntry, LeaderboardStat
} from '@/components/ranking/types';

// Fila devuelta por get_team_ranking / search_teams. rank_position sólo lo trae
// get_team_ranking; in_ranking sólo search_teams — ambos opcionales acá.
type RankingRpcRow = {
    rank_position?: number;
    team_id: string;
    team_name: string;
    shield_url: string | null;
    zone: string;
    category: Database['public']['Enums']['team_category'];
    preferred_format: Database['public']['Enums']['team_format'];
    elo_rating: number;
    fair_play_score: number;
    season_wins: number;
    season_losses: number;
    season_draws: number;
    matches_played: number;
    in_ranking?: boolean;
};

// Helper para mapear fila de DB a objeto TS
function mapToRankingTeamEntry(row: RankingRpcRow, userTeamIds: string[]): RankingTeamEntry {
    return {
        rankPosition: Number(row.rank_position),
        teamId: row.team_id,
        teamName: row.team_name,
        shieldUrl: row.shield_url ? getSupabaseStorageUrl('shields', row.shield_url) : null,
        zone: row.zone,
        category: row.category,
        preferredFormat: row.preferred_format,
        eloRating: row.elo_rating,
        fairPlayScore: Number(row.fair_play_score),
        seasonWins: row.season_wins,
        seasonLosses: row.season_losses,
        seasonDraws: row.season_draws,
        matchesPlayed: row.matches_played,
        isMyTeam: userTeamIds.includes(row.team_id),
    };
}

// 1. Fetch de la tabla de posiciones (con filtros)
export async function fetchRankingWithFilters(
    filters: RankingFiltersState,
    userTeamIds: string[],
    activeTeamElo: number | null
): Promise<RankingTeamEntry[]> {
    const { data, error } = await supabase.rpc('get_team_ranking', {
        p_zone: filters.zone ?? undefined,
        p_category: filters.category ?? undefined,
        p_format: filters.format ?? undefined,
    });
    if (error) throw error;

    const rows = data ?? [];

    // Filtrar ELO en el cliente si "Rivales Ideales" está activo
    const filtered = filters.rivalesIdeales && activeTeamElo !== null
        ? rows.filter((row) => row.elo_rating >= activeTeamElo - 200 && row.elo_rating <= activeTeamElo + 200)
        : rows;

    return filtered.map((row) => mapToRankingTeamEntry(row, userTeamIds));
}

// 2. Búsqueda libre de equipos
export async function searchRivalTeams(
    search: string,
    filters: RankingFiltersState,
    userTeamIds: string[],
    activeTeamElo: number | null
): Promise<RivalTeamEntry[]> {
    const minElo = filters.rivalesIdeales && activeTeamElo !== null ? Math.max(0, activeTeamElo - 200) : 0;
    const maxElo = filters.rivalesIdeales && activeTeamElo !== null ? activeTeamElo + 200 : 9999;

    const { data, error } = await supabase.rpc('search_teams', {
        p_search: search || undefined,
        p_zone: filters.zone ?? undefined,
        p_category: filters.category ?? undefined,
        p_format: filters.format ?? undefined,
        p_min_elo: minElo,
        p_max_elo: maxElo,
    });
    if (error) throw error;

    return (data ?? []).map((row) => {
        const entry = mapToRankingTeamEntry(row, userTeamIds);
        return { ...entry, inRanking: row.in_ranking ?? false };
    });
}

// ── Bootstrap del ranking (temporada activa, zonas, datos del equipo activo) ──

export interface ActiveTeamRankingInfo {
    eloRating: number;
    zone: string | null;
    category: Database['public']['Enums']['team_category'];
    format: Database['public']['Enums']['team_format'];
}

// Temporada activa (o null si no hay ninguna).
export async function fetchActiveSeason(): Promise<{ id: string; name: string } | null> {
    const { data, error } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('is_active', true)
        .maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * ELO + datos de filtro semilla del equipo activo (o null si no existe).
 *
 * `format` es el **mejor formato** del equipo (el de mayor ELO), no su
 * `preferred_format`. El preferido es lo que alguien tipeó al crear el equipo y
 * casi nunca se actualiza: un equipo que se dio de alta como F11 pero juega
 * todo en F5 abria el ranking filtrado en F11, se veia ultimo o directamente
 * ausente, y concluia que la tabla estaba rota.
 *
 * El `elo_rating` devuelto acompaña a ese formato — son el mismo dato mirado
 * desde dos lados, y devolver el ELO global junto al mejor formato daria un par
 * incoherente.
 *
 * Si el equipo todavia no tiene filas en `team_rankings` (nunca jugo un partido
 * de ranking) se cae al preferido y al ELO global, que es lo unico que hay.
 */
export async function fetchActiveTeamRankingInfo(teamId: string): Promise<ActiveTeamRankingInfo | null> {
    const [teamRes, rankingsRes] = await Promise.all([
        supabase
            .from('teams')
            .select('elo_rating, zone, category, preferred_format')
            .eq('id', teamId)
            .single(),
        supabase
            .from('team_rankings')
            .select('format, elo_score')
            .eq('team_id', teamId),
    ]);

    if (teamRes.error || !teamRes.data) return null;
    const data = teamRes.data;

    if (rankingsRes.error) {
        // No es fatal: se cae al formato preferido, que es el comportamiento
        // anterior. Pero queda registrado, porque desde afuera el sintoma
        // ("abre en el formato equivocado") es identico a un bug de logica.
        Logger.warn('No se pudieron leer los ELO por formato; se usa el formato preferido', {
            scope: 'ranking-data.fetchActiveTeamRankingInfo',
            teamId,
            error: rankingsRes.error,
        });
    }

    // Mismo resolvedor que usa la Home para la tarjeta de Mis Equipos: es lo
    // que garantiza que las dos pantallas muestren la misma cifra y el mismo
    // formato para el mismo equipo.
    const best = resolveBestFormatRanking((rankingsRes.data ?? []) as FormatRankingRow[], {
        eloRating: data.elo_rating,
        format: data.preferred_format,
    });

    return {
        eloRating: best.eloRating,
        zone: data.zone,
        category: data.category,
        format: best.format,
    };
}

interface FallbackPlayer {
    profileId: string;
    fullName: string;
    avatarUrl: string | null;
    teamId: string | null;
    teamName: string | null;
}

/**
 * Filtros que entiende `get_player_leaderboard`. Son los mismos de la tabla de
 * equipos salvo "rivales ideales", que es un rango de ELO de EQUIPO y no tiene
 * equivalente para un jugador. Categoría = la del equipo con el que sumó;
 * formato = el del partido.
 */
export type LeaderboardFilters = Pick<RankingFiltersState, 'zone' | 'category' | 'format'>;

type LeaderboardRpcRow = Database['public']['Functions']['get_player_leaderboard']['Returns'][number];

function mapToLeaderboardEntry(row: LeaderboardRpcRow, myProfileId: string | null): PlayerLeaderboardEntry {
    return {
        rankPosition: Number(row.rank_position),
        profileId: row.profile_id,
        fullName: row.full_name,
        username: row.username ?? undefined,
        avatarUrl: row.avatar_url ? getSupabaseStorageUrl('avatars', row.avatar_url) : null,
        teamId: row.team_id,
        teamName: row.team_name,
        zone: row.zone ?? undefined,
        value: Number(row.value),
        isMyPlayer: myProfileId !== null && row.profile_id === myProfileId,
    };
}

/**
 * Identidad de una fila del leaderboard. El RPC agrupa por (jugador, equipo),
 * así que alguien que sumó en dos equipos aparece dos veces: el profileId solo
 * no alcanza como key.
 */
export function leaderboardEntryKey(entry: Pick<PlayerLeaderboardEntry, 'profileId' | 'teamId'>): string {
    return `${entry.profileId}:${entry.teamId}`;
}

// 3. Fetch del Leaderboard de jugadores (resumen de la pestaña: top 20)
export async function fetchPlayerLeaderboard(
    stat: LeaderboardStat,
    filters: LeaderboardFilters,
    seasonId: string | null,
    fallback?: FallbackPlayer
): Promise<PlayerLeaderboardEntry[]> {
    const { data, error } = await supabase.rpc('get_player_leaderboard', {
        p_stat: stat,
        p_zone: filters.zone ?? undefined,
        p_season_id: seasonId ?? undefined,
        p_category: filters.category ?? undefined,
        p_format: filters.format ?? undefined,
    });
    if (error) throw error;

    const entries: PlayerLeaderboardEntry[] = (data ?? []).map((row) =>
        mapToLeaderboardEntry(row, fallback?.profileId ?? null),
    );

    // Si el usuario no aparece en los resultados, lo inyectamos al final con valor 0
    if (fallback && !entries.some(e => e.profileId === fallback.profileId)) {
        entries.push({
            rankPosition: entries.length + 1,
            profileId: fallback.profileId,
            fullName: fallback.fullName,
            avatarUrl: fallback.avatarUrl ? getSupabaseStorageUrl('avatars', fallback.avatarUrl) : null,
            teamId: fallback.teamId ?? '',
            teamName: fallback.teamName ?? '',
            value: 0,
            isMyPlayer: true,
        });
    }

    return entries;
}

// 4. Leaderboard paginado ("Ver tabla completa")

/** Tamaño de página de la tabla completa. El servidor topea en 100. */
export const LEADERBOARD_PAGE_SIZE = 50;

export interface LeaderboardPage {
    entries: PlayerLeaderboardEntry[];
    /** Hay (probablemente) más filas: la página vino llena. */
    hasMore: boolean;
}

/**
 * Una página de la tabla completa de jugadores. A diferencia de
 * `fetchPlayerLeaderboard` NO inyecta al usuario al final con valor 0: en la
 * tabla completa esa fila sería una posición inventada.
 *
 * `rank_position` es global (el RPC numera antes de recortar), así que la
 * página 2 empieza en 51 y no hace falta renumerar en el cliente.
 */
export async function fetchPlayerLeaderboardPage(params: {
    stat: LeaderboardStat;
    filters: LeaderboardFilters;
    seasonId: string | null;
    myProfileId: string | null;
    offset: number;
    limit?: number;
}): Promise<LeaderboardPage> {
    const limit = params.limit ?? LEADERBOARD_PAGE_SIZE;
    const { data, error } = await supabase.rpc('get_player_leaderboard', {
        p_stat: params.stat,
        p_zone: params.filters.zone ?? undefined,
        p_season_id: params.seasonId ?? undefined,
        p_category: params.filters.category ?? undefined,
        p_format: params.filters.format ?? undefined,
        p_limit: limit,
        p_offset: params.offset,
    });
    if (error) throw error;

    const rows = data ?? [];
    return {
        entries: rows.map((row) => mapToLeaderboardEntry(row, params.myProfileId)),
        hasMore: rows.length === limit,
    };
}

/**
 * Suma una página a lo ya cargado sin repetir filas. El orden del servidor es
 * determinista, así que en condiciones normales no hay solapamiento; el filtro
 * cubre el caso de que la tabla cambie entre dos páginas (se cargó un
 * resultado) y una fila se corra de lugar.
 */
export function appendLeaderboardPage(
    current: PlayerLeaderboardEntry[],
    page: PlayerLeaderboardEntry[],
): PlayerLeaderboardEntry[] {
    const seen = new Set(current.map(leaderboardEntryKey));
    return [...current, ...page.filter((entry) => !seen.has(leaderboardEntryKey(entry)))];
}

/** Tope de páginas que "Ir a mi posición" carga buscando al usuario. */
export const LEADERBOARD_LOCATE_MAX_PAGES = 10;

/**
 * Carga páginas hasta encontrar la fila del usuario, o hasta que no haya más,
 * o hasta el tope. Devuelve todo lo cargado (para pintarlo) y el índice de la
 * primera fila del usuario, o -1 si no está en lo cargado.
 *
 * `nextOffset` cuenta filas que devolvió el SERVIDOR, no las que quedaron
 * después de deduplicar: si no, una fila repetida correría el offset y se
 * volvería a pedir la misma franja.
 */
export async function loadLeaderboardUntilMine(
    state: { entries: PlayerLeaderboardEntry[]; nextOffset: number; hasMore: boolean },
    loadPage: (offset: number) => Promise<LeaderboardPage>,
    maxPages = LEADERBOARD_LOCATE_MAX_PAGES,
): Promise<{ entries: PlayerLeaderboardEntry[]; nextOffset: number; hasMore: boolean; index: number }> {
    let { entries, nextOffset, hasMore } = state;
    let index = entries.findIndex((entry) => entry.isMyPlayer);

    for (let pages = 0; index === -1 && hasMore && pages < maxPages; pages += 1) {
        const page = await loadPage(nextOffset);
        entries = appendLeaderboardPage(entries, page.entries);
        nextOffset += page.entries.length;
        hasMore = page.hasMore;
        index = entries.findIndex((entry) => entry.isMyPlayer);
    }

    return { entries, nextOffset, hasMore, index };
}