import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './ui/AppIcon';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { wordmarkWidthFor } from '@/constants/brand';

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
};

/**
 * Aire entre la barra de estado del sistema y los íconos del header.
 *
 * Se suma al inset real en vez de reemplazarlo: `insets.top` es exactamente lo
 * que ocupa el sistema (24 en Android sin notch, ~59 con Dynamic Island), así
 * que solo evita la superposición — sin este extra los íconos quedan pegados al
 * borde de la hora y la batería, que es lo que se reportó en el testing.
 */
const HEADER_BREATHING_ROOM = 12;

/**
 * Altura óptica del wordmark: ahora es la altura del logo, no la de su lienzo.
 *
 * Con el asset sin recortar, `LOGO_HEIGHT = 40` pintaba una caja de 40 px de la
 * que el logo ocupaba 33,4 (605/725) y el resto era aire transparente — de ahí
 * que no alineara. 34 conserva ese tamaño visible y elimina el aire, así que el
 * header no cambia de peso óptico: lo único que se va es el padding fantasma.
 *
 * El ancho sale del ratio real del asset (`constants/brand.ts`) y no de un
 * literal: es el mismo wordmark que usa `MatchShareCard`, y tener el ratio
 * escrito dos veces fue lo que dejó una de las dos copias desactualizada.
 */
const LOGO_HEIGHT = 45;
const LOGO_WIDTH = wordmarkWidthFor(LOGO_HEIGHT);

export function GlobalHeader({ onNotificationPress, notificationCount }: GlobalHeaderProps) {
  const insets = useSafeAreaInsets();
  const { unreadNotificationCount } = useAuth();

  const resolvedNotificationCount = notificationCount ?? unreadNotificationCount;
  const handleNotificationPress = onNotificationPress ?? (() => router.push('/notifications'));

  return (
    /**
     * `pt-12` fijo (48 px) era el bug: el inset real va de 24 a ~62 según el
     * dispositivo, así que en unos equipos sobraba y en otros los íconos se
     * metían debajo de la barra de estado.
     *
     * El fondo pasa a `surface-container` (más claro que el `surface-base` de
     * las pantallas) con borde inferior: es lo que despega al header del fondo.
     * De paso se va el `backdrop-blur-md`, que en React Native no hace nada —
     * NativeWind no lo traduce a ningún efecto nativo.
     */
    <View
      className="relative z-50 flex-row items-center justify-between border-b border-neutral-outline/15 bg-surface-container px-5 pb-2 shadow-ambient-sm"
      style={{ paddingTop: insets.top + HEADER_BREATHING_ROOM }}
    >
      {/* Logo TorneAR */}
      <Image
        source={require('@/assets/new-images/TorneAR_Logo_Nombre_1.png')}
        contentFit="contain"
        style={{ height: LOGO_HEIGHT, width: LOGO_WIDTH }}
      />

      {/* Rediseño (pendiente del 25/11): el selector de equipo salió del header.
          Se cambia desde Perfil › Mis equipos («Usar este») y desde Partidos. */}

      {/* gap-6 (24px) y no gap-4: con hitSlop de 12 por lado, 16px de separacion
          hacia que las areas tactiles de dos iconos vecinos se solaparan y el tap
          en la banda intermedia disparara el handler equivocado.

          Los iconos pasaron de 20/21 a 26px, asi que el hitSlop baja de 12 a 8:
          24px de gap menos 8+8 de expansion deja 8px de aire entre areas
          tactiles. Con el hitSlop viejo (12+12 = 24) volvian a tocarse justo y
          se reintroducia aquel bug. El area tactil total por icono queda en
          26+16 = 42px, arriba del minimo de 44 recomendado contando el padding
          vertical del header. */}
      <View className="flex-row items-center gap-6">
        {/* Rediseño, etapa 5: chats y desafíos salieron del header (Perfil › Mensajes y
            el badge de la pestaña Partidos). Queda la campanita. */}
        {/* Notification Bell */}
        <TouchableOpacity
          onPress={handleNotificationPress}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="relative"
        >
          <AppIcon family="material-community" name="bell" size={26} />
          {resolvedNotificationCount > 0 && (
            <View className="absolute -right-1 -top-1 h-[18px] w-[18px] items-center justify-center rounded-full bg-brand-primary">
              <Text className="font-uiBold text-[10px] text-[#003914]" style={{ fontVariant: ['tabular-nums'] }}>
                {resolvedNotificationCount > 9 ? '9+' : resolvedNotificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}