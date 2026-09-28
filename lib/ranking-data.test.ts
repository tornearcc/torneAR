import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchRankingWithFilters,
  fetchPlayerLeaderboard,
  fetchPlayerLeaderboardPage,
  appendLeaderboardPage,
  loadLeaderboardUntilMine,
  leaderboardEntryKey,
  type LeaderboardPage,
} from './ranking-data';
import type { PlayerLeaderboardEntry, RankingFiltersState } from '@/components/ranking/types';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

vi.mock('@/lib/supabase-storage', () => ({
  getSupabaseStorageUrl: (bucket: string, path: string) => `URL:${bucket}/${path}`,
}));

vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function leaderboardRow(profileId: string, rank: number, overrides: Record<string, unknown> = {}) {
  return {
    rank_position: rank,
    profile_id: profileId,
    full_name: `Jugador ${profileId}`,
    username: `u_${profileId}`,
    avatar_url: `${profileId}/avatar.jpg`,
    team_id: 'team-1',
    team_name: 'Los Pibes',
    zone: 'Berazategui',
    value: 10 - rank,
    ...overrides,
  };
}

function entry(profileId: string, teamId = 'team-1', isMyPlayer = false): PlayerLeaderboardEntry {
  return {
    rankPosition: 1, profileId, fullName: profileId, avatarUrl: null,
    teamId, teamName: 'T', value: 1, isMyPlayer,
  };
}

const FILTERS: RankingFiltersState = { zone: 'Berazategui', category: 'HOMBRES', format: null, rivalesIdeales: false };

describe('fetchRankingWithFilters', () => {
  it('manda los tres filtros a get_team_ranking y marca mis equipos', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [
        { rank_position: 1, team_id: 't1', team_name: 'A', shield_url: 't1/shield.png', zone: 'Z', category: 'HOMBRES',
          preferred_format: 'FUTBOL_5', elo_rating: 1200, fair_play_score: 90, season_wins: 3, season_losses: 0,
          season_draws: 0, matches_played: 3 },
      ],
      error: null,
    });

    const result = await fetchRankingWithFilters(FILTERS, ['t1'], null);

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_team_ranking', {
      p_zone: 'Berazategui', p_category: 'HOMBRES', p_format: undefined,
    });
    expect(result[0]).toMatchObject({ teamId: 't1', isMyTeam: true, shieldUrl: 'URL:shields/t1/shield.png' });
  });

  it('rivales ideales recorta a ±200 del ELO del equipo activo', async () => {
    const base = { team_name: 'x', shield_url: null, zone: 'Z', category: 'HOMBRES', preferred_format: 'FUTBOL_5',
      fair_play_score: 0, season_wins: 0, season_losses: 0, season_draws: 0, matches_played: 0 };
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [
        { ...base, rank_position: 1, team_id: 'lejos', elo_rating: 1500 },
        { ...base, rank_position: 2, team_id: 'cerca', elo_rating: 1150 },
      ],
      error: null,
    });

    const result = await fetchRankingWithFilters({ ...FILTERS, rivalesIdeales: true }, [], 1000);

    expect(result.map((r) => r.teamId)).toEqual(['cerca']);
  });
});

describe('fetchPlayerLeaderboard (resumen de la pestaña)', () => {
  it('manda categoría y formato, así el top coincide con la tabla completa', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [leaderboardRow('p1', 1)], error: null });

    await fetchPlayerLeaderboard('goals', { zone: 'Z', category: 'MIXTO', format: 'FUTBOL_7' }, 'season-1');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_player_leaderboard', {
      p_stat: 'goals', p_zone: 'Z', p_season_id: 'season-1', p_category: 'MIXTO', p_format: 'FUTBOL_7',
    });
  });

  it('sin filtros no manda los parámetros (el servidor usa sus defaults)', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [], error: null });

    await fetchPlayerLeaderboard('mvps', { zone: null, category: null, format: null }, null);

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_player_leaderboard', {
      p_stat: 'mvps', p_zone: undefined, p_season_id: undefined, p_category: undefined, p_format: undefined,
    });
  });

  it('sigue inyectando al usuario al final cuando no está en el top', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [leaderboardRow('p1', 1)], error: null });

    const result = await fetchPlayerLeaderboard('goals', FILTERS, null, {
      profileId: 'yo', fullName: 'Yo', avatarUrl: null, teamId: 't', teamName: 'T',
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ profileId: 'yo', value: 0, isMyPlayer: true, rankPosition: 2 });
  });
});

describe('fetchPlayerLeaderboardPage', () => {
  it('pide limit/offset y mapea la fila con la URL del avatar', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [leaderboardRow('p1', 51)], error: null });

    const page = await fetchPlayerLeaderboardPage({
      stat: 'goals', filters: FILTERS, seasonId: null, myProfileId: 'p1', offset: 50, limit: 50,
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_player_leaderboard', {
      p_stat: 'goals', p_zone: 'Berazategui', p_season_id: undefined, p_category: 'HOMBRES',
      p_format: undefined, p_limit: 50, p_offset: 50,
    });
    expect(page.entries[0]).toMatchObject({
      rankPosition: 51, profileId: 'p1', avatarUrl: 'URL:avatars/p1/avatar.jpg', isMyPlayer: true,
    });
  });

  it('hasMore sólo cuando la página vino llena', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [leaderboardRow('a', 1), leaderboardRow('b', 2)], error: null });
    const full = await fetchPlayerLeaderboardPage({
      stat: 'goals', filters: FILTERS, seasonId: null, myProfileId: null, offset: 0, limit: 2,
    });
    expect(full.hasMore).toBe(true);

    supabaseMock.rpc.mockResolvedValueOnce({ data: [leaderboardRow('c', 3)], error: null });
    const last = await fetchPlayerLeaderboardPage({
      stat: 'goals', filters: FILTERS, seasonId: null, myProfileId: null, offset: 2, limit: 2,
    });
    expect(last.hasMore).toBe(false);
  });

  it('no inyecta al usuario: en la tabla completa sería una posición inventada', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [leaderboardRow('otro', 1)], error: null });

    const page = await fetchPlayerLeaderboardPage({
      stat: 'goals', filters: FILTERS, seasonId: null, myProfileId: 'yo', offset: 0,
    });

    expect(page.entries.map((e) => e.profileId)).toEqual(['otro']);
  });

  it('propaga el error del RPC', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });

    await expect(
      fetchPlayerLeaderboardPage({ stat: 'goals', filters: FILTERS, seasonId: null, myProfileId: null, offset: 0 }),
    ).rejects.toThrow('boom');
  });
});

describe('appendLeaderboardPage', () => {
  it('no repite filas y distingue al mismo jugador en dos equipos', () => {
    const current = [entry('a'), entry('b')];
    const merged = appendLeaderboardPage(current, [entry('b'), entry('b', 'team-2'), entry('c')]);

    expect(merged.map(leaderboardEntryKey)).toEqual(['a:team-1', 'b:team-1', 'b:team-2', 'c:team-1']);
  });
});

describe('loadLeaderboardUntilMine', () => {
  it('no pide nada si ya estoy en lo cargado', async () => {
    const loadPage = vi.fn();
    const result = await loadLeaderboardUntilMine(
      { entries: [entry('a'), entry('yo', 'team-1', true)], nextOffset: 2, hasMore: true },
      loadPage,
    );

    expect(loadPage).not.toHaveBeenCalled();
    expect(result.index).toBe(1);
  });

  it('carga páginas hasta encontrarme, con el offset del servidor', async () => {
    const pages: LeaderboardPage[] = [
      // La primera trae una fila repetida: el offset igual tiene que avanzar 2.
      { entries: [entry('a'), entry('b')], hasMore: true },
      { entries: [entry('yo', 'team-1', true), entry('c')], hasMore: true },
    ];
    const loadPage = vi.fn(async () => pages.shift()!);

    const result = await loadLeaderboardUntilMine(
      { entries: [entry('a')], nextOffset: 1, hasMore: true },
      loadPage,
    );

    expect(loadPage.mock.calls).toEqual([[1], [3]]);
    expect(result).toMatchObject({ index: 2, nextOffset: 5, hasMore: true });
    expect(result.entries.map((e) => e.profileId)).toEqual(['a', 'b', 'yo', 'c']);
  });

  it('se detiene sin más páginas o en el tope, y devuelve -1', async () => {
    const endless = vi.fn(async (): Promise<LeaderboardPage> => ({ entries: [entry(`x${Math.random()}`)], hasMore: true }));
    const capped = await loadLeaderboardUntilMine({ entries: [], nextOffset: 0, hasMore: true }, endless, 3);
    expect(endless).toHaveBeenCalledTimes(3);
    expect(capped.index).toBe(-1);

    const finite = vi.fn(async (): Promise<LeaderboardPage> => ({ entries: [entry('z')], hasMore: false }));
    const done = await loadLeaderboardUntilMine({ entries: [], nextOffset: 0, hasMore: true }, finite);
    expect(finite).toHaveBeenCalledTimes(1);
    expect(done).toMatchObject({ index: -1, hasMore: false });
  });
});
