import { describe, it, expect, vi } from 'vitest';
import { buildPendingActions, fetchIncompleteCaptainTeam } from './home-data';
import { supabase } from '@/lib/supabase';
import { createQueryBuilder } from '@/lib/test-utils/supabase-mock';

// home-data importa el cliente real sólo para `fetchHomeViewData`; lo que se
// prueba acá es la parte pura (D12), pero el import se resuelve igual.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));
// Mismo motivo: `Logger` arrastra `react-native`, que el runtime `node` de
// estos tests no puede parsear.
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('buildPendingActions (D12)', () => {
  it('descarta las señales en cero: la bandeja no muestra "0 desafíos"', () => {
    const actions = buildPendingActions([
      { type: 'DISPUTE', count: 0 },
      { type: 'TEAM_REQUEST', count: 2 },
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('TEAM_REQUEST');
  });

  // El orden es de producto: primero lo que se cierra solo si nadie actúa.
  it('ordena por urgencia, no por el orden en que llegan los conteos', () => {
    const actions = buildPendingActions([
      { type: 'MARKET_APPLICATION', count: 1 },
      { type: 'TEAM_REQUEST', count: 1 },
      { type: 'LIVE_RESULT', count: 1 },
      { type: 'MATCH_PROPOSAL', count: 1 },
    ]);

    expect(actions.map((a) => a.type)).toEqual([
      'LIVE_RESULT',
      'MATCH_PROPOSAL',
      'TEAM_REQUEST',
      'MARKET_APPLICATION',
    ]);
  });

  it('usa singular con 1 y plural con más', () => {
    expect(buildPendingActions([{ type: 'MATCH_PROPOSAL', count: 1 }])[0].label).toBe(
      '1 propuesta de partido esperando tu respuesta',
    );
    expect(buildPendingActions([{ type: 'MATCH_PROPOSAL', count: 3 }])[0].label).toBe(
      '3 propuestas de partido esperando tu respuesta',
    );
  });

  it('cubre las cuatro señales nuevas de D12', () => {
    const actions = buildPendingActions([
      { type: 'LIVE_RESULT', count: 1 },
      { type: 'MATCH_PROPOSAL', count: 1 },
      { type: 'CANCELLATION_REQUEST', count: 1 },
      { type: 'MARKET_APPLICATION', count: 1 },
    ]);

    expect(actions).toHaveLength(4);
    for (const action of actions) {
      expect(action.label.length).toBeGreaterThan(0);
    }
  });

  // El atajo directo al partido sólo puede existir cuando no hay ambigüedad:
  // con dos propuestas pendientes, entrar a una de las dos sería arbitrario.
  it('conserva el matchId sólo cuando la acción es única', () => {
    expect(buildPendingActions([{ type: 'DISPUTE', count: 1, matchId: 'm-1' }])[0].matchId).toBe(
      'm-1',
    );
    expect(
      buildPendingActions([{ type: 'DISPUTE', count: 2, matchId: 'm-1' }])[0].matchId,
    ).toBeNull();
  });

  it('deja el matchId en null cuando la señal no apunta a un partido', () => {
    expect(buildPendingActions([{ type: 'TEAM_REQUEST', count: 1 }])[0].matchId).toBeNull();
  });
});

describe('fetchIncompleteCaptainTeam (rediseño etapa 1)', () => {
  const from = vi.mocked(supabase.from);
  const fila = (id: string, format: string, extra: Record<string, unknown> = {}) => ({
    id, name: `Equipo ${id}`, invite_code: 'AB12CD34', is_active: true, preferred_format: format, shield_url: null, ...extra,
  });

  function mockTables(members: { team_id: string }[], teams: unknown, teamError: unknown = null) {
    from.mockImplementation(((table: string) =>
      table === 'team_members'
        ? createQueryBuilder({ data: members, error: null })
        : createQueryBuilder({ data: teams, error: teamError })) as never);
  }

  it('sin equipos que gestione (solo jugador), ni consulta', async () => {
    from.mockClear();
    expect(await fetchIncompleteCaptainTeam('p1', [])).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('un F5 con 3 jugadores está incompleto: 3 de 5', async () => {
    mockTables([{ team_id: 't1' }, { team_id: 't1' }, { team_id: 't1' }], [fila('t1', 'FUTBOL_5')]);
    expect(await fetchIncompleteCaptainTeam('p1', ['t1'])).toEqual({
      id: 't1', name: 'Equipo t1', inviteCode: 'AB12CD34', shieldUrl: null, members: 3, needed: 5, format: 'FUTBOL_5',
    });
  });

  it('con 5 o más en un F5, no está incompleto', async () => {
    mockTables(Array.from({ length: 6 }, () => ({ team_id: 't1' })), [fila('t1', 'FUTBOL_5')]);
    expect(await fetchIncompleteCaptainTeam('p1', ['t1'])).toBeNull();
  });

  it('un equipo dado de baja no cuenta', async () => {
    mockTables([{ team_id: 't1' }], [fila('t1', 'FUTBOL_5', { is_active: false })]);
    expect(await fetchIncompleteCaptainTeam('p1', ['t1'])).toBeNull();
  });

  it('con varios incompletos, el que tiene menos lugares por llenar', async () => {
    mockTables(
      [{ team_id: 't1' }, ...Array.from({ length: 6 }, () => ({ team_id: 't2' }))],
      [fila('t1', 'FUTBOL_5'), fila('t2', 'FUTBOL_7')],
    );
    expect((await fetchIncompleteCaptainTeam('p1', ['t1', 't2']))?.id).toBe('t2');
  });

  it('un error no frena la Home: null', async () => {
    mockTables([{ team_id: 't1' }], null, { message: 'boom' });
    expect(await fetchIncompleteCaptainTeam('p1', ['t1'])).toBeNull();
  });
});
