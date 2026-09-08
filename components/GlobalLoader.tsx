import { useState } from 'react';
import LottieView from 'lottie-react-native';
import { View, Text } from 'react-native';

/**
 * Frases de vestuario que acompañan a la carga.
 *
 * Fuera del componente y no adentro: un array declarado en el cuerpo se
 * reconstruye en cada render. Acá la identidad es estable y el estado de abajo
 * elige una sola frase por montaje.
 */
const LOADER_PHRASES = [
  '¿Potrero quién te conoce?',
  'Los amistosos no existen más.',
  'Demostrá si sos copero.',
  'Sé vos el ídolo, que un juego no te la cuente.',
  'Por la Coca no, ¡por la Copa!',
] as const;

type GlobalLoaderProps = {
  label?: string;
  /**
   * Frase de vestuario debajo del label. Se puede apagar donde el loader
   * aparece en un espacio chico o muy seguido —ahí la frase pasa de guiño a
   * ruido— sin tener que duplicar el componente.
   */
  showPhrase?: boolean;
};

export function GlobalLoader({ label = 'Cargando...', showPhrase = true }: GlobalLoaderProps) {
  // `useState` con inicializador lazy: una frase por montaje. Sortearla en el
  // cuerpo del render la cambiaría en cada render y el texto parpadearía
  // durante toda la carga; el inicializador corre una sola vez.
  const [phrase] = useState(
    () => LOADER_PHRASES[Math.floor(Math.random() * LOADER_PHRASES.length)],
  );

  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-surface-base/95 px-6">
      <View className="h-48 w-48 items-center justify-center">
        <LottieView
          autoPlay
          loop
          style={{ width: '100%', height: '100%' }}
          source={require('../assets/animations/soccer-loader.json')}
        />
      </View>
      <Text className="mt-4 text-sm font-bold uppercase tracking-[0.22em] text-neutral-on-surface-variant">
        {label}
      </Text>
      {showPhrase && (
        <Text className="font-ui mt-3 max-w-[280px] text-center text-sm text-neutral-outline">
          {phrase}
        </Text>
      )}
    </View>
  );
}
