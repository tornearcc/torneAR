import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { Avatar } from '@/components/ui/Avatar';
import { resolveAvatarUrl } from '@/lib/supabase-storage';
import { getTeamRoleLabel, TeamRole } from '@/lib/team-options';
import { roleAppearance, firstLetterUpper, positionLabel, canManageMember } from '@/lib/team-helpers';
import { formatAge } from '@/lib/age';

interface TeamMemberRow {
  profile_id: string;
  role: TeamRole;
  joined_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    preferred_position: string | null;
    /** Ya calculada server-side — ver components/team-manage/types.ts. */
    age: number | null;
  } | null;
}

interface TeamMembersListProps {
  members: TeamMemberRow[];
  myRole: TeamRole | null;
  profileId?: string;
  processingMemberId: string | null;
  openRoleModal: (member: TeamMemberRow, isSelf: boolean) => void;
  askRemoveMember: (member: TeamMemberRow, isSelf: boolean) => void;
}

export function TeamMembersList({
  members,
  myRole,
  profileId,
  processingMemberId,
  openRoleModal,
  askRemoveMember,
}: TeamMembersListProps) {
  return (
    <View className="gap-2">
      {members.map((member) => {
        const avatarUrl = resolveAvatarUrl(member.profiles?.avatar_url);
        const roleVisual = roleAppearance(member.role);

        const memberAge = formatAge(member.profiles?.age ?? null);

        const isSelf = profileId === member.profile_id;
        const canManageThisMember = canManageMember(myRole, member.role, isSelf);
        const processingThisMember = processingMemberId === member.profile_id;

        return (
          <View
            key={`${member.profile_id}-${member.joined_at}`}
            className="rounded-lg border-l-4 bg-surface-high px-3 py-2.5"
            style={{ borderLeftColor: roleVisual.borderColor }}
          >
            <View className="flex-row items-center justify-between gap-2">
              {/* flex-1 + minWidth 0: un nombre largo (o con emojis) empujaba el
                  badge de rol fuera de la card. */}
              <View className="flex-1 flex-row items-center gap-3" style={{ minWidth: 0 }}>
                <View className="shrink-0">
                  <Avatar
                    uri={avatarUrl}
                    size={48}
                    profileId={member.profile_id}
                    name={member.profiles?.full_name ?? member.profiles?.username ?? undefined}
                    backgroundClassName="bg-surface-variant"
                    expandable
                  />
                </View>
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text
                    className="font-uiBold text-sm text-neutral-on-surface"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {member.profiles?.full_name ?? member.profiles?.username ?? 'Jugador'}
                  </Text>
                  <Text
                    className="font-ui text-xs text-neutral-on-surface-variant"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    @{member.profiles?.username ?? 'sin_usuario'}{isSelf ? ' (vos)' : ''}
                  </Text>
                  {/* La edad se cuelga de la línea de la posición en vez de
                      ocupar una propia: la card ya tiene tres renglones y el
                      dato es del mismo orden (ficha del jugador). Se omite el
                      separador entero cuando no hay fecha cargada. */}
                  <Text
                    className="font-ui mt-1 text-[11px] tracking-wide text-neutral-on-surface-variant"
                    numberOfLines={1}
                  >
                    {firstLetterUpper(positionLabel(member.profiles?.preferred_position ?? 'CUALQUIERA'))}
                    {memberAge ? ` · ${memberAge}` : ''}
                  </Text>
                </View>
              </View>

              <Text
                className="font-uiBold shrink-0 rounded px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{ backgroundColor: roleVisual.badgeBackground, color: roleVisual.badgeText }}
                numberOfLines={1}
              >
                {getTeamRoleLabel(member.role)}
              </Text>
            </View>

            {(myRole === 'CAPITAN' || myRole === 'SUBCAPITAN') && !isSelf ? (
              <View className="mt-3 flex-row gap-2">
                <TouchableOpacity
                  onPress={() => openRoleModal(member, isSelf)}
                  disabled={processingThisMember || !canManageThisMember}
                  activeOpacity={0.9}
                  className={`flex-1 flex-row items-center justify-center rounded-md py-2 ${canManageThisMember ? 'border border-neutral-outline-variant/15' : 'border border-neutral-outline-variant/40 bg-surface-high/40'}`}
                >
                  {processingThisMember ? (
                    <ActivityIndicator color="#BCCBB9" size="small" />
                  ) : (
                    <>
                      <AppIcon family="material-community" name="account-switch-outline" size={16} color={canManageThisMember ? '#BCCBB9' : '#6F6D6C'} />
                      <Text className={`font-display ml-1.5 text-[10px] uppercase tracking-wide ${canManageThisMember ? 'text-neutral-on-surface-variant' : 'text-neutral-on-surface-variant/60'}`}>
                        {canManageThisMember ? 'Cambiar rol' : 'Sin permisos'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => askRemoveMember(member, isSelf)}
                  disabled={processingThisMember || !canManageThisMember}
                  activeOpacity={0.9}
                  className={`flex-1 flex-row items-center justify-center rounded-md py-2 ${canManageThisMember ? 'border border-danger-error/35 bg-danger-error/10' : 'border border-neutral-outline-variant/40 bg-surface-high/40'}`}
                >
                  <AppIcon family="material-community" name="account-remove-outline" size={16} color={canManageThisMember ? '#FFB4AB' : '#6F6D6C'} />
                  <Text className={`font-display ml-1.5 text-[10px] uppercase tracking-wide ${canManageThisMember ? 'text-danger-error' : 'text-neutral-on-surface-variant/60'}`}>
                    {canManageThisMember ? 'Remover' : 'Sin permisos'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
