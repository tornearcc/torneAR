import { beforeEach, describe, expect, it, vi } from 'vitest';
// Los `vi.mock` de abajo se elevan por encima de este import.
import { addActiveDay, localDayKey, recordActiveDay } from './active-days';

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

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
});

describe('localDayKey', () => {
  it('usa la fecha local con ceros a la izquierda', () => {
    expect(localDayKey(new Date(2026, 8, 5, 23, 59))).toBe('2026-09-05');
  });
});

describe('addActiveDay', () => {
  it('no repite el mismo día', () => {
    expect(addActiveDay(['2026-09-28'], '2026-09-28')).toEqual(['2026-09-28']);
  });

  it('se queda con los 30 días más recientes', () => {
    const days = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    const result = addActiveDay(days, '2026-09-29');
    expect(result).toHaveLength(30);
    expect(result[0]).toBe('2026-08-02');
    expect(result.at(-1)).toBe('2026-09-29');
  });
});

describe('recordActiveDay', () => {
  it('cuenta días distintos entre aperturas', async () => {
    await expect(recordActiveDay(new Date(2026, 8, 25))).resolves.toBe(1);
    await expect(recordActiveDay(new Date(2026, 8, 25, 20))).resolves.toBe(1);
    await expect(recordActiveDay(new Date(2026, 8, 26))).resolves.toBe(2);
  });

  it('con datos corruptos arranca de cero en vez de fallar', async () => {
    storage.set('tornear.activeDays', '{no es json');
    await expect(recordActiveDay(new Date(2026, 8, 29))).resolves.toBe(1);
  });
});
