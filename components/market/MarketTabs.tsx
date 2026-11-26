import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TabType } from './types';

interface MarketTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TABS: { value: TabType; label: string }[] = [
  // Rediseño, etapa 3 (spec §6-7): qué buscás vos. Rival · Jugadores · Equipo.
  { value: 'RIVALS_LOOKING', label: 'Rival' },
  { value: 'PLAYERS_LOOKING', label: 'Jugadores' },
  { value: 'TEAMS_LOOKING', label: 'Equipo' },
];

export function MarketTabs({ activeTab, onTabChange }: MarketTabsProps) {
  return (
    <View className="flex-row gap-1 p-1 bg-surface-low rounded-xl">
      {TABS.map((tab) => {
        const active = activeTab === tab.value;
        return (
          <TouchableOpacity
            key={tab.value}
            className="flex-1 py-3 items-center rounded-lg"
            style={active ? { backgroundColor: '#53E076' } : undefined}
            onPress={() => onTabChange(tab.value)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text
              className="font-uiBold text-[13px]"
              style={{ color: active ? '#003914' : '#BCCBB9' }}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
