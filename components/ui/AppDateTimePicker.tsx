import { useCallback, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';

/**
 * Fecha/hora en es-AR. Es prop de iOS solamente: además de traducir los meses,
 * es lo que hace que el modo `time` salga en 24hs (allá no existe `is24Hour`,
 * el formato se deduce del locale). Android usa el locale del dispositivo y
 * recibe `is24Hour` explícito.
 */
const PICKER_LOCALE = 'es-AR';

/**
 * `themeVariant` es la prop que arregla el bug de legibilidad en iOS y no es
 * opcional: el `UIDatePicker` es una vista nativa que resuelve sus colores
 * contra el trait collection del sistema, NO contra los estilos de la app.
 * torneAR es dark-only por diseño propio, así que en un iPhone en modo claro
 * el picker se pintaba con `labelColor` = negro sobre nuestro fondo #131313
 * (el spinner es transparente) y quedaba ilegible. Con `overrideUserInterfaceStyle
 * = dark` —que es exactamente lo que setea esta prop— `labelColor` resuelve a
 * blanco y el picker queda integrado al tema de la app.
 *
 * `textColor` va igual como refuerzo, pero el que manda es `themeVariant`: la
 * librería descarta `textColor` si todavía no aplicó `displayIOS` (ver el
 * early-return de RNDateTimePickerManager.m para estilos != Wheels), y el
 * orden en que RN aplica las props no está garantizado.
 */
const PICKER_TEXT_COLOR = '#E5E2E1'; // neutral-on-surface
const PICKER_ACCENT_COLOR = '#53E076'; // brand-primary

interface Props {
  visible: boolean;
  /** Valor con el que abre la rueda. Se lee sólo al abrir (ver `draft`). */
  value: Date;
  mode: 'date' | 'time';
  /** El usuario confirmó: en Android al tocar OK, en iOS al tocar «Listo». */
  onConfirm: (date: Date) => void;
  /** Cancelado o descartado. El llamador sólo tiene que cerrar. */
  onCancel: () => void;
  minimumDate?: Date;
  maximumDate?: Date;
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  /** Título del sheet de iOS. En Android no se usa: el diálogo es del sistema. */
  title?: string;
}

/**
 * Picker de fecha/hora de la app. **Todo picker nativo de fecha u hora tiene
 * que pasar por acá**; no importar `@react-native-community/datetimepicker`
 * directo en una pantalla.
 *
 * Existe porque el componente de la librería se comporta de dos maneras
 * incompatibles según la plataforma, y las tres pantallas que lo usaban lo
 * trataban como si fuera uno solo:
 *
 * 1. **Android**: `<DateTimePicker>` no renderiza nada en el árbol (devuelve
 *    `null`) y abre un *diálogo nativo* como ventana aparte. Por eso allá
 *    funcionaba siempre, sin importar dónde estuviera montado ni con qué
 *    layout alrededor.
 *
 * 2. **iOS**: es una **vista inline común**, dimensionada por su intrinsic
 *    content size (`RNDateTimePickerShadowView`), que se acuesta en el layout
 *    en el lugar exacto donde la montaste. No hay modal, no hay overlay, no
 *    hay `show()`. Si la montás como hermana de un `flex-1`, se dibuja fuera
 *    de la pantalla y tocar el campo "no hace nada" — que era el síntoma de
 *    "el picker no abre".
 *
 * Este wrapper unifica las dos en un único contrato *confirmar/cancelar*:
 * en Android delega en el diálogo del sistema, y en iOS presenta la rueda
 * dentro del bottom sheet estándar de la app, con el tema forzado a dark y
 * botones explícitos.
 *
 * El `draft` no es un detalle: en iOS `onValueChange` dispara en **cada tick**
 * de la rueda y nunca emite un evento de "cancelado". Las pantallas cerraban
 * el picker en el primer callback, así que en iOS bastaba rozar la rueda para
 * que se cerrara sola con el primer valor que pasara por el medio. Acá el
 * scroll sólo mueve un borrador local y no se confirma nada hasta «Listo».
 */
export function AppDateTimePicker({
  visible,
  value,
  mode,
  onConfirm,
  onCancel,
  minimumDate,
  maximumDate,
  minuteInterval,
  title,
}: Props) {
  const [draft, setDraft] = useState(value);

  /*
   * Sincronización en el flanco de subida de `visible`, no en un efecto sobre
   * `value`. Varios llamadores pasan `value={fecha ?? new Date()}`: un `Date`
   * nuevo en cada render. Un efecto que dependiera de `value` pisaría el
   * borrador en pleno scroll y la rueda volvería sola al valor inicial.
   *
   * Además `draft` es el `value` que recibe el picker también en Android, así
   * que el timestamp queda estable entre renders: el efecto interno de la
   * librería depende de él y, si cambiara, reabriría el diálogo en loop.
   */
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  const handleValueChange = useCallback((_event: unknown, date?: Date) => {
    if (date) setDraft(date);
  }, []);

  const handleAndroidValueChange = useCallback(
    (_event: unknown, date?: Date) => {
      if (date) onConfirm(date);
    },
    [onConfirm],
  );

  if (!visible) return null;

  // ── Android: diálogo nativo, sin UI propia ──────────────────────────────
  if (Platform.OS !== 'ios') {
    return (
      <DateTimePicker
        value={draft}
        mode={mode}
        display="default"
        is24Hour
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        minuteInterval={minuteInterval}
        onValueChange={handleAndroidValueChange}
        onDismiss={onCancel}
      />
    );
  }

  // ── iOS: la rueda vive dentro de nuestro propio sheet ───────────────────
  return (
    <SafeAreaBottomSheet visible={visible} onClose={onCancel} dismissOnBackdropPress>
      <View className="flex-row items-center justify-between border-b border-neutral-outline-variant/15 px-4 py-3">
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
        >
          <Text className="font-ui text-sm text-neutral-on-surface-variant">Cancelar</Text>
        </TouchableOpacity>

        <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={1}>
          {title ?? (mode === 'date' ? 'Elegí la fecha' : 'Elegí la hora')}
        </Text>

        <TouchableOpacity
          onPress={() => onConfirm(draft)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
        >
          <Text className="font-uiBold text-sm text-brand-primary">Listo</Text>
        </TouchableOpacity>
      </View>

      <View className="items-center justify-center px-4 py-2">
        <DateTimePicker
          value={draft}
          mode={mode}
          display="spinner"
          locale={PICKER_LOCALE}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          minuteInterval={minuteInterval}
          themeVariant="dark"
          textColor={PICKER_TEXT_COLOR}
          accentColor={PICKER_ACCENT_COLOR}
          onValueChange={handleValueChange}
        />
      </View>
    </SafeAreaBottomSheet>
  );
}
