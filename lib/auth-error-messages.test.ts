import { describe, expect, it } from 'vitest';
import { describeAuthFailure, getAuthErrorMessage, getGenericSupabaseErrorMessage } from './auth-error-messages';
import { PASSWORD_MIN_LENGTH } from './schemas/authSchema';

describe('getAuthErrorMessage', () => {
  it('maps invalid credentials', () => {
    const message = getAuthErrorMessage({ message: 'Invalid login credentials' }, 'login');
    expect(message).toBe('Correo o contrasena incorrectos.');
  });

  it('maps email already registered', () => {
    const message = getAuthErrorMessage({ message: 'User already registered' }, 'signup');
    expect(message).toBe('Ese correo ya esta registrado. Proba iniciar sesion.');
  });

  it('returns fallback for unknown login message', () => {
    const message = getAuthErrorMessage({ message: 'Unexpected auth error' }, 'login');
    expect(message).toBe('No se pudo iniciar sesion. Verifica tus datos e intentalo otra vez.');
  });

  // Guard del bug 1: el mensaje traducido debe reportar el MISMO minimo que
  // valida el cliente y exige el server. Antes decia "6" mientras config.toml
  // exigia 8, asi que el usuario leia un limite que no existia.
  it('translates the server password error using the shared minimum', () => {
    const message = getAuthErrorMessage(
      { message: 'Password should be at least 8 characters' },
      'signup',
    );
    expect(message).toBe(`La contrasena debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    expect(message).toContain('8');
  });
});

describe('getGenericSupabaseErrorMessage', () => {
  it('maps network issues', () => {
    const message = getGenericSupabaseErrorMessage({ message: 'Failed to fetch' });
    expect(message).toBe('No hay conexion con el servidor. Verifica internet e intentalo nuevamente.');
  });

  it('maps unique constraint errors', () => {
    const message = getGenericSupabaseErrorMessage({ message: 'duplicate key value violates unique constraint' });
    expect(message).toBe('Ya existe un registro con esos datos. Revisa e intentalo nuevamente.');
  });

  it('returns fallback when message is unknown', () => {
    const fallback = 'Mensaje personalizado';
    const message = getGenericSupabaseErrorMessage({ message: 'random backend error' }, fallback);
    expect(message).toBe(fallback);
  });
});

describe('describeAuthFailure', () => {
  it('saca el mensaje de un objeto plano (el caso de oauthError, antes "[object Object]")', () => {
    expect(describeAuthFailure({ name: 'AuthError', message: 'The authorization attempt failed', status: 0 })).toEqual({
      reason: 'The authorization attempt failed',
      errorName: 'AuthError',
      status: 0,
    });
  });

  it('conserva el código de un error nativo', () => {
    const nativeError = Object.assign(new Error('Bad ID token'), { code: 'ERR_INVALID_TOKEN' });
    expect(describeAuthFailure(nativeError)).toEqual({
      reason: 'Bad ID token',
      errorName: 'Error',
      code: 'ERR_INVALID_TOKEN',
    });
  });

  it('un objeto sin mensaje se guarda serializado, nunca como "[object Object]"', () => {
    expect(describeAuthFailure({ foo: 1 }).reason).toBe('{"foo":1}');
  });

  it('strings y valores sueltos', () => {
    expect(describeAuthFailure('boom')).toEqual({ reason: 'boom' });
    expect(describeAuthFailure(undefined)).toEqual({ reason: 'undefined' });
  });
});
