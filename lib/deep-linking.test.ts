import { describe, expect, it, vi } from 'vitest';
import {
  deepLinkToHref,
  extractDeepLinkUrl,
  isOAuthCallback,
  isPasswordRecoveryLink,
  isProtectedDeepLink,
  resolveDeepLink,
} from './deep-linking';

// expo-linking arrastra react-native (sintaxis Flow) y no se puede importar en
// el entorno node de Vitest. Mockeamos SOLO `parse` con una implementación fiel
// al comportamiento de expo para schemes propios:
//   scheme://host/rest?query  ->  { scheme, hostname: host, path: rest, queryParams }
//   scheme:///rest            ->  { scheme, hostname: '', path: rest, ... }
//   sin "://"                 ->  { scheme: null, ... }
// Nuestro código combina hostname+path, así que es robusto a cómo se reparta el
// primer segmento; lo que este test fija es NUESTRA lógica de gating, no la de expo.
vi.mock('expo-linking', () => {
  function parse(url: string) {
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(url);
    if (!schemeMatch) {
      return { scheme: null, hostname: null, path: url || null, queryParams: {} };
    }

    const rest = url.slice(schemeMatch[0].length);
    const [pathPart, queryPart = ''] = rest.split('?');
    const segments = pathPart.split('/');
    const hostname = segments.shift() ?? '';
    const path = segments.join('/');

    const queryParams: Record<string, string> = {};
    if (queryPart) {
      for (const pair of queryPart.split('&')) {
        const [key, value = ''] = pair.split('=');
        if (key) queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }

    return {
      scheme: schemeMatch[1],
      hostname: hostname === '' ? null : hostname,
      path: path === '' ? null : path,
      queryParams,
    };
  }

  return { parse };
});

// Construye la forma mínima de un NotificationResponse de expo-notifications.
const pushResponse = (data: unknown) => ({
  notification: { request: { content: { data } } },
});

describe('extractDeepLinkUrl', () => {
  it('devuelve la url cuando data.url es un string no vacío', () => {
    expect(extractDeepLinkUrl(pushResponse({ url: 'tornear://market' }))).toBe('tornear://market');
  });

  it('conserva la url con query params intacta', () => {
    const url = 'tornear://match-detail?id=123';
    expect(extractDeepLinkUrl(pushResponse({ url, type: 'DESAFIO' }))).toBe(url);
  });

  it('devuelve null cuando data no trae url', () => {
    expect(extractDeepLinkUrl(pushResponse({ type: 'DESAFIO' }))).toBeNull();
  });

  it('devuelve null cuando data es un objeto vacío', () => {
    expect(extractDeepLinkUrl(pushResponse({}))).toBeNull();
  });

  it('devuelve null cuando data.url es un string vacío', () => {
    expect(extractDeepLinkUrl(pushResponse({ url: '' }))).toBeNull();
  });

  it('devuelve null cuando data.url no es string', () => {
    expect(extractDeepLinkUrl(pushResponse({ url: 123 }))).toBeNull();
  });

  it('devuelve null cuando data es null', () => {
    expect(extractDeepLinkUrl(pushResponse(null))).toBeNull();
  });

  it('devuelve null cuando data es undefined', () => {
    expect(extractDeepLinkUrl(pushResponse(undefined))).toBeNull();
  });
});

describe('resolveDeepLink · Ignore (URLs inválidas / scheme desconocido)', () => {
  it('ignora el scheme propio sin ruta (tornear://)', () => {
    expect(resolveDeepLink('tornear://', false)).toEqual({ kind: 'ignore' });
  });

  it('ignora string vacío', () => {
    expect(resolveDeepLink('', false)).toEqual({ kind: 'ignore' });
  });

  it('ignora URLs malformadas sin scheme', () => {
    expect(resolveDeepLink('not a url', false)).toEqual({ kind: 'ignore' });
  });

  it('ignora schemes ajenos aunque la ruta parezca válida', () => {
    expect(resolveDeepLink('evilapp://match-detail', true)).toEqual({ kind: 'ignore' });
  });

  it('ignora https (no es el scheme de la app)', () => {
    expect(resolveDeepLink('https://tornear.vercel.app/market', true)).toEqual({ kind: 'ignore' });
  });

  it('ignora un Universal Link a /i/ sin username', () => {
    expect(resolveDeepLink('https://tornear.vercel.app/i', false)).toEqual({ kind: 'ignore' });
    expect(resolveDeepLink('https://tornear.vercel.app/i/', false)).toEqual({ kind: 'ignore' });
  });
});

describe('resolveDeepLink · Universal Links de referido (https://tornear.vercel.app/i/<username>)', () => {
  // Fase 6.1: el link que se comparte hoy (lib/referral-link.ts) es este
  // formato https, no el tornear:// directo de antes. Si el SO lo
  // intercepta, la app recibe la URL cruda tal cual.
  it('traduce al mismo destino que el tornear://login?ref= de antes, sin sesión', () => {
    expect(resolveDeepLink('https://tornear.vercel.app/i/agussala', false)).toEqual({
      kind: 'navigate',
      href: { pathname: '/login', params: { ref: 'agussala' } },
    });
  });

  it('decodifica un username percent-encoded (Universal Link de producción)', () => {
    expect(resolveDeepLink('https://tornear.vercel.app/i/juan%2Fperez', false)).toEqual({
      kind: 'navigate',
      href: { pathname: '/login', params: { ref: 'juan/perez' } },
    });
  });

  it('navega igual con sesión activa (login es público independientemente del auth)', () => {
    expect(resolveDeepLink('https://tornear.vercel.app/i/agussala', true)).toEqual({
      kind: 'navigate',
      href: { pathname: '/login', params: { ref: 'agussala' } },
    });
  });

  // Fase 3 de Marketing & Growth: el Content Factory etiqueta los links de
  // las tarjetas con UTM. Tienen que sobrevivir la misma traducción que el
  // username, no perderse en el camino a `tornear://login`.
  it('reenvía los 3 UTM cuando vienen en el Universal Link', () => {
    expect(
      resolveDeepLink(
        'https://tornear.vercel.app/i/agussala?utm_source=instagram&utm_medium=social&utm_campaign=mvp-card-w34',
        false,
      ),
    ).toEqual({
      kind: 'navigate',
      href: {
        pathname: '/login',
        params: {
          ref: 'agussala',
          utm_source: 'instagram',
          utm_medium: 'social',
          utm_campaign: 'mvp-card-w34',
        },
      },
    });
  });

  it('reenvía sólo los UTM presentes, sin inventar los que faltan', () => {
    expect(
      resolveDeepLink('https://tornear.vercel.app/i/agussala?utm_source=whatsapp', false),
    ).toEqual({
      kind: 'navigate',
      href: { pathname: '/login', params: { ref: 'agussala', utm_source: 'whatsapp' } },
    });
  });

  it('ignora query params que no son ni ref ni UTM (allowlist, no passthrough genérico)', () => {
    expect(
      resolveDeepLink('https://tornear.vercel.app/i/agussala?utm_source=instagram&debug=1', false),
    ).toEqual({
      kind: 'navigate',
      href: { pathname: '/login', params: { ref: 'agussala', utm_source: 'instagram' } },
    });
  });
});

describe('resolveDeepLink · Defer (ruta protegida sin sesión)', () => {
  it('difiere una tab protegida y conserva la url para el store', () => {
    expect(resolveDeepLink('tornear://market', false)).toEqual({
      kind: 'defer',
      url: 'tornear://market',
    });
  });

  it('difiere una ruta protegida con query params', () => {
    const url = 'tornear://match-detail?id=123';
    expect(resolveDeepLink(url, false)).toEqual({ kind: 'defer', url });
  });

  it('difiere rutas protegidas anidadas', () => {
    const url = 'tornear://admin/wo-review';
    expect(resolveDeepLink(url, false)).toEqual({ kind: 'defer', url });
  });
});

describe('resolveDeepLink · Navigate (pública, o protegida con sesión)', () => {
  it('navega a una ruta pública aunque NO haya sesión (login)', () => {
    expect(resolveDeepLink('tornear://login', false)).toEqual({
      kind: 'navigate',
      href: { pathname: '/login', params: {} },
    });
  });

  it('navega a forgot-password sin sesión', () => {
    expect(resolveDeepLink('tornear://forgot-password', false)).toEqual({
      kind: 'navigate',
      href: { pathname: '/forgot-password', params: {} },
    });
  });

  it('navega a una ruta protegida CON sesión activa', () => {
    expect(resolveDeepLink('tornear://market', true)).toEqual({
      kind: 'navigate',
      href: { pathname: '/market', params: {} },
    });
  });

  it('navega y preserva los query params de una ruta protegida con sesión', () => {
    expect(resolveDeepLink('tornear://match-detail?id=123', true)).toEqual({
      kind: 'navigate',
      href: { pathname: '/match-detail', params: { id: '123' } },
    });
  });

  it('normaliza el triple-slash (tornear:///market) al mismo destino', () => {
    expect(resolveDeepLink('tornear:///market', true)).toEqual({
      kind: 'navigate',
      href: { pathname: '/market', params: {} },
    });
  });

  it('preserva rutas anidadas protegidas cuando hay sesión', () => {
    expect(resolveDeepLink('tornear://admin/wo-review', true)).toEqual({
      kind: 'navigate',
      href: { pathname: '/admin/wo-review', params: {} },
    });
  });
});

describe('deepLinkToHref (helpers de bajo nivel)', () => {
  it('rechaza schemes que no son el de la app', () => {
    expect(deepLinkToHref('https://tornear.vercel.app/market')).toBeNull();
    expect(deepLinkToHref('evilapp://market')).toBeNull();
    expect(deepLinkToHref('not a url')).toBeNull();
  });

  it('rechaza el scheme propio sin ruta', () => {
    expect(deepLinkToHref('tornear://')).toBeNull();
  });

  it('construye el href con pathname y params', () => {
    expect(deepLinkToHref('tornear://match-detail?id=7&tab=stats')).toEqual({
      pathname: '/match-detail',
      params: { id: '7', tab: 'stats' },
    });
  });

  it('traduce un Universal Link https://tornear.vercel.app/i/<username> al href de login con ref', () => {
    expect(deepLinkToHref('https://tornear.vercel.app/i/agussala')).toEqual({
      pathname: '/login',
      params: { ref: 'agussala' },
    });
  });

  it('decodifica el username percent-encoded del Universal Link', () => {
    expect(deepLinkToHref('https://tornear.vercel.app/i/juan%2Fperez')).toEqual({
      pathname: '/login',
      params: { ref: 'juan/perez' },
    });
  });

  it('sigue rechazando cualquier otro path bajo tornear.vercel.app', () => {
    // Solo /i/<username> tiene traducción — el resto del dominio (la
    // landing, /legal/*, etc.) no tiene pantalla equivalente en la app.
    expect(deepLinkToHref('https://tornear.vercel.app/legal/tyc')).toBeNull();
  });

  it('reenvía los UTM del Universal Link junto con ref', () => {
    expect(
      deepLinkToHref('https://tornear.vercel.app/i/agussala?utm_source=tiktok&utm_campaign=elo-jump'),
    ).toEqual({
      pathname: '/login',
      params: { ref: 'agussala', utm_source: 'tiktok', utm_campaign: 'elo-jump' },
    });
  });

  it('no agrega claves de UTM cuando el Universal Link no trae ninguno', () => {
    expect(deepLinkToHref('https://tornear.vercel.app/i/agussala')).toEqual({
      pathname: '/login',
      params: { ref: 'agussala' },
    });
  });
});

describe('isOAuthCallback · callback de Google', () => {
  it('reconoce el callback con los tokens en el fragment (implicit)', () => {
    expect(
      isOAuthCallback('tornear://auth/callback#access_token=abc&refresh_token=def&expires_in=3600'),
    ).toBe(true);
  });

  it('reconoce el callback con el code en el query (pkce)', () => {
    expect(isOAuthCallback('tornear://auth/callback?code=abc123')).toBe(true);
  });

  it('reconoce el callback pelado', () => {
    expect(isOAuthCallback('tornear://auth/callback')).toBe(true);
  });

  it('no confunde una ruta cualquiera con el callback', () => {
    expect(isOAuthCallback('tornear://match-detail?id=1')).toBe(false);
    expect(isOAuthCallback('tornear://auth')).toBe(false);
  });

  it('exige el scheme de la app', () => {
    expect(isOAuthCallback('evilapp://auth/callback#access_token=abc')).toBe(false);
  });
});

describe('resolveDeepLink · el callback de OAuth nunca navega ni se difiere', () => {
  // El eco que Android manda al listener de Linking despues de que
  // signInWithGoogle() ya canjeo los tokens. Si se difiriera, el guard
  // navegaria a /auth/callback (ruta inexistente) apenas hubiera sesion.
  it('ignora el callback sin sesion (no lo guarda como pendiente)', () => {
    expect(
      resolveDeepLink('tornear://auth/callback#access_token=abc&refresh_token=def', false),
    ).toEqual({ kind: 'ignore' });
  });

  it('ignora el callback con sesion ya activa', () => {
    expect(resolveDeepLink('tornear://auth/callback?code=abc123', true)).toEqual({
      kind: 'ignore',
    });
  });
});

describe('isProtectedDeepLink', () => {
  it('marca login y forgot-password como públicas', () => {
    expect(isProtectedDeepLink('tornear://login')).toBe(false);
    expect(isProtectedDeepLink('tornear://forgot-password')).toBe(false);
  });

  it('marca cualquier otra ruta como protegida', () => {
    expect(isProtectedDeepLink('tornear://market')).toBe(true);
    expect(isProtectedDeepLink('tornear://match-detail?id=1')).toBe(true);
    expect(isProtectedDeepLink('tornear://admin/wo-review')).toBe(true);
  });

  it('trata el Universal Link de referido como público (login), no como protegido', () => {
    // Regresión: normalizeUniversalLink() traduce a `login`, que SÍ está en
    // PUBLIC_DEEP_LINK_PATHS. Si esta función normalizara distinto que
    // deepLinkToHref (o no normalizara), vería la raíz `i` — que no está en
    // el set — y trataría un link público como protegido, diriéndolo en vez
    // de navegar aunque el usuario no tenga sesión.
    expect(isProtectedDeepLink('https://tornear.vercel.app/i/agussala')).toBe(false);
  });
});

describe('isPasswordRecoveryLink', () => {
  it('reconoce el link de recuperación pelado', () => {
    expect(isPasswordRecoveryLink('tornear://reset-password')).toBe(true);
  });

  it('lo reconoce con triple barra, que es como puede salir de Linking.createURL', () => {
    expect(isPasswordRecoveryLink('tornear:///reset-password#access_token=abc')).toBe(true);
  });

  it('lo reconoce con los tokens colgados del fragment (flujo implicit)', () => {
    expect(
      isPasswordRecoveryLink(
        'tornear://reset-password#access_token=abc&refresh_token=def&type=recovery',
      ),
    ).toBe(true);
  });

  it('lo reconoce con el code de PKCE y con el token_hash de la plantilla mobile', () => {
    expect(isPasswordRecoveryLink('tornear://reset-password?code=abc')).toBe(true);
    expect(
      isPasswordRecoveryLink('tornear://reset-password?token_hash=abc&type=recovery'),
    ).toBe(true);
  });

  it('rechaza otras rutas y otros schemes', () => {
    expect(isPasswordRecoveryLink('tornear://forgot-password')).toBe(false);
    expect(isPasswordRecoveryLink('tornear://auth/callback#access_token=abc')).toBe(false);
    // Un scheme ajeno no puede empujar a nadie a la pantalla de cambiar clave.
    expect(isPasswordRecoveryLink('evilapp://reset-password#access_token=abc')).toBe(false);
  });
});

describe('resolveDeepLink · Recuperación de contraseña', () => {
  it('devuelve `recover` con la URL entera, sin tocar el fragment', () => {
    const url = 'tornear://reset-password#access_token=abc&refresh_token=def&type=recovery';
    expect(resolveDeepLink(url, false)).toEqual({ kind: 'recover', url });
  });

  it('devuelve `recover` también con sesión activa', () => {
    // Caso real: el usuario ya está logueado en el teléfono y abre igual el
    // link del mail. Tiene que poder cambiar la clave, no caer en /(tabs).
    const url = 'tornear://reset-password#access_token=abc&type=recovery';
    expect(resolveDeepLink(url, true)).toEqual({ kind: 'recover', url });
  });

  it('devuelve `recover` cuando el link viene vencido (sin tokens, con error)', () => {
    // Supabase no manda tokens sino el error en el fragment. Igual tiene que
    // llegar a la pantalla: es la única que sabe explicar qué pasó.
    const url =
      'tornear://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    expect(resolveDeepLink(url, false)).toEqual({ kind: 'recover', url });
  });

  it('NO difiere el link aunque no haya sesión', () => {
    // Regresión: `reset-password` tiene que estar en PUBLIC_DEEP_LINK_PATHS.
    // Sin eso el link se guardaba como pendiente y el guard lo consumía recién
    // después del login — es decir, nunca, porque el usuario no puede loguearse
    // (a eso vino). Y para entonces el link ya habría vencido.
    expect(isProtectedDeepLink('tornear://reset-password')).toBe(false);
  });
});
