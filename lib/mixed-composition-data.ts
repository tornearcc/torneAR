// tornear/lib/mixed-composition-data.ts
//
// F3 — lectura del estado de la composición de un equipo MIXTO. Los tipos y
// los textos viven en lib/mixed-composition.ts.
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { parseMixedCompositionStatus, type MixedCompositionStatus } from '@/lib/mixed-composition';
import type { Database } from '@/types/supabase';

type TeamFormat = Database['public']['Enums']['team_format'];

/**
 * Estado de la composición de un equipo. Devuelve `null` si no se pudo leer:
 * la regla la aplica el servidor igual, así que la pantalla sigue sin el aviso
 * en vez de romperse (también cubre un preview publicado antes de la migración).
 */
export async function fetchMixedCompositionStatus(
  teamId: string,
  format?: TeamFormat | null,
): Promise<MixedCompositionStatus | null> {
  const { data, error } = await supabase.rpc('get_mixed_composition_status', {
    p_team_id: teamId,
    p_format: format ?? undefined,
  });
  if (error) {
    Logger.warn('No se pudo leer la composición mixta', {
      scope: 'mixed-composition.fetchMixedCompositionStatus',
      teamId,
      error,
    });
    return null;
  }
  return parseMixedCompositionStatus(data);
}
