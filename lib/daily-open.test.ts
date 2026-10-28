import { beforeEach, describe, expect, it, vi } from 'vitest';
// Los `vi.mock` de abajo se elevan por encima de este import.
import { logDailyOpen } from './daily-open';

const { storage, loggerMock } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));
vi.mock('@/lib/logger', () => ({ Logger: loggerMock }));

const VERSION = { updateId: 'a9cb5c1d', runtimeVersion: '1.1.0', isEmbeddedLaunch: false };

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
});

describe('logDailyOpen', () => {
  it('registra la primera apertura del día con la versión que corre', async () => {
    const logged = await logDailyOpen('user-1', VERSION, new Date(2026, 9, 28, 9, 0));

    expect(logged).toBe(true);
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Apertura del día',
      expect.objectContaining({ event: 'app.daily_open', day: '2026-10-28', updateId: 'a9cb5c1d' }),
    );
  });

  it('no repite el registro el mismo día', async () => {
    await logDailyOpen('user-1', VERSION, new Date(2026, 9, 28, 9, 0));
    const again = await logDailyOpen('user-1', VERSION, new Date(2026, 9, 28, 22, 30));

    expect(again).toBe(false);
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
  });

  it('vuelve a registrar al día siguiente', async () => {
    await logDailyOpen('user-1', VERSION, new Date(2026, 9, 28, 23, 59));
    const nextDay = await logDailyOpen('user-1', VERSION, new Date(2026, 9, 29, 0, 1));

    expect(nextDay).toBe(true);
    expect(loggerMock.info).toHaveBeenCalledTimes(2);
  });

  it('si otra cuenta entra en el mismo celular el mismo día, también la registra', async () => {
    await logDailyOpen('user-1', VERSION, new Date(2026, 9, 28, 9, 0));
    const other = await logDailyOpen('user-2', VERSION, new Date(2026, 9, 28, 10, 0));

    expect(other).toBe(true);
  });
});
