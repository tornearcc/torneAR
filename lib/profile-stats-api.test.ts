import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import { fetchProfileStatsViewData } from './profile-stats-api';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const PROFILE_ID = 'profile-1';
const MY_TEAM = 'team-a';
const RIVAL_TEAM = 'team-b';

/** Partido base: mi equipo (A) le gana 3-1 al rival (B). */
function buildParticipantRow(overrides: Record<string, unknown> = {}) {
  return {
    team_id: MY_TEAM,
    matches: {
      id: 'match-1',
      scheduled_at: '2026-08-01T20:00:00Z',
      status: 'FINALIZADO',
      match_type: 'RANKING',
      team_a_id: MY_TEAM,
      team_b_id: RIVAL_TEAM,
      team_a: { name: 'Mi Equipo', shield_url: 'mine.png' },
      team_b: { name: 'Rival FC', shield_url: 'rival.png' },
      match_results: [
        {
          team_id: MY_TEAM,
          goals_scored: 3,
          goals_against: 1,
          mvp_id: PROFILE_ID,
          scorers: [
            { profile_id: PROFILE_ID, goals: 2 },
            { profile_id: 'otro', goals: 1 },
          ],
        },
      ],
      ...overrides,
    },
  };
}

type Tables = {
  participants?: unknown[];
  elo?: unknown[];
  eloError?: unknown;
};

function mockTables({ participants = [buildParticipantRow()], elo = [], eloError = null }: Tables = {}) {
  supabaseMock.from.mockImplementation((table: string) => {
    switch (table) {
      // Una sola fuente para el perfil: `profiles_public`. La tabla `profiles`
      // no se mockea a proposito — el `default` de este switch tira si alguien
      // la vuelve a consultar, que es exactamente el 42501 que se arreglo.
      case 'profiles_public':
        return createQueryBuilder({
          data: { id: PROFILE_ID, full_name: 'Tester', username: 'tester', age: 28 },
          error: null,
        });
      case 'v_player_stats':
        return createQueryBuilder({
          data: { matches_played: 1, total_goals: 2, total_mvps: 1, total_wins: 1 },
          error: null,
        });
      case 'match_participants':
        return createQueryBuilder({ data: participants, error: null });
      case 'team_members':
        return createQueryBuilder({ data: [], error: null });
      case 'elo_history':
        return createQueryBuilder({ data: eloError ? null : elo, error: eloError });
      default:
        throw new Error(`Tabla no mockeada: ${table}`);
    }
  });
  supabaseMock.rpc.mockResolvedValue({ data: [], error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.storage.from.mockReturnValue({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
  });
});

describe('fetchProfileStatsViewData — historial de partidos', () => {
  it('cuenta solo los goles del jugador consultado, no los del equipo', async () => {
    mockTables();

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    // El equipo hizo 3, de los cuales este jugador metio 2.
    expect(data.recentMatches[0].goalsFor).toBe(3);
    expect(data.recentMatches[0].playerGoals).toBe(2);
  });

  it('suma varias entradas del mismo jugador en scorers', async () => {
    mockTables({
      participants: [
        buildParticipantRow({
          match_results: [
            {
              team_id: MY_TEAM,
              goals_scored: 3,
              goals_against: 1,
              mvp_id: null,
              scorers: [
                { profile_id: PROFILE_ID, goals: 1 },
                { profile_id: PROFILE_ID, goals: 2 },
              ],
            },
          ],
        }),
      ],
    });

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    expect(data.recentMatches[0].playerGoals).toBe(3);
  });

  it('marca el MVP solo cuando es el jugador consultado', async () => {
    mockTables();
    expect((await fetchProfileStatsViewData(PROFILE_ID)).recentMatches[0].isMvp).toBe(true);

    mockTables({
      participants: [
        buildParticipantRow({
          match_results: [
            { team_id: MY_TEAM, goals_scored: 3, goals_against: 1, mvp_id: 'otro', scorers: [] },
          ],
        }),
      ],
    });
    expect((await fetchProfileStatsViewData(PROFILE_ID)).recentMatches[0].isMvp).toBe(false);
  });

  it('resuelve el escudo del RIVAL, no el propio', async () => {
    mockTables();

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    expect(data.recentMatches[0].rivalName).toBe('Rival FC');
    expect(data.recentMatches[0].rivalShieldUrl).toBe('https://cdn.test/rival.png');
    expect(data.recentMatches[0].rivalTeamId).toBe(RIVAL_TEAM);
  });

  it('toma el escudo del equipo A cuando el jugador juega en el B', async () => {
    mockTables({
      participants: [{ ...buildParticipantRow(), team_id: RIVAL_TEAM }],
    });

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    expect(data.recentMatches[0].rivalName).toBe('Mi Equipo');
    expect(data.recentMatches[0].rivalShieldUrl).toBe('https://cdn.test/mine.png');
    expect(data.recentMatches[0].rivalTeamId).toBe(MY_TEAM);
  });

  it('deja el escudo en null si el rival no cargo ninguno', async () => {
    mockTables({
      participants: [
        buildParticipantRow({
          team_b: { name: 'Rival FC', shield_url: null },
        }),
      ],
    });

    expect((await fetchProfileStatsViewData(PROFILE_ID)).recentMatches[0].rivalShieldUrl).toBeNull();
  });

  // Este es el caso que motiva la clave compuesta: `elo_history` guarda una fila
  // por equipo y por partido. Filtrando solo por match_id se puede tomar la del
  // rival, que es el delta opuesto.
  it('toma el delta de MI equipo y no el del rival en el mismo partido', async () => {
    mockTables({
      elo: [
        { match_id: 'match-1', team_id: RIVAL_TEAM, delta: -12 },
        { match_id: 'match-1', team_id: MY_TEAM, delta: 12 },
      ],
    });

    expect((await fetchProfileStatsViewData(PROFILE_ID)).recentMatches[0].rankDelta).toBe(12);
  });

  it('devuelve rankDelta null cuando el partido no movio el Ranking', async () => {
    mockTables({ elo: [] });

    expect((await fetchProfileStatsViewData(PROFILE_ID)).recentMatches[0].rankDelta).toBeNull();
  });

  it('distingue un delta 0 real de la ausencia de historial', async () => {
    mockTables({ elo: [{ match_id: 'match-1', team_id: MY_TEAM, delta: 0 }] });

    expect((await fetchProfileStatsViewData(PROFILE_ID)).recentMatches[0].rankDelta).toBe(0);
  });

  it('no rompe el historial si falla la lectura de elo_history', async () => {
    mockTables({ eloError: { message: 'boom' } });

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    expect(data.recentMatches).toHaveLength(1);
    expect(data.recentMatches[0].rankDelta).toBeNull();
  });

  it('no consulta elo_history si el jugador no tiene partidos', async () => {
    mockTables({ participants: [] });

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    expect(data.recentMatches).toHaveLength(0);
    expect(supabaseMock.from).not.toHaveBeenCalledWith('elo_history');
  });

  // Regresion de produccion: `"code": "42501", "message": "permission denied
  // for table profiles"`. El `select('*')` sobre la tabla base se expandia a
  // `date_of_birth`/`expo_push_token`, revocadas por columna en
  // 20260819100000_privacy_and_age_compliance.
  it('lee el perfil de profiles_public y nunca de la tabla profiles', async () => {
    mockTables();

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    expect(supabaseMock.from).toHaveBeenCalledWith('profiles_public');
    expect(supabaseMock.from).not.toHaveBeenCalledWith('profiles');
    expect(data.profile.id).toBe(PROFILE_ID);
  });

  it('separa la edad del resto del perfil', async () => {
    mockTables();

    const data = await fetchProfileStatsViewData(PROFILE_ID);

    expect(data.age).toBe(28);
    expect(data.profile).not.toHaveProperty('age');
  });

  it('tolera un match_results vacio (partido aun sin resultado cargado)', async () => {
    mockTables({
      participants: [buildParticipantRow({ status: 'CONFIRMADO', match_results: [] })],
    });

    const match = (await fetchProfileStatsViewData(PROFILE_ID)).recentMatches[0];

    expect(match.playerGoals).toBe(0);
    expect(match.isMvp).toBe(false);
    expect(match.result).toBeNull();
  });
});
