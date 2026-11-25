import { Platform } from 'react-native';
import type { ErrorUtils as RNErrorUtils } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/supabase';
import { describeEmptyErrorObject, getRecentHttpFailure } from '@/lib/http-failures';

/**
 * Telemetria de cliente.
 *
 * Escribe en `public.app_logs` (migracion 20260728200000_app_logs_telemetry).
 * Tres reglas de diseno que conviene no romper:
 *
 *  1. **Nunca bloquea ni tira.** Todos los metodos son "fire and forget":
 *     devuelven `void`, no `Promise`, para que sea imposible `await`-earlos por
 *     accidente en un camino caliente. Si el INSERT falla, muere en un catch.
 *
 *  2. **Nunca se auto-alimenta.** El fallo del propio INSERT se ataja adentro
 *     de `writeLog` y solo va a consola: si un Supabase caido se logueara a si
 *     mismo, cada error generaria otro error en un bucle.
 *
 *  3. **Nunca inunda.** El handler global puede dispararse en loop (un render
 *     que revienta en cada frame). `RATE_LIMIT_MAX` corta la hemorragia y deja
 *     constancia de cuantos logs se descartaron.
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** Data extra libre: stacktrace, ids, respuesta de la RPC, lo que sirva. */
export type LogDetails = Record<string, unknown>;

/** Techo de inserts por ventana; lo que sobra se descarta (contandolo). */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Corte defensivo: un stacktrace gigante no justifica un INSERT gigante. */
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_DETAILS_LENGTH = 8_000;

// ─── Sesion cacheada ────────────────────────────────────────────────────────
// El FK de app_logs.user_id apunta a auth.users, asi que lo que necesitamos es
// el id de auth (no el de profiles). Se mantiene en memoria y no se lee con
// `getSession()` en cada log: eso agregaria un await —y un posible refresh de
// token— dentro de un camino que existe justamente para no molestar.
let currentAuthUserId: string | null = null;

// ─── Estado interno ─────────────────────────────────────────────────────────
let rateWindowStartedAt = 0;
let logsInWindow = 0;
// Sobrevive al reinicio de la ventana a proposito: se limpia recien cuando un
// log logra salir, para que el que sale cuente cuantos se comio el rate limit.
let droppedSinceLastWrite = 0;
let teardown: (() => void) | null = null;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}… [truncado]` : value;
}

/**
 * Vuelve `details` serializable a jsonb.
 *
 * `Error` no sobrevive a `JSON.stringify` (serializa como `{}`), y es
 * exactamente lo que mas queremos guardar, asi que se desarma a mano antes.
 * Si el resultado no se puede serializar (ciclos, funciones) o se pasa de
 * `MAX_DETAILS_LENGTH`, se degrada a un objeto chico en vez de perder el log.
 */
function toJsonDetails(details: LogDetails | undefined): Json | null {
  if (!details) return null;

  let serialized: string | undefined;

  try {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
      if (value instanceof Error) {
        normalized[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack ?? null,
        };
      } else if (typeof value === 'function' || typeof value === 'undefined') {
        normalized[key] = String(value);
      } else {
        normalized[key] = describeEmptyErrorObject(value);
      }
    }

    serialized = JSON.stringify(normalized);
  } catch {
    return { unserializable: true };
  }

  if (serialized === undefined) return null;

  // Truncar el JSON lo dejaria sintacticamente roto, asi que en vez de cortarlo
  // se guarda el texto recortado como un unico campo.
  if (serialized.length > MAX_DETAILS_LENGTH) {
    return { truncated: true, preview: truncate(serialized, MAX_DETAILS_LENGTH) };
  }

  return JSON.parse(serialized) as Json;
}

/** `true` si todavia hay cupo en la ventana actual. */
function allowedByRateLimit(): boolean {
  const now = Date.now();

  if (now - rateWindowStartedAt > RATE_LIMIT_WINDOW_MS) {
    rateWindowStartedAt = now;
    logsInWindow = 0;
  }

  if (logsInWindow >= RATE_LIMIT_MAX) {
    droppedSinceLastWrite += 1;
    return false;
  }

  logsInWindow += 1;
  return true;
}

function consoleMirror(level: LogLevel, message: string, details?: LogDetails): void {
  if (!__DEV__) return;
  const line = `[Logger:${level}] ${message}`;
  if (level === 'error') console.error(line, details ?? '');
  else if (level === 'warn') console.warn(line, details ?? '');
  else console.log(line, details ?? '');
}

async function writeLog(level: LogLevel, message: string, details: Json | null): Promise<void> {
  try {
    const { error } = await supabase.from('app_logs').insert({
      level,
      message: truncate(message, MAX_MESSAGE_LENGTH),
      details,
      user_id: currentAuthUserId,
    });

    if (error && __DEV__) {
      console.warn('[Logger] no se pudo persistir el log', error.message);
    }
  } catch (e) {
    // Punto final del logger: aca se corta, sin re-loguear (ver regla 2).
    if (__DEV__) console.warn('[Logger] excepcion al persistir el log', e);
  }
}

function emit(level: LogLevel, message: string, details?: LogDetails): void {
  consoleMirror(level, message, details);

  if (!allowedByRateLimit()) return;

  // En los errores, el último pedido a Supabase que falló (si fue hace poco):
  // status y path, que el error en sí a veces no trae.
  const lastHttpFailure = level === 'error' ? getRecentHttpFailure() : null;

  const payload = toJsonDetails({
    platform: Platform.OS,
    ...(details ?? {}),
    ...(lastHttpFailure ? { lastHttpFailure } : {}),
    ...(droppedSinceLastWrite > 0 ? { droppedByRateLimit: droppedSinceLastWrite } : {}),
  });
  droppedSinceLastWrite = 0;

  void writeLog(level, message, payload);
}

export const Logger = {
  info(message: string, details?: LogDetails): void {
    emit('info', message, details);
  },
  warn(message: string, details?: LogDetails): void {
    emit('warn', message, details);
  },
  error(message: string, details?: LogDetails): void {
    emit('error', message, details);
  },
};

// ─── Handlers globales ──────────────────────────────────────────────────────

type PromiseRejectionTrackerOptions = {
  allRejections?: boolean;
  onUnhandled?: (id: number, error: unknown) => void;
  onHandled?: (id: number) => void;
};

type GlobalWithErrorHooks = typeof globalThis & {
  ErrorUtils?: RNErrorUtils;
  HermesInternal?: {
    enablePromiseRejectionTracker?: (options: PromiseRejectionTrackerOptions) => void;
  } | null;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
};

/** Normaliza cualquier cosa que llegue por un canal de error a algo logueable. */
function describeThrown(thrown: unknown): { message: string; details: LogDetails } {
  if (thrown instanceof Error) {
    return {
      message: thrown.message || thrown.name || 'Error sin mensaje',
      details: { name: thrown.name, stack: thrown.stack ?? null },
    };
  }

  if (typeof thrown === 'string') {
    return { message: thrown, details: {} };
  }

  return { message: 'Error no serializable', details: { raw: String(thrown) } };
}

/**
 * Engancha la telemetria a los errores que nadie ataja. Se llama una sola vez,
 * desde app/_layout.tsx. Devuelve el teardown (util en tests; en la app el
 * ciclo de vida del proceso lo cubre).
 *
 * Cubre tres canales, porque ninguno solo alcanza:
 *
 *  · `ErrorUtils.setGlobalHandler` — excepciones no atajadas en nativo. Se
 *    encadena al handler previo para NO tapar la pantalla roja de LogBox.
 *
 *  · `HermesInternal.enablePromiseRejectionTracker` — unhandled rejections en
 *    Hermes. Solo se instala en produccion: en `__DEV__` ese slot ya lo ocupa
 *    React Native (Libraries/Core/polyfillPromise.js) para alimentar LogBox, y
 *    no tiene getter, asi que instalarlo lo pisaria y nos quedariamos sin el
 *    aviso en desarrollo.
 *
 *  · `unhandledrejection` / `error` de window — el target web.
 */
export function initLogger(): () => void {
  if (teardown) return teardown;

  const globalRef = globalThis as GlobalWithErrorHooks;
  const cleanups: (() => void)[] = [];

  // — Sesion: sembramos y despues seguimos los cambios de auth —
  void supabase.auth.getSession().then(({ data }) => {
    currentAuthUserId = data.session?.user?.id ?? null;
  });

  const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
    currentAuthUserId = session?.user?.id ?? null;
  });
  cleanups.push(() => authSubscription.subscription.unsubscribe());

  // — Excepciones globales (nativo) —
  const errorUtils = globalRef.ErrorUtils;
  if (errorUtils) {
    const previousHandler = errorUtils.getGlobalHandler();

    errorUtils.setGlobalHandler((thrown: unknown, isFatal?: boolean) => {
      const { message, details } = describeThrown(thrown);
      Logger.error(message, { ...details, source: 'globalHandler', isFatal: isFatal === true });
      previousHandler(thrown, isFatal);
    });

    cleanups.push(() => errorUtils.setGlobalHandler(previousHandler));
  }

  // — Unhandled promise rejections (Hermes, solo produccion) —
  const enableTracker = globalRef.HermesInternal?.enablePromiseRejectionTracker;
  if (enableTracker && !__DEV__) {
    enableTracker({
      allRejections: true,
      onUnhandled: (id, rejection) => {
        const { message, details } = describeThrown(rejection);
        Logger.error(message, { ...details, source: 'unhandledRejection', rejectionId: id });
      },
    });
  }

  // — Web —
  if (Platform.OS === 'web' && typeof globalRef.addEventListener === 'function') {
    const onRejection = (event: unknown) => {
      const reason = (event as { reason?: unknown })?.reason;
      const { message, details } = describeThrown(reason);
      Logger.error(message, { ...details, source: 'unhandledRejection' });
    };
    const onError = (event: unknown) => {
      const thrown = (event as { error?: unknown })?.error;
      const { message, details } = describeThrown(thrown);
      Logger.error(message, { ...details, source: 'windowError' });
    };

    globalRef.addEventListener('unhandledrejection', onRejection);
    globalRef.addEventListener('error', onError);
    cleanups.push(() => {
      globalRef.removeEventListener?.('unhandledrejection', onRejection);
      globalRef.removeEventListener?.('error', onError);
    });
  }

  teardown = () => {
    cleanups.forEach((fn) => fn());
    teardown = null;
  };

  return teardown;
}
