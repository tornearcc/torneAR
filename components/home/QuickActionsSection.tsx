import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface QuickAction {
  icon: string;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}

interface Props {
  /** Mercado › Buscan rival (P3-19). Antes era «Desafiar rival» → Ranking. */
  onFindRival: () => void;
  onGoToMarket: () => void;
  onManageTeam: () => void;
}

export function QuickActionsSection({ onFindRival, onGoToMarket, onManageTeam }: Props) {
  const actions: QuickAction[] = [
    {
      icon: 'magnify',
      label: 'Buscar\nrival',
      color: '#53E076',
      bg: '#53E07620',
      onPress: onFindRival,
    },
    {
      icon: 'store-search',
      label: 'Buscar\njugador',
      color: '#8CCDFF',
      bg: '#8CCDFF20',
      onPress: onGoToMarket,
    },
    {
      icon: 'shield-account',
      label: 'Mis\nequipos',
      color: '#FABD32',
      bg: '#FABD3220',
      onPress: onManageTeam,
    },
  ];

  return (
    <View className="mb-5">
      <Text className="font-displayBlack mb-3 text-xs uppercase tracking-widest text-neutral-on-surface-variant">
        Acciones rápidas
      </Text>
      <View className="flex-row gap-3">
        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            activeOpacity={0.8}
            onPress={action.onPress}
            className="flex-1 items-center justify-center rounded-2xl bg-surface-container py-4"
          >
            <View
              className="mb-2 h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: action.bg }}
            >
              <AppIcon
                family="material-community"
                name={action.icon}
                size={22}
                color={action.color}
              />
            </View>
            <Text
              className="font-uiBold text-center text-[11px] text-neutral-on-surface"
              numberOfLines={2}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
