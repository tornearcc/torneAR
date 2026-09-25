import { Text, View } from 'react-native';
import { formatAge } from '@/lib/age';
import { Avatar } from '@/components/ui/Avatar';
import { resolveAvatarUrl } from '@/lib/supabase-storage';
import { getTeamRoleLabel } from '@/lib/team-options';
import type { TeamMemberStat } from './types';

function positionLabel(pos: string): string {
  switch (pos) {
    case 'ARQUERO': return 'ARQ';
    case 'DEFENSOR': return 'DEF';
    case 'MEDIOCAMPISTA': return 'MED';
    case 'DELANTERO': return 'DEL';
    default: return 'CUA';
  }
}

function roleClass(role: TeamMemberStat['role']): string {
  if (role === 'CAPITAN') return 'bg-warning-tertiary/20 text-warning-tertiary';
  if (role === 'SUBCAPITAN') return 'bg-info-secondary/15 text-info-secondary';
  if (role === 'DIRECTOR_TECNICO') return 'bg-neutral-outline-variant/20 text-neutral-on-surface-variant';
  return 'bg-brand-primary/15 text-brand-primary';
}

type TeamMembersSectionProps = {
  members: TeamMemberStat[];
};

export function TeamMembersSection({ members }: TeamMembersSectionProps) {
  return (
    <View className="mt-4">
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Plantilla · {members.length}
      </Text>
      {members.length === 0 ? (
        <View className="rounded-xl bg-surface-low px-4 py-5">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            No hay miembros para mostrar.
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {members.map((member) => {
            const avatarUrl = resolveAvatarUrl(member.avatarUrl);
            // `null` cuando el jugador no cargo la fecha: no se muestra nada en
            // vez de un "0 años" o un guion, que se leerian como un dato real.
            const age = formatAge(member.age);
            return (
              <View
                key={member.profileId}
                className="flex-row items-center gap-3 rounded-xl bg-surface-low px-3 py-3"
              >
                <Avatar
                  uri={avatarUrl}
                  size={40}
                  profileId={member.profileId}
                  name={member.fullName}
                  backgroundClassName="bg-surface-variant"
                  expandable
                />

                {/* Name + role */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="font-uiBold text-sm text-neutral-on-surface"
                      numberOfLines={1}
                    >
                      {member.fullName}
                    </Text>
                    <Text
                      className={`font-uiBold rounded px-1.5 py-0.5 text-[8px] uppercase ${roleClass(member.role)}`}
                    >
                      {getTeamRoleLabel(member.role)}
                    </Text>
                  </View>
                  <View className="mt-1 flex-row items-center gap-2">
                    <Text className="font-uiBold rounded bg-surface-high px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-neutral-on-surface-variant">
                      {positionLabel(member.position)}
                    </Text>
                    {!!age && (
                      <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
                        {age}
                      </Text>
                    )}
                    <Text
                      className="font-ui flex-1 text-[11px] text-neutral-on-surface-variant"
                      numberOfLines={1}
                    >
                      @{member.username}
                    </Text>
                  </View>
                </View>

                {/* Stats */}
                <View className="items-end gap-1">
                  <View className="flex-row items-center gap-3">
                    <View className="items-center">
                      <Text
                        className="font-displayBlack text-base text-neutral-on-surface"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {member.matchesPlayed}
                      </Text>
                      <Text className="font-ui text-[9px] uppercase text-neutral-on-surface-variant">
                        PJ
                      </Text>
                    </View>
                    <View className="items-center">
                      <Text
                        className="font-displayBlack text-base text-brand-primary"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {member.goals}
                      </Text>
                      <Text className="font-ui text-[9px] uppercase text-neutral-on-surface-variant">
                        Goles
                      </Text>
                    </View>
                  </View>
                  <Text className="font-ui text-[10px] text-neutral-on-surface-variant">
                    {member.presencePercent} presencia
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
