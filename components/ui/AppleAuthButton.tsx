import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

interface AppleAuthButtonProps {
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** `true` en modo registro: cambia el rótulo a «Continuar con Apple». */
  isSignUp?: boolean;
}

/**
 * Altura del botón, en puntos.
 *
 * Igual a la del `GoogleAuthButton` para que las dos opciones se lean como
 * equivalentes: ahí son `py-4` (16 + 16) más ~20 de contenido. La guideline 4.8
 * pide una opción equivalente y el reviewer lo interpreta como "igual de
 * visible", así que una diferencia de altura acá no es un detalle estético.
 * El mínimo que admiten las HIG de Apple son 44.
 */
const BUTTON_HEIGHT = 52;

/**
 * Botón nativo de Sign in with Apple.
 *
 * Envuelve `AppleAuthentication.AppleAuthenticationButton`, que es el
 * `ASAuthorizationAppleIDButton` del sistema, y no un botón propio: las HIG lo
 * exigen y viene ya localizado y accesible. En español rinde «Iniciar sesión
 * con Apple» / «Continuar con Apple» sin que haya que pasar copy.
 *
 * ## Tres cosas que el componente nativo no hace
 *
 * 1. **No se dimensiona solo.** Sin `width` y `height` explícitos en `style` no
 *    aparece en pantalla. De ahí la excepción a la regla de usar sólo
 *    `className`: el alto va como número.
 * 2. **No acepta `backgroundColor` ni `borderRadius` por `style`.** Apple lo
 *    prohíbe; el color se elige con `buttonStyle` y el redondeo con
 *    `cornerRadius`. Los 12 de acá son el `rounded-xl` del botón de Google.
 * 3. **No tiene estado deshabilitado ni de carga.** Se resuelven en el wrapper:
 *    `pointerEvents="none"` corta el toque y el spinner se superpone, porque
 *    reemplazar el botón por otra cosa mientras carga haría saltar el layout.
 *
 * `buttonStyle` es `WHITE` a propósito: la app es dark-only (`surface-base` es
 * #131313) y el botón negro se perdería contra el fondo.
 *
 * Si la plataforma no lo soporta el componente nativo no renderiza nada, así
 * que el llamador tiene que preguntar antes por `isAppleSignInAvailable()`
 * (lib/auth-data.ts) y no pintar el bloque.
 */
export function AppleAuthButton({
  onPress,
  isLoading,
  disabled,
  isSignUp = false,
}: AppleAuthButtonProps) {
  const isDisabled = isLoading || disabled;

  return (
    <View className={`w-full ${isDisabled ? 'opacity-60' : ''}`}>
      <View pointerEvents={isDisabled ? 'none' : 'auto'}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            isSignUp
              ? AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={12}
          onPress={onPress}
          style={{ width: '100%', height: BUTTON_HEIGHT }}
        />
      </View>

      {isLoading && (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator size="small" color="#131313" />
        </View>
      )}
    </View>
  );
}
