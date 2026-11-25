/**
 * Último pedido HTTP que falló contra Supabase, para darle contexto a los logs.
 *
 * Cuando Supabase responde un error con el cuerpo vacío (un 502/503 del
 * gateway, un corte de red), postgrest-js arma un objeto plano
 * `{ message: '' }` sin el status: en `app_logs` quedaba un error ilegible.
 * El fetch del cliente (`lib/supabase.ts`) anota acá cada respuesta no-OK y
 * `Logger.error` adjunta la última si es reciente.
 *
 * Se guarda sólo el método, el path (sin query string: ahí van ids y filtros)
 * y el status. Nada del cuerpo ni de los headers.
 */
export type HttpFailure = {
  /** 0 si el pedido ni siquiera tuvo respuesta (red caída, abortado). */
  status: number;
  method: string;
  /** Ej. `rest/v1/teams`, `rest/v1/rpc/get_home_view`, `functions/v1/foo`. */
  path: string;
  /** Nombre del error de red cuando no hubo respuesta (`TypeError`, `AbortError`). */
  errorName?: string;
  at: number;
};

/** Ventana en la que un fallo HTTP se considera relacionado con el error que se loguea. */
export const HTTP_FAILURE_MAX_AGE_MS = 15_000;

let lastFailure: HttpFailure | null = null;

export function requestPath(url: string): string {
  try {
    const { pathname } = new URL(url);
    return pathname.replace(/^\/+/, '');
  } catch {
    return url.split('?')[0] ?? '';
  }
}

export function recordHttpFailure(
  failure: Omit<HttpFailure, 'at' | 'path'> & { url: string },
  now: number = Date.now(),
): void {
  lastFailure = {
    status: failure.status,
    method: failure.method.toUpperCase(),
    path: requestPath(failure.url),
    ...(failure.errorName ? { errorName: failure.errorName } : {}),
    at: now,
  };
}

/** El último fallo, si pasó hace menos de `HTTP_FAILURE_MAX_AGE_MS`. */
export function getRecentHttpFailure(now: number = Date.now()): (Omit<HttpFailure, 'at'> & { secondsAgo: number }) | null {
  if (!lastFailure || now - lastFailure.at > HTTP_FAILURE_MAX_AGE_MS) return null;
  const { at, ...rest } = lastFailure;
  return { ...rest, secondsAgo: Math.round((now - at) / 1000) };
}

export function resetHttpFailures(): void {
  lastFailure = null;
}

/**
 * Un error que no es `Error` y llega con `message` vacío (el caso de
 * postgrest-js con cuerpo vacío): se le pone un texto que lo explique, sin
 * perder el resto de sus campos.
 */
export function describeEmptyErrorObject(value: unknown): unknown {
  if (!value || typeof value !== 'object' || value instanceof Error || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (!('message' in record) || (typeof record.message === 'string' && record.message.trim() !== '')) return value;
  return { ...record, message: '(respuesta de Supabase sin cuerpo: ver lastHttpFailure)', emptyMessage: true };
}

/** Fetch para `createClient`: igual al global, pero anota los fallos. */
export const fetchWithFailureTracking: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
  try {
    const response = await fetch(input, init);
    if (!response.ok) recordHttpFailure({ status: response.status, method, url });
    return response;
  } catch (error) {
    recordHttpFailure({
      status: 0,
      method,
      url,
      errorName: error instanceof Error ? error.name : 'Error',
    });
    throw error;
  }
};
