import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

/**
 * Force update: comparación de versiones y consulta de `app_versions`.
 *
 * La versión corriente sale de `Constants.expoConfig.version` (app.json) y no
 * de `expo-application`: ese paquete no está instalado y agregarlo obliga a un
 * rebuild nativo, que es exactamente lo que este sistema existe para evitar
 * tener que pedir. `app.json` ya es la fuente de la versión que se publica en
 * las tiendas y de la que deriva `runtimeVersion` (policy `appVersion`).
 *
 * La comparación en sí vive en `lib/version-compare.ts`, sin dependencias de
 * plataforma, para que pueda probarse en el proyecto `lib` de Vitest.
 */

export { compareVersions, isUpdateRequired } from '@/lib/version-compare';

export interface AppVersionPolicy {
  platform: string;
  minRequiredVersion: string;
  latestVersion: string;
  updateUrl: string;
}

/** La versión de este build, según app.json. */
export function getCurrentAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/** 'android' | 'ios'. `null` en web y en cualquier plataforma sin política. */
export function getCurrentPlatform(): 'android' | 'ios' | null {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return null;
}

/**
 * Trae la política de versiones de la plataforma actual.
 *
 * `null` si no hay fila, si la plataforma no aplica (web) o si la consulta
 * falla. El llamador trata `null` como "no bloquear": sin conexión, la app
 * tiene que seguir abriendo.
 */
export async function fetchAppVersionPolicy(): Promise<AppVersionPolicy | null> {
  const platform = getCurrentPlatform();
  if (!platform) return null;

  const { data, error } = await supabase
    .from('app_versions')
    .select('platform, min_required_version, latest_version, update_url')
    .eq('platform', platform)
    .maybeSingle();

  if (error) {
    // Warn y no error: quedarse sin política es el modo degradado esperado
    // (avión, backend caído) y no amerita ruido de incidente.
    Logger.warn('No se pudo consultar la política de versiones', {
      scope: 'app-version.fetchAppVersionPolicy',
      platform,
      error,
    });
    return null;
  }
  if (!data) return null;

  return {
    platform: data.platform,
    minRequiredVersion: data.min_required_version,
    latestVersion: data.latest_version,
    updateUrl: data.update_url,
  };
}
