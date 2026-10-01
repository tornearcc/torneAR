# PoC — Navegación por swipe entre tabs

> Backlog Post-Lanzamiento · Tarea 5 (opcional / investigación).
> **Decisión (D-42): se difiere hasta que algún usuario lo pida.** Coincide con la
> recomendación de abajo.
> **Estado: NO integrado.** El código de abajo está listo para copiar, pero
> requiere dos dependencias nuevas con código nativo y un cambio en la
> estructura de rutas. Leé «Costos» antes de decidir.

---

## Recomendación

**Elegir `@react-navigation/material-top-tabs` con `tabBarPosition: 'bottom'`**,
no `react-native-pager-view` a pelo.

Las dos opciones terminan usando el mismo motor (`material-top-tabs` está
construido sobre `pager-view`), pero armar el pager a mano significa reimplementar
a mano lo que hoy nos da `<Tabs>` gratis: sincronizar el índice del pager con la
ruta activa de Expo Router, mantener el back de Android, el `tabPress` que
scrollea al tope, el estado de foco que alimenta los `useFocusEffect` de cada
pantalla. `material-top-tabs` ya resuelve todo eso y se integra con Expo Router
por la vía oficial (`withLayoutContext`).

**Pero la recomendación real es diferirlo**, por lo que sigue.

---

## Costos (leer antes de aprobar el ticket)

### 1. Rebuild nativo obligatorio

`react-native-pager-view` tiene código nativo. Instalarlo **no alcanza**: hace
falta un build nuevo del Dev Client (EAS) y, para producción, una release nueva
en las tiendas.

Ya nos pasó exactamente esto con `react-native-view-shot` — ver el comentario
largo en [`lib/share-image.ts`](../lib/share-image.ts): un binario sin el módulo
nativo reventaba al importar el módulo JS y se llevaba puesta la pantalla
entera. Acá el riesgo es peor, porque el módulo estaría en el **layout raíz de
los tabs**: un binario desalineado no rompe una función opcional, rompe la app
completa. Cualquier usuario con una versión vieja instalada queda afuera hasta
que actualice.

### 2. `href: null` deja de existir

Hoy [`app/(tabs)/_layout.tsx`](../app/(tabs)/_layout.tsx) usa:

```tsx
<Tabs.Screen name="profile/settings" options={{ href: null }} />
```

`href: null` es una feature del `<Tabs>` de **Expo Router**, no de React
Navigation. Con `material-top-tabs` vía `withLayoutContext` esa opción no
existe: `app/(tabs)/profile/settings.tsx` pasaría a renderizarse como una sexta
pestaña swipeable, con su propio botón en la barra.

**Hay que mover la pantalla fuera del grupo** — por ejemplo a
`app/profile-settings.tsx`, junto a `profile-stats`, `team-manage` y el resto de
las pantallas de detalle que ya viven ahí. Eso implica actualizar todos los
`router.push('/(tabs)/profile/settings')` de la app y revisar si algún deep link
apunta a esa ruta (`lib/deep-linking.ts` rutea por path crudo, así que un link
viejo dejaría de resolver).

### 3. `tabBarHideOnKeyboard` no existe

`material-top-tabs` no tiene esa opción. Hoy la barra se esconde sola cuando se
abre el teclado; con el cambio quedaría flotando encima del input en las
pantallas con formulario. Se puede reimplementar con un listener de `Keyboard`,
pero es código propio a mantener.

### 4. Conflictos de gesto horizontal

El swipe entre tabs compite con **cualquier scroll horizontal** dentro de una
pantalla: filas de chips de filtro, carruseles, y sobre todo el
`react-native-gesture-handler` de los modales. Hay que auditar pantalla por
pantalla y, donde haga falta, deshabilitar el swipe por ruta
(`options={{ swipeEnabled: false }}`).

### 5. Todas las tabs quedan "vivas"

Un pager mantiene montadas las pantallas vecinas para poder mostrarlas mientras
el dedo arrastra. Con `lazy: true` no se montan hasta la primera visita, pero una
vez montadas no se desmontan. Nuestras pantallas recargan con `useFocusEffect`
(ver el patrón en [`CLAUDE.md`](../CLAUDE.md)), así que el dato no queda viejo —
pero la memoria y las suscripciones de realtime sí se acumulan.

---

## Instalación

```bash
# Desde tornear/
npx expo install @react-navigation/material-top-tabs react-native-pager-view

# Rebuild del Dev Client — sin esto la app no arranca
eas build --profile development --platform android
```

`npx expo install` (y no `npm install`) es lo que fija la versión de
`react-native-pager-view` compatible con Expo 54. `@react-navigation/native` ya
está en `^7.1.8`, así que `material-top-tabs` tiene que resolver a `^7` también:
verificar que no baje a v6, porque **`tabBarPosition: 'bottom'` es de v7** — en
v6 la barra sólo va arriba y habría que escribir un `tabBar` custom entero.

`react-native-reanimated` y `react-native-gesture-handler`, las otras dos peer
deps, ya están instaladas.

---

## `app/(tabs)/_layout.tsx` — versión con swipe

```tsx
import * as Haptics from 'expo-haptics';
import { withLayoutContext } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabNavigationEventMap,
  type MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { Colors } from '@/constants/theme';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { TAB_BAR_CONTENT_HEIGHT } from '@/hooks/useTabBarInset';

/**
 * Puente oficial entre un navigator de React Navigation y el ruteo por archivos
 * de Expo Router. `withLayoutContext` es lo que hace que `<MaterialTopTabs.Screen
 * name="index" />` siga resolviendo contra `app/(tabs)/index.tsx`.
 *
 * Los cuatro genéricos NO son ceremonia: sin ellos, `screenOptions` y
 * `listeners` quedan tipados como `any` y se pierde el chequeo de que
 * `tabBarPosition`, `swipeEnabled`, etc. existan de verdad.
 */
const { Navigator } = createMaterialTopTabNavigator();

export const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const fetchMyTeams = useTeamStore((state) => state.fetchMyTeams);

  // Idéntico al layout actual: punto único de carga de los equipos.
  useEffect(() => {
    if (profile?.id) {
      void fetchMyTeams(profile.id);
    }
  }, [profile?.id, fetchMyTeams]);

  // Idéntico al layout actual: revalidación al volver del segundo plano.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile?.id) {
        void fetchMyTeams(profile.id);
      }
    });

    return () => subscription.remove();
  }, [profile?.id, fetchMyTeams]);

  return (
    <MaterialTopTabs
      // La barra abajo: es lo que hace que un "top tabs" se vea como el bottom
      // tabs que ya tenemos. Requiere @react-navigation/material-top-tabs v7.
      tabBarPosition="bottom"
      // El haptic ya no puede ir por `listeners` de cada Screen (el evento
      // `tabPress` de este navigator no es el mismo que el de bottom-tabs):
      // se centraliza acá para las cinco.
      screenListeners={{ tabPress: () => Haptics.selectionAsync() }}
      screenOptions={{
        // Sin esto se montan las cinco pantallas al arrancar la app: cinco
        // fetch iniciales en paralelo contra Supabase por abrir el home.
        lazy: true,

        tabBarStyle: {
          backgroundColor: '#201F1F', // surface-container
          borderTopColor: 'rgba(134, 149, 133, 0.15)', // neutral-outline / 15
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          // ⚠️ A diferencia de bottom-tabs, material-top-tabs NO suma el safe
          // area inset por su cuenta: sin este paddingBottom los íconos quedan
          // debajo de la gesture bar de Android y del Home Indicator de iOS.
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },

        // El indicador deslizante es la firma visual de Material: se apaga
        // para no delatar que abajo hay un top-tabs disfrazado.
        tabBarIndicatorStyle: { height: 0 },

        tabBarShowIcon: true,
        tabBarActiveTintColor: Colors.dark.tint,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'BarlowCondensed_700Bold',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        // El ripple de Material sobre toda la celda tampoco existe en el
        // bottom-tabs actual.
        tabBarPressColor: 'transparent',
        tabBarItemStyle: { paddingVertical: 0 },
      }}
    >
      {/* ⚠️ El orden de declaración ES el orden del swipe. */}
      <MaterialTopTabs.Screen
        name="index"
        options={{
          title: 'INICIO',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="home-variant-outline" size={focused ? 26 : 24} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="ranking"
        options={{
          title: 'RANKING',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="trophy-outline" size={focused ? 26 : 24} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="matches"
        options={{
          title: 'PARTIDOS',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="soccer" size={focused ? 26 : 24} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="market"
        options={{
          title: 'MERCADO',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="ionicons" name="storefront-outline" size={focused ? 26 : 24} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="profile"
        options={{
          title: 'PERFIL',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="account-outline" size={focused ? 26 : 24} color={color} />
          ),
        }}
      />

      {/* ⚠️ `profile/settings` NO figura acá: `href: null` no existe en este
          navigator. La pantalla TIENE que moverse fuera de `app/(tabs)/` antes
          de aplicar este layout, o va a aparecer como una sexta pestaña. */}
    </MaterialTopTabs>
  );
}
```

---

## Diferencias de comportamiento a validar en QA

| | Hoy (`<Tabs>` de Expo Router) | Con swipe (`material-top-tabs`) |
|---|---|---|
| Barra oculta con teclado | Sí (`tabBarHideOnKeyboard`) | **No** — hay que implementarlo |
| Safe area inferior | La suma la librería | **Manual** (`paddingBottom: insets.bottom`) |
| Pantallas ocultas del tab bar | `href: null` | **No existe** — mover la ruta |
| Barra flotando sobre el contenido | `position: 'absolute'` | Ocupa layout: revisar si sigue haciendo falta el `useTabBarInset()` de cada pantalla |
| Montaje de pantallas | Una por visita, se desmonta | Con `lazy`, una por visita, **no se desmonta** |
| Gestos horizontales internos | Sin conflicto | Conflicto: `swipeEnabled: false` por ruta donde haga falta |

El cuarto punto es el que más código toca: si la barra deja de ser absoluta, el
`paddingBottom` que hoy inyecta [`useTabBarInset`](../hooks/useTabBarInset.ts) en
cada `ScrollView` pasa a sobrar y todas las pantallas quedan con un hueco de
~90px abajo. Se puede conservar el comportamiento actual poniendo
`position: 'absolute'` también en el `tabBarStyle` de arriba — pero entonces hay
que verificar que el pager no le coma los toques a la barra.
