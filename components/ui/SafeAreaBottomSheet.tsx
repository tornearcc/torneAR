import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

/** Aire entre el fondo del sheet y el teclado cuando está abierto. */
const KEYBOARD_GAP = 8;

interface Props {
  visible: boolean;
  /** Back de Android, botón de cerrar y —si se habilita— tap en el fondo. */
  onClose: () => void;
  children: ReactNode;
  /**
   * Tope de alto del sheet. Sin esto el contenido crece hasta ocupar la
   * pantalla entera y un `ScrollView` interno, sin altura acotada por la que
   * desbordar, nunca llega a scrollear.
   */
  maxHeight?: DimensionValue;
  /**
   * `true` si el contenido tiene campos de texto.
   *
   * Sólo tiene efecto en iOS: ver el punto 3 del comentario del componente.
   * Los llamadores la pasan sin condicionar por plataforma — la decisión de
   * dónde aplica vive acá, no repetida en cada sheet.
   */
  avoidKeyboard?: boolean;
  /** Cerrar tocando el fondo oscurecido. */
  dismissOnBackdropPress?: boolean;
  animationType?: 'slide' | 'fade' | 'none';
  /**
   * Se renderiza dentro del `<Modal>`, como hermano del sheet. Para los alerts
   * propios: montados en la pantalla padre quedarían **detrás** del modal
   * nativo.
   */
  overlay?: ReactNode;
  /** Clases de la superficie del sheet. Por defecto el contenedor estándar. */
  surfaceClassName?: string;
}

/**
 * Bottom sheet estándar de la app.
 *
 * Nace de la auditoría E2E: varios sheets tenían el padding inferior hardcodeado
 * (`pb-8`, `pb-10`, `pb-12`) y en edge-to-edge el último control quedaba pisado
 * por la barra de navegación — el botón «Confirmar lista», el segundo equipo del
 * selector, el fondo del modal de invitado. Este componente centraliza las tres
 * decisiones que esos sheets tomaban por separado y mal:
 *
 * 1. **Colchón inferior** desde el inset real del dispositivo (`useBottomInset`).
 * 2. **Tope de alto**, para que el scroll interno funcione.
 * 3. **Teclado**: `avoidKeyboard` se aplica **sólo en iOS**, donde un `<Modal>`
 *    nativo no reacciona al teclado salvo que el `KeyboardAvoidingView` viva
 *    adentro de la ventana que ese Modal crea.
 *
 *    En Android no se compensa nada: la Activity ya redimensiona la ventana
 *    con el teclado (`softwareKeyboardLayoutMode` de Expo es `resize` por
 *    defecto y `app.json` no lo cambia), así que el sheet se achica solo y su
 *    ScrollView interno alcanza el campo. Sumar padding acá se apilaba sobre
 *    ese resize y empujaba el sheet el doble del alto del teclado —un hueco
 *    negro entre el sheet y el teclado—, que es el bug que arrastraban
 *    `CancellationModal`, `FeedbackModal` y `ZoneSelectSheet`.
 *
 *    ⚠️ Si algún día se pasa a `softwareKeyboardLayoutMode: "pan"`, Android
 *    deja de redimensionar y hay que volver a compensar: este es el lugar.
 */
export function SafeAreaBottomSheet({
  visible,
  onClose,
  children,
  maxHeight = '88%',
  avoidKeyboard = false,
  dismissOnBackdropPress = false,
  animationType = 'slide',
  overlay,
  surfaceClassName = 'bg-surface-container',
}: Props) {
  const restingInset = useBottomInset();
  const keyboardHeight = useKeyboardHeight();

  // En Android el árbol renderizado queda idéntico al de un sheet sin
  // `avoidKeyboard`: ni KAV ni padding de teclado.
  const avoidsKeyboard = avoidKeyboard && Platform.OS === 'ios';

  // Con el teclado abierto el KAV ya levantó el sheet, así que acá sólo va el
  // aire; en reposo manda el inset real del dispositivo.
  const paddingBottom = avoidsKeyboard && keyboardHeight > 0 ? KEYBOARD_GAP : restingInset;

  const content = (
    <>
      {dismissOnBackdropPress && (
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
        />
      )}
      <View
        className={`overflow-hidden rounded-t-3xl ${surfaceClassName}`}
        style={{ maxHeight, paddingBottom }}
      >
        {children}
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType={animationType} transparent onRequestClose={onClose}>
      {avoidsKeyboard ? (
        <KeyboardAvoidingView className="flex-1 justify-end bg-black/60" behavior="padding">
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View className="flex-1 justify-end bg-black/60">{content}</View>
      )}
      {overlay}
    </Modal>
  );
}
