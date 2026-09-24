import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { Logger } from '@/lib/logger';
import {
  fetchApplicationsForPost,
  markApplicationsAsSeen,
  respondToApplication,
  type MarketApplicationEntry,
  type MarketPostType,
} from '@/lib/market-applications-api';
import {
  APPLICATION_STATUS_CLASS,
  APPLICATION_STATUS_LABEL,
} from '@/components/market/applicationStatus';

export default function MarketApplicationsScreen() {
  const { postId, postType } = useLocalSearchParams<{ postId: string; postType: MarketPostType }>();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<MarketApplicationEntry[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // M6: abrir esta pantalla ES el acuse de recibo. Es lo único que produce el
  // estado VISTA, que existía en el CHECK y en la UI pero no se escribía nunca.
  // Va después de pintar la lista y sin bloquearla: el dueño no pidió esto, así
  // que no puede costarle ni un spinner ni un cartel de error si falla.
  const markSeen = useCallback(async (id: string, type: MarketPostType) => {
    try {
      const seenIds = await markApplicationsAsSeen(id, type);
      if (seenIds.length === 0) return;
      setApplications((prev) =>
        prev.map((entry) => (seenIds.includes(entry.id) ? { ...entry, status: 'VISTA' } : entry)),
      );
    } catch (err) {
      Logger.warn('No se pudieron marcar las postulaciones como vistas', {
        scope: 'market-applications.markSeen',
        postId: id,
        postType: type,
        error: err,
      });
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!postId || !postType) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchApplicationsForPost(postId, postType);
      setApplications(data);
      void markSeen(postId, postType);
    } catch (err) {
      Logger.error('No se pudieron cargar las postulaciones de la publicación', {
        scope: 'market-applications.loadData',
        postId,
        postType,
        error: err,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(err, 'No se pudieron cargar las postulaciones.'));
    } finally {
      setLoading(false);
    }
  }, [postId, postType, showAlert, markSeen]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  async function handleRespond(entry: MarketApplicationEntry, status: 'ACEPTADA' | 'RECHAZADA') {
    setRespondingId(entry.id);
    try {
      await respondToApplication(entry.id, postType, status, entry.notifyProfileId, postId);
      await loadData();

      // El alta NO ocurre acá: aceptar deja una solicitud de unión ACEPTADA y
      // el jugador confirma el traspaso desde "Mis solicitudes". El mensaje
      // tiene que decir eso — mismo criterio que la aprobación de solicitudes
      // en team-manage.tsx, para que el capitán no se quede esperando a alguien
      // que todavía no aparece en el plantel.
      //
      // M5: y tiene que decir además que el aviso se cerró y que el resto quedó
      // rechazado. Es un efecto irreversible desde la UI (para volver a buscar
      // hay que publicar de nuevo): enterarse al no encontrar la publicación en
      // el Mercado no es aceptable.
      if (status === 'ACEPTADA') {
        showAlert(
          'Postulación aceptada',
          postType === 'TEAM'
            ? `Le avisamos a ${entry.displayName} que puede sumarse: va a aparecer en el plantel cuando confirme el traspaso desde "Mis solicitudes". Cerramos la publicación y rechazamos las postulaciones que quedaban.`
            : `Le avisamos a ${entry.displayName}. Cerramos la publicación y rechazamos las postulaciones que quedaban.`,
        );
      }
    } catch (err) {
      Logger.error('No se pudo responder la postulación', {
        scope: 'market-applications.handleRespond',
        applicationId: entry.id,
        postId,
        postType,
        status,
        error: err,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    } finally {
      setRespondingId(null);
    }
  }

  const bucket = postType === 'TEAM' ? 'avatars' : 'shields';

  function resolveImageUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return getSupabaseStorageUrl(bucket, path);
  }

  if (loading) return <GlobalLoader label="Cargando postulaciones..." />;

  return (
    <View className="flex-1 bg-surface-base">
      <SecondaryHeader
        title={`Postulaciones ${postType === 'TEAM' ? 'de jugadores' : 'de equipos'}`}
      />

      <FlatList
        data={applications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View className="items-center py-16">
            <AppIcon family="material-community" name="inbox-outline" size={40} color="#3F4943" />
            <Text className="mt-3 text-center font-ui text-sm text-neutral-on-surface-variant">
              Todavía no recibiste postulaciones.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const imageUrl = resolveImageUrl(item.displayAvatarOrShieldUrl);
          const isPending = item.status === 'PENDIENTE' || item.status === 'VISTA';
          const isResponding = respondingId === item.id;

          return (
            <View className="mb-3 rounded-xl bg-surface-container p-4">
              <View className="flex-row items-center gap-3">
                {imageUrl ? (
                  // Post de EQUIPO: se postulan jugadores (displayId = profile.id).
                  // Post de JUGADOR: se postulan equipos (displayId = team.id).
                  <ExpandablePhoto
                    uri={imageUrl}
                    subject={postType === 'TEAM'
                      ? { kind: 'avatar', profileId: item.displayId }
                      : { kind: 'shield', teamId: item.displayId }}
                    title={item.displayName}
                  >
                    <Image source={{ uri: imageUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  </ExpandablePhoto>
                ) : (
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-high">
                    <AppIcon
                      family="material-community"
                      name={postType === 'TEAM' ? 'account' : 'shield-account'}
                      size={20}
                      color="#53E076"
                    />
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  {item.displaySubtitle ? (
                    <Text className="font-ui text-xs text-neutral-on-surface-variant" numberOfLines={1}>
                      {item.displaySubtitle}
                    </Text>
                  ) : null}
                </View>
                <View className={`rounded-full px-2.5 py-1 ${APPLICATION_STATUS_CLASS[item.status].bg}`}>
                  <Text className={`font-uiBold text-[10px] uppercase ${APPLICATION_STATUS_CLASS[item.status].text}`}>
                    {APPLICATION_STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>

              {isPending && (
                <View className="mt-3 flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => void handleRespond(item, 'RECHAZADA')}
                    disabled={isResponding}
                    activeOpacity={0.8}
                    className="flex-1 items-center rounded-lg border border-danger-error/30 bg-danger-error/10 py-2.5"
                  >
                    <Text className="font-uiBold text-xs text-danger-error">Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleRespond(item, 'ACEPTADA')}
                    disabled={isResponding}
                    activeOpacity={0.8}
                    className="flex-1 items-center rounded-lg bg-brand-primary py-2.5"
                  >
                    <Text className="font-uiBold text-xs" style={{ color: '#003914' }}>Aceptar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
      {AlertComponent}
    </View>
  );
}
