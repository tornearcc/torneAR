import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  describeEmptyErrorObject,
  fetchWithFailureTracking,
  getRecentHttpFailure,
  HTTP_FAILURE_MAX_AGE_MS,
  recordHttpFailure,
  requestPath,
  resetHttpFailures,
} from './http-failures';

const BASE = 'https://proyecto.supabase.co';

afterEach(() => {
  resetHttpFailures();
  vi.unstubAllGlobals();
});

describe('requestPath', () => {
  it('se queda con el path y descarta la query (ids y filtros)', () => {
    expect(requestPath(`${BASE}/rest/v1/teams?id=eq.123&select=*`)).toBe('rest/v1/teams');
    expect(requestPath(`${BASE}/rest/v1/rpc/get_home_view`)).toBe('rest/v1/rpc/get_home_view');
  });
});

describe('recordHttpFailure / getRecentHttpFailure', () => {
  it('devuelve el último fallo mientras es reciente', () => {
    recordHttpFailure({ status: 503, method: 'post', url: `${BASE}/rest/v1/rpc/x?a=1` }, 1_000);
    expect(getRecentHttpFailure(4_000)).toEqual({ status: 503, method: 'POST', path: 'rest/v1/rpc/x', secondsAgo: 3 });
  });

  it('lo olvida después de la ventana', () => {
    recordHttpFailure({ status: 502, method: 'GET', url: `${BASE}/rest/v1/teams` }, 1_000);
    expect(getRecentHttpFailure(1_000 + HTTP_FAILURE_MAX_AGE_MS + 1)).toBeNull();
  });
});

describe('describeEmptyErrorObject', () => {
  it('explica el objeto plano con message vacío y conserva el resto', () => {
    expect(describeEmptyErrorObject({ message: '', code: '' })).toEqual({
      message: '(respuesta de Supabase sin cuerpo: ver lastHttpFailure)',
      code: '',
      emptyMessage: true,
    });
  });

  it('no toca errores con mensaje, instancias de Error ni otros valores', () => {
    const conMensaje = { message: 'permission denied' };
    const error = new Error('');
    expect(describeEmptyErrorObject(conMensaje)).toBe(conMensaje);
    expect(describeEmptyErrorObject(error)).toBe(error);
    expect(describeEmptyErrorObject('texto')).toBe('texto');
    expect(describeEmptyErrorObject({ teamId: '1' })).toEqual({ teamId: '1' });
  });
});

describe('fetchWithFailureTracking', () => {
  it('anota las respuestas no-OK y las devuelve igual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const res = await fetchWithFailureTracking(`${BASE}/rest/v1/teams?id=eq.1`, { method: 'GET' });
    expect(res.status).toBe(503);
    expect(getRecentHttpFailure()).toMatchObject({ status: 503, method: 'GET', path: 'rest/v1/teams' });
  });

  it('no anota las respuestas OK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    await fetchWithFailureTracking(`${BASE}/rest/v1/teams`);
    expect(getRecentHttpFailure()).toBeNull();
  });

  it('anota el corte de red con status 0 y vuelve a tirar el error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network request failed'); }));
    await expect(fetchWithFailureTracking(`${BASE}/rest/v1/rpc/x`, { method: 'POST' })).rejects.toThrow('Network request failed');
    expect(getRecentHttpFailure()).toMatchObject({ status: 0, method: 'POST', path: 'rest/v1/rpc/x', errorName: 'TypeError' });
  });
});
