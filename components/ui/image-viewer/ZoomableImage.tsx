import { useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Image } from 'expo-image';
import {
  DOUBLE_TAP_SCALE,
  MIN_SCALE,
  backdropOpacity,
  clampPinchScale,
  clampTranslation,
  focalTranslation,
  shouldDismiss,
} from '@/lib/image-viewer';

interface Props {
  uri: string;
  accessibilityLabel: string;
  /** Se llama cuando el usuario desliza la foto para cerrar. */
  onDismiss: () => void;
}

/**
 * Foto a pantalla completa con pinch-zoom, doble tap y deslizar para cerrar.
 *
 * La imagen vive en una caja cuadrada del ancho de la pantalla: avatares y
 * escudos se suben recortados 1:1, y `contentFit="contain"` cubre los escudos
 * viejos que no lo están. La matemática (bordes, punto focal, umbral de
 * cierre) está en lib/image-viewer.ts, con tests.
 *
 * Deslizar para cerrar sólo funciona sin zoom y con un dedo: con zoom, el
 * arrastre mueve la foto; con dos dedos, es un pinch.
 */
export function ZoomableImage({ uri, accessibilityLabel, onDismiss }: Props) {
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const dragY = useSharedValue(0);

  const viewport = { width, height };
  const boxSize = width;

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedScale.value = 1;
    savedTx.value = 0;
    savedTy.value = 0;
  };

  // Deja la imagen dentro de sus bordes después de un pinch o un arrastre.
  const settle = () => {
    'worklet';
    const t = clampTranslation(tx.value, ty.value, scale.value, boxSize, viewport);
    tx.value = withTiming(t.x);
    ty.value = withTiming(t.y);
    savedScale.value = scale.value;
    savedTx.value = t.x;
    savedTy.value = t.y;
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = clampPinchScale(savedScale.value * e.scale);
    })
    .onEnd(() => {
      if (scale.value <= MIN_SCALE) {
        resetZoom();
      } else {
        settle();
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      if (scale.value > MIN_SCALE) {
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      } else if (e.numberOfPointers === 1) {
        dragY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value > MIN_SCALE) {
        settle();
        return;
      }
      if (shouldDismiss(dragY.value, e.velocityY)) {
        scheduleOnRN(onDismiss);
      } else {
        dragY.value = withSpring(0);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd((e, success) => {
      if (!success) return;
      if (scale.value > MIN_SCALE) {
        resetZoom();
        return;
      }
      const t = focalTranslation({ x: e.x, y: e.y }, DOUBLE_TAP_SCALE, boxSize, viewport);
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      tx.value = withTiming(t.x);
      ty.value = withTiming(t.y);
      savedScale.value = DOUBLE_TAP_SCALE;
      savedTx.value = t.x;
      savedTy.value = t.y;
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity(dragY.value) }));
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value + dragY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropStyle]} />
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          {loading && <ActivityIndicator color="#53E076" style={StyleSheet.absoluteFill} />}
          <Animated.View style={[{ width: boxSize, height: boxSize }, imageStyle]}>
            <Image
              source={{ uri }}
              style={{ width: boxSize, height: boxSize }}
              contentFit="contain"
              transition={120}
              accessibilityLabel={accessibilityLabel}
              onLoadEnd={() => setLoading(false)}
            />
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}
