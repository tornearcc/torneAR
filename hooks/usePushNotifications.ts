import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { IS_PUSH_UNSUPPORTED_ENV as isUnsupportedEnv } from '@/lib/push-environment';
import { registerForPushNotificationsAsync } from '@/lib/push-notifications';
import { extractDeepLinkUrl, resolveDeepLink } from '@/lib/deep-linking';
import { useDeepLinkStore } from '@/stores/deepLinkStore';
import { useAuth } from '@/context/AuthContext';

/**
 * Orquesta las push notifications del lado del cliente:
 *  - configura el handler de presentación en foreground,
 *  - ataja el tap sobre la notificación CON LA APP VIVA y lo enruta a través
 *    del mismo Auth Gating de deep links (deepLinkStore + guard de `_layout`),
 *  - registra/refresca el `expo_push_token` del perfil autenticado, de modo que
 *    el dispositivo más reciente siempre pise al anterior.
 *
 * ⚠️ El ARRANQUE EN FRÍO (app muerta, se abre tocando la push) NO se maneja
 * acá: lo cubre `<ColdStartPushLinkGate />`, montado en `app/_layout.tsx`. La
 * lectura one-shot de `getLastNotificationResponseAsync()` que vivía en este
 * hook llegaba tarde en Android —el módulo nativo todavía no tenía el intent,
 * devolvía `null` y no había segunda oportunidad— y además navegaba directo,
 * compitiendo con los `replace` del guard de auth. El detalle completo está en
 * el comentario de `components/push/ColdStartPushLink.tsx`.
 *
 * Se llama sin argumentos desde `app/_layout.tsx`; internamente se activa solo
 * cuando la sesión ya está hidratada y hay un usuario logueado.
 */
export function usePushNotifications(): void {
  const { session, profile, hydrated } = useAuth();
  const router = useRouter();

  // Guardamos la sesión en un ref para que el listener de taps (registrado una
  // sola vez) siempre lea el estado de auth actual sin re-suscribirse.
  const sessionRef = useRef<Session | null>(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Enruta una URL entrante reutilizando la decisión de gating compartida:
  // si es protegida y no hay sesión la difiere (pending) y el guard la consume
  // tras el login; si no, navega directo.
  const routeIncomingUrl = useCallback(
    (url: string) => {
      const action = resolveDeepLink(url, Boolean(sessionRef.current));
      if (action.kind === 'defer') {
        useDeepLinkStore.getState().setPendingDeepLink(action.url);
      } else if (action.kind === 'navigate') {
        router.replace(action.href);
      }
    },
    [router],
  );

  // ─── Handler de presentación + listener de taps calientes (una vez) ─────────
  useEffect(() => {
    if (isUnsupportedEnv) return;

    let responseSubscription: { remove: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      // Todo el bloque va bajo try/catch: sin el entorno nativo de FCM
      // inicializado, tanto el import dinámico como los métodos nativos de
      // abajo pueden tirar. Sin capturarlo, la rejection quedaba sin manejar y
      // `initLogger` (app/_layout.tsx) la reportaba como excepción global —
      // ruido de `error` en telemetría por una función opcional que falla.
      try {
        // Import dinámico: evita que la carga del módulo explote en Expo Go.
        const Notifications = await import('expo-notifications');

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });

        if (cancelled) return;

        // Warm: taps mientras la app está viva (foreground/background). Acá SÍ
        // se navega directo: la navegación ya está montada y la sesión
        // hidratada, así que no hay carrera posible contra el guard de auth.
        // El caso frío (app muerta) lo cubre `<ColdStartPushLinkGate />` —
        // ver el comentario de arriba.
        responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const url = extractDeepLinkUrl(response);
          if (url) routeIncomingUrl(url);
        });
      } catch (error) {
        // Degradación, no falla: la app entera funciona sin esto; lo único que
        // se pierde es que el tap sobre una push navegue al detalle.
        Logger.warn('No se pudo montar el listener de push notifications', {
          scope: 'usePushNotifications.listener',
          error,
        });
      }
    })();

    return () => {
      cancelled = true;
      responseSubscription?.remove();
    };
  }, [routeIncomingUrl]);

  // ─── Registro / refresco del expo_push_token del perfil autenticado ─────────
  useEffect(() => {
    if (isUnsupportedEnv) return;
    if (!hydrated || !session || !profile?.id) return;

    let cancelled = false;

    void (async () => {
      const token = await registerForPushNotificationsAsync();
      if (cancelled || !token) return;

      // Evitamos el write si el token ya es el guardado (evita UPDATE por launch).
      if (token === profile.expo_push_token) return;

      const { error } = await supabase
        .from('profiles')
        .update({ expo_push_token: token })
        .eq('id', profile.id);

      if (error) {
        // Fallo terminal y mudo: el dispositivo tiene token, el perfil no, y el
        // usuario deja de recibir pushes sin que nada en pantalla lo indique.
        Logger.error('No se pudo guardar el expo_push_token del perfil', {
          scope: 'usePushNotifications',
          profileId: profile.id,
          error,
        });
        return;
      }

      Logger.info('expo_push_token actualizado', {
        scope: 'usePushNotifications',
        profileId: profile.id,
        wasEmpty: !profile.expo_push_token,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, session, profile?.id, profile?.expo_push_token]);
}
