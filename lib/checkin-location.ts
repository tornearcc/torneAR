import * as Location from 'expo-location';
import { Logger } from '@/lib/logger';

/**
 * Captura de ubicación para el check-in.
 *
 * Vivía duplicada en app/match-checkin.tsx y app/match-detail.tsx, con tres
 * problemas en ambas copias:
 *
 *   1. Sin timeout. `getCurrentPositionAsync` bajo techo puede no resolver
 *      nunca: el botón quedaba en "Presentando lista…" para siempre, sin salida
 *      ni forma de reintentar.
 *   2. Sin control de precisión. Un fix con ±500 m de error entraba igual que
 *      uno de ±5 m. Con el radio de entonces (150 m; hoy 500 m), eso volvía el geofence decorativo.
 *   3. Sin mirar `mocked`. Android expone si la posición viene de una app de
 *      ubicación simulada y el dato se descartaba.
 */

/** Precisión mínima aceptable, en metros. Por encima, el fix no sirve para el radio de 500 m (app_settings.checkin_geofence_radius_m). */
const MAX_ACCURACY_M = 100;

/** Corte duro de espera del GPS. */
const LOCATION_TIMEOUT_MS = 15_000;

export type CheckinLocationResult =
  | { ok: true; coords: { lat: number; lng: number }; mocked: boolean }
  | { ok: false; reason: 'PERMISSION_DENIED' | 'TIMEOUT' | 'INACCURATE' | 'UNAVAILABLE'; message: string };

const MESSAGES: Record<Exclude<CheckinLocationResult & { ok: false }, { ok: true }>['reason'], string> = {
  PERMISSION_DENIED:
    'Necesitamos tu ubicación para verificar que estás en la cancha. Habilitá el permiso e intentá de nuevo.',
  TIMEOUT:
    'No pudimos obtener tu ubicación. Salí al aire libre unos segundos y volvé a intentar.',
  INACCURATE:
    'La señal de GPS es demasiado imprecisa para validar el check-in. Esperá unos segundos al aire libre y reintentá.',
  UNAVAILABLE:
    'No pudimos acceder al GPS del dispositivo. Verificá que la ubicación esté activada.',
};

/** Rechaza la promesa si el GPS no responde a tiempo, en vez de colgar la UI. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), ms),
    ),
  ]);
}

/**
 * Pide permiso y devuelve una posición utilizable para el geofence.
 *
 * Nunca lanza: los fallos vuelven como `{ ok: false, reason, message }` para que
 * la pantalla decida si bloquear o reintentar.
 */
export async function getCheckinLocation(): Promise<CheckinLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Logger.warn('Permiso de ubicación denegado en el check-in', {
        scope: 'getCheckinLocation',
        status,
      });
      return { ok: false, reason: 'PERMISSION_DENIED', message: MESSAGES.PERMISSION_DENIED };
    }

    Logger.info('Permiso de ubicación otorgado para el check-in', {
      scope: 'getCheckinLocation',
    });

    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      LOCATION_TIMEOUT_MS,
    );

    // `accuracy` es el radio de confianza en metros. Si es null lo dejamos
    // pasar: iOS no siempre lo informa y bloquear por un dato ausente dejaría
    // sin check-in a usuarios legítimos.
    const accuracy = position.coords.accuracy;
    if (accuracy !== null && accuracy > MAX_ACCURACY_M) {
      Logger.warn('Fix de GPS descartado por imprecisión', {
        scope: 'getCheckinLocation',
        accuracy,
        maxAccuracy: MAX_ACCURACY_M,
      });
      return { ok: false, reason: 'INACCURATE', message: MESSAGES.INACCURATE };
    }

    if (position.mocked === true) {
      Logger.warn('Ubicación reportada como simulada en el check-in', {
        scope: 'getCheckinLocation',
      });
    }

    return {
      ok: true,
      coords: { lat: position.coords.latitude, lng: position.coords.longitude },
      // Sólo se reporta, no bloquea: los emuladores dan `mocked: true` y
      // cortar por ahí rompería el desarrollo y el QA en dispositivos virtuales.
      // La decisión de qué hacer con el dato es del servidor.
      mocked: position.mocked ?? false,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'LOCATION_TIMEOUT') {
      Logger.warn('El GPS no respondió dentro del timeout del check-in', {
        scope: 'getCheckinLocation',
        timeoutMs: LOCATION_TIMEOUT_MS,
      });
      return { ok: false, reason: 'TIMEOUT', message: MESSAGES.TIMEOUT };
    }
    Logger.error('No se pudo obtener la ubicación para el check-in', {
      scope: 'getCheckinLocation',
      error,
    });
    return { ok: false, reason: 'UNAVAILABLE', message: MESSAGES.UNAVAILABLE };
  }
}
