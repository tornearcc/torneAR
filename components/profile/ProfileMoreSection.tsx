import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
  unreadMessages: number;
  onMessages: () => void;
  onCensus: () => void;
  onAmbassador: () => void;
}

function Row({ icon, color, title, badge, first, onPress }: { icon: string; color: string; title: string; badge?: number; first?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} className={`flex-row items-center gap-3 px-4 py-3.5 ${first ? '' : 'border-t border-surface-high'}`}>
      <AppIcon family="material-community" name={icon} size={20} color={color} />
      <Text className="font-ui flex-1 text-[15px] text-neutral-on-surface">{title}</Text>
      {badge && badge > 0 ? (
        <View className="h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand-primary px-1.5">
          <Text className="font-uiBold text-xs text-surface-lowest">{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
      <AppIcon family="material-community" name="chevron-right" size={18} color="#869585" />
    </TouchableOpacity>
  );
}

/**
 * Perfil › Más (rediseño, etapa 5; spec §6, §8.5): los mensajes del Mercado
 * (antes, ícono suelto del header), el censo y el programa de embajadores
 * (antes, una opción de la bienvenida).
 */
export function ProfileMoreSection({ unreadMessages, onMessages, onCensus, onAmbassador }: Props) {
  return (
    <View className="mt-5">
      <Text className="font-uiBold mb-2.5 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Más</Text>
      <View className="rounded-2xl bg-surface-container">
        <Row first icon="message-text-outline" color="#53E076" title="Mensajes" badge={unreadMessages} onPress={onMessages} />
        <Row icon="chart-line" color="#8CCDFF" title="Censo de hinchas" onPress={onCensus} />
        <Row icon="cash-multiple" color="#FABD32" title="Invitá equipos y ganá (embajadores)" onPress={onAmbassador} />
      </View>
    </View>
  );
}
