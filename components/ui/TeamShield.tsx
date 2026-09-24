import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { getInitials } from '@/lib/market-utils';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';

interface Props {
  shieldUrl: string | null;
  size?: number;
  isMyTeam?: boolean;
  /**
   * Nombre del equipo. Si se pasa, el fallback son las **iniciales** en vez del
   * escudo genérico: en una lista de equipos propios el ícono genérico se
   * repite idéntico en cada fila y no distingue a ninguno. Donde el equipo ya
   * está identificado por su nombre al lado (tarjetas de partido, hero), el
   * ícono genérico alcanza y se omite esta prop.
   */
  name?: string;
  /** Con `expandable`, tocar el escudo lo abre en el visor (y permite denunciarlo). */
  teamId?: string;
  expandable?: boolean;
}

export function TeamShield({ shieldUrl, size = 48, isMyTeam = false, name, teamId, expandable = false }: Props) {
  const shield = <ShieldCircle shieldUrl={shieldUrl} size={size} isMyTeam={isMyTeam} name={name} />;
  if (!expandable || !teamId) return shield;

  return (
    <ExpandablePhoto
      uri={shieldUrl}
      subject={{ kind: 'shield', teamId }}
      title={name}
      hitSlop={size < 36 ? 6 : 0}
    >
      {shield}
    </ExpandablePhoto>
  );
}

function ShieldCircle({ shieldUrl, size, isMyTeam, name }: Required<Pick<Props, 'size' | 'isMyTeam'>> & Pick<Props, 'shieldUrl' | 'name'>) {
  const borderClass = isMyTeam
    ? 'border-2 border-brand-primary/40'
    : 'border border-neutral-outline/20';
  const initialsClass = isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface-variant';

  return (
    <View
      className={`items-center justify-center rounded-full bg-surface-high ${borderClass}`}
      style={{ width: size, height: size }}
    >
      {shieldUrl ? (
        <Image
          source={{ uri: shieldUrl }}
          style={{ width: size * 0.65, height: size * 0.65 }}
          contentFit="contain"
        />
      ) : name ? (
        <Text className={`font-uiBold ${initialsClass}`} style={{ fontSize: size * 0.36 }}>
          {getInitials(name)}
        </Text>
      ) : (
        <AppIcon
          family="material-community"
          name="shield"
          size={size * 0.55}
          color={isMyTeam ? '#53E076' : '#869585'}
        />
      )}
    </View>
  );
}
