import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
  title: string;
  count?: number;
  /**
   * Convierte el encabezado en un control de plegado.
   *
   * Se pasa junto con `expanded`. Sin `onToggle` el encabezado sigue siendo el
   * separador estatico de siempre — que es lo correcto para "Proximos", la
   * seccion accionable: esconderla detras de un tap seria esconder lo unico
   * que el usuario entra a hacer.
   */
  onToggle?: () => void;
  expanded?: boolean;
}

export function MatchSectionHeader({ title, count, onToggle, expanded = true }: Props) {
  const content = (
    <>
      {onToggle && (
        <AppIcon
          family="material-community"
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={18}
          color="#BCCBB9"
        />
      )}
      <Text className="font-uiBold text-xs uppercase tracking-wider text-neutral-on-surface-variant">
        {title}
      </Text>
      {count !== undefined && count > 0 && (
        <View className="rounded-full bg-surface-high px-2 py-0.5">
          <Text className="font-uiBold text-[10px] text-neutral-on-surface-variant">{count}</Text>
        </View>
      )}
      <View className="flex-1 border-t border-neutral-outline/20" />
    </>
  );

  if (!onToggle) {
    return <View className="mb-3 flex-row items-center gap-3">{content}</View>;
  }

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${title}, ${expanded ? 'contraer' : 'expandir'}`}
      // `py-1` + `-my-1`: agranda el area tactil sin mover el separador de
      // sitio, que quedaria desalineado respecto de las secciones estaticas.
      className="mb-3 -my-1 flex-row items-center gap-2 py-1"
    >
      {content}
    </TouchableOpacity>
  );
}
