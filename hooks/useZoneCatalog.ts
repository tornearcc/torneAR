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
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    fetchZoneCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setZones(catalog);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailed(true);
        Logger.warn('No se pudo cargar el catálogo de zonas', {
          scope: 'useZoneCatalog',
          error,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { zones, loading, failed, reload };
}
