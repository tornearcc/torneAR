import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { NotificationsSkeleton } from '@/components/notifications/NotificationsSkeleton';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { supabase } from '@/lib/supabase';
import { fetchNotificationsViewData, markAllNotificationsAsRead, markNotificationAsRead } from '@/lib/notifications-data';
import { NotificationsViewData, NotificationItem } from '@/components/notifications/types';
import { NotificationsListSection } from '@/components/notifications/NotificationsListSection';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { Logger } from '@/lib/logger';

export default function NotificationsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<NotificationsViewData | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);

  // Se extrae el id antes de los callbacks: con `profile?.id` directo en el
  // array de deps, el React Compiler infiere `profile` entero como dependencia
  // (menos específica que la declarada) y desactiva la memoización de la
  // pantalla. Con la variable, lo inferido y lo declarado coinciden.
  const profileId = profile?.id ?? null;

  const notifications = useMemo(() => viewData?.notifications ?? [], [viewData?.notifications]);
  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const loadNotificationsData = useCallback(async (showBaseLoader = true) => {
    if (!profileId) {
      setLoading(false);
      return;
    }

    try {
      if (showBaseLoader) setLoading(true);
      const data = await fetchNotificationsViewData(profileId);
      setViewData(data);
    } catch (error) {
      Logger.error('No se pudieron cargar las notificaciones', {
        scope: 'notifications.loadNotificationsData',
        profileId,
        error,
      });
      showAlert(
        'Error al cargar',
        getGenericSupabaseErrorMessage(error, 'No se pudieron cargar las notificaciones.')
      );
    } finally {
      setLoading(false);
    }
  }, [profileId, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadNotificationsData(true);
    }, [loadNotificationsData])
  );

  useEffect(() => {
    if (!profileId) {
      return;
    }

    const channel = supabase
      .channel(`notifications-screen-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profileId}`,
        },
        () => {
          void loadNotificationsData(false);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotificationsData, profileId]);

  const markAllAsRead = async () => {
    if (!profileId || unreadCount === 0 || !viewData) {
      return;
    }

    try {
      setMarkingAllRead(true);
      await markAllNotificationsAsRead(profileId);

      setViewData({
        ...viewData,
        notifications: viewData.notifications.map((item) => ({ ...item, is_read: true })),
      });
    } catch (error) {
      Logger.error('No se pudieron marcar todas las notificaciones como leídas', {
        scope: 'notifications.markAllAsRead',
        profileId,
        unreadCount,
        error,
      });
      showAlert('No se pudo marcar', getGenericSupabaseErrorMessage(error, 'No se pudieron marcar como leidas.'));
    } finally {
      setMarkingAllRead(false);
    }
  };

  const openNotification = async (item: NotificationItem) => {
    try {
      setOpeningNotificationId(item.id);

      if (!item.is_read && viewData) {
        await markNotificationAsRead(item.id);

        setViewData({
          ...viewData,
          notifications: viewData.notifications.map((row) =>
            row.id === item.id ? { ...row, is_read: true } : row
          ),
        });
      }

      // Ruteo por tipo. Antes solo SOLICITUD_UNION_EQUIPO navegaba: el resto —
      // incluida SOLICITUD_UNION_ACEPTADA, que justamente le pide al jugador
      // confirmar el traspaso — se marcaba como leída y no hacía nada, dejando
      // al usuario sin forma de llegar a la acción que la notificación pedía.
      const maybeData = (item.data ?? {}) as { team_id?: unknown; match_id?: unknown };
      const teamId = typeof maybeData.team_id === 'string' ? maybeData.team_id : null;
      const matchId = typeof maybeData.match_id === 'string' ? maybeData.match_id : null;

      // M2: una postulación ACEPTADA a un post de EQUIPO ahora deja una
      // solicitud de unión que el jugador tiene que confirmar (ver M1), y el
      // payload trae el `team_id` justamente en ese caso. El resto de las
      // respuestas —rechazos, y las de posts de JUGADOR, donde el aceptado es
      // el equipo y no hay traspaso que confirmar— siguen yendo al chat.
      const isAcceptedTeamApplication = item.type === 'POSTULACION_RESPONDIDA' && teamId !== null;

      switch (item.type) {
        case 'SOLICITUD_UNION_EQUIPO':
          // Capitán: la solicitud se modera desde la gestión del equipo.
          if (teamId) router.push({ pathname: '/team-manage', params: { teamId } });
          // Sin `team_id` en el payload la notificación es un callejón sin
          // salida: se marca como leída y no navega a ningún lado.
          else Logger.warn('Notificación sin team_id: no se pudo resolver el destino', {
            scope: 'notifications.openNotification',
            notificationId: item.id,
            type: item.type,
          });
          break;

        case 'SOLICITUD_UNION_ACEPTADA':
        case 'SOLICITUD_UNION_RECHAZADA':
          // Jugador: acá confirma el traspaso que habilita su alta al plantel.
          router.push('/team-requests');
          break;

        case 'DESAFIO_RECIBIDO':
        case 'DESAFIO_ACEPTADO':
        case 'DESAFIO_RECHAZADO':
          router.push('/challenge-inbox');
          break;

        case 'ROL_ACTUALIZADO':
        case 'EXPULSADO_EQUIPO':
          if (teamId) router.push({ pathname: '/team-manage', params: { teamId } });
          else Logger.warn('Notificación sin team_id: no se pudo resolver el destino', {
            scope: 'notifications.openNotification',
            notificationId: item.id,
            type: item.type,
          });
          break;

        case 'POSTULACION_RESPONDIDA':
          // Te aceptaron en el Mercado: el destino es donde se confirma el
          // traspaso, no la bandeja de chats. Ahí es donde la postulación
          // aceptada se convierte en un alta real al plantel.
          //
          // M4: el resto ya no cae en el chat. Un rechazo —o una aceptación de
          // post de JUGADOR— se explica en "Mis postulaciones", que es la
          // pantalla que muestra el estado y qué significa. `/market-chats` sólo
          // tenía sentido cuando ese estado no se podía ver en ningún lado.
          router.push(isAcceptedTeamApplication ? '/team-requests' : '/market-my-applications');
          break;

        case 'POSTULACION_RECIBIDA':
          router.push('/market-chats');
          break;

        default:
          // D11: todo evento de partido —confirmación, cancelación, disputa,
          // WO aprobado/rechazado/automático, recordatorio de 24h— viaja con
          // `match_id` en el payload. Antes caían todas acá y se marcaban como
          // leídas sin llevar a ningún lado: justo las que piden una respuesta
          // en las próximas horas eran las que no accionaban.
          if (matchId) router.push({ pathname: '/match-detail', params: { matchId } });
          else Logger.warn('Notificación sin destino: tipo no ruteado y sin match_id', {
            scope: 'notifications.openNotification',
            notificationId: item.id,
            type: item.type,
          });
          break;
      }
    } catch (error) {
      Logger.error('No se pudo abrir la notificación', {
        scope: 'notifications.openNotification',
        notificationId: item.id,
        type: item.type,
        error,
      });
      showAlert('No se pudo abrir', getGenericSupabaseErrorMessage(error, 'No se pudo abrir la notificacion.'));
    } finally {
      setOpeningNotificationId(null);
    }
  };

  if (!profile && !loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">No disponible</Text>
        {AlertComponent}
      </View>
    );
  }

  // La suscripcion realtime recarga esta pantalla ante cualquier INSERT/UPDATE.
  // Acotar el esqueleto a la carga inicial evita que la lista desaparezca cada
  // vez que llega una notificacion nueva.
  if (loading && !viewData) {
    return <NotificationsSkeleton />;
  }

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Notificaciones"
        rightSlot={
          <TouchableOpacity
            onPress={markAllAsRead}
            disabled={markingAllRead || unreadCount === 0}
            activeOpacity={0.9}
            className={`rounded-md px-3 py-1.5 ${unreadCount > 0 ? 'bg-surface-low' : 'bg-surface-low/40'}`}
          >
            {markingAllRead ? (
              <ActivityIndicator size="small" color="#BCCBB9" />
            ) : (
              <Text className={`font-display text-[10px] uppercase tracking-wide ${unreadCount > 0 ? 'text-neutral-on-surface-variant' : 'text-neutral-on-surface-variant/50'}`}>
                Marcar leidas
              </Text>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 32 }}>
        {/* El conteo pasa de texto gris perdido a badge con peso propio: es el
            dato que el usuario viene a buscar al entrar. Cuando es 0 no
            mostramos un "0 sin leer" en verde — ahi el mensaje tranquilizador
            es el correcto. */}
        {unreadCount > 0 ? (
          <View className="self-start rounded-full border border-brand-primary/40 bg-brand-primary/15 px-3 py-1">
            <Text className="font-uiBold text-xs uppercase tracking-wide text-brand-primary">
              {unreadCount} sin leer
            </Text>
          </View>
        ) : (
          <Text className="font-ui text-sm text-neutral-on-surface-variant">Estas al dia</Text>
        )}

        <View className="mt-5 gap-2">
          <NotificationsListSection
            notifications={notifications}
            openingNotificationId={openingNotificationId}
            onOpenNotification={openNotification}
          />
        </View>
      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}
