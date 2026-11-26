import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import type { RankingTeamEntry } from './types';

interface Props {
  entries: RankingTeamEntry[];
  /** Nombre del equipo activo, para cuando no aparece en esta tabla. */
  activeTeamName: string | null;
  onPress: (teamId: string) => void;
}

/**
 * Ranking › tu puesto primero (rediseño, etapa 5; spec §8.5). Con la tabla
 * filtrada, el puesto es el de esa tabla. Sin equipo no se muestra nada; con un
 * equipo que todavía no figura, se explica cómo entrar.
 */
export function MyPositionCard({ entries, activeTeamName, onPress }: Props) {
  if (!activeTeamName) return null;
  const mine = entries.find((e) => e.isMyTeam);

  return (
    <TouchableOpacity
      disabled={!mine}
      onPress={() => mine && onPress(mine.teamId)}
      activeOpacity={0.85}
      className="mb-4 flex-row items-center gap-3.5 rounded-2xl border border-brand-primary/35 bg-brand-primary/10 p-4"
    >
      {mine ? (
        <View className="w-16 items-center">
          <Text className="font-displayBlack text-[40px] leading-[40px] text-brand-primary">{`${mine.rankPosition}.º`}</Text>
          <Text className="font-ui text-[11px] text-neutral-on-surface-variant">{`de ${entries.length}`}</Text>
        </View>
      ) : null}
      <View className="flex-1">
        <Text className="font-uiBold text-base text-neutral-on-surface" numberOfLines={1}>
          {mine ? mine.teamName : activeTeamName}
        </Text>
        <Text className="font-ui mt-1 text-[13px] text-neutral-on-surface-variant">
          {mine ? `Rating ${mine.eloRating} · ${mine.matchesPlayed} PJ` : 'Todavía no aparece en esta tabla: jugá tu primer partido por el ranking.'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
