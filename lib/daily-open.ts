import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDayKey } from '@/lib/active-days';
import { Logger } from '@/lib/logger';

/**
 * Una fila en `app_logs` la primera vez que cada cuenta abre la app en el día.
 *
 * Sirve para medir cuántos vuelven (los logs de antes solo salían en algunas
 * acciones) y para saber qué OTA corre cada celular: el 27/10 no había forma de
 * confirmar si un teléfono ya tenía el arreglo de los links `/i/`. Una fila por
 * cuenta y día no pesa en el disco (P2-13).
 *
 * La versión llega por parámetro y no se importa `expo-updates` acá, para que
 * el módulo se pueda testear en node.
 */

const STORAGE_KEY = 'tornear.dailyOpenLogged';

export interface RunningVersion {
  updateId: string | null;
  runtimeVersion: string | null;
  isEmbeddedLaunch: boolean;
}

/** Devuelve `true` si registró la apertura. Nunca tira. */
export async function logDailyOpen(
  authUserId: string,
  version: RunningVersion,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const day = localDayKey(now);
    const key = `${authUserId}:${day}`;
    if ((await AsyncStorage.getItem(STORAGE_KEY)) === key) return false;

    await AsyncStorage.setItem(STORAGE_KEY, key);
    Logger.info('Apertura del día', { event: 'app.daily_open', day, ...version });
    return true;
  } catch (error) {
    Logger.warn('No se pudo registrar la apertura del día', { scope: 'daily-open.logDailyOpen', error });
    return false;
  }
}
