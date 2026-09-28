import { Image, Text, TouchableOpacity, View } from 'react-native';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { TeamItem } from './types';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { AppIcon } from '@/components/ui/AppIcon';
import { getTeamRoleLabel } from '@/lib/team-options';

type ProfileTeamsSectionProps = {
  teams: TeamItem[];
  onCreateTeam?: () => void;
  onJoinTeam?: () => void;
  onOpenRequests?: () => void;
  onTeamPress?: (teamId: string) => void;
  onLeaveTeam?: (team: TeamItem) => void;
};

function roleClass(role: TeamItem['role']): string {
  if (role === 'CAPITAN' || role === 'SUBCAPITAN') {
    return 'bg-info-secondary/15 text-info-secondary';
  }
  return 'bg-brand-primary/15 text-brand-primary';
}

export function ProfileTeamsSection({ teams, onCreateTeam, onJoinTeam, onOpenRequests, onTeamPress, onLeaveTeam }: ProfileTeamsSectionProps) {
  // Helper para obtener URL de shield
  const getShieldImageUrl = (team: TeamItem): string => {
    if (!team.shieldUrl) return '';
    if (team.shieldUrl.startsWith('http')) return team.shieldUrl;
    return getSupabaseStorageUrl('shields', team.shieldUrl);
  };

  return (
    <View className="mt-8">
      <View className="mb-4 flex-row items-center justify-between px-1">
        <Text className="font-display text-sm uppercase tracking-wider text-neutral-on-surface-variant">Mis Equipos</Text>
        {teams.length > 0 ? (
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={onOpenRequests}
              activeOpacity={0.9}
              className="rounded-md border border-neutral-outline-variant/15 bg-surface-high px-2.5 py-1"
            >
              <Text className="font-display text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Solicitudes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onJoinTeam}
              activeOpacity={0.9}
              className="rounded-md border border-info-secondary/35 bg-info-secondary/10 px-2.5 py-1"
            >
              <Text className="font-display text-[10px] uppercase tracking-wide text-info-secondary">Unirme</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onCreateTeam}
              activeOpacity={0.9}
              className="rounded-md border border-brand-primary/45 bg-brand-primary/15 px-2.5 py-1"
            >
              <Text className="font-display text-[10px] uppercase tracking-wide text-brand-primary">Crear</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <View className="gap-3">
        {teams.length === 0 ? (
          <View className="rounded-xl bg-surface-low p-4">
            <Text className="font-ui text-sm text-neutral-on-surface-variant">Todavia no estas en equipos.</Text>
            <View className="mt-3 flex-row gap-2">
              <TouchableOpacity onPress={onOpenRequests} activeOpacity={0.9} className="flex-1 flex-row items-center justify-center rounded-lg bg-surface-high py-2.5">
                <AppIcon family="material-community" name="clipboard-text-outline" size={16} color="#BCCBB9" />
                <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Solicitudes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCreateTeam} activeOpacity={0.9} className="flex-1 flex-row items-center justify-center rounded-lg bg-brand-primary py-2.5">
                <AppIcon family="material-community" name="shield-plus" size={16} color="#003914" />
                <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#003914]">Crear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onJoinTeam} activeOpacity={0.9} className="flex-1 flex-row items-center justify-center rounded-lg bg-info-secondary/75 py-2.5">
                <AppIcon family="material-community" name="account-plus" size={16} color="#0E2430" />
                <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#0E2430]">Unirme</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          teams.map((team) => {
            const isCaptain = team.role === 'CAPITAN';

            return (
              <View key={team.id} className="rounded-xl bg-surface-low p-3">
                {/* Fila principal: navega a gestión. Es un touchable propio para
                    que el botón "Abandonar" no comparta el área de tap. */}
                <TouchableOpacity
                  onPress={() => onTeamPress?.(team.id)}
                  activeOpacity={0.88}
                  className="flex-row items-center justify-between"
                >
                  {/* flex-1 en el contenedor: sin esto el nombre del equipo empuja
                      el layout y se come el chevron (equipos con nombres de 100+
                      caracteres). minWidth 0 es para el target web (react-native-web
                      usa flexbox CSS real, donde min-width:auto impide encoger). */}
                  <View className="flex-1 flex-row items-center gap-4" style={{ minWidth: 0 }}>
                    <ExpandablePhoto
                      uri={getShieldImageUrl(team) || null}
                      subject={{ kind: 'shield', teamId: team.id }}
                      title={team.name}
                    >
                      <View className="h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-variant">
                        {getShieldImageUrl(team) ? (
                          <Image source={{ uri: getShieldImageUrl(team) }} className="h-8 w-8" resizeMode="contain" />
                        ) : (
                          <AppIcon family="material-community" name="shield-outline" size={18} color="#BCCBB9" />
                        )}
                      </View>
                    </ExpandablePhoto>

                    <View className="flex-1" style={{ minWidth: 0 }}>
                      <Text
                        className="font-display text-xl text-neutral-on-surface"
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {team.name}
                      </Text>
                      <View className="mt-2 flex-row flex-wrap items-center gap-2">
                        <Text className={`font-uiBold rounded px-2 py-0.5 text-[9px] uppercase ${roleClass(team.role)}`}>
                          {getTeamRoleLabel(team.role)}
                        </Text>
                        <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>- Rating {team.prRating}</Text>
                      </View>
                    </View>
                  </View>

                  {/* shrink-0: el chevron nunca cede ancho al nombre */}
                  <View className="shrink-0 pl-2">
                    <AppIcon family="material-icons" name="chevron-right" size={20} color="#BCCBB9" />
                  </View>
                </TouchableOpacity>

                {/* Abandonar equipo. El capitán no puede: debe ceder la
                    capitanía primero (la RPC lo rechazaría con
                    CAPTAIN_MUST_TRANSFER). Se muestra deshabilitado con el motivo
                    para que la restricción sea visible, no un error tras el tap. */}
                {onLeaveTeam && (
                  <View className="mt-3 border-t border-neutral-outline-variant/10 pt-3">
                    <TouchableOpacity
                      onPress={() => onLeaveTeam(team)}
                      disabled={isCaptain}
                      activeOpacity={0.85}
                      className={`flex-row items-center justify-center gap-2 rounded-lg border py-2.5 ${
                        isCaptain
                          ? 'border-neutral-outline-variant/15 bg-surface-high/40'
                          : 'border-danger-error/30 bg-danger-error/10'
                      }`}
                    >
                      <AppIcon
                        family="material-community"
                        name="exit-run"
                        size={15}
                        color={isCaptain ? '#6F6D6C' : '#FFB4AB'}
                      />
                      <Text
                        className={`font-display text-[10px] uppercase tracking-wide ${
                          isCaptain ? 'text-neutral-on-surface-variant/60' : 'text-danger-error'
                        }`}
                      >
                        Abandonar equipo
                      </Text>
                    </TouchableOpacity>
                    {isCaptain && (
                      <Text className="font-ui mt-1.5 text-center text-[10px] text-neutral-on-surface-variant">
                        Debes ceder la capitanía antes de salir.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
