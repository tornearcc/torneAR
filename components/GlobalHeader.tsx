import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './ui/AppIcon';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTeamStore } from '@/stores/teamStore';
import { ActiveTeamSelector } from './ui/ActiveTeamSelector';
import { fetchUnreadChatCount } from '@/lib/chat-api';
import { fetchChallengesInbox } from '@/lib/challenge-actions'; // NUEVO
import { Logger } from '@/lib/logger';
import { wordmarkWidthFor } from '@/constants/brand';

type GlobalHeaderProps = {
  onNotificationPress?: () => void;
  notificationCount?: number;
  isMarketTab?: boolean;
  isRankingTab?: boolean; // NUEVO
};

/**
 * Aire entre la barra de estado del sistema y los íconos del header.
 *
 * Se suma al inset real en vez de reemplazarlo: `insets.top` es exactamente lo
 * que ocupa el sistema (24 en Android sin notch, ~59 con Dynamic Island), así
 * que solo evita la superposición — sin este extra los íconos quedan pegados al
 * borde de la hora y la batería, que es lo que se reportó en el testing.
 */
const HEADER_BREATHING_ROOM = 12;

/**
 * Altura óptica del wordmark: ahora es la altura del logo, no la de su lienzo.
 *
 * Con el asset sin recortar, `LOGO_HEIGHT = 40` pintaba una caja de 40 px de la
 * que el logo ocupaba 33,4 (605/725) y el resto era aire transparente — de ahí
 * que no alineara. 34 conserva ese tamaño visible y elimina el aire, así que el
 * header no cambia de peso óptico: lo único que se va es el padding fantasma.
 *
 * El ancho sale del ratio real del asset (`constants/brand.ts`) y no de un
 * literal: es el mismo wordmark que usa `MatchShareCard`, y tener el ratio
 * escrito dos veces fue lo que dejó una de las dos copias desactualizada.
 */
const LOGO_HEIGHT = 45;
const LOGO_WIDTH = wordmarkWidthFor(LOGO_HEIGHT);

export function GlobalHeader({ onNotificationPress, notificationCount, isMarketTab, isRankingTab }: GlobalHeaderProps) {
  const insets = useSafeAreaInsets();
  const { profile, unreadNotificationCount } = useAuth();
  // Selector puntual: el header solo necesita el equipo activo para el badge de
  // desafios. Suscribirse al store entero lo re-renderizaba ante cualquier cambio.
  // La carga de `myTeams` vive en app/(tabs)/_layout.tsx — no aca: GlobalHeader se
  // monta en las 5 tabs y disparaba un fetch por tab, y cada uno reemplazaba
  // `myTeams` por un array nuevo, invalidando los useCallback que lo tenian en deps.
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  // Se extrae el id antes de los callbacks: con `profile?.id` directo en el
  // array de deps, el React Compiler infiere `profile` entero como dependencia
  // (menos específica que la declarada) y desactiva la memoización del
  // componente. Con la variable, lo inferido y lo declarado coinciden.
  const profileId = profile?.id ?? null;
  const [chatCount, setChatCount] = useState(0);
  const [challengeCount, setChallengeCount] = useState(0); // NUEVO

  // -- Lógica de Mercado --
  // Cadena de promesas y no `async`/`await`: esta función la llama un efecto, y
  // todo lo que un `async` hace antes de suspenderse cuenta como setState
  // síncrono dentro de él. Dentro de `.then`/`.catch`, no.
  const loadChatCount = useCallback(() => {
    if (!profileId) return;
    fetchUnreadChatCount()
      .then(setChatCount)
      .catch((error: unknown) => {
        // Mismo criterio que las notificaciones: ocultamos el badge y seguimos.
        Logger.warn('No se pudo contar los chats sin leer; el badge queda en 0', {
          scope: 'GlobalHeader.loadChatCount',
          profileId,
          error,
        });
        setChatCount(0);
      });
  }, [profileId]);

  useEffect(() => {
    if (!isMarketTab || !profileId) return;
    loadChatCount();
    const channel = supabase
      .channel(`market-messages-badge-${profileId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => loadChatCount()
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [isMarketTab, profileId, loadChatCount]);

  // -- NUEVO: Lógica de Ranking (Desafíos) --
  // Mismo motivo que `loadChatCount` para la cadena de promesas.
  const loadChallengeCount = useCallback(() => {
    if (!activeTeamId) return;
    fetchChallengesInbox(activeTeamId)
      .then((inbox) => {
        setChallengeCount(inbox.filter(c => c.direction === 'RECIBIDO' && c.status === 'ENVIADA').length);
      })
      .catch((error: unknown) => {
        Logger.warn('No se pudo contar los desafíos recibidos; el badge queda en 0', {
          scope: 'GlobalHeader.loadChallengeCount',
          activeTeamId,
          error,
        });
        setChallengeCount(0);
      });
  }, [activeTeamId]);

  useEffect(() => {
    if (!isRankingTab || !activeTeamId) return;
    loadChallengeCount();

    // Escuchamos cambios en los desafíos dirigidos a nuestro equipo
    const channel = supabase
      .channel(`challenges-badge-${activeTeamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenges', filter: `to_team_id=eq.${activeTeamId}` },
        () => loadChallengeCount()
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [isRankingTab, activeTeamId, loadChallengeCount]);

  const resolvedNotificationCount = notificationCount ?? unreadNotificationCount;
  const handleNotificationPress = onNotificationPress ?? (() => router.push('/notifications'));

  return (
    /**
     * `pt-12` fijo (48 px) era el bug: el inset real va de 24 a ~62 según el
     * dispositivo, así que en unos equipos sobraba y en otros los íconos se
     * metían debajo de la barra de estado.
     *
     * El fondo pasa a `surface-container` (más claro que el `surface-base` de
     * las pantallas) con borde inferior: es lo que despega al header del fondo.
     * De paso se va el `backdrop-blur-md`, que en React Native no hace nada —
     * NativeWind no lo traduce a ningún efecto nativo.
     */
    <View
      className="relative z-50 flex-row items-center justify-between border-b border-neutral-outline/15 bg-surface-container px-5 pb-2 shadow-ambient-sm"
      style={{ paddingTop: insets.top + HEADER_BREATHING_ROOM }}
    >
      {/* Logo TorneAR */}
      <Image
        source={require('@/assets/new-images/TorneAR_Logo_Nombre_1.png')}
        contentFit="contain"
        style={{ height: LOGO_HEIGHT, width: LOGO_WIDTH }}
      />

      {/* `min-w-0` + pr-3 (antes pr-4): con el logo y los íconos más grandes, el
          presupuesto horizontal del selector se achicó ~40px. */}
      <View className="min-w-0 flex-1 flex-row items-center justify-end pr-3">
        <ActiveTeamSelector />
      </View>

      {/* gap-6 (24px) y no gap-4: con hitSlop de 12 por lado, 16px de separacion
          hacia que las areas tactiles de dos iconos vecinos se solaparan y el tap
          en la banda intermedia disparara el handler equivocado.

          Los iconos pasaron de 20/21 a 26px, asi que el hitSlop baja de 12 a 8:
          24px de gap menos 8+8 de expansion deja 8px de aire entre areas
          tactiles. Con el hitSlop viejo (12+12 = 24) volvian a tocarse justo y
          se reintroducia aquel bug. El area tactil total por icono queda en
          26+16 = 42px, arriba del minimo de 44 recomendado contando el padding
          vertical del header. */}
      <View className="flex-row items-center gap-6">
        {/* Market Chats Icon */}
        {isMarketTab && (
          <TouchableOpacity
            onPress={() => router.push('/market-chats' as any)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="relative"
          >
            <AppIcon family="material-icons" name="chat" size={26} />
            {chatCount > 0 && (
              <View className="absolute -right-1.5 -top-1.5 h-[18px] w-[18px] items-center justify-center rounded-full border border-[#53E076] bg-[#003914]">
                <Text className="font-uiBold text-[9px] text-[#53E076]" style={{ fontVariant: ['tabular-nums'] }}>
                  {chatCount > 9 ? '9+' : chatCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* NUEVO: Ranking Challenges Icon */}
        {isRankingTab && (
          <TouchableOpacity
            onPress={() => router.push('/challenge-inbox' as any)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="relative"
          >
            <AppIcon family="material-community" name="sword-cross" size={26} />
            {challengeCount > 0 && (
              <View className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] items-center justify-center rounded-full border border-surface-container bg-danger-error px-1">
                <Text className="font-uiBold text-[9px] text-surface-base" style={{ fontVariant: ['tabular-nums'] }}>
                  {challengeCount > 9 ? '9+' : challengeCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Notification Bell */}
        <TouchableOpacity
          onPress={handleNotificationPress}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="relative"
        >
          <AppIcon family="material-community" name="bell" size={26} />
          {resolvedNotificationCount > 0 && (
            <View className="absolute -right-1 -top-1 h-[18px] w-[18px] items-center justify-center rounded-full bg-brand-primary">
              <Text className="font-uiBold text-[10px] text-[#003914]" style={{ fontVariant: ['tabular-nums'] }}>
                {resolvedNotificationCount > 9 ? '9+' : resolvedNotificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}