import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, TouchableOpacity, TouchableOpacityProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface HeroButtonProps extends TouchableOpacityProps {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
}

/** Verde de marca. */
const ACTIVE_COLORS = ['#53e076', '#1db954'] as const;
/**
 * Gris apagado (`surface-high` → `surface-container`). Sin esto `disabled` sólo
 * bloqueaba el press: el botón seguía viéndose verde y llamando a tocarlo, que
 * es como se leía el botón «Crear cuenta» con el formulario inválido
 * (auditoría E2E, módulo 1.1).
 */
const DISABLED_COLORS = ['#2A2A2A', '#201F1F'] as const;

export function HeroButton({ label, onPress, isLoading, style, ...props }: HeroButtonProps) {
  const scale = useSharedValue(1);
  const isDisabled = isLoading === true || props.disabled === true;

  // Los handlers van antes de `useAnimatedStyle` a propósito: el worklet que
  // recibe ese hook captura `scale`, y el React Compiler trata todo lo que
  // captura un worklet como congelado a partir de ese punto. Declarados antes,
  // las escrituras a `scale.value` quedan fuera de ese rango y `react-hooks/
  // immutability` no las marca. No cambia el comportamiento: son sólo
  // declaraciones, y el orden de llamada a los hooks se mantiene.
  const handlePressIn = () => {
    // Sin rebote cuando está deshabilitado: la animación se lee como "te
    // escuché" y acá justamente no pasa nada.
    if (isDisabled) return;
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        activeOpacity={1}
        {...props}
      >
        <LinearGradient
          colors={isDisabled && !isLoading ? DISABLED_COLORS : ACTIVE_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 12, overflow: 'hidden' }}
        >
          <View className="py-4 items-center justify-center">
            <Text
              className="font-display text-lg uppercase tracking-widest"
              style={{ color: isDisabled && !isLoading ? '#869585' : '#003914' }}
            >
              {isLoading ? 'CARGANDO...' : label}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}
