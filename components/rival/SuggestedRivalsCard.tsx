import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TeamShield } from '@/components/ui/TeamShield';
import { AppIcon } from '@/components/ui/AppIcon';
import type { SuggestedRival } from '@/lib/rival-posts-api';
import { formatDistanceKm } from '@/lib/rival-posts-utils';

interface Props {
  rivals: SuggestedRival[];
  loading: boolean;
  onPressRival: (teamId: string) => void;
  onSeeMore: () => void;
}

function Tag({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <View className={`rounded-md px-1.5 py-0.5 ${strong ? 'bg-brand-primary' : 'bg-surface-high'}`}>
      <Text className={`text-[10px] ${strong ? 'font-uiBold text-[#003914]' : 'font-ui text-neutral-on-surface-variant'}`}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Inicio: «Rivales para vos». Los 3 primeros de get_suggested_rivals, para que
 * un equipo nuevo tenga a quién desafiar sin ir directo al #1 del ranking.
 */
export function SuggestedRivalsCard({ rivals, loading, onPressRival, onSeeMore }: Props) {
  if (!loading && rivals.length === 0) return null;

  return (
    <View className="mb-5 rounded-2xl bg-surface-container p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-displayBlack text-xl uppercase text-neutral-on-surface">Sugeridos para tu equipo</Text>
        <TouchableOpacity onPress={onSeeMore} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text className="font-uiBold text-xs text-brand-primary">Ver más</Text>
        </TouchableOpacity>
      </View>
      <Text className="mb-3 font-ui text-xs text-neutral-on-surface-variant">
        Cerca, de tu nivel y con ganas de jugar.
      </Text>

      <View className="gap-2">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <View key={i} className="h-[62px] rounded-xl bg-surface-low" />)
          : rivals.slice(0, 3).map((rival) => {
              const distance = formatDistanceKm(rival.distanceKm);
              const reason = rival.reasons.find((r) => !r.startsWith('Busca rival'));
              return (
                <TouchableOpacity
                  key={rival.teamId}
                  activeOpacity={0.85}
                  onPress={() => onPressRival(rival.teamId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver equipo ${rival.teamName}`}
                  className="flex-row items-center gap-3 rounded-xl bg-surface-low p-2.5"
                >
                  <TeamShield shieldUrl={rival.shieldUrl} size={42} name={rival.teamName} />
                  <View className="flex-1">
                    <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={1}>
                      {rival.teamName}
                    </Text>
                    <View className="mt-1 flex-row flex-wrap gap-1.5">
                      {rival.hasRivalPost && rival.rivalPostWhen ? (
                        <Tag label={`BUSCA RIVAL · ${rival.rivalPostWhen.split(' · ')[0].toUpperCase()}`} strong />
                      ) : reason ? (
                        <Tag label={reason} />
                      ) : null}
                      {distance ? <Tag label={distance} /> : null}
                    </View>
                  </View>
                  <AppIcon family="material-icons" name="chevron-right" size={20} color="#869585" />
                </TouchableOpacity>
              );
            })}
      </View>
    </View>
  );
}
