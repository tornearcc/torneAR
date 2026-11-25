import React from 'react';
import { View, Text } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { MATCH_STEPS, type MatchStepNumber } from '@/lib/match-steps';

interface Props {
  /** Paso actual (1-4) o `'done'` si el partido terminó. */
  step: MatchStepNumber | 'done';
  /** Lo que se hace en el paso actual (la sección de siempre: propuesta, check-in, resultado…). */
  children?: React.ReactNode;
  /** Texto chico bajo un paso ya hecho (p. ej. la fecha acordada). */
  doneDetail?: Partial<Record<MatchStepNumber, string>>;
  /** El paso actual en amarillo (falta algo tuyo) o en verde (en marcha). */
  tone?: 'warning' | 'live';
}

/**
 * Un partido, paso a paso (rediseño, etapa 4; spec §8.4): una línea vertical
 * de 4 pasos donde solo el actual está abierto.
 */
export function MatchStepper({ step, children, doneDetail = {}, tone = 'warning' }: Props) {
  const current = step === 'done' ? 5 : step;
  const accent = tone === 'live' ? '#53E076' : '#FABD32';

  return (
    <View className="mt-4" accessibilityLabel={step === 'done' ? 'Partido terminado' : `Paso ${step} de 4: ${MATCH_STEPS[step - 1].title}`}>
      {MATCH_STEPS.map((s, i) => {
        const n = (i + 1) as MatchStepNumber;
        const done = n < current;
        const isCurrent = n === current;
        const last = n === 4;
        return (
          <View key={s.title} className="flex-row gap-3.5">
            <View className="items-center">
              {done ? (
                <View className="h-7 w-7 items-center justify-center rounded-full bg-brand-primary">
                  <AppIcon family="material-community" name="check" size={16} color="#0E0E0E" />
                </View>
              ) : isCurrent ? (
                <View className="h-7 w-7 rounded-full border-[3px] bg-surface-base" style={{ borderColor: accent }} />
              ) : (
                <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-surface-high">
                  <Text className="font-uiBold text-[13px] text-neutral-outline">{n}</Text>
                </View>
              )}
              {!last && <View className={`min-h-[18px] w-0.5 flex-1 ${done ? 'bg-brand-primary' : 'bg-surface-high'}`} />}
            </View>
            <View className="flex-1 pb-[18px] pt-[3px]">
              <Text
                className={`text-[15px] ${isCurrent ? 'font-uiBold' : 'font-ui'} ${done ? 'text-neutral-on-surface' : isCurrent ? '' : 'text-neutral-on-surface-variant'}`}
                style={isCurrent ? { color: accent } : undefined}
              >
                {s.title}
              </Text>
              {done && doneDetail[n] ? <Text className="font-ui mt-0.5 text-xs text-neutral-outline">{doneDetail[n]}</Text> : null}
              {!done && !isCurrent && s.upcoming ? <Text className="font-ui mt-0.5 text-xs text-neutral-outline">{s.upcoming}</Text> : null}
              {isCurrent ? <View className="mt-1">{children}</View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
