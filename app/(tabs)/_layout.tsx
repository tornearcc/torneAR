import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Colors } from '@/constants/theme';
import { AppIcon } from '@/components/ui/AppIcon';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { TAB_BAR_CONTENT_HEIGHT } from '@/hooks/useTabBarInset';
import { useReceivedChallengesCount } from '@/hooks/useBadgeCounts';

/**
 * Alto del CONTENIDO de la barra, sin el área segura.
 *
 * El default de React Navigation es 49 (`TABBAR_HEIGHT_UIKIT`). Se sube a 62
 * para que entren los íconos de 26px con su label sin apretarse, en
 * correlación con el header, que también creció.
 *
 * ⚠️ Este número se suma a `insets.bottom` a mano, y NO es opcional hacerlo:
 * `getTabBarHeight()` de la librería devuelve `49 + insets.bottom`, pero si
 * `tabBarStyle` trae un `height` numérico lo usa TAL CUAL y descarta el inset.
 * O sea que un `height: 62` a secas dejaría los íconos pisados por la gesture
 * bar de Android y por el Home Indicator de iOS — exactamente el bug que este
 * cambio viene a evitar.
 *
 * Se define en `hooks/useTabBarInset` y no acá para que las pantallas que
 * scrollean por debajo de la barra lean el MISMO número en vez de replicarlo a
 * ojo, que es de donde salían los `paddingBottom: 114` / `120`. Este archivo es
 * una ruta de expo-router: no debe exportar nada más que el componente.
 */

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const fetchMyTeams = useTeamStore((state) => state.fetchMyTeams);
  // Desafíos recibidos: badge de Partidos (rediseño, etapa 5; antes, ícono de espadas en el header).
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const receivedChallenges = useReceivedChallengesCount(activeTeamId);

  // Punto unico de carga de los equipos del usuario. Este layout monta una sola
  // vez para todo el grupo de tabs, asi que `myTeams` se pide una vez por sesion
  // (o cuando cambia el perfil) en lugar de una vez por cada tab visitada.
  useEffect(() => {
    if (profile?.id) {
      void fetchMyTeams(profile.id);
    }
  }, [profile?.id, fetchMyTeams]);

  /*
   * Revalidacion al volver del segundo plano.
   *
   * Justamente porque este layout monta una sola vez, una expulsion ocurrida
   * mientras la app estaba abierta no llegaba nunca: el equipo seguia en el
   * selector hasta matar la app y reabrirla (auditoria E2E, modulo 4.3).
   *
   * Revalidar seguido es barato POR DISENO: `fetchMyTeams` compara el resultado
   * campo a campo y, si nada cambio, conserva el array anterior y no publica
   * estado nuevo. Sin esa comparacion esto dispararia recargas en cascada en
   * todo consumidor que tenga `myTeams` en sus dependencias.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile?.id) {
        void fetchMyTeams(profile.id);
      }
    });

    return () => subscription.remove();
  }, [profile?.id, fetchMyTeams]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /*
         * Mismo esquema que el GlobalHeader (surface-container + borde sutil),
         * para que las dos barras se lean como un par.
         *
         * Se eliminó el `tabBarBackground` con `<BlurView>`: el
         * `backgroundColor` de acá es OPACO (alpha 1, pese a que el comentario
         * viejo decía "at 80%"), así que el blur quedaba tapado y no se veía
         * nada — pagábamos un blur a pantalla completa por frame para nada.
         * Mismo caso que el `backdrop-blur-md` muerto que sacamos del header.
         *
         * `paddingBottom` NO se declara a propósito: la librería ya le pone
         * `insets.bottom` y pisarlo acá sólo abre la puerta a duplicarlo.
         */
        tabBarStyle: {
          position: 'absolute',
          // Rediseño (spec §10): fondo más oscuro que las tarjetas, para que la barra no compita con ellas.
          backgroundColor: '#0E0E0E', // surface-lowest
          borderTopColor: 'rgba(134, 149, 133, 0.15)', // neutral-outline / 15
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.dark.tint,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: {
          // 11 y no 10: con íconos de 26px, el label de 10 quedaba desbalanceado.
          // Rediseño: etiquetas en tipo oración (Inter), como el resto de la app.
          fontSize: 11,
          fontFamily: 'Inter_500Medium',
          letterSpacing: 0.5,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="home-variant-outline" size={focused ? 26 : 24} color={color} />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Partidos',
          tabBarBadge: receivedChallenges > 0 ? (receivedChallenges > 9 ? '9+' : receivedChallenges) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FABD32', color: '#0E0E0E', fontSize: 11 },
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="calendar-month-outline" size={focused ? 26 : 24} color={color} />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      {/*
        Ranking va en el CENTRO y resaltado (P3-25, idea de Juani, 25/11/2026): es
        lo que diferencia a TorneAR, y el botón del medio en verde lo comunica
        como el botón principal de un juego. El label queda siempre en verde.
      */}
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'Ranking',
          tabBarActiveTintColor: Colors.dark.tint,
          tabBarInactiveTintColor: Colors.dark.tint,
          tabBarIcon: ({ focused }) => (
            <View
              className={`items-center justify-center rounded-full bg-brand-primary ${focused ? 'shadow-glow-primary' : ''}`}
              style={{ width: 46, height: 46, marginTop: -14 }}
            >
              <AppIcon family="material-community" name="trophy" size={focused ? 24 : 22} color="#0E0E0E" />
            </View>
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Buscar',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="magnify" size={focused ? 26 : 24} color={color} />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <AppIcon family="material-community" name="account-outline" size={focused ? 26 : 24} color={color} />
          ),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="profile/settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}