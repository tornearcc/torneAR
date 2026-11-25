import { describe, expect, it } from 'vitest';
import { welcomeIntents } from './welcome-intents';

describe('welcomeIntents (rediseño, etapa 2)', () => {
  it('ofrece: me invitó un amigo, armar mi equipo, busco equipo, en ese orden', () => {
    expect(welcomeIntents().map((intent) => intent.id)).toEqual(['join_code', 'create_team', 'find_team']);
  });

  it('ya no ofrece ser embajador (pasa a Perfil)', () => {
    expect(welcomeIntents().some((intent) => (intent.id as string) === 'ambassador')).toBe(false);
  });

  it('cada opción lleva a una pantalla de la app; los dos caminos para sumarse van a «Sumarme a un equipo»', () => {
    const hrefs = Object.fromEntries(welcomeIntents().map((intent) => [intent.id, intent.href]));
    expect(hrefs).toEqual({
      join_code: '/team-join',
      create_team: '/team-create',
      find_team: '/team-join',
    });
  });
});
