import { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { GlobalLoader } from '@/components/GlobalLoader';
import { GlobalHeader } from '@/components/GlobalHeader';
import { ProfileSkeleton } from '@/components/profile/ProfileSkeleton';
import { AppIcon } from '@/components/ui/AppIcon';
import { getAuthErrorMessage, getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchProfileViewData } from '@/lib/profile-data';
import { leaveTeam, getTeamActionErrorMessage } from '@/lib/team-manage-data';
import { ProfileViewData, TeamItem } from '@/components/profile/types';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileStatsGrid } from '@/components/profile/ProfileStatsGrid';
import { ProfileBadgesSection } from '@/components/profile/ProfileBadgesSection';
import { ProfileInviteCard } from '@/components/profile/ProfileInviteCard';
import { ProfileTeamsSection } from '@/components/profile/ProfileTeamsSection';
import { CareerTimeline } from '@/components/profile/CareerTimeline';
import { ProfileSettingsSection } from '@/components/profile/ProfileSettingsSection';
import { ProfileFeedbackCard } from '@/components/profile/ProfileFeedbackCard';
import { ProfileSocialSection } from '@/components/profile/ProfileSocialSection';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { Logger } from '@/lib/logger';

export default function ProfileScreen() {
  const { signOut, profile } = useAuth();
  const tabBarInset = useTabBarInset();
  const { fetchMyTeams } = useTeamStore();
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<ProfileViewData | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Abandonar equipo (ConfirmDialog custom, no Alert nativo).
  const [teamToLeave, setTeamToLeave] = useState<TeamItem | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const { showAlert, AlertComponent } = useCustomAlert();

  const loadProfileData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchProfileViewData(profile);
      setViewData(data);
    } catch (error) {
      Logger.error('No se pudo cargar la pantalla de perfil', {
        scope: 'tabs.profile.loadProfileData',
        profileId: profile.id,
        error,
      });
      showAlert('Error al cargar perfil', getGenericSupabaseErrorMessage(error, 'No se pudo cargar la informacion de perfil.'));
    } finally {
      setLoading(false);
    }
  }, [profile, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadProfileData();
    }, [loadProfileData])
  );

  const handleConfirmLeaveTeam = useCallback(async () => {
    if (!teamToLeave || !profile || isLeaving) return;
    setIsLeaving(true);
    try {
      await leaveTeam(teamToLeave.id);
      await fetchMyTeams(profile.id);
      await loadProfileData();
      setTeamToLeave(null);
      Logger.info('El usuario abandonó el equipo desde el perfil', {
        scope: 'tabs.profile.handleConfirmLeaveTeam',
        teamId: teamToLeave.id,
        profileId: profile.id,
      });
      showAlert('Saliste del equipo', `Tu ciclo en ${teamToLeave.name} quedó cerrado en tu trayectoria.`);
    } catch (error) {
      // CAPTAIN_MUST_TRANSFER / ACTIVE_MATCH llegan tipados desde la RPC.
      Logger.error('No se pudo abandonar el equipo desde el perfil', {
        scope: 'tabs.profile.handleConfirmLeaveTeam',
        teamId: teamToLeave.id,
        profileId: profile.id,
        error,
      });
      setTeamToLeave(null);
      showAlert('No pudimos sacarte del equipo', getTeamActionErrorMessage(error, 'No se pudo abandonar el equipo.'));
    } finally {
      setIsLeaving(false);
    }
  }, [teamToLeave, profile, isLeaving, fetchMyTeams, loadProfileData, showAlert]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      Logger.info('Sesión cerrada desde el perfil', {
        scope: 'tabs.profile.handleSignOut',
      });
    } catch (error) {
      Logger.error('Fallo el cierre de sesión desde el perfil', {
        scope: 'tabs.profile.handleSignOut',
        error,
      });
      showAlert('Error al cerrar sesion', getAuthErrorMessage(error, 'login'));
    } finally {
      setIsSigningOut(false);
    }
  };

  // Esqueleto solo en la carga inicial; los refrescos por foco conservan el
  // contenido para no parpadear. GlobalLoader queda reservado para acciones
  // bloqueantes (cerrar sesion), que si justifican tapar la pantalla.
  if (loading && !viewData) {
    return (
      <View className="flex-1 bg-surface-base">
        <GlobalHeader />
        <ProfileSkeleton />
      </View>
    );
  }

  if (!profile || !viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Perfil no disponible</Text>
        <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">No se pudo obtener la informacion de perfil en este momento.</Text>

        {AlertComponent}
      </View>
    );
  }

  const isEmbajador = viewData.badges.some((b) => b.slug === 'embajador' && b.isEarned);

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />
      {/* `paddingBottom: 114` fijo dejaba el boton de Cerrar Sesion debajo de
          la Tab Bar en los equipos con inset grande. */}
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: tabBarInset }}>
        <ProfileHeader profile={viewData.profile} isEmbajador={isEmbajador} />
        <ProfileStatsGrid stats={viewData.stats} />
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push({ pathname: '/profile-stats', params: { profileId: viewData.profile.id } })}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-surface-low py-3"
        >
          <AppIcon family="material-community" name="chart-timeline-variant" size={16} color="#8CCDFF" />
          <Text className="font-display text-xs uppercase tracking-wider text-info-secondary">Ver stats detalladas</Text>
        </TouchableOpacity>
        <ProfileBadgesSection badges={viewData.badges} />
        <ProfileInviteCard
          profileId={viewData.profile.id}
          username={viewData.profile.username}
          displayName={viewData.profile.full_name}
          isEmbajador={isEmbajador}
          onError={(message) => showAlert('No se pudo compartir', message)}
        />
        <ProfileTeamsSection
          teams={viewData.teams}
          onCreateTeam={() => router.push('/team-create')}
          onJoinTeam={() => router.push('/team-join')}
          onOpenRequests={() => router.push('/team-requests')}
          onTeamPress={(teamId) => router.push({ pathname: '/team-manage', params: { teamId } })}
          onLeaveTeam={setTeamToLeave}
        />
        <CareerTimeline profileId={viewData.profile.id} />
        {profile.is_admin && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/admin' as never)}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-surface-low py-3"
          >
            <AppIcon family="material-community" name="shield-account" size={16} color="#FABD32" />
            <Text className="font-display text-xs uppercase tracking-wider text-warning-tertiary">
              Panel de administración
            </Text>
          </TouchableOpacity>
        )}
        <ProfileFeedbackCard profileId={profile?.id} />
        <ProfileSocialSection
          onError={(message) => showAlert('No pudimos abrir la red', message)}
        />
        <ProfileSettingsSection isSigningOut={isSigningOut} onSignOut={handleSignOut} />
      </ScrollView>

      <ConfirmDialog
        visible={teamToLeave !== null}
        title="Abandonar equipo"
        message={`Tu ciclo en ${teamToLeave?.name ?? 'este equipo'} se cerrará y quedará registrado en tu trayectoria. Las estadísticas ganadas se conservan.`}
        confirmLabel="Abandonar"
        cancelLabel="Cancelar"
        confirmTone="danger"
        loading={isLeaving}
        onConfirm={() => void handleConfirmLeaveTeam()}
        onCancel={() => setTeamToLeave(null)}
      />

      {AlertComponent}

      {isSigningOut && <GlobalLoader label="Cerrando sesion" />}
    </View>
  );
}
