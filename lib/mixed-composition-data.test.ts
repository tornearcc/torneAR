import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMixedCompositionStatus } from './mixed-composition-data';

const { supabaseMock, loggerMock } = vi.hoisted(() => ({
  supabaseMock: { rpc: vi.fn() },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/logger', () => ({ Logger: loggerMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

const MEMBER_PAYLOAD = {
  applies: true,
  enforced: false,
  ok: false,
  minPerGender: 2,
  male: 3,
  female: 1,
  other: 1,
  unset: 0,
  missingMale: 0,
  missingFemale: 1,
  missingTotal: 1,
  xCountsAsAny: false,
};

describe('fetchMixedCompositionStatus', () => {
  it('pide el estado con el formato cuando lo hay', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: MEMBER_PAYLOAD, error: null });

    const status = await fetchMixedCompositionStatus('team-1', 'FUTBOL_5');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_mixed_composition_status', {
      p_team_id: 'team-1',
      p_format: 'FUTBOL_5',
    });
    expect(status?.counts?.missingFemale).toBe(1);
  });

  it('sin formato no lo manda: el servidor usa el mínimo más bajo del catálogo', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: MEMBER_PAYLOAD, error: null });

    await fetchMixedCompositionStatus('team-1');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_mixed_composition_status', {
      p_team_id: 'team-1',
      p_format: undefined,
    });
  });

  it('si la RPC falla devuelve null y deja un warn (la pantalla sigue sin el aviso)', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    });

    await expect(fetchMixedCompositionStatus('team-1')).resolves.toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
  });
});
