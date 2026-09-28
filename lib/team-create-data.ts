import { supabase } from '@/lib/supabase';
import { TeamCategory, TeamFormat } from '@/lib/team-options';

// `fetchZones()` vivía acá y era un tercer camino para la misma query que
// `zones-data.ts`, sin caché. Quedó sin consumidores al unificar el selector;
// las zonas se piden con `fetchZoneCatalog()` / `fetchActiveZoneNames()`.

export async function createTeam(
  profileId: string,
  name: string,
  zone: string,
  category: TeamCategory,
  format: TeamFormat
): Promise<{ id: string; name: string }> {
  const { data: teamData, error: teamError } = await supabase
    .from('teams')
    .insert({
      name,
      zone,
      category,
      preferred_format: format,
    })
    .select('id, name')
    .single();

  if (teamError) throw teamError;

  const { error: memberError } = await supabase
    .from('team_members')
    .insert({
      team_id: teamData.id,
      profile_id: profileId,
      role: 'CAPITAN',
    });

  if (memberError) throw memberError;

  return teamData;
}
