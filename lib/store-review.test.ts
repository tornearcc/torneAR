import { beforeEach, describe, expect, it, vi } from 'vitest';
// Los `vi.mock` de abajo se elevan por encima de este import.
import { requestEngagedReturnReviewOnce, runStoreReviewPrompt } from './store-review';

const { loggerMock, rpcMock, storeReviewMock, platformMock, versionMock, appStateMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  rpcMock: vi.fn(),
  storeReviewMock: { isAvailableAsync: vi.fn(), requestReview: vi.fn() },
  platformMock: vi.fn<() => 'ios' | 'android' | null>(),
  versionMock: vi.fn<() => string | null>(),
  appStateMock: { currentState: 'active' },
}));

vi.mock('@/lib/logger', () => ({ Logger: loggerMock }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: rpcMock } }));
vi.mock('expo-store-review', () => storeReviewMock);
vi.mock('react-native', () => ({ AppState: appStateMock }));
// `app-version` importa react-native y expo-constants: se reemplaza entero.
vi.mock('@/lib/app-version', () => ({
  getCurrentPlatform: platformMock,
  getCurrentAppVersion: versionMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  platformMock.mockReturnValue('ios');
  versionMock.mockReturnValue('1.1.0');
  storeReviewMock.isAvailableAsync.mockResolvedValue(true);
  storeReviewMock.requestReview.mockResolvedValue(undefined);
  rpcMock.mockResolvedValue({ data: true, error: null });
  appStateMock.currentState = 'active';
});

describe('runStoreReviewPrompt', () => {
  it('gate en true: reclama con los datos del dispositivo y abre el diálogo', async () => {
    await expect(runStoreReviewPrompt('match_shared', 0)).resolves.toBe(true);

    expect(rpcMock).toHaveBeenCalledWith('claim_review_prompt', {
      p_trigger: 'match_shared',
      p_platform: 'ios',
      p_app_version: '1.1.0',
    });
    expect(storeReviewMock.requestReview).toHaveBeenCalledTimes(1);
  });

  it('gate en false: no abre el diálogo', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });

    await expect(runStoreReviewPrompt('result_confirmed', 0)).resolves.toBe(false);
    expect(storeReviewMock.requestReview).not.toHaveBeenCalled();
  });

  it('dispositivo sin API (TestFlight): ni siquiera reclama, para no gastar el pedido', async () => {
    storeReviewMock.isAvailableAsync.mockResolvedValue(false);

    await expect(runStoreReviewPrompt('match_shared', 0)).resolves.toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('app en segundo plano (el usuario se fue a Instagram): no reclama', async () => {
    appStateMock.currentState = 'background';

    await expect(runStoreReviewPrompt('match_shared', 0)).resolves.toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(storeReviewMock.requestReview).not.toHaveBeenCalled();
  });

  it('web (sin plataforma) o sin versión: no hace nada', async () => {
    platformMock.mockReturnValue(null);
    await expect(runStoreReviewPrompt('match_shared', 0)).resolves.toBe(false);

    platformMock.mockReturnValue('android');
    versionMock.mockReturnValue(null);
    await expect(runStoreReviewPrompt('match_shared', 0)).resolves.toBe(false);

    expect(rpcMock).not.toHaveBeenCalled();
    expect(storeReviewMock.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('error de la RPC: no abre el diálogo y no tira', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(runStoreReviewPrompt('match_shared', 0)).resolves.toBe(false);
    expect(storeReviewMock.requestReview).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('falla del módulo nativo: se traga la excepción', async () => {
    storeReviewMock.requestReview.mockRejectedValue(new Error('native'));

    await expect(runStoreReviewPrompt('match_shared', 0)).resolves.toBe(false);
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('dos disparos simultáneos: sólo el primero consulta el gate', async () => {
    const [first, second] = await Promise.all([
      runStoreReviewPrompt('match_shared', 0),
      runStoreReviewPrompt('result_confirmed', 0),
    ]);

    expect([first, second]).toEqual([true, false]);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  describe('diagnóstico: cada oportunidad sin diálogo deja el motivo (tarjeta #75)', () => {
    const skippedWith = (reason: string) =>
      expect(loggerMock.info).toHaveBeenCalledWith(
        'Pedido de valoración no mostrado',
        expect.objectContaining({
          event: 'review_prompt.skipped',
          reason,
          trigger: 'match_shared',
          platform: 'ios',
          appVersion: '1.1.0',
        }),
      );

    it('gate en false → gate_denied', async () => {
      rpcMock.mockResolvedValue({ data: false, error: null });
      await runStoreReviewPrompt('match_shared', 0);
      skippedWith('gate_denied');
    });

    it('sin API de la tienda → store_review_unavailable', async () => {
      storeReviewMock.isAvailableAsync.mockResolvedValue(false);
      await runStoreReviewPrompt('match_shared', 0);
      skippedWith('store_review_unavailable');
    });

    it('app en segundo plano → app_not_active', async () => {
      appStateMock.currentState = 'background';
      await runStoreReviewPrompt('match_shared', 0);
      skippedWith('app_not_active');
    });

    it('cuando se pide, no registra un "no mostrado"', async () => {
      await runStoreReviewPrompt('match_shared', 0);
      expect(loggerMock.info).not.toHaveBeenCalledWith(
        'Pedido de valoración no mostrado',
        expect.anything(),
      );
    });
  });

  it('libera el candado al terminar: un disparo posterior vuelve a consultar', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await runStoreReviewPrompt('match_shared', 0);
    await runStoreReviewPrompt('match_shared', 0);

    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});

describe('requestEngagedReturnReviewOnce (D-63)', () => {
  it('reclama con engaged_return una sola vez por sesión', async () => {
    requestEngagedReturnReviewOnce();
    requestEngagedReturnReviewOnce();
    // El pedido real espera la pausa de presentación antes de llamar a la RPC.
    await vi.waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(rpcMock).toHaveBeenCalledWith('claim_review_prompt', expect.objectContaining({ p_trigger: 'engaged_return' }));
  });
});
