import { describe, it, expect, vi } from 'vitest';
import { buildPendingActions, fetchSoloCaptainTeam } from './home-data';
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

describe('fetchSoloCaptainTeam (Tanda 7)', () => {
  const from = vi.mocked(supabase.from);

  function mockTables(members: { team_id: string }[], team: unknown, teamError: unknown = null) {
    from.mockImplementation(((table: string) =>
      table === 'team_members'
        ? createQueryBuilder({ data: members, error: null })
        : createQueryBuilder({ data: team, error: teamError })) as never);
  }

  it('sin equipos que gestione, ni consulta', async () => {
    from.mockClear();
    expect(await fetchSoloCaptainTeam('p1', [])).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('devuelve el primer equipo que gestiona con un solo integrante', async () => {
    mockTables(
      [{ team_id: 't1' }, { team_id: 't1' }, { team_id: 't2' }],
      { id: 't2', name: 'Furbol', invite_code: 'AB12CD34', is_active: true },
    );
    expect(await fetchSoloCaptainTeam('p1', ['t1', 't2'])).toEqual({ id: 't2', name: 'Furbol', inviteCode: 'AB12CD34' });
  });

  it('con compañeros en todos sus equipos, null', async () => {
    mockTables([{ team_id: 't1' }, { team_id: 't1' }], null);
    expect(await fetchSoloCaptainTeam('p1', ['t1'])).toBeNull();
  });

  it('un equipo dado de baja no muestra la tarjeta', async () => {
    mockTables([{ team_id: 't1' }], { id: 't1', name: 'Viejo', invite_code: 'AB12CD34', is_active: false });
    expect(await fetchSoloCaptainTeam('p1', ['t1'])).toBeNull();
  });

  it('un error no frena la Home: null', async () => {
    mockTables([{ team_id: 't1' }], null, { message: 'boom' });
    expect(await fetchSoloCaptainTeam('p1', ['t1'])).toBeNull();
  });
});
