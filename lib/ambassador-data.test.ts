import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import {
  buildAmbassadorInviteMessage,
  fetchAmbassadorOverview,
  fetchAmbassadorProgramEnabled,
  setAmbassadorOwnTeam,
  fetchTeamCreateAmbassadorPrefill,
  setAmbassadorPayoutAlias,
  setTeamAmbassador,
  upsertAmbassador,
} from './ambassador-data';

const { supabaseMock, loggerMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/logger', () => ({ Logger: loggerMock }));

const OWN_TEAM = { team_id: 't1', name: 'Los Pibes', format: 'FUTBOL_5', members_now: 5, members_needed: 5 };

const REGISTERED = {
  enabled: true,
  registered: true,
  status: 'ACTIVO',
  username: 'jose',
  instagram: 'jose.ig',
  show_in_ranking: false,
  follow_verified: false,
  has_payout_alias: false,
  own_team: OWN_TEAM,
  eligible_own_teams: [{ team_id: 't1', name: 'Los Pibes' }],
  debut_state: 'DISPONIBLE',
  teams_counted: 1,
  next_bonus_at: 5,
  bonus_5_earned: false,
  bonus_10_earned: false,
  earned_total: 5000,
  paid_total: 0,
  slots_left: 99,
  brought_teams: [
    { team_id: 't2', name: 'Amigos', format: null, members_now: 5, members_needed: null, state: 'ESPERANDO', amount: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchAmbassadorOverview', () => {
  it('parsea un overview válido con equipo propio', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: REGISTERED, error: null });
    const result = await fetchAmbassadorOverview();
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_my_ambassador_overview');
    expect(result).toMatchObject({ registered: true, username: 'jose', debut_state: 'DISPONIBLE' });
  });

  it('parsea un overview válido sin equipo propio', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { ...REGISTERED, own_team: null, debut_state: 'SIN_EQUIPO' },
      error: null,
    });
    const result = await fetchAmbassadorOverview();
    expect(result).toMatchObject({ registered: true, own_team: null });
  });

  it('parsea el caso sin inscripción', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { enabled: true, registered: false, slots_left: 100 },
      error: null,
    });
    expect(await fetchAmbassadorOverview()).toEqual({ enabled: true, registered: false, slots_left: 100 });
  });

  it('devuelve null y avisa si la forma está rota', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { enabled: true, registered: true }, error: null });
    expect(await fetchAmbassadorOverview()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('devuelve null y avisa ante un error de red', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchAmbassadorOverview()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('devuelve null si la RPC tira', async () => {
    supabaseMock.rpc.mockRejectedValue(new Error('network'));
    expect(await fetchAmbassadorOverview()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

describe('fetchAmbassadorProgramEnabled', () => {
  it('es true cuando el valor es 1', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: { value: 1 }, error: null }));
    expect(await fetchAmbassadorProgramEnabled()).toBe(true);
    expect(supabaseMock.from).toHaveBeenCalledWith('app_settings');
  });

  it('es false cuando el valor es 0', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: { value: 0 }, error: null }));
    expect(await fetchAmbassadorProgramEnabled()).toBe(false);
  });

  it('es false si no existe la fila', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: null }));
    expect(await fetchAmbassadorProgramEnabled()).toBe(false);
  });

  it('es false ante un error', async () => {
    supabaseMock.from.mockReturnValue(createQueryBuilder({ data: null, error: { message: 'x' } }));
    expect(await fetchAmbassadorProgramEnabled()).toBe(false);
  });
});

describe('upsertAmbassador', () => {
  it('manda el Instagram sin @ y devuelve el estado', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'created', error: null });
    const status = await upsertAmbassador({
      instagram: ' @Jose.IG ',
      showInRanking: true,
      acceptTerms: true,
      confirmAdult: true,
    });
    expect(status).toBe('created');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('upsert_ambassador', {
      p_instagram: 'jose.ig',
      p_show_in_ranking: true,
      p_accept_terms: true,
      p_confirm_adult: true,
    });
  });

  it('devuelve rpc_error ante un error', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    const status = await upsertAmbassador({ instagram: 'a', showInRanking: false, acceptTerms: true, confirmAdult: true });
    expect(status).toBe('rpc_error');
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('devuelve rpc_error si la respuesta no es un estado conocido', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'otra_cosa', error: null });
    const status = await upsertAmbassador({ instagram: 'a', showInRanking: false, acceptTerms: true, confirmAdult: true });
    expect(status).toBe('rpc_error');
  });
});

describe('setAmbassadorOwnTeam', () => {
  it('manda p_team_id null para sacar el equipo', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'applied', error: null });
    expect(await setAmbassadorOwnTeam(null)).toBe('applied');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('set_ambassador_own_team', { p_team_id: null });
  });

  it('devuelve el estado de la RPC', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'noop_locked', error: null });
    expect(await setAmbassadorOwnTeam('t1')).toBe('noop_locked');
  });

  it('devuelve rpc_error si la RPC tira', async () => {
    supabaseMock.rpc.mockRejectedValue(new Error('network'));
    expect(await setAmbassadorOwnTeam('t1')).toBe('rpc_error');
  });
});

describe('setAmbassadorPayoutAlias', () => {
  it('manda el alias recortado', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'applied', error: null });
    expect(await setAmbassadorPayoutAlias('  mi.alias.mp ')).toBe('applied');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('set_ambassador_payout_alias', { p_alias: 'mi.alias.mp' });
  });

  it('devuelve rpc_error ante un error', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await setAmbassadorPayoutAlias('mi.alias.mp')).toBe('rpc_error');
  });
});

describe('buildAmbassadorInviteMessage', () => {
  it('incluye el link con ?emb=1 y la instrucción', () => {
    const msg = buildAmbassadorInviteMessage('jose');
    expect(msg).toContain('https://tornear.vercel.app/i/jose?emb=1');
    expect(msg).toContain('Creá tu equipo y en "¿Quién los invitó?" poné mi usuario jose');
  });
});

describe('fetchTeamCreateAmbassadorPrefill', () => {
  it('devuelve el usuario del embajador', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'jose', error: null });
    expect(await fetchTeamCreateAmbassadorPrefill()).toBe('jose');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_team_create_ambassador_prefill');
  });

  it('devuelve null cuando no hay embajador', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchTeamCreateAmbassadorPrefill()).toBeNull();
  });

  it('devuelve null ante un error de la RPC', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchTeamCreateAmbassadorPrefill()).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('devuelve null si la llamada tira', async () => {
    supabaseMock.rpc.mockRejectedValue(new Error('network'));
    expect(await fetchTeamCreateAmbassadorPrefill()).toBeNull();
  });
});

describe('setTeamAmbassador', () => {
  it('no llama a la RPC con un usuario vacío', async () => {
    expect(await setTeamAmbassador('t1', '   ')).toBe('noop_invalid');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('pasa el usuario recortado y devuelve el estado', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'applied', error: null });
    expect(await setTeamAmbassador('t1', ' jose ')).toBe('applied');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('set_team_ambassador', { p_team_id: 't1', p_username: 'jose' });
  });

  it('devuelve noop_ambassador_member', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 'noop_ambassador_member', error: null });
    expect(await setTeamAmbassador('t1', 'jose')).toBe('noop_ambassador_member');
  });

  it('devuelve rpc_error ante error o estado desconocido', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await setTeamAmbassador('t1', 'jose')).toBe('rpc_error');
    supabaseMock.rpc.mockResolvedValue({ data: 'otra_cosa', error: null });
    expect(await setTeamAmbassador('t1', 'jose')).toBe('rpc_error');
  });

  it('devuelve rpc_error si la llamada tira', async () => {
    supabaseMock.rpc.mockRejectedValue(new Error('network'));
    expect(await setTeamAmbassador('t1', 'jose')).toBe('rpc_error');
  });
});
