import { PASSWORD_MIN_LENGTH } from '@/lib/schemas/authSchema';

type ErrorLike = {
  message?: string;
  status?: number;
  code?: string;
};

function normalizeMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as ErrorLike;
    return (maybeError.message ?? '').toLowerCase();
  }
  return '';
}

export function getAuthErrorMessage(error: unknown, mode: 'login' | 'signup' = 'login'): string {
  const msg = normalizeMessage(error);

  if (!msg) {
    return mode === 'login'
      ? 'No se pudo iniciar sesion. Intentalo nuevamente.'
      : 'No se pudo crear la cuenta. Intentalo nuevamente.';
  }

  if (msg.includes('invalid login credentials')) {
    return 'Correo o contrasena incorrectos.';
  }

  if (msg.includes('email not confirmed')) {
    return 'Tu correo aun no fue confirmado. Revisa tu bandeja de entrada.';
  }

  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'Ese correo ya esta registrado. Proba iniciar sesion.';
  }

  // El minimo viaja desde la constante compartida: hardcodear 6 aca hacia que
  // la UI reportara un limite distinto al que aplica el server (config.toml).
  if (msg.includes('password should be at least')) {
    return `La contrasena debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return 'El formato del correo no es valido.';
  }

  if (msg.includes('signup is disabled')) {
    return 'El registro de nuevas cuentas esta deshabilitado temporalmente.';
  }

  if (msg.includes('email rate limit exceeded') || msg.includes('too many requests')) {
    return 'Hiciste demasiados intentos. Espera unos minutos y volve a intentar.';
  }

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'No hay conexion con el servidor. Verifica internet e intentalo nuevamente.';
  }

  // ── Login federado (Google) ────────────────────────────────────────────────
  // El proveedor no esta habilitado en el panel de Supabase (Auth > Providers).
  if (msg.includes('provider is not enabled') || msg.includes('unsupported provider')) {
    return 'El acceso con Google no esta disponible por ahora. Entra con tu correo.';
  }

  // El usuario rechazo el consentimiento en la pantalla de Google.
  if (msg.includes('access_denied') || msg.includes('access denied')) {
    return 'Cancelaste el acceso con Google.';
  }

  // Mismo correo ya registrado con otro metodo y sin verificar: Supabase se
  // niega a vincular las identidades en silencio.
  if (msg.includes('identity is already linked') || msg.includes('email address is already')) {
    return 'Ese correo ya tiene una cuenta. Entra con tu contrasena y despues vincula Google.';
  }

  // redirect_uri / client_id mal configurados en Google Cloud o en Supabase.
  if (msg.includes('redirect_uri_mismatch') || msg.includes('invalid_client')) {
    return 'El acceso con Google esta mal configurado. Avisanos e intenta con tu correo.';
  }

  return mode === 'login'
    ? 'No se pudo iniciar sesion. Verifica tus datos e intentalo otra vez.'
    : 'No se pudo crear la cuenta. Revisa los datos e intentalo otra vez.';
}

/**
 * Traduce el fallo del canje del link de recuperación.
 *
 * Separado de `getAuthErrorMessage` porque los errores no llegan como códigos
 * de una excepción sino como texto que Supabase cuelga de la URL de vuelta
 * (`error_description`), y porque acá el mensaje tiene que terminar SIEMPRE en
 * una instrucción: quien está leyendo esto se quedó afuera de su cuenta y
 * necesita saber que el próximo paso es pedir otro mail, no reintentar.
 */
export function getRecoveryLinkErrorMessage(error: unknown): string {
  const msg = normalizeMessage(error);

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'No hay conexion con el servidor. Verifica internet y volve a abrir el enlace del correo.';
  }

  // `otp_expired` es el caso dominante: el link dura una hora y es de un solo
  // uso, asi que tambien cae aca el usuario que lo abrio dos veces.
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('access_denied')) {
    return 'Este enlace ya se uso o expiro. Pedi uno nuevo desde «Olvide mi contrasena».';
  }

  return 'No pudimos validar el enlace. Pedi uno nuevo desde «Olvide mi contrasena».';
}

export function getGenericSupabaseErrorMessage(
  error: unknown,
  fallback = 'No se pudo completar la operacion. Intentalo nuevamente.'
): string {
  const msg = normalizeMessage(error);

  if (!msg) return fallback;

  if (msg.includes('network request failed') || msg.includes('failed to fetch')) {
    return 'No hay conexion con el servidor. Verifica internet e intentalo nuevamente.';
  }

  if (msg.includes('duplicate key value') || msg.includes('unique constraint')) {
    return 'Ya existe un registro con esos datos. Revisa e intentalo nuevamente.';
  }

  if (msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'No tienes permisos para realizar esta accion.';
  }

  // Códigos que levantan las RPCs de moderación (submit_content_report,
  // block_user) y los triggers de bloqueo. Se mapean acá y no en cada pantalla
  // porque son los mismos tres mensajes en las cinco superficies donde se puede
  // denunciar o bloquear. Sin esto el usuario ve el texto crudo de Postgres.
  if (msg.includes('user_blocked')) {
    return 'No podés interactuar con este usuario porque hay un bloqueo entre ustedes.';
  }

  if (msg.includes('entity_not_found')) {
    return 'Ese contenido ya no está disponible.';
  }

  if (msg.includes('invalid_target')) {
    return 'No podés hacer eso sobre tu propio contenido.';
  }

  if (msg.includes('invalid_reason')) {
    return 'Elegí un motivo para la denuncia.';
  }

  return fallback;
}
