import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

/**
 * Descarga la tarjeta 1080×1920 que renderiza el dashboard y la deja como
 * archivo local listo para compartir.
 *
 * Es la alternativa SERVIDOR a `captureViewToUri` (lib/share-image.ts), que
 * captura la `MatchShareCard` nativa con react-native-view-shot. Las dos
 * devuelven un `file://` y alimentan a los mismos consumidores
 * (`shareToInstagramStories` / `shareGeneric`), así que son intercambiables
 * en `ShareMatchButton`.
 *
 * Qué gana la vía servidor: no depende del módulo nativo de captura (el que
 * obliga a un rebuild del Dev Client y tira `NativeCaptureUnavailableError`
 * en binarios viejos), y la tarjeta se puede rediseñar deployando el
 * dashboard, sin pasar por las tiendas. Qué pierde: necesita red, y sólo
 * sirve para partidos FINALIZADO.
 *
 * ─── Autenticación ────────────────────────────────────────────────────────
 * El endpoint exige `Authorization: Bearer <jwt>` y corre las consultas con
 * el rol `authenticated` bajo RLS. No es público: sin token válido devuelve
 * 401. El token sale de la sesión de Supabase, que ya se refresca sola
 * (`autoRefreshToken: true` en lib/supabase.ts).
 */

/**
 * Base del dashboard.
 *
 * El default es producción. `EXPO_PUBLIC_SHARE_CARD_BASE_URL` existe para
 * poder apuntar al `next dev` de la máquina de desarrollo mientras el
 * endpoint todavía no está deployado — sin eso, probar la tarjeta desde el
 * teléfono exige un deploy por cada cambio.
 *
 * Para usarlo hay que poner la IP de LAN, no `localhost`: `localhost` en el
 * teléfono es el teléfono. Ejemplo en `.env.local` de la app:
 *
 *     EXPO_PUBLIC_SHARE_CARD_BASE_URL=http://192.168.0.12:3000
 *
 * En Android, un origen `http://` plano lo bloquea el `cleartextTraffic` del
 * manifest salvo en builds de desarrollo — es otra razón para que esto sea
 * sólo una herramienta de prueba y nunca el camino de producción.
 */
const SHARE_CARD_BASE_URL =
  process.env.EXPO_PUBLIC_SHARE_CARD_BASE_URL ?? 'https://tornear.vercel.app';

const SHARE_CARD_ENDPOINT = `${SHARE_CARD_BASE_URL}/api/og/share-match`;

/**
 * Traza de diagnóstico de la descarga, etiquetada `[ShareCard]`.
 *
 * `console.*` directo y no `Logger`: el Logger imprime en consola PERO además
 * persiste cada línea en `app_logs` (lib/logger.ts), y una traza paso a paso
 * de cada intento de compartir llenaría esa tabla de ruido operativo. Para
 * telemetría de verdad siguen estando los `Logger.warn`/`Logger.error` de más
 * abajo; esto es sólo para mirar la terminal de Metro.
 *
 * Guardado detrás de `__DEV__` a propósito: en un build de release estas
 * líneas no aportan nada (nadie mira esa consola) y sí imprimirían la URL
 * completa y el prefijo del token en los logs del dispositivo. En Expo Go y
 * en el Dev Client `__DEV__` es `true`, así que para probar en el celular
 * no hay que tocar nada.
 */
const debug = (...args: unknown[]) => {
  if (__DEV__) console.log('[ShareCard]', ...args);
};

/** Errores que la UI puede explicarle al usuario sin decir "error 409". */
export type ShareCardFailureReason =
  | 'unauthenticated'
  | 'not-shareable'
  | 'not-found'
  | 'network';

export class ShareCardError extends Error {
  readonly reason: ShareCardFailureReason;

  constructor(reason: ShareCardFailureReason, message: string) {
    super(message);
    this.name = 'ShareCardError';
    this.reason = reason;
  }
}

/**
 * Saca el status HTTP del mensaje de error de expo-file-system.
 *
 * `File.downloadFileAsync` RECHAZA en cualquier respuesta fuera de 2xx en vez
 * de guardar el cuerpo — verificado en el código nativo de las dos
 * plataformas (`FileSystemModule.swift` chequea `statusCode` 200..<300,
 * `FileSystemModule.kt` chequea `response.isSuccessful`). Eso es lo que
 * queremos: el endpoint devuelve una imagen de error con status 401/404/409,
 * y sin ese rechazo la app guardaría esa imagen y la compartiría como si
 * fuera la tarjeta.
 *
 * El costo es que el status sólo viaja dentro del texto del mensaje, y cada
 * plataforma lo escribe distinto ("response has status 409" en iOS,
 * "response has status: 409" en Android). El regex tolera las dos; si no
 * matchea, se trata como problema de red, que es el diagnóstico correcto
 * para un fallo sin respuesta HTTP.
 */
function httpStatusFrom(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = /status:?\s*(\d{3})/i.exec(error.message);
  return match ? Number(match[1]) : null;
}

/**
 * Descarga la tarjeta del partido y devuelve su URI local (`file://...`).
 *
 * El archivo va al directorio de CACHÉ y no al de documentos: es un artefacto
 * regenerable que sólo tiene que sobrevivir hasta que el usuario elija a
 * dónde compartirlo, y el sistema puede borrarlo cuando necesite espacio.
 */
export async function downloadShareCard(matchId: string): Promise<string> {
  const startedAt = Date.now();
  const requestUrl = `${SHARE_CARD_ENDPOINT}?match=${encodeURIComponent(matchId)}`;

  debug('─────────── inicio ───────────');
  debug('matchId:', matchId);
  debug('base URL:', SHARE_CARD_BASE_URL);
  // Cuál de los dos caminos está activo. Si acá dice `false` y estabas
  // esperando pegarle a tu máquina, el `.env.local` no se releyó: Expo lee
  // las `EXPO_PUBLIC_*` al arrancar el bundler, hay que reiniciarlo.
  debug('override EXPO_PUBLIC_SHARE_CARD_BASE_URL activo:', !!process.env.EXPO_PUBLIC_SHARE_CARD_BASE_URL);
  debug('URL completa:', requestUrl);

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token ?? null;

  debug('sesión — hay session:', !!data.session);
  debug('sesión — hay access_token:', !!accessToken);
  debug('sesión — error de getSession:', error ? error.message : 'ninguno');
  if (accessToken) {
    // Sólo el prefijo y el largo: alcanza para ver que es un JWT plausible
    // (`eyJ...`) sin dejar una credencial usable en la consola.
    debug('sesión — token:', `${accessToken.slice(0, 12)}… (${accessToken.length} chars)`);
    debug('sesión — expira:', data.session?.expires_at
      ? new Date(data.session.expires_at * 1000).toISOString()
      : 'desconocido');
  }

  if (error || !accessToken) {
    debug('ABORTA: sin token, no se intenta la descarga.');
    Logger.warn('No hay sesión para descargar la tarjeta compartible', {
      scope: 'share-card-remote.downloadShareCard',
      matchId,
      error,
    });
    throw new ShareCardError('unauthenticated', 'Necesitás iniciar sesión para compartir.');
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  // Se imprime el header ARMADO, no el token suelto: así se ve si el prefijo
  // "Bearer " y el espacio quedaron bien, que es el error clásico y el que el
  // servidor rechaza con 401 sin decir por qué.
  debug('headers — Authorization:', `${headers.Authorization.slice(0, 19)}…`);
  debug('headers — largo total del valor:', headers.Authorization.length);

  // Un subdirectorio propio para no mezclarse con lo que cachean otras
  // librerías, y `create({ idempotent: true })` porque a partir de la segunda
  // vez ya existe.
  const directory = new Directory(Paths.cache, 'share-cards');
  directory.create({ idempotent: true });

  /**
   * Nombre ÚNICO por descarga, y se borra lo anterior.
   *
   * Antes esto reusaba `match-<id>.png` para no llenar la caché, y funcionaba
   * mientras el archivo sólo se compartía. Ahora que además se dibuja con
   * `<Image source={{ uri }}>` en el preview, ese nombre fijo es un bug: el
   * caché de imágenes de React Native se indexa POR URI, así que si el
   * marcador cambia en el servidor y se vuelve a abrir el modal, el archivo
   * nuevo se escribe en la misma ruta y `<Image>` sigue mostrando el PNG
   * viejo desde memoria. Con un nombre distinto por descarga, esa colisión no
   * puede pasar.
   *
   * El barrido previo mantiene la cota: siempre queda un solo archivo, no uno
   * por toque. `try/catch` individual porque un archivo que no se puede
   * borrar (bloqueado por el visor de otra app, por ejemplo) no es motivo
   * para no entregar la tarjeta.
   */
  for (const stale of directory.list()) {
    try {
      stale.delete();
    } catch (cleanupError) {
      debug('no se pudo borrar un archivo viejo (se sigue igual):', cleanupError);
    }
  }

  const destination = new File(directory, `match-${matchId}-${Date.now()}.png`);
  debug('destino:', destination.uri);

  try {
    debug('descargando…');
    const downloaded = await File.downloadFileAsync(requestUrl, destination, {
      headers,
      // Sin esto, la segunda descarga tira porque el archivo ya existe.
      idempotent: true,
    });

    debug('OK — uri:', downloaded.uri);
    debug('OK — bytes:', downloaded.size);
    debug(`OK — tardó ${Date.now() - startedAt}ms`);

    // Un PNG de 1080×1920 nunca pesa 0. Si esto salta, la descarga "tuvo
    // éxito" con un cuerpo vacío — típico de un proxy o portal cautivo en el
    // medio, y conviene verlo acá y no cuando Instagram muestre un cuadro
    // negro.
    if (downloaded.size === 0) {
      debug('⚠️  el archivo bajó VACÍO (0 bytes).');
    }

    debug('─────────── fin ───────────');
    return downloaded.uri;
  } catch (downloadError) {
    const status = httpStatusFrom(downloadError);

    debug('FALLÓ la descarga.');
    debug('error — status detectado por el regex:', status ?? 'ninguno (no hubo respuesta HTTP)');
    debug('error — name:', downloadError instanceof Error ? downloadError.name : typeof downloadError);
    debug('error — message:', downloadError instanceof Error ? downloadError.message : String(downloadError));
    debug('error — crudo:', downloadError);
    debug(`error — tardó ${Date.now() - startedAt}ms`);
    if (status === null) {
      // Sin status no hubo respuesta: DNS, TLS, cleartext bloqueado en
      // Android, o el host simplemente no existe.
      debug('⚠️  sin status HTTP: el servidor no respondió. Probá abrir esta URL en el navegador del celular:');
      debug('   ', requestUrl);
    }
    debug('─────────── fin ───────────');

    Logger.error('No se pudo descargar la tarjeta compartible', {
      scope: 'share-card-remote.downloadShareCard',
      matchId,
      status,
      error: downloadError,
    });

    // 401 vencido: `getSession()` ya devolvió un token, así que si el server
    // igual lo rechaza es que venció entre medio. Reintentar suele alcanzar,
    // y el mensaje lo dice.
    if (status === 401) {
      throw new ShareCardError('unauthenticated', 'Tu sesión venció. Probá de nuevo.');
    }
    // 409: el partido existe pero todavía no se puede compartir (en disputa,
    // sin planilla, o con las dos planillas distintas).
    if (status === 409) {
      throw new ShareCardError(
        'not-shareable',
        'Este partido todavía no se puede compartir. Esperá a que el resultado esté confirmado.',
      );
    }
    if (status === 404 || status === 400) {
      throw new ShareCardError('not-found', 'No encontramos ese partido.');
    }

    throw new ShareCardError('network', 'No se pudo generar la imagen. Revisá tu conexión.');
  }
}

/**
 * Descarga la tarjeta y abre la hoja de compartir del sistema.
 *
 * Para el botón de Instagram Stories NO se usa esta función: ahí el destino
 * es `shareToInstagramStories(uri)` (lib/instagram-stories), que abre la
 * Story directamente en vez de la hoja genérica. El flujo correcto es
 * `downloadShareCard(matchId)` y después el destino que corresponda — esta
 * función es sólo el atajo para "Más opciones".
 */
export async function shareMatchCard(matchId: string): Promise<void> {
  const uri = await downloadShareCard(matchId);

  // Mismo chequeo que `shareGeneric`: en web y en algunos emuladores sin apps
  // de destino, `shareAsync` no existe. Se sale en silencio con un warn en vez
  // de tirar — el usuario ya tiene la imagen, no hay error que mostrarle.
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Logger.warn('Sharing no disponible en este dispositivo', {
      scope: 'share-card-remote.shareMatchCard',
      matchId,
    });
    return;
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Compartir resultado',
    // iOS lo usa para decidir a qué apps ofrecer el archivo; sin esto, algunas
    // no aparecen en la hoja aunque acepten imágenes.
    UTI: 'public.png',
  });
}
