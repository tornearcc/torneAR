import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import {
  fetchFormatRules,
  submitTeamCheckin,
  getCheckinErrorMessage,
  CheckinError,
} from './checkin-data';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

// Llega por lib/mixed-composition-data (F3). El módulo real importa
// `react-native`, que no existe en el runtime `node` de estos tests.
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchFormatRules', () => {
  it('lee format_rules por formato y mapea a camelCase', async () => {
    const builder = createQueryBuilder({
      data: { format: 'FUTBOL_5', players_on_field: 5, min_players_to_start: 4, max_squad_size: 10 },
      error: null,
    });
    supabaseMock.from.mockReturnValueOnce(builder);

    const rules = await fetchFormatRules('FUTBOL_5');

    expect(supabaseMock.from).toHaveBeenCalledWith('format_rules');
    expect(builder.eq).toHaveBeenCalledWith('format', 'FUTBOL_5');
    expect(rules).toEqual({
      format: 'FUTBOL_5',
      playersOnField: 5,
      minPlayersToStart: 4,
      maxSquadSize: 10,
    });
  });
});

describe('submitTeamCheckin', () => {
  const players = [
    { profileId: 'p1', lineupRole: 'TITULAR' as const },
    { profileId: 'p2', lineupRole: 'SUPLENTE' as const },
  ];

  it('llama a la RPC con el payload snake_case y devuelve el resumen', async () => {
    const summary = {
      matchId: 'm1',
      teamId: 't1',
      format: 'FUTBOL_5',
      starters: 1,
      substitutes: 1,
      total: 2,
      matchStatus: 'CONFIRMADO',
    };
    supabaseMock.rpc.mockResolvedValueOnce({ data: summary, error: null });

    const result = await submitTeamCheckin('m1', 't1', players, { lat: -34.6, lng: -58.4 });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('submit_team_checkin', {
      p_match_id: 'm1',
      p_team_id: 't1',
      p_players: [
        { profile_id: 'p1', lineup_role: 'TITULAR' },
        { profile_id: 'p2', lineup_role: 'SUPLENTE' },
      ],
      p_lat: -34.6,
      p_lng: -58.4,
    });
    expect(result).toEqual(summary);
  });

  it('omite p_lat/p_lng cuando no hay coords (DEFAULT NULL server-side)', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await submitTeamCheckin('m1', 't1', players);
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'submit_team_checkin',
      expect.objectContaining({ p_lat: undefined, p_lng: undefined }),
    );
  });

  it('convierte el prefijo estable del error de la RPC en un CheckinError tipado', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'MIN_STARTERS_NOT_MET: FUTBOL_5 necesita al menos 4 titulares (recibidos: 3)' },
    });

    const promise = submitTeamCheckin('m1', 't1', players);
    await expect(promise).rejects.toBeInstanceOf(CheckinError);
    await expect(promise).rejects.toMatchObject({ code: 'MIN_STARTERS_NOT_MET' });
  });

  it('propaga errores sin código estable tal cual (ej. red caída)', async () => {
    const netError = { message: 'Network request failed' };
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: netError });
    await expect(submitTeamCheckin('m1', 't1', players)).rejects.toBe(netError);
  });
});

describe('getCheckinErrorMessage', () => {
  it('mapea cada código estable a su mensaje amigable', () => {
    expect(
      getCheckinErrorMessage({ message: 'SQUAD_LIMIT_EXCEEDED: FUTBOL_5 admite 10 (recibidos: 11)' }),
    ).toMatch(/máximo de convocados/i);
    // R6: el DT también presenta la lista, así que el mensaje lo nombra.
    expect(
      getCheckinErrorMessage({ message: 'NOT_TEAM_ADMIN: sólo el capitán' }),
    ).toMatch(/capitán, el subcapitán o el DT/i);
    expect(
      getCheckinErrorMessage({ message: 'GEOFENCE_FAILED: estás a 900m' }),
    ).toMatch(/lejos de la cancha/i);
  });

  it('F3: conserva cuántos faltan entre los titulares de un equipo mixto', () => {
    expect(
      getCheckinErrorMessage({
        message:
          'MIXED_COMPOSITION: los titulares no cumplen la composición mínima de un equipo mixto: falta 1 de género femenino',
      }),
    ).toBe(
      'Los titulares no cumplen la composición mínima de un equipo mixto: falta 1 de género femenino.',
    );
  });

  it('usa el mensaje del CheckinError ya tipado', () => {
    const err = new CheckinError('DUPLICATE_PLAYER', 'Hay jugadores repetidos en la lista.');
    expect(getCheckinErrorMessage(err)).toBe('Hay jugadores repetidos en la lista.');
  });

  it('cae al mensaje genérico cuando no hay código estable', () => {
    expect(getCheckinErrorMessage({ message: 'algo inesperado' })).toMatch(/No se pudo completar/i);
    expect(getCheckinErrorMessage({ message: 'Network request failed' })).toMatch(/conexion/i);
  });
});
