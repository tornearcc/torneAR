import { useCallback, useEffect, useState } from 'react';

import { Logger } from '@/lib/logger';
import { fetchZoneCatalog } from '@/lib/zones-data';
import type { ZoneOption } from '@/lib/zone-search';

interface ZoneCatalogState {
  zones: ZoneOption[];
  loading: boolean;
  /** `true` si la carga falló: el sheet ofrece reintentar en vez de mentir con una lista vacía. */
  failed: boolean;
  reload: () => void;
}

/**
 * Catálogo de zonas para el selector.
 *
 * La request la resuelve `fetchZoneCatalog`, que cachea por sesión: montar este
 * hook en cinco pantallas no son cinco queries.
 *
 * Nada de fallbacks hardcodeados. `ZonePickerDialog` caía en
 * `['Buenos Aires Centro', 'GBA Norte', 'GBA Sur', 'GBA Oeste']` cuando fallaba
 * la carga — cuatro zonas que ya **no existen** en la tabla: el usuario elegía
 * una y guardaba en su perfil un valor que no matchea ninguna zona real, con lo
 * cual desaparecía de los filtros de ranking y de market. Un error visible con
 * botón de reintentar es estrictamente mejor que un dato inválido guardado.
 */
export function useZoneCatalog(enabled = true): ZoneCatalogState {
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [attempt, setAttempt] = useState(0);
  // Resultado del último intento terminado. `attempt: -1` es «todavía ninguno».
  // `loading` y `failed` se derivan de comparar este intento con el actual, en
  // vez de escribirse a mano al arrancar cada carga: así el efecto no tiene
  // ningún setState síncrono y no hay un render intermedio donde `loading`
  // todavía diga `false` con la request ya en vuelo.
  const [outcome, setOutcome] = useState<{ attempt: number; ok: boolean }>({
    attempt: -1,
    ok: false,
  });

  const settled = outcome.attempt === attempt;
  const loading = enabled && !settled;
  const failed = settled && !outcome.ok;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const runAttempt = attempt;

    fetchZoneCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setZones(catalog);
        setOutcome({ attempt: runAttempt, ok: true });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // `zones` se deja como está: si había un catálogo cargado, seguir
        // mostrándolo es mejor que vaciar la lista.
        setOutcome({ attempt: runAttempt, ok: false });
        Logger.warn('No se pudo cargar el catálogo de zonas', {
          scope: 'useZoneCatalog',
          error,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { zones, loading, failed, reload };
}
