import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { Logger } from '@/lib/logger';

const STORAGE_KEY = 'tornear.recent-zones.v1';
const MAX_RECENT = 4;

/**
 * Últimas zonas elegidas, para ofrecerlas arriba de todo con la búsqueda vacía.
 *
 * Es la mitad de la solución de UX: la lista tiene 245 entradas, pero una
 * persona juega siempre en dos o tres barrios. Guardadas, el caso normal vuelve
 * a ser "abrir y tocar" — sin teclado — y la búsqueda queda para la primera vez
 * y para las excepciones.
 *
 * Se guardan **nombres**, que es como se identifica la zona en casi toda la app.
 * El selector después descarta las que no estén en su lista de opciones, así
 * que una reciente que no aplica al contexto (p. ej. una zona sin canchas en el
 * flujo de proponer partido) simplemente no se muestra.
 */
export function useRecentZones(): {
  recent: string[];
  remember: (zoneName: string) => void;
} {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        // El storage es texto libre: una versión vieja del formato no puede
        // tirar abajo el selector.
        if (Array.isArray(parsed)) {
          setRecent(parsed.filter((item): item is string => typeof item === 'string'));
        }
      })
      .catch((error: unknown) => {
        Logger.warn('No se pudieron leer las zonas recientes', { scope: 'useRecentZones', error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((zoneName: string) => {
    setRecent((previous) => {
      const next = [zoneName, ...previous.filter((name) => name !== zoneName)].slice(0, MAX_RECENT);
      // Fire-and-forget: la UI ya avanzó con el estado nuevo y que la escritura
      // falle no invalida la selección que el usuario acaba de hacer.
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error: unknown) => {
        Logger.warn('No se pudieron guardar las zonas recientes', {
          scope: 'useRecentZones.remember',
          error,
        });
      });
      return next;
    });
  }, []);

  return { recent, remember };
}
