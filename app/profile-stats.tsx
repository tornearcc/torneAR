import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { ReportModal } from '@/components/reports/ReportModal';
import { UserActionsSheet } from '@/components/moderation/UserActionsSheet';
import { isBlockedWith } from '@/lib/blocks-data';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchProfileStatsViewData } from '@/lib/profile-stats-api';
import { Logger } from '@/lib/logger';
import type { ProfileStatsViewData } from '@/components/profile-stats/types';
import { StatsHeader } from '@/components/profile-stats/StatsHeader';
import { StatsOverview } from '@/components/profile-stats/StatsOverview';
import { RecentMatchesSection } from '@/components/profile-stats/RecentMatchesSection';
import { BadgesSection } from '@/components/profile-stats/BadgesSection';
import { TeamsSection } from '@/components/profile-stats/TeamsSection';
import { CareerTimeline } from '@/components/profile/CareerTimeline';

export default function ProfileStatsScreen() {
  const { profile } = useAuth();
  const { profileId: paramProfileId } = useLocalSearchParams<{ profileId?: string }>();
  const profileId = paramProfileId ?? profile?.id ?? null;

  // Sin `profileId` en los params la pantalla ya cae en el perfil propio, pero
  // se compara contra el id resuelto y no contra la ausencia del param: a las
  // stats propias tambien se llega con el id explicito desde la tab de Perfil.
  const isOwnProfile = !!profile?.id && profileId === profile.id;

  // Resultado de la carga del perfil pedido. Guardar el `profileId` junto al
  // dato deja derivar `loading` y `viewData` en el render: el efecto no tiene
  // que encender ni apagar un flag desde su cuerpo síncrono, que es lo que
  // dispara renders en cascada. `data: null` es «se intentó y falló».
  const [result, setResult] = useState<{
    profileId: string;
    data: ProfileStatsViewData | null;
  } | null>(null);
  // Un solo estado para los dos sheets y no un booleano por cada uno:
  // `ReportModal` y `UserActionsSheet` son `<Modal>` nativos, y con flags
  // independientes es posible dejar los dos en `true` a la vez — en iOS el
  // segundo queda debajo del backdrop del primero y parece que no pasó nada.
  const [sheet, setSheet] = useState<'none' | 'actions' | 'report'>('none');
  const [isBlocked, setIsBlocked] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();

  const loading = Boolean(profileId) && result?.profileId !== profileId;
  const viewData = result?.profileId === profileId ? result.data : null;

  useEffect(() => {
    if (!profileId) return;

    let cancelled = false;
    fetchProfileStatsViewData(profileId)
      .then((data) => {
        if (!cancelled) setResult({ profileId, data });
      })
      .catch((error: unknown) => {
        Logger.error('No se pudo cargar el detalle de estadísticas del perfil', {
          scope: 'profile-stats.loadData',
          profileId,
          error,
        });
        if (cancelled) return;
        setResult({ profileId, data: null });
        showAlert(
          'Error al cargar stats',
          getGenericSupabaseErrorMessage(error, 'No se pudo cargar el detalle de estadísticas.'),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [profileId, showAlert]);

  // Estado del bloqueo, para saber si el menú ofrece «Bloquear» o
  // «Desbloquear». Falla en silencio a `false`: no poder resolverlo no tiene
  // que romper la pantalla, y ofrecer «Bloquear» sobre alguien ya bloqueado es
  // inocuo — la RPC es idempotente por el ON CONFLICT DO NOTHING.
  useEffect(() => {
    if (!profileId || isOwnProfile) return;

    let cancelled = false;
    isBlockedWith(profileId)
      .then((blocked) => {
        if (!cancelled) setIsBlocked(blocked);
      })
      .catch((error: unknown) => {
        Logger.warn('No se pudo resolver el estado de bloqueo del perfil', {
          scope: 'profile-stats.loadBlockState',
          profileId,
          error,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [profileId, isOwnProfile]);

  if (loading) return <GlobalLoader label="Cargando stats" />;

  if (!viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Perfil no disponible</Text>
        {AlertComponent}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Stats"
        // Sólo tiene sentido moderar el perfil de OTRO: no te podés denunciar
        // ni bloquear a vos mismo, así que el botón directamente no existe en
        // isOwnProfile — no es una validación que haga falta llevar al menú.
        rightSlot={
          !isOwnProfile ? (
            <TouchableOpacity
              onPress={() => setSheet('actions')}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Opciones del perfil"
            >
              <AppIcon family="material-community" name="dots-vertical" size={22} color="#869585" />
            </TouchableOpacity>
          ) : null
        }
      />
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 114 }}>
        <StatsHeader
          profile={viewData.profile}
          age={viewData.age}
          isEmbajador={viewData.badges.some((b) => b.slug === 'embajador' && b.isEarned)}
        />
        <StatsOverview stats={viewData.stats} />
        <RecentMatchesSection matches={viewData.recentMatches} isOwnProfile={isOwnProfile} />
        <BadgesSection badges={viewData.badges} />
        <TeamsSection teams={viewData.teams} />
        {/* Misma seccion que en la tab de Perfil: la trayectoria es publica y
            faltaba justo en la pantalla a la que se llega desde el rival. */}
        <CareerTimeline profileId={viewData.profile.id} isOwnProfile={isOwnProfile} />
      </ScrollView>

      {profile?.id && !isOwnProfile && (
        <>
          <UserActionsSheet
            visible={sheet === 'actions'}
            onClose={() => setSheet('none')}
            targetProfileId={viewData.profile.id}
            targetName={viewData.profile.full_name}
            isBlocked={isBlocked}
            onReport={() => setSheet('report')}
            onBlockChanged={() => setIsBlocked((previous) => !previous)}
          />

          <ReportModal
            visible={sheet === 'report'}
            onClose={() => setSheet('none')}
            entityType="USER"
            entityId={viewData.profile.id}
            reporterId={profile.id}
          />
        </>
      )}

      {AlertComponent}
    </View>
  );
}
