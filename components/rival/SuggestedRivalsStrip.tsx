import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { TeamShield } from '@/components/ui/TeamShield';
import type { SuggestedRival } from '@/lib/rival-posts-api';
import { formatDistanceKm } from '@/lib/rival-posts-utils';

interface Props {
  rivals: SuggestedRival[];
  loading: boolean;
  teamName: string | null;
  onPress: (teamId: string) => void;
}

/** Motivos para la tarjeta: la distancia primero, sin el de «Busca rival» (va como etiqueta). */
export function rivalDetailLines(rival: SuggestedRival, max = 3): string[] {
  const distance = formatDistanceKm(rival.distanceKm);
  const others = rival.reasons.filter((reason) => !reason.startsWith('Busca rival'));
  return [distance, ...others].filter((line): line is string => Boolean(line)).slice(0, max);
}

/** Ranking › Buscar rival: tira horizontal «Sugeridos para vos». */
export function SuggestedRivalsStrip({ rivals, loading, teamName, onPress }: Props) {
  if (!loading && rivals.length === 0) return null;

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="font-displayBlack text-xl uppercase text-neutral-on-surface">Sugeridos para vos</Text>
        {teamName ? (
          <Text className="font-ui text-[11px] text-neutral-outline" numberOfLines={1}>
            para {teamName}
          </Text>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <View key={i} className="h-[150px] w-[150px] rounded-2xl bg-surface-container" />
            ))
          : rivals.map((rival) => (
              <TouchableOpacity
                key={rival.teamId}
                activeOpacity={0.85}
                onPress={() => onPress(rival.teamId)}
                accessibilityRole="button"
                accessibilityLabel={`Ver equipo ${rival.teamName}`}
                className={`w-[150px] gap-2 rounded-2xl bg-surface-container p-3 ${
                  rival.hasRivalPost ? 'border border-brand-primary/45' : ''
                }`}
              >
                <TeamShield shieldUrl={rival.shieldUrl} size={40} name={rival.teamName} />
                <Text className="font-uiBold text-sm leading-4 text-neutral-on-surface" numberOfLines={2}>
                  {rival.teamName}
                </Text>
                {rival.hasRivalPost ? (
                  <View className="self-start rounded-md bg-brand-primary px-1.5 py-0.5">
                    <Text className="font-uiBold text-[10px] text-[#003914]">BUSCA RIVAL</Text>
                  </View>
                ) : null}
                <View>
                  {rivalDetailLines(rival).map((line) => (
                    <Text key={line} className="font-ui text-[11px] leading-4 text-neutral-on-surface-variant">
                      {line}
                    </Text>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
      </ScrollView>
    </View>
  );
}
