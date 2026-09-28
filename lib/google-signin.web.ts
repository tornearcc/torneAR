import type { GoogleIdTokenResult } from '@/lib/google-signin';

/**
 * Variante web (Metro la elige por el sufijo `.web.ts`; la nativa está en
 * `google-signin.native.ts`).
 *
 * El SDK no tiene login en web —su `signIn` lanza "not implemented"—, y en web
 * `signInWithGoogle` (lib/auth-data.ts) usa el redirect OAuth de Supabase, así
 * que esto no debería llamarse nunca. Si alguien lo llama, recibe un error
 * explícito en vez de una excepción del SDK.
 */
export async function requestGoogleIdToken(): Promise<GoogleIdTokenResult> {
  return { status: 'error', message: 'El inicio de sesión nativo con Google no existe en la web.' };
}

/** En web no hay sesión local del SDK que cerrar. */
export function signOutFromGoogle(): Promise<void> {
  return Promise.resolve();
}
