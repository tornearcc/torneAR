import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/AppIcon';
import { ZoomableImage } from './ZoomableImage';

/** Si la foto se puede mostrar: el bloqueo se consulta al abrir. */
export type ViewerAccess = 'checking' | 'allowed' | 'blocked';

export interface ViewerAction {
  label: string;
  icon: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

interface Props {
  visible: boolean;
  uri: string | null;
  title?: string;
  access: ViewerAccess;
  action?: ViewerAction;
  onClose: () => void;
  /** iOS: el modal terminó de cerrarse y ya se puede presentar otro. */
  onDismissed: () => void;
}

/**
 * Capa de presentación del visor. La maneja `ImageViewerProvider`; nadie la
 * monta directamente.
 *
 * `GestureHandlerRootView` va ADENTRO del Modal: en Android un `<Modal>` es
 * otra ventana nativa y los gestos no llegan desde la raíz de la app.
 */
export function ImageViewerModal({ visible, uri, title, access, action, onClose, onDismissed }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {access === 'allowed' && uri ? (
          <ZoomableImage
            key={uri}
            uri={uri}
            accessibilityLabel={title ? `Foto de ${title}` : 'Foto'}
            onDismiss={onClose}
          />
        ) : (
          <View className="flex-1 items-center justify-center bg-black px-8">
            {access === 'checking' ? (
              <ActivityIndicator color="#53E076" />
            ) : (
              <>
                <AppIcon family="material-community" name="eye-off-outline" size={36} color="#869585" />
                <Text className="mt-3 text-center font-uiBold text-base text-neutral-on-surface">
                  Foto no disponible
                </Text>
                <Text className="mt-1 text-center font-ui text-sm text-neutral-on-surface-variant">
                  Hay un bloqueo entre ustedes.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Barra superior: va por encima de la imagen y no participa de los gestos. */}
        <View
          className="absolute left-0 right-0 top-0 flex-row items-center gap-3 px-4"
          style={{ paddingTop: insets.top + 8 }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/50"
          >
            <AppIcon family="material-community" name="close" size={22} color="#E5E2E1" />
          </TouchableOpacity>
          {title ? (
            <Text className="flex-1 font-uiBold text-base text-neutral-on-surface" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>

        {action && access === 'allowed' ? (
          <View
            className="absolute bottom-0 left-0 right-0 items-center"
            style={{ paddingBottom: insets.bottom + 20 }}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={action.onPress}
              accessibilityRole="button"
              className="flex-row items-center gap-2 rounded-full bg-black/60 px-4 py-2.5"
            >
              <AppIcon
                family="material-community"
                name={action.icon}
                size={16}
                color={action.tone === 'danger' ? '#FFB4AB' : '#E5E2E1'}
              />
              <Text
                className={`font-uiBold text-sm ${action.tone === 'danger' ? 'text-danger-error' : 'text-neutral-on-surface'}`}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
