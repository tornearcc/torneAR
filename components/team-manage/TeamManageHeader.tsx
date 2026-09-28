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

      <View className="mt-4 flex-row flex-wrap items-center gap-2">
        <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
          {getTeamCategoryLabel(team.category)}
        </Text>
        <Text className="font-uiBold rounded bg-info-secondary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-info-secondary">
          {getTeamFormatLabel(team.preferred_format)}
        </Text>
        {myRole ? (
          <Text className="font-uiBold rounded bg-surface-high px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">
            {getTeamRoleLabel(myRole)}
          </Text>
        ) : null}
      </View>

      <View className="mt-4 rounded-lg bg-surface-high px-3 py-2.5">
        <Text className="font-display text-[10px] uppercase tracking-widest text-neutral-on-surface-variant">
          Codigo de invitacion
        </Text>
        <View className="mt-1.5 flex-row items-center justify-between">
          <Text className="font-displayBlack text-xl uppercase tracking-[1px] text-brand-primary">
            {team.invite_code}
          </Text>
          <View className="flex-row items-center gap-1">
            <TouchableOpacity
              onPress={onCopyInviteCode}
              activeOpacity={0.9}
              className="h-8 w-8 items-center justify-center rounded-md bg-surface-variant"
            >
              <AppIcon family="material-icons" name="content-copy" size={16} color="#BCCBB9" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onShareInvite}
              activeOpacity={0.9}
              className="h-8 w-8 items-center justify-center rounded-md bg-surface-variant"
            >
              <AppIcon family="material-community" name="share-variant" size={16} color="#BCCBB9" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View className="mt-4 rounded-xl bg-surface-low">
        <Text className="font-display mb-3 text-xs uppercase tracking-wider text-neutral-on-surface-variant">
          Resumen
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1 rounded-lg bg-surface-high px-3 py-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Rating</Text>
            <Text className="font-display mt-1 text-xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
              {team.elo_rating}
            </Text>
          </View>
          <View className="flex-1 rounded-lg bg-surface-high px-3 py-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Partidos</Text>
            <Text className="font-display mt-1 text-xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
              {team.matches_played}
            </Text>
          </View>
          <View className="flex-1 rounded-lg bg-surface-high px-3 py-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Fair Play</Text>
            <Text className="font-display mt-1 text-xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
              {Number(team.fair_play_score).toFixed(1)}
            </Text>
          </View>
        </View>

        {/* Promedio de edad del plantel. Fila propia y no una cuarta baldosa:
            con 4 en la misma fila el número queda con menos ancho que sus
            dígitos y el label se corta. */}
        <View className="mt-3 flex-row items-center justify-between rounded-lg bg-surface-high px-3 py-3">
          <View className="flex-1 pr-3">
            <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Promedio de edad
            </Text>
            {squadAge && squadAge.counted < members.length && (
              <Text className="font-ui mt-0.5 text-[10px] text-neutral-outline">
                sobre {squadAge.counted} de {members.length} jugadores con fecha cargada
              </Text>
            )}
          </View>
          <Text
            className="font-display text-xl text-neutral-on-surface"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {squadAge ? `${squadAge.average} años` : '—'}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push({ pathname: '/team-stats', params: { teamId: team.id } })}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-surface-high py-2.5"
        >
          <AppIcon family="material-community" name="chart-timeline-variant" size={15} color="#8CCDFF" />
          <Text className="font-display text-[10px] uppercase tracking-wider text-info-secondary">Ver stats detalladas</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
