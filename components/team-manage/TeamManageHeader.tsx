import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamDetailRow, TeamMemberRow } from './types';
import { getTeamCategoryLabel, getTeamFormatLabel, getTeamRoleLabel, TeamRole } from '@/lib/team-options';
import { averageOfAges } from '@/lib/age';
import { resolveShieldUrl } from '@/lib/supabase-storage';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';

interface TeamManageHeaderProps {
  team: TeamDetailRow;
  myRole: TeamRole | null;
  canEditTeam: boolean;
  uploadingShield: boolean;
  /** Plantel completo, para el promedio de edad. */
  members: TeamMemberRow[];
  onEditTeam: () => void;
  onPickShield: () => void;
  onCopyInviteCode: () => void;
  onShareInvite: () => void;
}

export function TeamManageHeader({
  team,
  myRole,
  canEditTeam,
  uploadingShield,
  members,
  onEditTeam,
  onPickShield,
  onCopyInviteCode,
  onShareInvite,
}: TeamManageHeaderProps) {
  const router = useRouter();
  const shieldUrl = resolveShieldUrl(team.shield_url);

  // Se calcula sobre quienes cargaron su fecha; `counted` permite aclarar la
  // muestra cuando no es todo el plantel, en vez de dar un promedio que parece
  // del equipo entero y no lo es.
  const squadAge = useMemo(
    () => averageOfAges(members.map((member) => member.profiles?.age)),
    [members],
  );

  const shieldBox = (
    <View className="relative">
      <View className="border-4 border-brand-primary-container bg-surface-lowest p-1" style={{ height: 84, width: 84, borderRadius: 8 }}>
        {uploadingShield ? (
          <View className="h-full w-full items-center justify-center rounded-md bg-surface-high">
            <ActivityIndicator size="small" color="#53E076" />
          </View>
        ) : shieldUrl ? (
          <Image source={{ uri: shieldUrl }} style={{ width: '100%', height: '100%', borderRadius: 6 }} contentFit="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center rounded-md bg-surface-high">
            <AppIcon family="material-community" name="shield-outline" size={24} color="#BCCBB9" />
          </View>
        )}
      </View>
      <View className="absolute bottom-1.5 right-1.5 rounded-md border-2 border-surface-base bg-brand-primary p-1">
        <AppIcon family="material-icons" name={shieldUrl ? 'verified' : 'add'} size={12} color="#003914" />
      </View>
    </View>
  );

  return (
    <View className="relative mt-6 rounded-xl border border-neutral-outline-variant/35 bg-surface-low p-4">
      <TouchableOpacity
        onPress={onEditTeam}
        disabled={!canEditTeam}
        activeOpacity={0.9}
        className={`absolute right-3 top-3 z-10 h-8 w-8 items-center justify-center rounded-md ${canEditTeam ? 'bg-surface-high' : 'bg-surface-high/50'}`}
      >
        <AppIcon family="material-community" name="pencil-outline" size={16} color={canEditTeam ? '#BCCBB9' : '#7B7A79'} />
      </TouchableOpacity>

      <View className="flex-row items-center gap-4 pr-10">
        {/* Con escudo, tocarlo lo abre en el visor; quien puede editar el equipo
            ve ahí "Cambiar escudo". Sin escudo el toque va directo al selector,
            como antes (mismo criterio que la foto del perfil propio). */}
        {shieldUrl && !uploadingShield ? (
          <ExpandablePhoto
            uri={shieldUrl}
            subject={{ kind: 'shield', teamId: team.id }}
            title={team.name}
            onChangePhoto={canEditTeam ? onPickShield : undefined}
          >
            {shieldBox}
          </ExpandablePhoto>
        ) : (
          <TouchableOpacity onPress={onPickShield} disabled={uploadingShield} activeOpacity={0.85}>
            {shieldBox}
          </TouchableOpacity>
        )}

        <View className="flex-1">
          <Text className="font-display text-2xl text-neutral-on-surface">{team.name}</Text>
          <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">{team.zone}</Text>
        </View>
      </View>

      {/* Rediseño, etapa 5 (spec §8.2): lo importante en dos líneas, el código para
          invitar y las stats a un toque. Antes: chips, tarjeta de código, tres
          baldosas de resumen y la fila de edad, una debajo de la otra. */}
      <Text className="font-ui mt-3 text-[13px] text-neutral-on-surface-variant">
        {[getTeamFormatLabel(team.preferred_format), getTeamCategoryLabel(team.category), myRole ? getTeamRoleLabel(myRole) : null].filter(Boolean).join(' · ')}
      </Text>
      <Text className="font-ui mt-1 text-[13px] text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>
        {`Rating ${team.elo_rating} · ${team.matches_played} PJ · Fair play ${Number(team.fair_play_score).toFixed(0)}${squadAge ? ` · ${String(squadAge.average).replace('.', ',')} años de promedio` : ''}`}
      </Text>

      <View className="mt-4 flex-row items-center justify-between rounded-lg bg-surface-high px-3 py-2.5">
        <Text className="font-ui text-[13px] text-neutral-on-surface-variant">
          Código <Text className="font-displayBlack text-xl tracking-[1px] text-brand-primary">{team.invite_code}</Text>
        </Text>
        <View className="flex-row items-center gap-1">
          <TouchableOpacity onPress={onCopyInviteCode} activeOpacity={0.9} accessibilityLabel="Copiar código" className="h-9 w-9 items-center justify-center rounded-md bg-surface-variant">
            <AppIcon family="material-icons" name="content-copy" size={16} color="#BCCBB9" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onShareInvite} activeOpacity={0.9} accessibilityLabel="Compartir invitación" className="h-9 w-9 items-center justify-center rounded-md bg-surface-variant">
            <AppIcon family="material-community" name="share-variant" size={16} color="#BCCBB9" />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push({ pathname: '/team-stats', params: { teamId: team.id } })}
        className="mt-3 flex-row items-center justify-center gap-2 py-1.5"
      >
        <AppIcon family="material-community" name="chart-timeline-variant" size={15} color="#8CCDFF" />
        <Text className="font-uiBold text-[13px] text-info-secondary">Ver stats del equipo</Text>
      </TouchableOpacity>
    </View>
  );
}
