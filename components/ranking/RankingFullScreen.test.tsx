import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Los vi.mock de abajo se elevan por encima de este import.
import RankingFullScreen from '@/app/ranking-full';

/**
 * Pantalla "Ver tabla completa" (app/ranking-full.tsx).
 *
 * Vive acá y no al lado de la pantalla porque todo archivo dentro de `app/` es
 * una ruta de expo-router.
 *
 * Lo que se prueba es el cableado: qué pide la pantalla con los params que
 * recibe, que cambiar el stat vuelva a la primera página, que "Mi posición"
 * pagine hasta encontrar al usuario y que un error no deje el esqueleto para
 * siempre. Las filas y el modal se reemplazan por stubs: su render (Reanimated,
 * expo-image) es del dispositivo, no de jsdom. El scroll infinito no se puede
 * disparar sin layout real; su lógica de offsets está en lib/ranking-data.test.
 */

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  showAlert: vi.fn(),
  fetchActiveSeason: vi.fn(),
  fetchActiveTeamRankingInfo: vi.fn(),
  fetchRankingWithFilters: vi.fn(),
  fetchPlayerLeaderboardPage: vi.fn(),
}));

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), back: vi.fn() },
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'yo' } }),
}));

vi.mock('@/stores/teamStore', () => {
  const state = { activeTeamId: 'mi-equipo', myTeams: [{ id: 'mi-equipo' }] };
  const useTeamStore = (selector: (s: typeof state) => unknown) => selector(state);
  useTeamStore.getState = () => state;
  return { useTeamStore };
});

vi.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({ showAlert: mocks.showAlert, AlertComponent: null }),
}));

vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/ranking-data', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ranking-data')>('@/lib/ranking-data');
  return {
    ...actual,
    fetchActiveSeason: mocks.fetchActiveSeason,
    fetchActiveTeamRankingInfo: mocks.fetchActiveTeamRankingInfo,
    fetchRankingWithFilters: mocks.fetchRankingWithFilters,
    fetchPlayerLeaderboardPage: mocks.fetchPlayerLeaderboardPage,
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('@/components/ranking/RankingTeamRow', async () => {
  const { Text } = await import('react-native');
  return {
    RankingTeamRow: ({ entry }: { entry: { teamName: string; rankPosition: number } }) =>
      <Text>{`equipo ${entry.rankPosition} ${entry.teamName}`}</Text>,
  };
});

vi.mock('@/components/ranking/PlayerLeaderboardRow', async () => {
  const { Text } = await import('react-native');
  return {
    PlayerLeaderboardRow: ({ entry }: { entry: { fullName: string; rankPosition: number } }) =>
      <Text>{`jugador ${entry.rankPosition} ${entry.fullName}`}</Text>,
  };
});

vi.mock('@/components/ranking/RankingRowSkeleton', async () => {
  const { Text } = await import('react-native');
  return { RankingRowSkeleton: () => <Text>cargando</Text> };
});

vi.mock('@/components/ranking/RankingFilterModal', () => ({ RankingFilterModal: () => null }));

function team(id: string, rank: number, isMyTeam = false) {
  return {
    rankPosition: rank, teamId: id, teamName: `Equipo ${id}`, shieldUrl: null, zone: 'Z', category: 'HOMBRES',
    preferredFormat: 'FUTBOL_5', eloRating: 1000, fairPlayScore: 100, seasonWins: 0, seasonLosses: 0,
    seasonDraws: 0, matchesPlayed: 0, isMyTeam,
  };
}

function player(id: string, rank: number, isMyPlayer = false) {
  return {
    rankPosition: rank, profileId: id, fullName: `Jugador ${id}`, avatarUrl: null,
    teamId: 't', teamName: 'T', value: 1, isMyPlayer,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.fetchActiveSeason.mockResolvedValue({ id: 'season-1', name: 'Temporada 1' });
});

describe('RankingFullScreen · equipos', () => {
  it('pide la tabla con los filtros de los params y la muestra entera', async () => {
    mocks.params = { kind: 'teams', zone: 'Berazategui', category: 'HOMBRES' };
    mocks.fetchRankingWithFilters.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => team(`t${i + 1}`, i + 1, i === 6)),
    );

    render(<RankingFullScreen />);

    expect(await screen.findByText('equipo 8 Equipo t8')).toBeTruthy();
    expect(mocks.fetchRankingWithFilters).toHaveBeenCalledWith(
      { zone: 'Berazategui', category: 'HOMBRES', format: null, rivalesIdeales: false },
      ['mi-equipo'],
      null,
    );
    expect(screen.getByText('Berazategui')).toBeTruthy();
    expect(screen.getByText('Mi equipo')).toBeTruthy();
  });

  it('con rivales ideales resuelve el ELO del equipo activo', async () => {
    mocks.params = { kind: 'teams', ideales: '1' };
    mocks.fetchActiveTeamRankingInfo.mockResolvedValue({ eloRating: 1234 });
    mocks.fetchRankingWithFilters.mockResolvedValue([team('t1', 1)]);

    render(<RankingFullScreen />);

    await screen.findByText('equipo 1 Equipo t1');
    expect(mocks.fetchActiveTeamRankingInfo).toHaveBeenCalledWith('mi-equipo');
    expect(mocks.fetchRankingWithFilters.mock.calls[0][2]).toBe(1234);
    // Sin mi equipo en la tabla no se ofrece el atajo.
    expect(screen.queryByText('Mi equipo')).toBeNull();
  });

  it('un error no deja el esqueleto para siempre y avisa', async () => {
    mocks.params = { kind: 'teams' };
    mocks.fetchRankingWithFilters.mockRejectedValue(new Error('boom'));

    render(<RankingFullScreen />);

    await waitFor(() => expect(mocks.showAlert).toHaveBeenCalledWith('Error', expect.any(String)));
    expect(screen.queryByText('cargando')).toBeNull();
    expect(screen.getByText('Sin resultados')).toBeTruthy();
  });
});

describe('RankingFullScreen · jugadores', () => {
  it('pide la primera página con stat, filtros y temporada', async () => {
    mocks.params = { kind: 'players', zone: 'Quilmes', category: 'MIXTO', format: 'FUTBOL_7', stat: 'mvps' };
    mocks.fetchPlayerLeaderboardPage.mockResolvedValue({ entries: [player('a', 1)], hasMore: false });

    render(<RankingFullScreen />);

    expect(await screen.findByText('jugador 1 Jugador a')).toBeTruthy();
    expect(mocks.fetchPlayerLeaderboardPage).toHaveBeenCalledWith({
      stat: 'mvps',
      filters: { zone: 'Quilmes', category: 'MIXTO', format: 'FUTBOL_7', rivalesIdeales: false },
      seasonId: 'season-1',
      myProfileId: 'yo',
      offset: 0,
    });
    expect(screen.getByText('Temporada 1')).toBeTruthy();
  });

  it('cambiar el stat vuelve a la primera página', async () => {
    mocks.params = { kind: 'players' };
    mocks.fetchPlayerLeaderboardPage.mockResolvedValue({ entries: [player('a', 1)], hasMore: false });

    render(<RankingFullScreen />);
    await screen.findByText('jugador 1 Jugador a');

    fireEvent.click(screen.getByText('Vallas'));

    await waitFor(() =>
      expect(mocks.fetchPlayerLeaderboardPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ stat: 'clean_sheets', offset: 0 }),
      ),
    );
  });

  it('la categoría es un filtro propio: elegirla vuelve a la primera página', async () => {
    mocks.params = { kind: 'players', zone: 'Quilmes' };
    mocks.fetchPlayerLeaderboardPage.mockResolvedValue({ entries: [player('a', 1)], hasMore: false });

    render(<RankingFullScreen />);
    await screen.findByText('jugador 1 Jugador a');
    expect(mocks.fetchPlayerLeaderboardPage.mock.calls[0][0].filters.category).toBeNull();

    fireEvent.click(screen.getByText('Mixto'));

    await waitFor(() =>
      expect(mocks.fetchPlayerLeaderboardPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          offset: 0,
          filters: expect.objectContaining({ zone: 'Quilmes', category: 'MIXTO' }),
        }),
      ),
    );
  });

  it('"Mi posición" pagina hasta encontrarme', async () => {
    mocks.params = { kind: 'players' };
    mocks.fetchPlayerLeaderboardPage
      .mockResolvedValueOnce({ entries: [player('a', 1), player('b', 2)], hasMore: true })
      .mockResolvedValueOnce({ entries: [player('c', 3), player('yo', 4, true)], hasMore: true });

    render(<RankingFullScreen />);
    await screen.findByText('jugador 2 Jugador b');

    fireEvent.click(screen.getByText('Mi posición'));

    expect(await screen.findByText('jugador 4 Jugador yo')).toBeTruthy();
    expect(mocks.fetchPlayerLeaderboardPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2 }));
    expect(mocks.showAlert).not.toHaveBeenCalled();
  });

  it('"Mi posición" avisa si no aparezco', async () => {
    mocks.params = { kind: 'players' };
    mocks.fetchPlayerLeaderboardPage.mockResolvedValue({ entries: [player('a', 1)], hasMore: false });

    render(<RankingFullScreen />);
    await screen.findByText('jugador 1 Jugador a');

    fireEvent.click(screen.getByText('Mi posición'));

    await waitFor(() =>
      expect(mocks.showAlert).toHaveBeenCalledWith('No aparecés en esta tabla', expect.any(String)),
    );
  });
});
