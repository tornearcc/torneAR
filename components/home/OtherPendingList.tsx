import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import type { PendingAction } from './types';

interface Props {
  actions: PendingAction[];
  onPress: (action: PendingAction) => void;
}

/**
 * Lo pendiente que no es el próximo paso (rediseño, etapa 1). Nada de lo que
 * mostraba la bandeja de Inicio se esconde: queda acá, chico, debajo del paso.
 */
export function OtherPendingList({ actions, onPress }: Props) {
  if (actions.length === 0) return null;
  return (
    <View className="mb-5">
      <Text className="font-uiBold mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">También tenés pendiente</Text>
      <View className="rounded-2xl bg-surface-container">
        {actions.map((a, i) => (
          <TouchableOpacity
            key={a.type}
            onPress={() => onPress(a)}
            activeOpacity={0.85}
            className={`flex-row items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-surface-high' : ''}`}
          >
            <View className="h-2 w-2 rounded-full bg-warning-tertiary" />
            <Text className="font-ui flex-1 text-sm text-neutral-on-surface">{a.label}</Text>
            <AppIcon family="material-community" name="chevron-right" size={18} color="#869585" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
