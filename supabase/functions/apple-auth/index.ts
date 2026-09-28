import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// apple-auth — canje y revocación de tokens de Sign in with Apple
// ------------------------------------------------------------
// Apple exige que una app que ofrece Sign in with Apple y eliminación de cuenta
// revoque los tokens al dar de baja (guideline 5.1.1(v)). Esta función es las
// dos mitades de eso:
//
//   · action 'link'   — canjea el `authorizationCode` del login por un
//                       refresh_token y lo guarda en public.apple_credentials.
//                       Se llama en CADA login con Apple: el código vive 5
//                       minutos y no existe al momento de pedir la baja.
//   · action 'revoke' — revoca ese refresh_token contra Apple y borra la fila.
//                       Se llama justo antes de delete_own_account().
//
// ── Por qué una sola función y no dos ───────────────────────────────────────
// Las dos necesitan exactamente los mismos secretos y el mismo client_secret
// firmado. Partirla en dos duplicaría la firma ES256 —la parte delicada— en dos
// deploys que pueden desincronizarse.
//
// ── Auth ────────────────────────────────────────────────────────────────────
// A diferencia de push-dispatch, acá el llamador SÍ es un cliente autenticado,
// así que se deja `verify_jwt` en su valor por defecto (true) y además se
// resuelve el usuario del JWT adentro. El usuario sobre el que se opera sale
// SIEMPRE del token, nunca del body: si viniera por parámetro, cualquiera
// podría revocarle la credencial a otro.
//
// ── Secretos (Supabase → Edge Functions → Secrets) ──────────────────────────
//   APPLE_TEAM_ID     — 10 caracteres, Membership del portal de Apple.
//   APPLE_KEY_ID      — 10 caracteres, de la Key de tipo Sign in with Apple.
//   APPLE_PRIVATE_KEY — contenido del .p8 completo, con las líneas BEGIN/END.
//   APPLE_CLIENT_ID   — el bundle ID. Para un login NATIVO el client_id es el
//                       bundle, no el Services ID: el token se emitió para la
//                       app. Mandar el Services ID acá devuelve invalid_client.
// ============================================================

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';

/** Apple rechaza client secrets con más de 6 meses de vigencia. 1 hora sobra. */
const CLIENT_SECRET_TTL_SECONDS = 3600;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceKey);

function requireSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta el secreto ${name}`);
  return value;
}

/** base64url sin padding, que es lo que pide JWS. */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * Importa la clave privada del .p8.
 *
 * El archivo es PEM con una clave EC P-256 en PKCS#8. Se le sacan las líneas
 * BEGIN/END y todo el whitespace —incluidos los `\n` literales que quedan
 * cuando el .p8 se pega en un campo de secreto de una sola línea— y lo que
 * queda es base64 del DER.
 */
async function importApplePrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');

  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * Arma el client_secret que Apple pide: un JWT ES256 firmado con el .p8.
 *
 * `crypto.subtle.sign` con ECDSA devuelve la firma cruda r||s de 64 bytes, que
 * es exactamente el formato que espera JWS. Si se usara una librería que
 * devuelve DER habría que convertirla; acá no.
 */
async function buildClientSecret(): Promise<string> {
  const teamId = requireSecret('APPLE_TEAM_ID');
  const keyId = requireSecret('APPLE_KEY_ID');
  const clientId = requireSecret('APPLE_CLIENT_ID');
  const key = await importApplePrivateKey(requireSecret('APPLE_PRIVATE_KEY'));

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUDIENCE,
    sub: clientId,
  };

  const signingInput = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/** Deja rastro en `public.app_logs`, la misma tabla que mira el dashboard. */
async function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  details: Record<string, unknown>,
) {
  console[level === 'info' ? 'log' : level](message, details);
  await admin.from('app_logs').insert({ level, message, details });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Canjea el authorizationCode por un refresh_token y lo guarda.
 *
 * Un fallo acá NO es fatal para el login: el usuario ya tiene sesión cuando el
 * cliente llama a esto. Devuelve 200 con `linked: false` para que el cliente
 * pueda seguir sin tratarlo como error, y queda el rastro en app_logs.
 */
async function handleLink(authUserId: string, authorizationCode: string): Promise<Response> {
  const body = new URLSearchParams({
    client_id: requireSecret('APPLE_CLIENT_ID'),
    client_secret: await buildClientSecret(),
    code: authorizationCode,
    grant_type: 'authorization_code',
  });

  const response = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.refresh_token) {
    await log('warn', 'No se pudo canjear el authorizationCode de Apple', {
      scope: 'apple-auth.link',
      auth_user_id: authUserId,
      status: response.status,
      apple_error: payload.error ?? null,
    });
    return json({ linked: false, reason: payload.error ?? 'exchange_failed' });
  }

  const { error } = await admin
    .from('apple_credentials')
    .upsert(
      {
        auth_user_id: authUserId,
        refresh_token: payload.refresh_token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'auth_user_id' },
    );

  if (error) {
    await log('error', 'No se pudo guardar el refresh token de Apple', {
      scope: 'apple-auth.link',
      auth_user_id: authUserId,
      reason: error.message,
    });
    return json({ linked: false, reason: 'storage_failed' });
  }

  return json({ linked: true });
}

/**
 * Revoca el refresh_token contra Apple y borra la fila.
 *
 * Nunca devuelve error al cliente: quien llama a esto está por eliminar su
 * cuenta, y abortar una baja porque el endpoint de Apple no respondió sería
 * mucho peor que no haber revocado. El resultado viaja en el cuerpo para que
 * quede registrado, y el fallo queda en app_logs para reintentar a mano.
 *
 * La fila local se borra sólo si Apple confirmó la revocación. Si Apple falló,
 * conservarla deja el token disponible para un reintento; y si el usuario
 * completa igual la baja, `delete_own_account()` la borra de todos modos.
 */
async function handleRevoke(authUserId: string): Promise<Response> {
  const { data, error } = await admin
    .from('apple_credentials')
    .select('refresh_token')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    await log('error', 'No se pudo leer la credencial de Apple para revocar', {
      scope: 'apple-auth.revoke',
      auth_user_id: authUserId,
      reason: error.message,
    });
    return json({ revoked: false, reason: 'lookup_failed' });
  }

  // Caso normal para las cuentas de Google y de email: no hay nada que revocar.
  if (!data) {
    return json({ revoked: false, reason: 'no_apple_credential' });
  }

  const body = new URLSearchParams({
    client_id: requireSecret('APPLE_CLIENT_ID'),
    client_secret: await buildClientSecret(),
    token: data.refresh_token,
    token_type_hint: 'refresh_token',
  });

  const response = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  // Apple responde 200 con cuerpo vacío cuando revoca bien.
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    await log('error', 'Apple rechazó la revocación del token', {
      scope: 'apple-auth.revoke',
      auth_user_id: authUserId,
      status: response.status,
      detail: detail.slice(0, 500),
    });
    return json({ revoked: false, reason: 'apple_rejected' });
  }

  await admin.from('apple_credentials').delete().eq('auth_user_id', authUserId);

  await log('info', 'Token de Apple revocado', {
    scope: 'apple-auth.revoke',
    auth_user_id: authUserId,
  });

  return json({ revoked: true });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // El usuario sale del JWT, nunca del body. `verify_jwt` del gateway ya
  // rechaza las llamadas sin token; esto además resuelve DE QUIÉN es.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: 'unauthorized' }, 401);
  }
  const authUserId = userData.user.id;

  let payload: { action?: string; authorizationCode?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  try {
    if (payload.action === 'link') {
      if (!payload.authorizationCode) {
        return json({ error: 'missing_authorization_code' }, 400);
      }
      return await handleLink(authUserId, payload.authorizationCode);
    }

    if (payload.action === 'revoke') {
      return await handleRevoke(authUserId);
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (unexpected) {
    // Cae acá sobre todo si falta un secreto o el .p8 está mal pegado: sin esto
    // el gateway devolvería un 500 opaco y el síntoma sería "el login de Apple
    // anda pero la revocación no", sin nada en los logs.
    await log('error', 'Excepción en apple-auth', {
      scope: 'apple-auth',
      auth_user_id: authUserId,
      action: payload.action ?? null,
      reason: unexpected instanceof Error ? unexpected.message : String(unexpected),
    });
    return json({ error: 'internal_error' }, 500);
  }
});
