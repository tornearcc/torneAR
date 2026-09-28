import React from 'react';
import { Text, View } from 'react-native';
import { openLegal } from '@/constants/legal';

interface Props {
  /** Texto que antecede a los enlaces. Sin punto final: lo agrega el componente. */
  lead?: string;
}

/**
 * Aviso legal informativo, sin checkbox.
 *
 * Va en el modo «Iniciar sesión» del login, donde el checkbox de
 * `LegalConsentCheckbox` no corresponde: quien ya tiene cuenta aceptó al
 * crearla, y volver a exigirle un tilde para entrar es fricción sin
 * contrapartida (los cambios de versión los atrapa `LegalVersionGate`, que
 * bloquea la app hasta re-aceptar).
 *
 * Existe igual porque los botones de Google y Apple dan de alta la cuenta en el
 * primer consentimiento: alguien sin cuenta puede registrarse desde esta
 * pestaña, y la pantalla tiene que ofrecerle los documentos a la vista. El
 * consentimiento explícito de esas altas lo sigue exigiendo el onboarding
 * (`mustAcceptLegal` en app/onboarding.tsx), que no deja completar el perfil
 * sin tildar — este aviso no lo reemplaza, lo antecede.
 *
 * Los enlaces son `<Text onPress>` anidados y no `<TouchableOpacity>`, por el
 * mismo motivo que documenta `LegalConsentCheckbox`: un Touchable es una caja
 * de layout propia y parte la oración en pedazos que saltan de renglón por
 * separado.
 */
export function LegalLinksNotice({ lead = 'Al continuar, aceptás los' }: Props) {
  return (
    <View className="mb-6 px-2">
      <Text className="font-ui text-center text-xs leading-5 text-neutral-on-surface-variant">
        {lead}{' '}
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
