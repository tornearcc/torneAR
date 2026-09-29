import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from '@/lib/logger';

/**
 * Días distintos en que se usó la app en este dispositivo (D-63).
 *
 * Alimenta el pedido de valoración «usuario frecuente» (`engaged_return`): a
 * partir del 5.º día distinto se puede pedir al volver a Inicio. Se guarda en
 * el dispositivo y no en la base porque es sólo una señal para decidir cuándo
 * preguntar; los filtros que importan (edad de la cuenta, uno por versión,
 * señales negativas) los aplica `claim_review_prompt` en el servidor.
 */

const STORAGE_KEY = 'tornear.activeDays';
/** Alcanza con recordar los últimos días: el umbral es chico. */
const MAX_REMEMBERED_DAYS = 30;
export const ENGAGED_DAYS_THRESHOLD = 5;

/** Fecha local del dispositivo como `YYYY-MM-DD`. */
export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Suma el día a la lista sin repetir y se queda con los más recientes. */
export function addActiveDay(days: readonly string[], today: string): string[] {
  const unique = Array.from(new Set([...days, today])).sort();
  return unique.slice(-MAX_REMEMBERED_DAYS);
}

function parseDays(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Registra el día de hoy y devuelve cuántos días distintos lleva. Nunca tira:
 * si el almacenamiento falla, devuelve 0 y el pedido simplemente no se hace.
 */
export async function recordActiveDay(now: Date = new Date()): Promise<number> {
  try {
    const days = addActiveDay(parseDays(await AsyncStorage.getItem(STORAGE_KEY)), localDayKey(now));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(days));
    return days.length;
  } catch (error) {
    Logger.warn('No se pudieron registrar los días de uso', { scope: 'active-days.recordActiveDay', error });
    return 0;
  }
}
