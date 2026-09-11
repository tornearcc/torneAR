import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { openLegal } from '@/constants/legal';

interface Props {
  checked: boolean;
  onToggle: (next: boolean) => void;
  /** Deshabilita el control mientras hay una operación de auth en vuelo. */
  disabled?: boolean;
}

/**
 * Consentimiento legal obligatorio previo al registro.
 *
 * Los enlaces son `<Text onPress>` anidados y NO `<TouchableOpacity>` sueltos:
 * un Touchable es una caja de layout propia, así que dentro de un `flex-row
 * flex-wrap` el texto se corta en pedazos que saltan de renglón por separado
 * (es lo que hacía el aviso legal anterior de `login.tsx`). Anidando Text el
 * párrafo fluye como una sola oración y el quiebre de línea cae donde tiene
 * que caer, en cualquier ancho de pantalla.
 */
export function LegalConsentCheckbox({ checked, onToggle, disabled = false }: Props) {
  return (
    <View className={`mb-6 flex-row items-start gap-3 ${disabled ? 'opacity-60' : ''}`}>
      {/* La caja es su propio Touchable: tocar el texto NO debe alternar el
          check, porque el texto contiene los dos enlaces y el usuario que va a
          leerlos terminaría aceptando sin querer. */}
      <TouchableOpacity
        onPress={() => onToggle(!checked)}
        disabled={disabled}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel="Acepto los Términos y Condiciones y la Política de Privacidad"
        className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
          checked ? 'border-brand-primary bg-brand-primary' : 'border-neutral-outline bg-transparent'
        }`}
      >
        {checked && <AppIcon family="material-community" name="check-bold" size={16} color="#003914" />}
      </TouchableOpacity>

      <Text className="font-ui flex-1 text-xs leading-5 text-neutral-on-surface-variant">
        He leído y acepto los{' '}
        <Text
          onPress={() => openLegal('terms')}
          suppressHighlighting
          className="font-uiBold text-brand-primary underline"
        >
          Términos y Condiciones
        </Text>
        {' '}y la{' '}
        <Text
          onPress={() => openLegal('privacy')}
          suppressHighlighting
          className="font-uiBold text-brand-primary underline"
        >
          Política de Privacidad
        </Text>
        .
      </Text>
    </View>
  );
}
