import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Desmonta el árbol entre tests: sin esto los renders se acumulan y las queries
// por texto encuentran nodos de tests anteriores.
afterEach(() => {
  cleanup();
});

/**
 * Módulos nativos de Expo que no existen en jsdom.
 *
 * Se mockean acá y no en cada test porque son transversales: casi cualquier
 * componente de la app termina importando AppIcon, y varios usan haptics. El
 * objetivo de esta capa es la lógica de estado, no el render nativo.
 */
vi.mock('@expo/vector-icons', () => {
  const stub = () => null;
  return {
    Ionicons: stub,
    MaterialCommunityIcons: stub,
    MaterialIcons: stub,
  };
});

/*
 * El picker de fecha se distribuye como fuente de React Native con tipos Flow,
 * que el parser de Vite no entiende: importarlo tumba la suite entera con
 * "Flow is not supported" antes de correr un solo test.
 *
 * El stub devuelve `null` porque acá no se prueba el calendario nativo —
 * `maximumDate` es una prop que resuelve el sistema operativo, no algo que
 * jsdom pueda verificar. Lo que sí se prueba es el helper que calcula ese tope
 * (`lib/age.test.ts`), que es donde vive la regla de negocio.
 */
vi.mock('@react-native-community/datetimepicker', () => ({
  default: () => null,
}));

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

/*
 * `react-native-safe-area-context` se distribuye con fuentes en sintaxis Flow
 * (`import typeof ...`), que el parser de Vite no entiende: cualquier test que
 * termine importándolo muere con "Unexpected token 'typeof'" antes de correr.
 *
 * Entra en juego desde que `AppDateTimePicker` presenta la rueda de iOS dentro
 * de `SafeAreaBottomSheet`, y el sheet lee el inset real del dispositivo. Los
 * insets son una medición del sistema operativo: en jsdom no hay nada que
 * medir, así que devolver ceros es la respuesta correcta y no una simplificación.
 */
vi.mock('react-native-safe-area-context', async () => {
  const { createElement } = await import('react');
  const zeroInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  const passthrough = ({ children }: { children?: unknown }) =>
    createElement('div', null, children as never);

  return {
    useSafeAreaInsets: () => zeroInsets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    initialWindowMetrics: { insets: zeroInsets, frame: { x: 0, y: 0, width: 0, height: 0 } },
    SafeAreaProvider: passthrough,
    SafeAreaView: passthrough,
  };
});
