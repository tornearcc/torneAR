import { Platform } from 'react-native';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@/constants/google-auth';
import type { GoogleIdTokenResult } from '@/lib/google-signin';
import { Logger } from '@/lib/logger';

/**
 * Login nativo con Google: módulo "Original" (gratuito) de
 * `@react-native-google-signin/google-signin` (D-51).
 *
 * El SDK NO se importa en el top-level, por el mismo motivo que
 * `react-native-share` en `instagram-stories.native.ts`: su TurboModule se
 * resuelve al EVALUAR el módulo, y un binario que no lo trae —un Dev Client
 * anterior al rebuild— lanzaría en el import y se llevaría puesta la pantalla
 * de login entera. Con el require diferido, ese binario muestra un error claro
 * al tocar el botón y el resto de la pantalla sigue andando.
 *
 * `typeof import(...)` es sólo de tipos: TypeScript lo borra al compilar.
 */
type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let configured = false;

function loadGoogleSignin(): GoogleSigninModule | null {
  let mod: GoogleSigninModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
  } catch (error) {
    Logger.warn('El SDK de Google Sign-In no está en el binario nativo', {
      scope: 'google-signin.loadGoogleSignin',
      hint: 'Falta el rebuild del Dev Client con EAS para esta dependencia.',
      error,
    });
    return null;
  }

  if (!configured) {
    /*
     * Sin `scopes` a propósito: el default del SDK es email y profile, que
     * junto con openid son los únicos scopes que Google no obliga a verificar.
     * Pedir cualquier otro cambia eso.
     *
     * Sin `offlineAccess`: no hace falta un server auth code, porque Supabase
     * emite su propia sesión a partir del ID token.
     */
    mod.GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
    });
    configured = true;
  }

  return mod;
}

/**
 * Presenta la hoja de Google y devuelve el ID token de la cuenta elegida.
 *
 * Nunca lanza: todo desenlace vuelve como `GoogleIdTokenResult`, para que
 * `signInWithGoogle` (lib/auth-data.ts) lo traduzca al mismo `OAuthResult`
 * que ya consume `app/login.tsx`.
 */
export async function requestGoogleIdToken(): Promise<GoogleIdTokenResult> {
  const mod = loadGoogleSignin();
  if (!mod) {
    return {
      status: 'error',
      message: 'Esta versión de la app no tiene el inicio de sesión con Google. Actualizala desde la tienda.',
    };
  }

  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = mod;

  try {
    if (Platform.OS === 'android') {
      // Sin Play Services no hay hoja de Google en Android. Con este flag el
      // sistema ofrece actualizarlos en lugar de fallar callado.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    /*
     * El SDK recuerda la última cuenta y, en Android, entra directo con ella
     * sin mostrar el selector. El flujo web resolvía lo mismo con
     * `prompt: 'select_account'`: sin esto, quien tiene dos mails no puede
     * elegir con cuál jugar. Cierra sólo la sesión LOCAL del SDK: no toca la
     * de Supabase ni la cuenta de Google del teléfono.
     */
    await GoogleSignin.signOut();

    const response = await GoogleSignin.signIn();

    if (isCancelledResponse(response)) {
      return { status: 'cancelled' };
    }

    const { idToken } = response.data;
    if (!idToken) {
      return { status: 'error', message: 'Google no devolvió un token de identidad.' };
    }

    return { status: 'success', idToken };
  } catch (error) {
    if (isErrorWithCode(error)) {
      // Cerrar la hoja es una decisión del usuario, no un fallo: mismo criterio
      // que Apple. IN_PROGRESS es un segundo toque con la hoja todavía abierta:
      // el primero termina solo y no hay nada que avisar.
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
        return { status: 'cancelled' };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          status: 'error',
          message: 'Para entrar con Google necesitás tener actualizados los servicios de Google Play.',
        };
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message };
  }
}

/**
 * Cierra la sesión LOCAL del SDK al salir de la app.
 *
 * Best-effort: nunca lanza. Si falla, lo único que queda es que el SDK
 * recuerde la cuenta, y `requestGoogleIdToken` igual la limpia antes de cada
 * login.
 */
export async function signOutFromGoogle(): Promise<void> {
  const mod = loadGoogleSignin();
  if (!mod) return;

  try {
    await mod.GoogleSignin.signOut();
  } catch (error) {
    Logger.warn('No se pudo cerrar la sesión local de Google', {
      scope: 'google-signin.signOutFromGoogle',
      error,
    });
  }
}
