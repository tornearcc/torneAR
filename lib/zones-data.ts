import { supabase } from '@/lib/supabase';
import type { ZoneOption } from '@/lib/zone-search';

/**
 * Catálogo de zonas activas.
 *
 * Son 245 filas que no cambian durante una sesión, y hasta ahora cada pantalla
 * que abría el selector disparaba su propia query (onboarding, editar perfil,
 * crear publicación, crear equipo, filtros de market y de ranking, cada una por
 * su lado). La promesa se cachea a nivel de módulo: la primera pantalla paga la
 * request y el resto abre el sheet con la lista ya puesta.
 *
 * Se cachea la PROMESA y no el resultado para que dos pantallas que montan a la
 * vez compartan el vuelo en lugar de pedir lo mismo dos veces.
 */
let catalogPromise: Promise<ZoneOption[]> | null = null;

export function fetchZoneCatalog(): Promise<ZoneOption[]> {
  if (catalogPromise) return catalogPromise;

  const pending = (async (): Promise<ZoneOption[]> => {
    const { data, error } = await supabase
      .from('zones')
      .select('name')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;

    // `value` es el nombre a propósito: la zona se persiste como texto en
    // `profiles.zone`, `teams.zone` y los filtros. El uuid sólo lo necesita el
    // flujo de canchas, que arma sus propias opciones desde `venue-data`.
    return (data ?? []).map((zone) => ({ value: zone.name, name: zone.name }));
  })();

  catalogPromise = pending;

  // Un fallo de red no puede quedar cacheado: sin esto la primera pantalla que
  // falla condena a todas las demás de la sesión a la misma lista vacía.
  pending.catch(() => {
    if (catalogPromise === pending) catalogPromise = null;
  });

  return pending;
}

/** Para tests y para forzar recarga si el catálogo cambia en caliente. */
export function invalidateZoneCatalog(): void {
  catalogPromise = null;
}

/**
 * Nombres de las zonas activas, ordenados alfabéticamente.
 * Fuente única para el ranking y el selector de zonas.
 */
export async function fetchActiveZoneNames(): Promise<string[]> {
  const catalog = await fetchZoneCatalog();
  return catalog.map((zone) => zone.name);
}
