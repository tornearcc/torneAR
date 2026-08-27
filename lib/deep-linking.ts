import * as Linking from 'expo-linking';
import type { Href } from 'expo-router';

/**
 * Rutas públicas alcanzables sin sesión. Cualquier otra ruta se considera
 * protegida y exige autenticación antes de navegar (ver `isProtectedDeepLink`).
 */
const PUBLIC_DEEP_LINK_PATHS = new Set<string>(['login', 'forgot-password', 'reset-password']);

/**
 * Scheme propio de la app (ver `app.json`). Todo el gating de abajo trabaja
 * sobre este scheme — un Universal Link `https://tornear.vercel.app/...` se traduce
 * primero a este formato (`normalizeUniversalLink`) antes de llegar a
 * cualquiera de los chequeos. Cualquier otro scheme ajeno, o una URL sin
 * scheme, se sigue descartando tal cual.
 */
const APP_SCHEME = 'tornear';

/**
 * Dominio asociado a Universal Links / App Links (Fase 6.1 — ver
 * `associatedDomains`/`intentFilters` en `app.json` y
 * `tornear.vercel.app/.well-known/*` en torneAR/dashboard). Si el SO interceptó
 * bien el link, la app recibe esta URL `https://` cruda en vez del
 * `tornear://` que se comparte (`lib/referral-link.ts`).
 */
const UNIVERSAL_LINK_HOST = 'tornear.vercel.app';

/**
 * Prefijo de path de los links de referido en la web
 * (`torneAR/dashboard/app/(public)/i/[username]`). Es el único patrón de
 * Universal Link que esta función sabe traducir — mantenerlo en sync con
 * `REFERRAL_LINK_BASE_URL` de `lib/referral-link.ts` si alguno cambia.
 * Cualquier otro path bajo `tornear.vercel.app` (ej. la landing en `/`) no tiene
 * pantalla equivalente dentro de la app y se sigue ignorando como
 * cualquier https ajeno.
 */
const REFERRAL_UNIVERSAL_LINK_PREFIX = 'i/';

/**
 * UTM que `normalizeUniversalLink` reenvía del Universal Link al
 * `tornear://login?...` (Fase 3 de Marketing & Growth: el Content Factory
 * del dashboard etiqueta los links de las tarjetas con esto). Allowlist
 * explícita y no un passthrough genérico de `queryParams` — esta función
 * arma la URL interna que el resto de la app confía en resolver; no vale
 * la pena que cualquier query param futuro se cuele ahí sin una decisión.
 */
const UTM_PARAM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

/**
 * Path al que Supabase devuelve el control después del consentimiento de Google
 * (`tornear://auth/callback`). NO es una pantalla: `signInWithGoogle()`
 * (lib/auth-data.ts) ya resuelve esa URL desde `WebBrowser.openAuthSessionAsync`
 * y canjea los tokens ahí mismo.
 *
 * En Android, además, el SO entrega la misma URL al listener de `Linking` del
 * `_layout`. Sin esta excepción el guard la vería como una ruta protegida más:
 * la guardaría como deep link pendiente y, apenas la sesión quedara lista,
 * navegaría a `/auth/callback` — una ruta que no existe. Por eso se ignora
 * explícitamente.
 */
export const OAUTH_CALLBACK_PATH = 'auth/callback';

/**
 * Destino del link del mail de recuperación (`tornear://reset-password`).
 *
 * A diferencia de `OAUTH_CALLBACK_PATH`, este SÍ es una pantalla real
 * (`app/reset-password.tsx`), pero tampoco se navega con `deepLinkToHref`: la
 * URL trae la sesión de recuperación colgada del fragment
 * (`#access_token=…&refresh_token=…&type=recovery`) y `Linking.parse` no lee
 * fragments — navegar directo perdería los tokens y la pantalla se quedaría sin
 * sesión con la cual llamar a `updateUser`. Por eso `resolveDeepLink` la marca
 * como `recover` y el `_layout` primero canjea y después navega.
 */
export const PASSWORD_RECOVERY_PATH = 'reset-password';

/**
 * Normaliza el path de una URL `tornear://...`. `Linking.parse` reparte el
 * primer segmento entre `hostname` y `path` según la cantidad de barras
 * (`tornear://match-detail` vs `tornear:///match-detail`), así que los unimos
 * para obtener siempre el mismo resultado.
 */
function extractPath(parsed: Linking.ParsedURL): string {
  return [parsed.hostname, parsed.path]
    .filter(Boolean)
    .join('/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Traduce un Universal Link de referido (`https://tornear.vercel.app/i/<username>`)
 * al `tornear://login?ref=<username>` que el resto de este módulo ya sabe
 * resolver — mismo destino final que si el link hubiera llegado con el
 * scheme propio desde el vamos. Cualquier otra URL, incluido cualquier otro
 * path bajo `tornear.vercel.app`, se devuelve sin tocar.
 *
 * Se llama al principio de `isOAuthCallback`, `deepLinkToHref` e
 * `isProtectedDeepLink` — las tres, no solo una — para que el gating de
 * `isProtectedDeepLink` vea `login` (público) y no `i` (que, sin traducir,
 * no está en `PUBLIC_DEEP_LINK_PATHS` y diferiría el link como si fuera
 * protegido).
 *
 * El username va percent-encoded en el path si tenía caracteres especiales
 * (`juan%2Fperez` si el username original tenía una `/`, ver
 * `lib/referral-link.ts`): se decodifica con `decodeURIComponent` y se
 * vuelve a codificar como query param al armar el `tornear://`, sin asumir
 * que el escapado de un path y el de un query string son intercambiables.
 */
function normalizeUniversalLink(url: string): string {
  const parsed = Linking.parse(url);

  if (parsed.scheme !== 'https' || parsed.hostname !== UNIVERSAL_LINK_HOST) {
    return url;
  }

  // OJO: acá NO se usa `extractPath()`. Esa función combina hostname+path
  // porque en un `tornear://...` el host ES el primer segmento de la ruta
  // (`tornear://match-detail` → hostname: 'match-detail'). Para un
  // `https://`, `parsed.hostname` ya es el dominio real (`tornear.vercel.app`,
  // recién validado arriba) y NO forma parte de la ruta — combinarlo
  // armaría `tornear.vercel.app/i/juan` en vez de `i/juan`.
  const path = (parsed.path ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!path.startsWith(REFERRAL_UNIVERSAL_LINK_PREFIX)) {
    return url;
  }

  const encodedUsername = path.slice(REFERRAL_UNIVERSAL_LINK_PREFIX.length);
  if (!encodedUsername) {
    return url;
  }

  const username = decodeURIComponent(encodedUsername);
  const parts = [`ref=${encodeURIComponent(username)}`];

  for (const key of UTM_PARAM_KEYS) {
    const value = parsed.queryParams?.[key];
    if (typeof value === 'string' && value.length > 0) {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }

  return `${APP_SCHEME}://login?${parts.join('&')}`;
}

/**
 * Reconoce la URL de callback de OAuth. Compara sobre la URL sin query ni
 * fragment porque Supabase vuelve con los tokens colgados ahí
 * (`...#access_token=…` en implicit, `...?code=…` en PKCE).
 */
export function isOAuthCallback(url: string): boolean {
  const withoutParams = normalizeUniversalLink(url).split('#')[0].split('?')[0];
  const parsed = Linking.parse(withoutParams);

  if (parsed.scheme !== APP_SCHEME) {
    return false;
  }

  return extractPath(parsed) === OAUTH_CALLBACK_PATH;
}

/**
 * Reconoce el link de recuperación de contraseña. Compara sobre la URL sin
 * query ni fragment, por el mismo motivo que `isOAuthCallback`: Supabase cuelga
 * ahí los tokens (implicit), el `code` (PKCE) o el error si el link venció.
 */
export function isPasswordRecoveryLink(url: string): boolean {
  const withoutParams = normalizeUniversalLink(url).split('#')[0].split('?')[0];
  const parsed = Linking.parse(withoutParams);

  if (parsed.scheme !== APP_SCHEME) {
    return false;
  }

  return extractPath(parsed) === PASSWORD_RECOVERY_PATH;
}

/**
 * Convierte una URL de deep link en un `Href` navegable por expo-router,
 * preservando los query params. Devuelve `null` si la URL no apunta a
 * ninguna ruta concreta (ej. `tornear://` a secas), o si el scheme/host no
 * son ninguno de los que la app reconoce (ver `normalizeUniversalLink` para
 * el único caso `https://` aceptado: los Universal Links de referido).
 */
export function deepLinkToHref(url: string): Href | null {
  const parsed = Linking.parse(normalizeUniversalLink(url));

  if (parsed.scheme !== APP_SCHEME) {
    return null;
  }

  const path = extractPath(parsed);

  if (!path) {
    return null;
  }

  return {
    pathname: `/${path}`,
    params: parsed.queryParams ?? {},
  } as Href;
}

/**
 * Indica si la URL apunta a una ruta protegida (todo lo que no esté en
 * `PUBLIC_DEEP_LINK_PATHS`: `login`, `forgot-password` y `reset-password`). Se
 * usa para decidir si guardamos el link como pendiente cuando el usuario
 * todavía no está autenticado.
 */
export function isProtectedDeepLink(url: string): boolean {
  const parsed = Linking.parse(normalizeUniversalLink(url));
  const root = extractPath(parsed).split('/')[0] ?? '';

  return !PUBLIC_DEEP_LINK_PATHS.has(root);
}

/**
 * Decisión pura de gating para una URL entrante (deep link o tap de push):
 *  - `ignore`   → la URL no apunta a ninguna ruta navegable.
 *  - `defer`    → ruta protegida y sin sesión: guardar como pendiente y que el
 *                 guard de `_layout` la consuma tras el login (Auth Gating).
 *  - `navigate` → ruta pública, o protegida con sesión activa: navegar ya.
 *  - `recover`  → link del mail de recuperación: hay que canjear la sesión de
 *                 la URL ANTES de navegar (ver `PASSWORD_RECOVERY_PATH`).
 *
 * No produce efectos: el llamante aplica el store/router según el resultado,
 * de modo que la misma decisión sirve dentro y fuera de React.
 */
export type DeepLinkAction =
  | { kind: 'ignore' }
  | { kind: 'defer'; url: string }
  | { kind: 'navigate'; href: Href }
  | { kind: 'recover'; url: string };

export function resolveDeepLink(url: string, isAuthenticated: boolean): DeepLinkAction {
  // El callback de OAuth ya lo consume signInWithGoogle(): acá sólo llega el
  // eco que Android manda al listener de Linking. Navegar a él sería ir a una
  // ruta inexistente, y diferirlo dejaría un deep link pendiente envenenado.
  if (isOAuthCallback(url)) {
    return { kind: 'ignore' };
  }

  /*
   * Antes que `deepLinkToHref`, y antes que el gating de sesión.
   *
   * Es la única URL entrante que trae credenciales adentro: si cayera en la
   * rama genérica, `deepLinkToHref` armaría un `/reset-password` pelado —el
   * fragment con los tokens no sobrevive a `Linking.parse`— y el usuario
   * llegaría a la pantalla sin sesión de recuperación, o sea sin poder cambiar
   * nada. Tampoco puede diferirse: el link tiene un solo uso y vence.
   */
  if (isPasswordRecoveryLink(url)) {
    return { kind: 'recover', url };
  }

  const href = deepLinkToHref(url);
  if (!href) {
    return { kind: 'ignore' };
  }

  if (isProtectedDeepLink(url) && !isAuthenticated) {
    return { kind: 'defer', url };
  }

  return { kind: 'navigate', href };
}

/** Forma mínima de un `NotificationResponse` de expo-notifications, tipada
 *  estructuralmente para no arrastrar el módulo nativo a esta capa pura. */
export interface NotificationResponseLike {
  notification: { request: { content: { data: unknown } } };
}

/**
 * Extrae el deep link (`data.url`) que trae el payload de una push. La edge
 * function `push-dispatch` reenvía `notifications.data` tal cual, así que la
 * convención es que el backend incluya `url: "tornear://..."` cuando quiera que
 * el tap navegue. Devuelve `null` si no hay una URL string no vacía.
 */
export function extractDeepLinkUrl(response: NotificationResponseLike): string | null {
  const data = response.notification.request.content.data;
  if (data && typeof data === 'object' && 'url' in data) {
    const url = (data as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) {
      return url;
    }
  }
  return null;
}
