import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildShareEventDetails, shareActivityType, trackShareIntent } from './share-analytics';

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// `@/lib/logger` importa react-native; mockearlo deja este test en Node puro.
vi.mock('@/lib/logger', () => ({ Logger: loggerMock }));

// Lo que fija este archivo es el CONTRATO de `details` en `app_logs`: la RPC
// `dashboard_share_summary` agrupa por `details->>'content_type'` y
// `details->>'activity_type'`. Renombrar una clave compila igual en la app y
// deja el panel en cero sin ningún error visible.

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildShareEventDetails', () => {
  it('tarjeta de partido: conserva las claves de siempre y suma content_type', () => {
    expect(
      buildShareEventDetails({
        target: 'instagram',
        contentType: 'match',
        profileId: 'p1',
        matchId: 'm1',
        teamId: 't1',
      }),
    ).toEqual({
      scope: 'share-analytics.trackShareIntent',
      event: 'share.instagram',
      target: 'instagram',
      content_type: 'match',
      profileId: 'p1',
      matchId: 'm1',
      teamId: 't1',
    });
  });

  it('referido desde iOS: incluye el destino real como activity_type', () => {
    expect(
      buildShareEventDetails({
        target: 'generic',
        contentType: 'referral',
        profileId: 'p1',
        activityType: 'net.whatsapp.WhatsApp.ShareExtension',
      }),
    ).toEqual({
      scope: 'share-analytics.trackShareIntent',
      event: 'share.generic',
      target: 'generic',
      content_type: 'referral',
      profileId: 'p1',
      activity_type: 'net.whatsapp.WhatsApp.ShareExtension',
    });
  });

  it('invitación de equipo sin destino (Android o cancelado): omite las claves ausentes', () => {
    const details = buildShareEventDetails({
      target: 'generic',
      contentType: 'team_invite',
      profileId: 'p1',
      teamId: 't9',
    });

    expect(details).toMatchObject({ content_type: 'team_invite', teamId: 't9' });
    // Omitidas, no en null: en SQL `details ? 'activity_type'` tiene que dar false.
    expect(details).not.toHaveProperty('activity_type');
    expect(details).not.toHaveProperty('matchId');
  });

  it('profileId null se manda explícito: el evento sigue siendo válido sin perfil cargado', () => {
    expect(
      buildShareEventDetails({ target: 'generic', contentType: 'referral', profileId: null }),
    ).toHaveProperty('profileId', null);
  });
});

describe('trackShareIntent', () => {
  it('escribe por Logger.info con el message del destino como identificador', () => {
    trackShareIntent({ target: 'generic', contentType: 'team_invite', profileId: 'p1', teamId: 't1' });

    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).toHaveBeenCalledWith(
      'share.generic',
      expect.objectContaining({ content_type: 'team_invite', teamId: 't1' }),
    );
    // Nunca por warn/error: es telemetría de producto, no un problema.
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('devuelve void (no una promesa que alguien pueda await-ear en el tap)', () => {
    const result = trackShareIntent({ target: 'instagram', contentType: 'match', profileId: null });
    expect(result).toBeUndefined();
  });
});

describe('shareActivityType', () => {
  it('iOS compartido: devuelve el destino', () => {
    expect(
      shareActivityType({ action: 'sharedAction', activityType: 'com.apple.UIKit.activity.Message' }),
    ).toBe('com.apple.UIKit.activity.Message');
  });

  it('iOS cancelado: sin destino', () => {
    expect(shareActivityType({ action: 'dismissedAction', activityType: null })).toBeUndefined();
  });

  it('Android: sharedAction sin activityType no inventa un valor', () => {
    expect(shareActivityType({ action: 'sharedAction' })).toBeUndefined();
    expect(shareActivityType({ action: 'sharedAction', activityType: null })).toBeUndefined();
    expect(shareActivityType({ action: 'sharedAction', activityType: '   ' })).toBeUndefined();
  });

  it('resultado ausente: sin destino', () => {
    expect(shareActivityType(undefined)).toBeUndefined();
    expect(shareActivityType(null)).toBeUndefined();
  });
});
