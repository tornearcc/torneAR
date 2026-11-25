import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  step: 1 | 2 | 3;
  /** 0 a 1: cuánto del plantel está completo (solo pinta el paso 1). */
  teamProgress: number;
}

const STEPS = ['1 · Tu equipo', '2 · Un rival', '3 · El partido suma'] as const;

/**
 * Barra de 3 pasos de Inicio (rediseño, etapa 1): explica de qué se trata la
 * app sin tutorial y muestra dónde está la persona.
 */
export function JourneyBar({ step, teamProgress }: Props) {
  return (
    <View className="mb-5 flex-row gap-1.5" accessibilityLabel={`Paso ${step} de 3: ${STEPS[step - 1]}`}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const fill = n < step ? 1 : n === step ? (n === 1 ? Math.max(teamProgress, 0.08) : 0.5) : 0;
        const active = n <= step;
        return (
          <View key={label} className="flex-1 gap-1.5">
            <View className="h-1 overflow-hidden rounded-full bg-surface-high">
              <View className="h-1 rounded-full bg-brand-primary" style={{ width: `${Math.round(fill * 100)}%` }} />
            </View>
            <Text className={`text-xs ${active ? 'font-uiBold text-brand-primary' : 'font-ui text-neutral-outline'}`}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}
