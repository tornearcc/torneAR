import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, Modal } from 'react-native';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

/** Botón opcional para que el aviso no sea un callejón sin salida (ej.: «Crear equipo»). */
export interface AlertAction {
  label: string;
  onPress: () => void;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  type?: AlertType;
  action?: AlertAction;
}

export default function CustomAlert({ visible, title, message, onClose, type = 'info', action }: CustomAlertProps) {
  useEffect(() => {
    if (!visible) return;
    switch (type) {
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
    }
  }, [visible, type]);

  /*
   * <Modal> y no un View con `absolute inset-0`.
   *
   * En React Native el posicionamiento absoluto es relativo al View PADRE, no a
   * la pantalla. Como este componente se monta donde cada pantalla lo ubique
   * —components/profile/ProfileHeader.tsx lo tenia dentro del contenedor del
   * avatar—, el overlay terminaba cubriendo solo ese recuadro en vez de toda la
   * pantalla, con el mensaje recortado adentro.
   *
   * Un <Modal> se presenta en una ventana propia del sistema: cubre siempre la
   * pantalla completa y queda por encima de cualquier otro contenido, sin
   * importar la profundidad a la que este montado. Tambien resuelve el caso
   * inverso (que quedara DETRAS de un <Modal> nativo ya abierto).
   */
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/80 p-6">
        <TouchableWithoutFeedback onPress={onClose}>
          <View className="absolute inset-0" />
        </TouchableWithoutFeedback>

        <TouchableWithoutFeedback>
          <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-6 shadow-2xl">
            <Text className="font-display mb-2 text-xl text-neutral-on-surface">{title}</Text>
            <Text className="font-ui mb-6 text-base leading-6 text-neutral-on-surface-variant">{message}</Text>

            {action ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    action.onPress();
                  }}
                  activeOpacity={0.9}
                  className="w-full rounded-xl bg-brand-primary py-3 items-center"
                >
                  <Text className="font-display text-base uppercase tracking-wider text-[#003914]">
                    {action.label}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} className="mt-3 w-full py-2 items-center">
                  <Text className="font-ui text-base text-neutral-on-surface-variant">Ahora no</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.9}
                className="w-full rounded-xl bg-brand-primary py-3 items-center"
              >
                <Text className="font-display text-base uppercase tracking-wider text-[#003914]">
                  Aceptar
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
}