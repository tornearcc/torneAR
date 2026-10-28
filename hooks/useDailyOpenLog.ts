import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { logDailyOpen, type RunningVersion } from '@/lib/daily-open';

/**
 * Registra la primera apertura del día de la cuenta logueada (ver
 * `lib/daily-open.ts`). Se dispara al montar y cada vez que la app vuelve al
 * frente: quien la deja abierta de un día para el otro también cuenta.
 */
export function useDailyOpenLog(authUserId: string | null): void {
  useEffect(() => {
    if (!authUserId) return;

    const version: RunningVersion = {
      updateId: Updates.updateId ?? null,
      runtimeVersion: Updates.runtimeVersion ?? null,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    };

    void logDailyOpen(authUserId, version);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void logDailyOpen(authUserId, version);
    });

    return () => subscription.remove();
  }, [authUserId]);
}
