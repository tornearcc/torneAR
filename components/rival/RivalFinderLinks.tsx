import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { SuggestedRivalsCard } from '@/components/rival/SuggestedRivalsCard';
import type { SuggestedRival } from '@/lib/rival-posts-api';

interface Props {
  /** Sin equipo no hay sugeridos: solo queda la búsqueda por nombre. */
  hasTeam: boolean;
  suggestions: SuggestedRival[];
  loading: boolean;
  onPressRival: (teamId: string) => void;
  onSearch: () => void;
}

/**
 * Buscar › Rival, debajo de «Publicá que buscan rival» (rediseño, etapa 3):
 * los sugeridos para tu equipo y la búsqueda por nombre, que antes vivían en la
 * pestaña Ranking. Debajo siguen los que «Buscan rival ahora».
 */
export function RivalFinderLinks({ hasTeam, suggestions, loading, onPressRival, onSearch }: Props) {
  return (
    <View className="mb-2">
      {hasTeam && <SuggestedRivalsCard rivals={suggestions} loading={loading} onPressRival={onPressRival} onSeeMore={onSearch} />}
      <TouchableOpacity onPress={onSearch} activeOpacity={0.85} className="mb-4 flex-row items-center gap-3 rounded-2xl bg-surface-container px-4 py-3.5">
        <AppIcon family="material-community" name="magnify" size={22} color="#53E076" />
        <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface">Buscar un equipo por nombre</Text>
        <AppIcon family="material-community" name="chevron-right" size={18} color="#869585" />
      </TouchableOpacity>
      <Text className="font-uiBold mb-2.5 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Buscan rival ahora</Text>
    </View>
  );
}
