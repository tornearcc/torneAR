import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Logger } from '@/lib/logger';

/**
 * Techo duro para el registro del token.
 *
 * Sin FCM inicializado en el build (falta `google-services.json` + el plugin
 * `expo-notifications` en app.json), `getExpoPushTokenAsync` no siempre
 * rechaza: hay casos donde la promesa se queda colgada para siempre. Como el
 * llamante la espera con `await`, eso deja el registro pendiente de por vida.
 * Con el race, el peor caso es "sin token" y no "app esperando".
 */
const PUSH_TOKEN_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} superó los ${ms}ms`)), ms),
    ),
  ]);
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // En SDK 53+, expo-notifications crashea si se inicializa dentro de Expo Go en Android.
  // Bypass automático si el usuario está probando en Expo Go:
  if (Constants.appOwnership === 'expo') {
    return null;
  }

  try {
    // Importación dinámica para evitar que tire la excepción en la carga global del archivo
    const Notifications = await import('expo-notifications');

    let token = null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#53E076',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        // No es un error: el usuario dijo que no. Pero explica por qué ese
        // dispositivo nunca recibe un push, que es la consulta típica de soporte.
        Logger.info('Permiso de notificaciones denegado', {
          scope: 'push-notifications.register',
          platform: Platform.OS,
          previousStatus: existingStatus,
        });
        return null;
      }

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

      token = (
        await withTimeout(
          Notifications.getExpoPushTokenAsync({ projectId: projectId }),
          PUSH_TOKEN_TIMEOUT_MS,
          'getExpoPushTokenAsync',
        )
      ).data;

      return token;
    } else {
      return null;
    }
  } catch (error) {
    // `warn`, no `error`: quedarse sin push token degrada una funcionalidad
    // secundaria, no rompe la app.
    //
    // Con FCM ya configurado (plugin `expo-notifications` + `googleServicesFile`,
    // este último resuelto en app.config.js), llegar acá dejó de ser el caso
    // normal y pasó a ser puntual: emulador sin Google Play Services, build sin
    // el google-services.json materializado, o un fallo de red contra el
    // servicio de tokens de Expo. Si se repite en dispositivos reales de
    // producción, ahí sí hay algo que investigar.
    Logger.warn('No se pudo inicializar el registro de push notifications', {
      scope: 'push-notifications.register',
      platform: Platform.OS,
      isDevice: Device.isDevice,
      error,
    });
    return null;
  }
}
