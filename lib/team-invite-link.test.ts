import { describe, expect, it } from 'vitest';
import { buildTeamInviteLink, buildTeamInviteMessage, normalizeTeamInviteCode } from './team-invite-link';

// El contrato que fija este test lo leen otros dos lados:
//   · lib/deep-linking.ts, que con `e` manda a «Unirme a un equipo».
//   · la landing /i/[username] de torneAR/dashboard, que con `e` y `t` muestra
//     la invitación al equipo.

describe('normalizeTeamInviteCode', () => {
  it('pasa a mayúsculas y recorta espacios', () => {
    expect(normalizeTeamInviteCode(' ab12cd34 ')).toBe('AB12CD34');
  });

  it('rechaza lo que no puede ser un código', () => {
    expect(normalizeTeamInviteCode('abc')).toBeNull();
    expect(normalizeTeamInviteCode('AB12-CD34')).toBeNull();
    expect(normalizeTeamInviteCode('A'.repeat(13))).toBeNull();
    expect(normalizeTeamInviteCode('')).toBeNull();
    expect(normalizeTeamInviteCode(null)).toBeNull();
    expect(normalizeTeamInviteCode(undefined)).toBeNull();
  });
});

describe('buildTeamInviteLink', () => {
  it('es el link de referido de quien invita más el código y el nombre del equipo', () => {
    expect(
      buildTeamInviteLink({ username: 'agussala', fullName: 'Agustín Saladino', inviteCode: 'AB12CD34', teamName: 'Maldito 32' }),
    ).toBe('https://tornear.vercel.app/i/agussala?n=Agust%C3%ADn&e=AB12CD34&t=Maldito%2032');
  });

  it('sin nombre de quien invita, el código va como primer parámetro', () => {
    expect(buildTeamInviteLink({ username: 'agussala', inviteCode: 'AB12CD34', teamName: 'Furbol' })).toBe(
      'https://tornear.vercel.app/i/agussala?e=AB12CD34&t=Furbol',
    );
  });

  it('escapa los caracteres del nombre del equipo que romperían el query string', () => {
    expect(buildTeamInviteLink({ username: 'x', inviteCode: 'AB12CD34', teamName: 'A&B=C #1' })).toBe(
      'https://tornear.vercel.app/i/x?e=AB12CD34&t=A%26B%3DC%20%231',
    );
  });

  it('sin nombre de equipo, omite `t`', () => {
    expect(buildTeamInviteLink({ username: 'x', inviteCode: 'AB12CD34', teamName: '  ' })).toBe(
      'https://tornear.vercel.app/i/x?e=AB12CD34',
    );
  });
});

describe('buildTeamInviteMessage', () => {
  it('lleva el link y el código en texto plano', () => {
    const message = buildTeamInviteMessage({ username: 'agussala', inviteCode: 'AB12CD34', teamName: 'Furbol' });
    expect(message).toContain('¡Sumate a Furbol en torneAR!');
    expect(message).toContain('https://tornear.vercel.app/i/agussala?e=AB12CD34&t=Furbol');
    expect(message).toContain('Código del equipo: AB12CD34');
  });

  it('sin username, sale sólo el código', () => {
    const message = buildTeamInviteMessage({ username: null, inviteCode: 'AB12CD34', teamName: 'Furbol' });
    expect(message).not.toContain('https://');
    expect(message).toContain('Código del equipo: AB12CD34');
  });
});
