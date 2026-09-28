import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// push-dispatch — Edge Function genérica de entrega push (G1)
// ------------------------------------------------------------
// Única función de push del sistema. Se dispara por un trigger AFTER INSERT
// sobre public.notifications (vía pg_net), recibe la fila insertada y entrega
// el push a Expo. Es AGNÓSTICA del evento: cualquier notificación (desafío,
// partido, disputa, recordatorio 24h, etc.) se empuja con solo insertar la fila.
//
// Auth: se despliega con verify_jwt=false y valida un secreto compartido
// (header x-push-secret) contra supabase_vault mediante la RPC
// verify_push_webhook_secret (SECURITY DEFINER). Un tercero sin el secreto
// recibe 401 aunque conozca la URL.
//
// Idempotencia: setea notifications.pushed_at al intentar el envío y saltea si
// ya estaba seteada, evitando doble-push ante reintentos de pg_net.
// ============================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceKey);

interface NotificationRow {
  id: string;
  profile_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  pushed_at: string | null;
}

interface ExpoTicket {
  status: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Deja rastro en `public.app_logs` (la misma tabla que usa el cliente vía
 * `lib/logger.ts`, así aparece en el panel del dashboard).
 *
 * `console` solo no alcanza: los logs de Edge Functions rotan y no son
 * consultables desde el panel, que es donde se mira cuando un usuario reporta
 * que no le llegan las notificaciones.
 */
async function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  details: Record<string, unknown>,
) {
  console[level === 'info' ? 'log' : level](message, details);
  await supabase.from('app_logs').insert({ level, message, details });
}

Deno.serve(async (req) => {
  // 1. Autenticación por secreto compartido (validado contra vault).
  const candidate = req.headers.get('x-push-secret') ?? '';
  const { data: authorized, error: authErr } = await supabase.rpc(
    'verify_push_webhook_secret',
    { p_candidate: candidate },
  );
  if (authErr || authorized !== true) {
    return new Response('unauthorized', { status: 401 });
  }

  // 2. Payload: shape de webhook de Supabase ({ record }) o la fila directa.
  const payload = await req.json();
  const notif: NotificationRow = payload.record ?? payload;
  if (!notif?.id || !notif?.profile_id) {
    return new Response('no record', { status: 200 });
  }

  // 3. Idempotencia: si ya se empujó, no repetir.
  if (notif.pushed_at) {
    return new Response('already pushed', { status: 200 });
  }

  // 4. Marcar pushed_at ANTES de enviar (best-effort; el canal confiable es la
  //    campana in-app). Evita que un reintento re-empuje la misma notificación.
  await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', notif.id);

  // 5. Token del destinatario.
  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', notif.profile_id)
    .single();

  const token = profile?.expo_push_token ?? null;
  if (!token) {
    return new Response('ok (no token)', { status: 200 });
  }

  // 6. Envío a Expo.
  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title: notif.title,
      body: notif.body ?? '',
      data: { ...(notif.data ?? {}), notification_id: notif.id, type: notif.type },
    }),
  });

  if (!expoResponse.ok) {
    await log('error', 'push-dispatch: el endpoint de Expo respondió con error HTTP', {
      scope: 'push-dispatch',
      notificationId: notif.id,
      httpStatus: expoResponse.status,
    });
    return new Response('ok (push failed)', { status: 200 });
  }

  // 7. Lectura del ticket.
  //
  // ⚠️ Expo responde 200 con el fallo ADENTRO del cuerpo: un token inválido,
  // credenciales de APNs sin cargar o un payload mal formado llegan como
  // `{ data: { status: 'error', details: { error: '…' } } }`. Antes sólo se
  // miraba `DeviceNotRegistered` y todo lo demás se descartaba en silencio:
  // desde afuera, un push rechazado por Expo se veía idéntico a uno entregado,
  // y `notifications.pushed_at` —que se sella ANTES de enviar— reforzaba la
  // ilusión de que había salido.
  const expoResult = await expoResponse.json();
  const ticket = expoResult?.data as ExpoTicket | undefined;

  // Errores de nivel request (payload rechazado entero), fuera del ticket.
  if (Array.isArray(expoResult?.errors) && expoResult.errors.length > 0) {
    await log('error', 'push-dispatch: Expo rechazó la request', {
      scope: 'push-dispatch',
      notificationId: notif.id,
      profileId: notif.profile_id,
      errors: expoResult.errors,
    });
    return new Response('ok (rejected)', { status: 200 });
  }

  if (ticket?.status === 'error') {
    const reason = ticket.details?.error ?? 'UNKNOWN';

    // `DeviceNotRegistered` es el único que se limpia solo: el token murió
    // (app desinstalada, permiso revocado) y guardarlo sólo genera reintentos.
    if (reason === 'DeviceNotRegistered') {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('id', notif.profile_id);
    }

    await log('error', 'push-dispatch: Expo rechazó el envío', {
      scope: 'push-dispatch',
      notificationId: notif.id,
      profileId: notif.profile_id,
      reason,
      expoMessage: ticket.message ?? null,
      tokenCleared: reason === 'DeviceNotRegistered',
    });
    return new Response('ok (ticket error)', { status: 200 });
  }

  // 8. Ticket aceptado. El id queda en el log porque es lo ÚNICO con lo que
  // después se puede consultar el receipt de Expo (/push/getReceipts): el
  // ticket sólo dice "lo recibí", el receipt dice si APNs/FCM lo entregó de
  // verdad. Consultarlos automáticamente (a los ~15 min) es el paso siguiente
  // y necesita una columna donde persistirlos.
  await log('info', 'push-dispatch: entregado a Expo', {
    scope: 'push-dispatch',
    notificationId: notif.id,
    profileId: notif.profile_id,
    ticketId: ticket?.id ?? null,
  });

  return new Response('ok', { status: 200 });
});
