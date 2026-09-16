/**
 * `tsc` no resuelve los sufijos de plataforma `.native.ts` / `.web.ts` (mismo
 * motivo que `instagram-stories.d.ts`): este archivo sólo declara la forma
 * pública. En runtime Metro ignora este `.d.ts` y elige
 * `google-signin.native.ts` o `google-signin.web.ts` según el bundle.
 */

/** Resultado de pedirle al SDK nativo un ID token de Google. */
export type GoogleIdTokenResult =
  | { status: 'success'; idToken: string }
  /** El usuario cerró la hoja: no es un error y no lleva alerta. */
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export function requestGoogleIdToken(): Promise<GoogleIdTokenResult>;

export function signOutFromGoogle(): Promise<void>;
