import { describe, expect, it } from 'vitest';
import { welcomeIntents } from './welcome-intents';

describe('welcomeIntents', () => {
  it('con el programa prendido ofrece armar, sumarse y embajador, en ese orden', () => {
    expect(welcomeIntents(true).map((intent) => intent.id)).toEqual(['create_team', 'join_team', 'ambassador']);
  });

  it('con el programa apagado no ofrece ser embajador', () => {
    expect(welcomeIntents(false).map((intent) => intent.id)).toEqual(['create_team', 'join_team']);
  });

  it('cada opción lleva a una pantalla de la app', () => {
    const hrefs = Object.fromEntries(welcomeIntents(true).map((intent) => [intent.id, intent.href]));
    expect(hrefs).toEqual({
      create_team: '/team-create',
      join_team: '/(tabs)/market',
      ambassador: '/ambassador',
    });
  });
});
