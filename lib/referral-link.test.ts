import { describe, expect, it } from 'vitest';
import { buildReferralLink, buildReferralMessage } from './referral-link';

// Modulo puro: no importa react-native ni expo, asi que no necesita mocks.
// Lo que fija este test es el CONTRATO del link (Fase 6.1): `buildReferralLink`
// genera un Universal Link `https://tornear.vercel.app/i/<username>`, no el
// `tornear://` directo de antes. Tres lugares tienen que seguir de acuerdo
// entre si sobre ese contrato:
//   1. ProfileInviteCard, que lo comparte via Share.share().
//   2. El SO (Universal Link / App Link) si `app.json` declara los
//      entitlements y la app esta instalada: abre la app directo.
//   3. La landing web /i/[username] (torneAR/dashboard) si el SO no lo
//      intercepto: ahi el link manual `tornear://login?ref=<username>` es lo
//      que parsea app/login.tsx via lib/deep-linking.ts.
// Si alguien cambia el path o como se arma el segmento, la invitacion sigue
// "siendo un link" pero el referido se pierde en silencio en cualquiera de
// los tres pasos, porque `set_referral` no-opea sin username.

describe('buildReferralLink', () => {
  it('arma el Universal Link con el username como codigo', () => {
    expect(buildReferralLink('agussala')).toBe('https://tornear.vercel.app/i/agussala');
  });

  it('apunta al path publico /i/<username> que resuelve la landing de referidos', () => {
    // `/i/[username]` es la ruta publica en torneAR/dashboard: no requiere
    // sesion ni depende de si el SO logro interceptar el Universal Link.
    expect(buildReferralLink('x')).toBe('https://tornear.vercel.app/i/x');
  });

  it('escapa los caracteres que romperian el path', () => {
    expect(buildReferralLink('juan perez')).toBe('https://tornear.vercel.app/i/juan%20perez');
    expect(buildReferralLink('a&b=c')).toBe('https://tornear.vercel.app/i/a%26b%3Dc');
  });

  it('escapa una barra en el username para que no arme un segmento de path adicional', () => {
    // A diferencia del query string de antes, ahora el username es un
    // segmento de PATH: un `/` sin escapar partiria la URL en un segmento
    // de mas y rompería el matching de `/i/[username]`, tanto en el App
    // Router de la landing como en el intentFilter de Android
    // (pathPrefix: '/i/').
    expect(buildReferralLink('a/b')).toBe('https://tornear.vercel.app/i/a%2Fb');
  });
});

describe('buildReferralLink con nombre visible (?n=)', () => {
  it('agrega el nombre codificado: tildes, eñes y espacios', () => {
    expect(buildReferralLink('agussala', 'Agustín Muñoz')).toBe(
      'https://tornear.vercel.app/i/agussala?n=Agust%C3%ADn%20Mu%C3%B1oz',
    );
  });

  it('el nombre codificado vuelve intacto al decodificarlo (lo que hace la landing)', () => {
    const link = new URL(buildReferralLink('agussala', 'José María Pérez'));
    expect(link.pathname).toBe('/i/agussala');
    expect(link.searchParams.get('n')).toBe('José María Pérez');
  });

  it('escapa los caracteres que partirian el query string', () => {
    const link = buildReferralLink('agussala', 'Tom & Jerry #1 ?=');
    expect(link).toBe('https://tornear.vercel.app/i/agussala?n=Tom%20%26%20Jerry%20%231%20%3F%3D');
    expect(new URL(link).searchParams.get('n')).toBe('Tom & Jerry #1 ?=');
  });

  it('recorta espacios de los bordes', () => {
    expect(buildReferralLink('agussala', '  Agus  ')).toBe('https://tornear.vercel.app/i/agussala?n=Agus');
  });

  it('sin nombre, vacio o solo espacios: no agrega el parametro', () => {
    const plain = 'https://tornear.vercel.app/i/agussala';
    expect(buildReferralLink('agussala', null)).toBe(plain);
    expect(buildReferralLink('agussala', undefined)).toBe(plain);
    expect(buildReferralLink('agussala', '')).toBe(plain);
    expect(buildReferralLink('agussala', '   ')).toBe(plain);
  });

  it('no recorta nombres largos: el corte a 40 code points lo hace la web', () => {
    const longName = 'Juan Ignacio Sacco Moriconi de la Santísima Trinidad';
    expect(new URL(buildReferralLink('juani', longName)).searchParams.get('n')).toBe(longName);
  });
});

describe('buildReferralMessage', () => {
  it('incluye el codigo en texto plano ademas del link', () => {
    const message = buildReferralMessage('agussala');

    // El texto plano es el fallback si el link no llega a abrir nada: el
    // codigo tipeable si le sirve al referido para registrarse igual.
    expect(message).toContain('mi código: agussala');
    expect(message).toContain('https://tornear.vercel.app/i/agussala');
  });

  it('mantiene el copy acordado con producto', () => {
    expect(buildReferralMessage('nico')).toBe(
      '¡Sumate a torneAR! Registrate con mi código: nico y empezá a rankear: https://tornear.vercel.app/i/nico',
    );
  });

  it('con nombre visible, el link del mensaje lleva ?n= y el codigo en texto sigue siendo el username', () => {
    expect(buildReferralMessage('nico', 'Nicolás Gómez')).toBe(
      '¡Sumate a torneAR! Registrate con mi código: nico y empezá a rankear: https://tornear.vercel.app/i/nico?n=Nicol%C3%A1s%20G%C3%B3mez',
    );
  });
});
