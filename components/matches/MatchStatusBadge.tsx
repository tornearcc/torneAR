import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];

interface StatusConfig {
  label: string;
  className: string;
  textClassName: string;
}

const CONFIG: Record<MatchStatus, StatusConfig> = {
  PENDIENTE:  { label: 'Falta acordar día', className: 'bg-warning-tertiary/20', textClassName: 'text-warning-tertiary' },
  CONFIRMADO: { label: 'Confirmado', className: 'bg-info-secondary/20',   textClassName: 'text-info-secondary' },
  EN_VIVO:    { label: 'En vivo',    className: 'bg-brand-primary/15',     textClassName: 'text-brand-primary' },
  FINALIZADO: { label: 'Terminado',  className: 'bg-neutral-outline/20',   textClassName: 'text-neutral-on-surface-variant' },
  EN_DISPUTA: { label: 'En disputa', className: 'bg-warning-tertiary/20',  textClassName: 'text-warning-tertiary' },
  WO_A:       { label: 'W.O.',       className: 'bg-neutral-outline/20',   textClassName: 'text-neutral-on-surface-variant' },
  WO_B:       { label: 'W.O.',       className: 'bg-neutral-outline/20',   textClassName: 'text-neutral-on-surface-variant' },
  CANCELADO:  { label: 'Cancelado',  className: 'bg-danger-error/10',      textClassName: 'text-danger-error/70' },
};

/** Pulsing dot shown only for EN_VIVO matches. */
function LiveDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.2, { duration: 600 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width: 5, height: 5, borderRadius: 3, backgroundColor: '#53E076', marginRight: 4 },
        animatedStyle,
      ]}
    />
  );
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const cfg = CONFIG[status];
  return (
    <View className={`flex-row items-center rounded px-2 py-0.5 ${cfg.className}`}>
      {status === 'EN_VIVO' && <LiveDot />}
      <Text className={`font-uiBold text-[11px] ${cfg.textClassName}`}>
        {cfg.label}
      </Text>
    </View>
  );
}
