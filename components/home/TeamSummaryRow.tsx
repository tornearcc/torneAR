import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import { getTeamRoleLabel } from '@/lib/team-options';
import type { HomeTeamSnapshot } from './types';

interface Props {
  team: HomeTeamSnapshot;
  onPress: () => void;
}

/** Tu equipo en una línea (rediseño, etapa 1): reemplaza las tarjetas de ranking de Inicio. */
export function TeamSummaryRow({ team, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} className="mb-2.5 flex-row items-center gap-3.5 rounded-2xl bg-surface-container p-4">
      <TeamShield shieldUrl={team.shieldUrl} size={48} name={team.name} isMyTeam />
      <View className="flex-1">
        <Text className="font-uiBold text-base text-neutral-on-surface" numberOfLines={1}>{team.name}</Text>
        <Text className="font-ui mt-0.5 text-[13px] text-neutral-on-surface-variant">
          {`${getTeamRoleLabel(team.role)} · ${team.seasonWins}G ${team.seasonDraws}E ${team.seasonLosses}P`}
        </Text>
      </View>
      <AppIcon family="material-community" name="chevron-right" size={20} color="#869585" />
    </TouchableOpacity>
  );
}
