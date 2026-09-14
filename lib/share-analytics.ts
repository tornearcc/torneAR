import { Logger } from '@/lib/logger';

/**
 * Instrumentación de compartir (Fase 6.2).
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * No podemos medir vistas de una Story de Instagram: una vez que la imagen sale
 * de la app, Meta no nos devuelve absolutamente nada — ni impresiones, ni
 * clicks, ni si la Story se llegó a publicar. Ni `expo-sharing` ni el
 * `shareToInstagramStories` nativo resuelven con un "el usuario posteó": en
 * Android el intent se considera entregado apenas se abre la app destino.
 *
 * Lo único observable de nuestro lado es la INTENCIÓN: el usuario tocó el botón
 * y arrancó el flujo. Es una métrica de embudo (cuántas tarjetas generadas
 * terminan en un intento de compartir, y hacia dónde), no de alcance. Nombrarla
 * bien importa: si mañana alguien lee "share.instagram" como "shares
 * publicados", el número miente por arriba.
 *
 * ── Tres superficies ─────────────────────────────────────────────────────────
 *   · `match`       — tarjeta de resultado (`ShareMatchButton`). Se registra
 *                     ANTES de abrir el share: ni `expo-sharing` ni
 *                     `react-native-share` devuelven el destino, así que
 *                     esperar no aporta nada.
 *   · `referral`    — link de invitación del perfil (`ProfileInviteCard`).
 *   · `team_invite` — código de invitación del equipo (`team-manage`).
 * Las dos últimas usan `Share.share` de React Native, que en iOS SÍ devuelve
 * el destino real al cerrarse la hoja (ver `shareActivityType`). Por eso ahí
 * el evento se registra DESPUÉS, una sola vez por toque: registrar antes y
 * después costaría dos filas del mismo presupuesto por cada intención.
 *
 * ── Por qué pasa por Logger y no por un INSERT propio ────────────────────────
 * `lib/logger.ts` ya resuelve las cuatro cosas que este evento necesita y que
 * un `supabase.from('app_logs').insert(...)` suelto tendría que repetir:
 *   · el `user_id` de AUTH (el FK de app_logs apunta a `auth.users`, no a
 *     `profiles` — ver el comentario de "Sesion cacheada" en logger.ts), ya
 *     cacheado en memoria y sin un `await getSession()` en el camino caliente;
 *   · fire-and-forget real: devuelve `void`, así que es imposible bloquear el
 *     tap del usuario esperando el INSERT;
 *   · el catch que impide que un fallo de telemetría se propague a la UI;
 *   · el rate limit y el truncado de payload.
 *
 * ⚠️ Ese rate limit (30 logs/minuto) es COMPARTIDO con la telemetría de
 * errores. Es aceptable acá porque estos eventos los dispara un tap humano
 * sobre un modal —techo real de un puñado por minuto—, pero es el motivo por
 * el que este módulo no debe crecer hacia analytics de alta frecuencia
 * (scrolls, impresiones, navegación). Eso necesitaría su propio canal, no
 * comerse el presupuesto de los errores.
 */

/** Destinos instrumentados. Espeja `ShareTarget` de `ShareMatchButton` a
 *  propósito: si mañana se suma un tercer botón, el tipo de acá tiene que
 *  fallar la compilación hasta que se decida cómo se llama su evento. */
export type ShareAnalyticsTarget = 'instagram' | 'generic';

/**
 * Qué se compartió. Viaja en `details->>'content_type'` y es la dimensión por
 * la que agrupa `dashboard_share_summary`: un literal nuevo acá tiene que
 * existir también en esa RPC, o el panel lo cuenta como desconocido.
 */
export type ShareContentType = 'match' | 'team_invite' | 'referral';

/**
 * `message` de `app_logs` para cada destino.
 *
 * Constantes con prefijo `share.` y no un template string armado al vuelo:
 * el panel de /dashboard/health agrupa por `message` exacto, así que estos
 * literales SON el identificador del evento. Un typo en un template no rompe
 * nada visible, sólo parte la serie en dos.
 */
const SHARE_EVENT_MESSAGE: Record<ShareAnalyticsTarget, string> = {
  instagram: 'share.instagram',
  generic: 'share.generic',
};

export interface ShareIntentPayload {
  target: ShareAnalyticsTarget;
  contentType: ShareContentType;
  /** `profiles.id` del usuario que comparte. Va en `details` y NO en la
   *  columna `user_id`: esa columna es un FK a `auth.users` y la llena el
   *  Logger sola. Guardar acá el id de perfil es lo que permite cruzar el
   *  evento contra `profiles` sin pasar por `auth`. */
  profileId: string | null;
  /** Sólo en `match`. */
  matchId?: string;
  /** Equipo desde cuya perspectiva se comparte (`match`) o al que se invita
   *  (`team_invite`). Sin esto no se puede saber si los que comparten son
   *  mayoritariamente los que ganaron. */
  teamId?: string;
  /** Destino real reportado por iOS (`net.whatsapp.WhatsApp.ShareExtension`,
   *  `com.apple.UIKit.activity.CopyToPasteboard`, …). Ausente en Android,
   *  cuando se cancela la hoja, y en las superficies que no usan
   *  `Share.share`. Nunca se completa con un valor inventado. */
  activityType?: string;
}

/**
 * Arma el `details` del evento. Separado de `trackShareIntent` para poder
 * fijar el contrato en un test sin pasar por el Logger.
 *
 * Las claves opcionales se OMITEN en vez de mandarse en `null`: así
 * `details ? 'activity_type'` en SQL distingue "no vino" sin tener que
 * interpretar un null, y las filas de `match` quedan iguales a las de antes
 * salvo por `content_type`.
 */
export function buildShareEventDetails(payload: ShareIntentPayload): Record<string, unknown> {
  const event = SHARE_EVENT_MESSAGE[payload.target];
  return {
    scope: 'share-analytics.trackShareIntent',
    // Redundante con `message`, y a propósito: deja el evento filtrable desde
    // `details->>'event'` sin depender de un LIKE sobre el texto del mensaje.
    event,
    target: payload.target,
    content_type: payload.contentType,
    profileId: payload.profileId,
    ...(payload.matchId ? { matchId: payload.matchId } : {}),
    ...(payload.teamId ? { teamId: payload.teamId } : {}),
    ...(payload.activityType ? { activity_type: payload.activityType } : {}),
  };
}

/**
 * Registra un intento de compartir.
 *
 * Devuelve `void`, igual que todo `Logger`: es imposible `await`-earlo por
 * accidente y frenar el tap.
 */
export function trackShareIntent(payload: ShareIntentPayload): void {
  Logger.info(SHARE_EVENT_MESSAGE[payload.target], buildShareEventDetails(payload));
}

/**
 * Destino real de un `Share.share` de React Native, si lo hay.
 *
 * · iOS: resuelve `sharedAction` con `activityType` cuando el usuario eligió
 *   un destino, y `dismissedAction` sin destino cuando cerró la hoja.
 * · Android: resuelve SIEMPRE `sharedAction` y SIEMPRE sin `activityType`,
 *   haya compartido o no — por eso ahí esto devuelve `undefined` y no se
 *   inventa un "android" que parecería un destino.
 *
 * Tipo estructural y no `ShareAction` de react-native: así este módulo sigue
 * sin importar react-native y su test corre en Node puro.
 */
export function shareActivityType(
  result: { action: string; activityType?: string | null } | null | undefined,
): string | undefined {
  if (!result || result.action !== 'sharedAction') return undefined;
  const value = result.activityType?.trim();
  return value ? value : undefined;
}
