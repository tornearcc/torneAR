import { Image, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { getTeamRoleLabel } from '@/lib/team-options';
import type { TeamEntry } from './types';

function roleClass(role: TeamEntry['role']): string {
  if (role === 'CAPITAN' || role === 'SUBCAPITAN') return 'bg-info-secondary/15 text-info-secondary';
  return 'bg-brand-primary/15 text-brand-primary';
}

type TeamsSectionProps = {
  teams: TeamEntry[];
};

export function TeamsSection({ teams }: TeamsSectionProps) {
  return (
    <View className="mt-8">
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Equipos
      </Text>
      {teams.length === 0 ? (
        <View className="rounded-xl bg-surface-low px-4 py-5">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            No pertenece a ningún equipo actualmente.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {teams.map((team) => {
            const shieldUrl = team.shieldUrl
              ? team.shieldUrl.startsWith('http')
                ? team.shieldUrl
                : getSupabaseStorageUrl('shields', team.shieldUrl)
              : null;
            return (
              <View
                key={team.id}
                className="flex-row items-center gap-4 rounded-xl bg-surface-low p-3"
              >
                <ExpandablePhoto uri={shieldUrl || null} subject={{ kind: 'shield', teamId: team.id }} title={team.name}>
                  <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-variant">
                    {shieldUrl ? (
                      <Image source={{ uri: shieldUrl }} className="h-8 w-8" resizeMode="contain" />
                    ) : (
                      <AppIcon family="material-community" name="shield-outline" size={18} color="#BCCBB9" />
                    )}
                  </View>
                </ExpandablePhoto>
                <View className="flex-1">
                  <Text className="font-display text-xl text-neutral-on-surface">{team.name}</Text>
                  <View className="mt-1.5 flex-row items-center gap-2">
                    <Text
                      className={`font-uiBold rounded px-2 py-0.5 text-[9px] uppercase ${roleClass(team.role)}`}
                    >
                      {getTeamRoleLabel(team.role)}
                    </Text>
                    <Text
                      className="font-ui text-xs text-neutral-on-surface-variant"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      Ranking {team.prRating}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
