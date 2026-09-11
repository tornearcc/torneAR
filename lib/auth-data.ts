import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { OAUTH_CALLBACK_PATH, PASSWORD_RECOVERY_PATH } from '@/lib/deep-linking';
import { LEGAL_VERSIONS } from '@/constants/legal';
import { AuthError, User } from '@supabase/supabase-js';

export async function signIn(email: string, password: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Prueba de aceptación legal que viaja con el alta de cuenta.
 *
 * Va en `options.data` (→ `auth.users.raw_user_meta_data`) y no en una tabla
 * propia porque tiene que quedar registrado en el MISMO acto que crea el
 * usuario: si fuese un INSERT posterior, un fallo de red entre ambos dejaría
 * una cuenta creada sin constancia de consentimiento — exactamente el agujero
 * que el requerimiento legal viene a cerrar.
 *
 * Las versiones se guardan además del booleano: "aceptó los TyC" no prueba
 * nada si no consta QUÉ texto estaba vigente cuando aceptó.
 */
export interface LegalAcceptance {
  accepted_tyc: true;
  accepted_privacy: true;
  legal_acceptance_date: string;
  tyc_version: string;
  privacy_version: string;
}

/**
 * Arma la constancia con la fecha del momento y las versiones VIGENTES.
 *
 * Existe para que los dos puntos de entrada —el alta por email (`app/login.tsx`)
 * y el onboarding de Google (`app/onboarding.tsx`)— no repitan el literal. Si
 * cada uno armara su propio objeto, alcanzaría con que a uno se le olvidara
 * `tyc_version` para que esas cuentas quedaran con una constancia que no prueba
 * contra qué texto se aceptó.
 */
export function buildLegalAcceptance(): LegalAcceptance {
  return {
    accepted_tyc: true,
    accepted_privacy: true,
    legal_acceptance_date: new Date().toISOString(),
    tyc_version: LEGAL_VERSIONS.terms,
    privacy_version: LEGAL_VERSIONS.privacy,
  };
}

/**
 * Escribe la constancia sobre una cuenta que YA existe.
 *
 * Es el caso de Google: el proveedor da de alta al usuario en el primer
 * consentimiento, y `signInWithGoogle()` no puede adjuntar `options.data` como
 * hace `signUp()` — el alta no pasa por nosotros. Sin esto, ninguna cuenta
 * creada por Google tenía `accepted_tyc`, fecha ni versión.
 *
 * El momento para llamarla es el onboarding: es el único punto por el que pasan
 * todas las altas de Google (el guard de `app/_layout.tsx` no deja entrar a la
 * app con el perfil incompleto), y ocurre antes de que exista fila en
 * `profiles`.
 *
 * `updateUser` dispara `USER_UPDATED`, así que el `AuthContext` recoge la
 * metadata nueva solo.
 */
export async function recordLegalAcceptance(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.updateUser({ data: buildLegalAcceptance() });
  return { error };
}

/**
 * `true` si la cuenta todavía no tiene constancia de aceptación VIGENTE.
 *
 * Lee `user_metadata` (espejo de `auth.users.raw_user_meta_data`). Compara
 * `accepted_tyc` contra `true` estricto y no por truthiness: la metadata es
 * JSON libre y un `"false"` o un `1` no deben pasar por una aceptación.
 *
 * Además de la aceptación en sí, compara `tyc_version` contra
 * `LEGAL_VERSIONS.terms`: aceptar unos Términos viejos no cubre una versión
 * publicada después — sin esto, actualizar el documento no volvía a pedir
 * consentimiento a nadie que ya lo hubiera aceptado alguna vez (gap cerrado
 * en LegalVersionGate.tsx).
 *
 * Sin usuario devuelve `true` —hay que pedir el consentimiento— porque el error
 * barato es pedirlo de más y el caro es dar de alta sin él.
 */
export function needsLegalAcceptance(user: User | null): boolean {
  if (user?.user_metadata?.accepted_tyc !== true) return true;
  return user.user_metadata.tyc_version !== LEGAL_VERSIONS.terms;
}

export async function signUp(
  email: string,
  password: string,
  legalAcceptance: LegalAcceptance,
): Promise<{ error: AuthError | null }> {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: legalAcceptance },
  });
}

/**
 * Envía el mail de recuperación apuntando de vuelta a la app.
 *
 * Sin `redirectTo`, Supabase usa el **Site URL** del proyecto — la landing de
 * `tornear.vercel.app` — y el link terminaba abriendo la web, que no tiene
 * pantalla de cambio de contraseña. De ahí el síntoma original.
 *
 * `Linking.createURL` en vez del literal `'tornear://reset-password'`, igual
 * que en `signInWithGoogle()`: la URL sale del scheme declarado en `app.json`,
 * así que no hay una constante que se desincronice si ese scheme cambia.
 *
 * En dev-client y en producción resuelve a `tornear://reset-password` — el
 * MISMO valor en los dos, así que una sola entrada `tornear://**` en la
 * allowlist cubre desarrollo y producción y no hay nada que tocar al publicar.
 *
 * En Expo Go devolvería `exp://<ip>:8081/--/reset-password`, pero eso acá es
 * teórico: esta app no corre en Expo Go (config plugin propio en
 * `plugins/withInstagramQueries.js`, más `react-native-share` y
 * `react-native-view-shot`, que no vienen en ese runtime), y aunque corriera,
 * el gating de `lib/deep-linking.ts` descarta todo scheme distinto de
 * `tornear`. El flujo se prueba con `npx expo run:android`.
 *
 * ⚠️ La URL resultante tiene que estar en la allowlist de **Authentication →
 * URL Configuration → Redirect URLs** del proyecto. Supabase ignora en silencio
 * cualquier `redirectTo` que no esté ahí y cae de nuevo al Site URL — es decir,
 * el bug vuelve sin ningún error visible.
 */
export async function sendPasswordReset(email: string): Promise<{ error: AuthError | null }> {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: Linking.createURL(PASSWORD_RECOVERY_PATH),
  });
}

/**
 * Canjea la sesión de recuperación que viene en el link del mail.
 *
 * En nativo esto NO ocurre solo: `detectSessionInUrl` está apagado fuera de web
 * (ver lib/supabase.ts) porque no hay `window.location` que inspeccionar. Sin
 * este canje explícito no hay sesión, `updateUser` falla con "Auth session
 * missing" y —esto es lo que sorprende— `onAuthStateChange` **nunca emite
 * `PASSWORD_RECOVERY`**: ese evento lo produce el propio `detectSessionInUrl`,
 * así que en iOS/Android no se dispara jamás.
 *
 * Reusa `establishSessionFromUrl`, el mismo canje del callback de Google:
 * Supabase devuelve los tokens con idéntica forma en los dos flujos.
 */
export async function completePasswordRecovery(url: string): Promise<{ error: AuthError | null }> {
  const params = parseCallbackParams(url);

  /*
   * Plantilla con `{{ .TokenHash }}`: el mail linkea DIRECTO a la app
   * (`tornear://reset-password?token_hash=…&type=recovery`) en vez de pasar por
   * `/auth/v1/verify`. Es la variante que Supabase recomienda para mobile
   * porque evita el salto por el navegador, y ahí no hay tokens que leer sino
   * un hash que se canjea con `verifyOtp`.
   *
   * Se chequea primero porque es el único caso que `establishSessionFromUrl` no
   * sabría resolver: no trae ni `code` ni `access_token`, así que caería en
   * "el proveedor no devolvió una sesión válida".
   */
  const tokenHash = params.get('token_hash');
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    return { error };
  }

  return establishSessionFromUrl(url);
}

/**
 * Escribe la contraseña nueva sobre la sesión de recuperación vigente.
 *
 * `updateUser` opera sobre el usuario de la sesión actual: si el canje de
 * arriba no corrió, esto falla — no hay forma de cambiarle la contraseña a
 * alguien sin su sesión, que es justamente la garantía del flujo.
 */
export async function updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error };
}

/**
 * Resultado de un login federado. `cancelled` distingue "el usuario cerró la
 * ventana de Google" (no es un error: no hay que mostrar alerta) de un fallo
 * real del proveedor o del canje de tokens.
 */
export type OAuthResult = { error: AuthError | null; cancelled: boolean };

function oauthError(message: string): AuthError {
  return { name: 'AuthError', message, status: 0 } as AuthError;
}

/**
 * Lee los parámetros que Supabase cuelga de la URL de callback. El lugar
 * depende del `flowType` del cliente:
 *   · implicit (default de supabase-js) → fragment: `#access_token=…&refresh_token=…`
 *   · pkce                              → query:    `?code=…`
 * Soportamos los dos para que cambiar `flowType` en lib/supabase.ts no rompa
 * este flujo.
 */
function parseCallbackParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  return new URLSearchParams(fragment || query);
}

/**
 * Arma la sesión a partir de una URL de vuelta de Supabase.
 *
 * Compartida por los DOS flujos que reciben credenciales por deep link —el
 * callback de Google y el link de recuperación— porque Supabase devuelve los
 * tokens con la misma forma en ambos. Antes esto era `completeOAuthSession` y
 * vivía atado al login federado; duplicarlo para recuperación habría dejado dos
 * copias del parseo implicit/PKCE que hay que mantener en sync.
 */
async function establishSessionFromUrl(url: string): Promise<{ error: AuthError | null }> {
  const params = parseCallbackParams(url);

  // Google/Supabase reportan el rechazo por la propia URL de vuelta, no por una
  // excepción: si no lo miramos, terminaríamos con un "sesión inválida" opaco.
  // En recuperación es el caso más frecuente de todos: `error_code=otp_expired`
  // cuando el link ya venció o ya se usó.
  const providerError = params.get('error_description') ?? params.get('error');
  if (providerError) {
    return { error: oauthError(providerError) };
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { error };
  }

  return { error: oauthError('El proveedor no devolvió una sesión válida.') };
}

/**
 * Login con Google vía el proveedor OAuth de Supabase.
 *
 * Nativo: abrimos la URL de consentimiento en una custom tab / ASWebAuthentication
 * Session con `openAuthSessionAsync`, que devuelve el control a la app en la
 * `redirectTo` (`tornear://auth/callback`) sin dejar pestañas colgadas. De ahí
 * sacamos los tokens y armamos la sesión a mano — `detectSessionInUrl` está
 * apagado en nativo porque no hay `window.location`.
 *
 * Web: no hay AuthSession nativa; dejamos que supabase-js redirija la pestaña y
 * `detectSessionInUrl` (lib/supabase.ts) levante la sesión al volver.
 *
 * En ningún caso navegamos: al escribir la sesión, `onAuthStateChange` despierta
 * al AuthContext y el guard de `app/_layout.tsx` decide el destino (onboarding
 * si el perfil está incompleto — el caso normal en el primer login con Google —
 * o el deep link pendiente / `/(tabs)` si ya está completo).
 */
export async function signInWithGoogle(): Promise<OAuthResult> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error, cancelled: false };
  }

  const redirectTo = Linking.createURL(OAUTH_CALLBACK_PATH);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // Abrimos nosotros el navegador (abajo): sin esto supabase-js intentaría
      // redirigir un `window` que en nativo no existe.
      skipBrowserRedirect: true,
      // Sin esto Google entra directo con la última cuenta usada y el usuario
      // no puede elegir con cuál de sus mails jugar.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) {
    return { error, cancelled: false };
  }

  if (!data?.url) {
    return { error: oauthError('No se pudo abrir el login de Google.'), cancelled: false };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  // 'cancel' (usuario cerró) y 'dismiss' (volvió con el gesto/back) no son
  // errores: se vuelve al login sin alerta.
  if (result.type !== 'success') {
    return { error: null, cancelled: true };
  }

  const { error: sessionError } = await establishSessionFromUrl(result.url);
  return { error: sessionError, cancelled: false };
}

/**
 * `true` si el dispositivo puede ofrecer Sign in with Apple.
 *
 * En Android y en web el módulo nativo no existe y `expo-apple-authentication`
 * devuelve un stub cuyo `isAvailableAsync()` responde `false`, así que importar
 * el paquete fuera de iOS es inocuo y esta llamada no rompe.
 *
 * Se exporta para que `app/login.tsx` decida si pinta el botón: Apple exige que
 * la opción esté al mismo nivel que la de Google, pero pintar un botón que no
 * puede funcionar sería peor que no pintarlo.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Login nativo con Apple (guideline 4.8 de la App Store).
 *
 * A diferencia de Google, esto NO pasa por el navegador: el sistema presenta su
 * propia hoja, devuelve un identity token firmado y ese token se canjea por una
 * sesión de Supabase con `signInWithIdToken`. No hay deep link ni callback que
 * parsear, así que nada de `establishSessionFromUrl` aplica acá.
 *
 * ## Por qué no se manda `nonce`
 *
 * `signInAsync` acepta un `nonce` y lo pasa VERBATIM a
 * `ASAuthorizationAppleIDRequest.nonce` (ver ios/AppleAuthenticationRequest.swift
 * del paquete): el módulo no lo hashea. El patrón correcto sería mandarle a
 * Apple el SHA-256 y a Supabase el valor crudo, y si se invierte el orden el
 * canje falla con un error opaco que no se puede diagnosticar desde el
 * dispositivo. El flujo documentado por Supabase para Expo omite el nonce, que
 * es lo que se hace acá: el token igual se valida por firma y por audiencia
 * contra el bundle ID cargado en el provider.
 *
 * ## El nombre viene UNA sola vez
 *
 * Apple entrega `fullName` únicamente en la primera autorización de cada
 * cuenta, y el identity token no lo lleva, así que Supabase no lo guarda solo.
 * Si no se persiste en ese momento se pierde para siempre: la segunda vez que
 * esa persona entre, `credential.fullName` va a venir en `null`.
 *
 * Por eso se escribe en `user_metadata.full_name` apenas hay sesión. Ese es
 * exactamente el campo que `app/onboarding.tsx` ya lee para prellenar el nombre
 * en las altas de Google, así que la pantalla de onboarding no se toca.
 *
 * El fallo al guardarlo NO aborta el login: la cuenta ya existe y la sesión ya
 * está activa; dejar al usuario afuera por no haber podido precargar un campo
 * que igual puede escribir a mano sería el peor de los dos resultados.
 */
export async function signInWithApple(): Promise<OAuthResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;

  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    // Cerrar la hoja es una decisión del usuario, no un fallo: mismo criterio
    // que el `cancelled` de Google. El paquete rechaza con
    // `ERR_REQUEST_CANCELED`; se mira además el mensaje porque el código viaja
    // en una propiedad no tipada y un cambio de nombre del lado nativo
    // convertiría una cancelación en una alerta de error.
    const code = (error as { code?: string })?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(message)) {
      return { error: null, cancelled: true };
    }
    return { error: oauthError(message), cancelled: false };
  }

  if (!credential.identityToken) {
    return {
      error: oauthError('Apple no devolvió un token de identidad.'),
      cancelled: false,
    };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) {
    return { error, cancelled: false };
  }

  await persistAppleFullName(credential.fullName);

  return { error: null, cancelled: false };
}

/**
 * Guarda el nombre que Apple entrega en la primera autorización.
 *
 * Best-effort a propósito (ver el comentario de `signInWithApple`): loguea y
 * sigue. `givenName` y `familyName` pueden venir sueltos o en `null` por
 * separado si la persona editó lo que comparte, así que se arma con los que
 * haya y no se escribe nada si no quedó ninguno.
 */
async function persistAppleFullName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): Promise<void> {
  const parts = [fullName?.givenName, fullName?.familyName].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );

  if (parts.length === 0) return;

  const { error } = await supabase.auth.updateUser({
    data: { full_name: parts.join(' ') },
  });

  if (error) {
    Logger.warn('No se pudo guardar el nombre que devolvió Apple; el onboarding lo va a pedir', {
      scope: 'auth-data.persistAppleFullName',
      reason: error.message,
    });
  }
}
