import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { Platform } from 'react-native';
import { fetchWithFailureTracking } from '@/lib/http-failures';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = requireEnv('EXPO_PUBLIC_SUPABASE_KEY', process.env.EXPO_PUBLIC_SUPABASE_KEY);

// Creamos un adaptador de storage condicional
const getStorage = () => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      // Estamos en el navegador web
      return window.localStorage;
    } else {
      // Estamos en el servidor Node.js (SSR/SSG de Expo Web)
      // Retornamos un objeto dummy para que no explote
      return {
        getItem: () => Promise.resolve(null),
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
      };
    }
  }
  // Estamos en la app nativa (iOS/Android)
  return AsyncStorage;
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    // Solo en web: al volver del consentimiento de Google, supabase-js levanta
    // la sesión de la URL por sí mismo. En nativo no hay `window.location` que
    // inspeccionar — ahí el callback lo resuelve `signInWithGoogle()`
    // (lib/auth-data.ts) leyendo la URL que devuelve `openAuthSessionAsync`.
    detectSessionInUrl: Platform.OS === 'web',
  },
  // Anota el último pedido que falló (status y path, sin datos) para que
  // Logger.error lo adjunte: los errores con cuerpo vacío llegaban sin nada.
  global: { fetch: fetchWithFailureTracking },
});

// Las RPCs se invocan con `supabase.rpc(...)` fuertemente tipado: todas las
// funciones están reflejadas en types/supabase.ts (regenerado 2026-07-14).
// El helper `supabaseRpc` sin tipar quedó obsoleto y fue eliminado.