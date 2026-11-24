import { describe, it, expect, vi, beforeEach } from 'vitest';

const { clipboardMock, linkingMock, loggerMock } = vi.hoisted(() => ({
  clipboardMock: { setStringAsync: vi.fn() },
  linkingMock: { openURL: vi.fn() },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('expo-clipboard', () => clipboardMock);
vi.mock('react-native', () => ({ Linking: linkingMock }));
vi.mock('@/lib/logger', () => ({ Logger: loggerMock }));

import { buildPlaceRequestMessage, requestMissingPlace, TORNEAR_INSTAGRAM_DM_URL } from './place-request';

beforeEach(() => {
  vi.clearAllMocks();
  clipboardMock.setStringAsync.mockResolvedValue(true);
  linkingMock.openURL.mockResolvedValue(true);
});

describe('buildPlaceRequestMessage', () => {
  it('zona con lo que buscó', () => {
    expect(buildPlaceRequestMessage({ kind: 'zona', query: '  Villa Gesell ' }))
      .toBe('¡Hola! Mi ciudad, Villa Gesell, no está en TorneAR. ¿La pueden sumar? Somos de la provincia de: ');
  });

  it('zona sin búsqueda', () => {
    expect(buildPlaceRequestMessage({ kind: 'zona' })).toMatch(/La ciudad es: $/);
  });

  it('cancha con zona', () => {
    expect(buildPlaceRequestMessage({ kind: 'cancha', zone: 'Tandil' }))
      .toBe('¡Hola! Falta una cancha de Tandil en TorneAR. Se llama: ');
  });
});

describe('requestMissingPlace', () => {
  it('registra el pedido, copia el mensaje y abre el chat', async () => {
    const copied = await requestMissingPlace({ kind: 'zona', query: 'Villa Gesell', surface: 'zone_select' });

    expect(copied).toBe(true);
    expect(loggerMock.info).toHaveBeenCalledWith('Pedido de zona o cancha', {
      event: 'place_request', kind: 'zona', query: 'Villa Gesell', zone: null, surface: 'zone_select',
    });
    expect(clipboardMock.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('Villa Gesell'));
    expect(linkingMock.openURL).toHaveBeenCalledWith(TORNEAR_INSTAGRAM_DM_URL);
  });

  it('si no abre el chat, cae al perfil; si no copia, lo avisa con false', async () => {
    clipboardMock.setStringAsync.mockRejectedValueOnce(new Error('sin portapapeles'));
    linkingMock.openURL.mockRejectedValueOnce(new Error('no ig.me')).mockResolvedValueOnce(true);

    const copied = await requestMissingPlace({ kind: 'cancha', zone: 'Tandil', surface: 'proposal' });

    expect(copied).toBe(false);
    expect(linkingMock.openURL).toHaveBeenLastCalledWith('https://www.instagram.com/tornear.app');
  });
});
