import { useState } from 'react';
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { MissingPlaceLink } from '@/components/ui/MissingPlaceLink';
import { Logger } from '@/lib/logger';

type ProfileSocialSectionProps = {
  onError: (message: string) => void;
};

type SocialNetwork = {
  key: 'instagram' | 'tiktok' | 'x';
  label: string;
  /** Ionicons: es la única familia de AppIcon que trae los tres logos. */
  icon: string;
  url: string;
};

/**
 * A diferencia del formulario de feedback (ProfileFeedbackCard), acá SÍ va
 * `Linking.openURL` y no `expo-web-browser`: el sistema operativo resuelve el
 * link de Instagram/TikTok hacia la app nativa si está instalada, que es donde
 * el usuario ya tiene sesión iniciada. Un navegador in-app lo dejaría deslogueado
 * frente a un muro de login.
 */
const NETWORKS: SocialNetwork[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: 'logo-instagram',
    url: 'https://www.instagram.com/tornear.app/',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: 'logo-tiktok',
    url: 'https://tiktok.com/@tornear.app',
  },
  {
    // `logo-x` y no `logo-twitter`: es la marca vigente y la que acompaña al
    // dominio x.com del enlace. El pajarito quedaría desalineado con el destino.
    key: 'x',
    label: 'X',
    icon: 'logo-x',
    url: 'https://x.com/tornear_app',
  },
];

export function ProfileSocialSection({ onError }: ProfileSocialSectionProps) {
  const [opening, setOpening] = useState<SocialNetwork['key'] | null>(null);

  async function handlePress(network: SocialNetwork) {
    if (opening) return;
    setOpening(network.key);
    try {
      await Linking.openURL(network.url);
    } catch (error) {
      // `openURL` rechaza cuando no hay ninguna app capaz de abrir el esquema
      // (emuladores sin navegador, perfiles restringidos). Sin este catch el
      // rechazo quedaba como unhandled rejection y el tap no hacía nada visible.
      Logger.error('No se pudo abrir la red social', {
        scope: 'ProfileSocialSection.handlePress',
        network: network.key,
        error,
      });
      onError(`No pudimos abrir ${network.label}. Buscanos como @tornear.app.`);
    } finally {
      setOpening(null);
    }
  }

  return (
    <View className="mt-8">
      <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Comunidad
      </Text>

      <View className="rounded-2xl border border-brand-primary/25 bg-surface-container p-4">
        <Text className="font-uiBold text-sm text-neutral-on-surface">
          Seguinos en nuestras redes
        </Text>
        <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
          Novedades, partidos destacados y todo lo que se viene después de la Beta.
        </Text>

        {/* Ícono arriba y etiqueta abajo. Con dos columnas el ícono entraba en
            línea con el texto, pero a tres "Instagram" no da en pantallas de
            360dp y quedaba cortado. En vertical las celdas son idénticas, el
            ancho del label deja de mandar y entra una cuarta red sin retocar
            nada. */}
        <View className="mt-3 flex-row gap-2">
          {NETWORKS.map((network) => (
            <TouchableOpacity
              key={network.key}
              activeOpacity={0.85}
              disabled={opening !== null}
              onPress={() => void handlePress(network)}
              className="flex-1 items-center gap-1.5 rounded-xl bg-surface-high px-2 py-3"
            >
              {/* Caja cuadrada y fija (32×32) con el glifo a 18: el spinner no
                  mide igual que el glifo y la fila entera saltaba un par de
                  píxeles al alternar.

                  El alto era `h-5` (20px) con el ícono a `size={20}`, es decir
                  exactamente el mismo número. Un glifo de Ionicons no ocupa
                  `size` sino el line-height de su fuente, que es mayor, así que
                  los logos se recortaban arriba y abajo. La caja tiene que ser
                  más grande que el glifo, no igual: 32 contra 18 deja 7px de
                  aire por lado. */}
              <View className="h-8 w-8 items-center justify-center">
                {opening === network.key ? (
                  <ActivityIndicator size="small" color="#53E076" />
                ) : (
                  <AppIcon family="ionicons" name={network.icon} size={18} color="#53E076" />
                )}
              </View>
              <Text className="font-uiBold text-xs text-neutral-on-surface" numberOfLines={1}>
                {network.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pedido de zona o cancha por Instagram (D-75: se cargan a mano). */}
      <View className="mt-3">
        <MissingPlaceLink
          kind="zona"
          surface="profile"
          variant="card"
          title="¿Falta tu ciudad o tu cancha?"
          detail="Escribinos por Instagram y la sumamos."
        />
      </View>
    </View>
  );
}
