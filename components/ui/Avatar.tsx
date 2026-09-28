import { View } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';

interface Props {
  /** URL ya resuelta con `resolveAvatarUrl`; `null` = placeholder. */
  uri: string | null;
  size: number;
  /**
   * Dueño de la foto. Con `expandable`, tocarla abre el visor, que lo usa para
   * el chequeo de bloqueo y para "Denunciar".
   */
  profileId?: string;
  /** Nombre del jugador: título del visor y etiqueta de accesibilidad. */
  name?: string;
  expandable?: boolean;
  /** Sólo en la foto propia del perfil: el visor ofrece "Cambiar foto". */
  onChangePhoto?: () => void;
  /** Fondo del círculo detrás de la foto o del ícono. */
  backgroundClassName?: string;
}

/**
 * Foto de perfil circular. Reemplaza los avatares que cada pantalla armaba a
 * mano, con tamaños, fondos y componentes de imagen distintos (algunos con el
 * `Image` de RN, sin caché en disco).
 *
 * Usa `expo-image`, que cachea en disco: la foto que se ve chica en una lista
 * es la misma URL que abre el visor, así que la versión grande sale del caché.
 */
export function Avatar({
  uri,
  size,
  profileId,
  name,
  expandable = false,
  onChangePhoto,
  backgroundClassName = 'bg-surface-high',
}: Props) {
  const circle = (
    <View
      className={`items-center justify-center overflow-hidden rounded-full ${backgroundClassName}`}
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          accessibilityLabel={name ? `Foto de ${name}` : undefined}
        />
      ) : (
        <AppIcon family="material-community" name="account" size={Math.round(size * 0.45)} color="#869585" />
      )}
    </View>
  );

  if (!expandable || !profileId) return circle;

  return (
    <ExpandablePhoto
      uri={uri}
      subject={{ kind: 'avatar', profileId }}
      title={name}
      onChangePhoto={onChangePhoto}
      hitSlop={size < 36 ? 6 : 0}
    >
      {circle}
    </ExpandablePhoto>
  );
}
