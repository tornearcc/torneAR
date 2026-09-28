import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketTabs } from '@/components/market/MarketTabs';
import { MarketListSection } from '@/components/market/MarketListSection';
import { FilterModal } from '@/components/market/FilterModal';
import { UserActionsSheet } from '@/components/moderation/UserActionsSheet';
import { ReportModal } from '@/components/reports/ReportModal';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { useTeamStore } from '@/stores/teamStore';
import { fetchMarketViewData } from '@/lib/market-data';
import { togglePostStatus } from '@/lib/market-api';
import { filterPostsByDay, resolveApplicantTeam } from '@/lib/market-utils';
import { useDistanceResolver } from '@/hooks/useDistanceResolver';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { MarketViewData, TabType, type MarketModerationTarget } from '@/components/market/types';
import { getOrCreateMarketChat } from '@/lib/chat-api';
import { Logger } from '@/lib/logger';
import {
  applyToTeamPost,
  applyToPlayerPost,
  fetchApplicationCounts,
  getMarketApplicationErrorMessage,
  MarketApplicationError,
} from '@/lib/market-applications-api';

export default function MarketScreen() {
  const { profile } = useAuth();
  const { showAlert, showLoader, hideLoader } = useUI();
  // La carga de `myTeams` vive en app/(tabs)/_layout.tsx; aca solo leemos el
  // equipo activo, con selector puntual para no re-renderizar ante cualquier
  // cambio del store.
  const activeTeamId = useTeamStore((state) => state.activeTeamId);

  const [activeTab, setActiveTab] = useState<TabType>('TEAMS_LOOKING');

  const [filterZone, setFilterZone] = useState<string | null>(null);
  const [filterDays, setFilterDays] = useState<string[]>([]);
  const [filterSort, setFilterSort] = useState<'nearest' | 'recent'>('recent');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewData, setViewData] = useState<MarketViewData | null>(null);

  const [activeCaptainTeamId, setActiveCaptainTeamId] = useState<string | null>(null);
  const [postPendingDelete, setPostPendingDelete] = useState<{ id: string; isTeamPost: boolean } | null>(null);
  const [applicationCounts, setApplicationCounts] = useState<Record<string, number>>({});
  // Moderación. El target NO se limpia al cerrar, sólo se apaga `sheet`: si se
  // desmontara el sheet, el alert de confirmación que vive adentro se iría con
  // él y el usuario no vería el resultado de lo que acaba de hacer. Se
  // reemplaza recién al abrir el menú de otra publicación.
  const [moderationTarget, setModerationTarget] = useState<MarketModerationTarget | null>(null);
  const [sheet, setSheet] = useState<'none' | 'actions' | 'report'>('none');

  const openModeration = useCallback((target: MarketModerationTarget) => {
    setModerationTarget(target);
    setSheet('actions');
  }, []);

  const closeModeration = useCallback(() => setSheet('none'), []);
  // Badge de distancia. El hook resuelve origen y destino con la misma
  // prioridad que el selector de complejo y el de la propuesta de partido.
  const { label: distanceLabel } = useDistanceResolver();
  const fabBottom = useTabBarInset({ gap: 16 });

  const loadMarketData = useCallback(async (showFullLoader = true) => {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      if (showFullLoader) setLoading(true);
      const data = await fetchMarketViewData(profile, 'CUALQUIERA', { zone: filterZone, sortBy: filterSort });
      setViewData(data);

      if (data.managedTeams.length > 0) {
        setActiveCaptainTeamId((current) => current ?? data.managedTeams[0].id);
      }

      const ownTeamPostIds = data.teamPosts.filter((p) => p.created_by === profile.id).map((p) => p.id);
      const ownPlayerPostIds = data.playerPosts.filter((p) => p.profile_id === profile.id).map((p) => p.id);
      Promise.all([
        fetchApplicationCounts(ownTeamPostIds, 'TEAM'),
        fetchApplicationCounts(ownPlayerPostIds, 'PLAYER'),
      ])
        .then(([teamCounts, playerCounts]) => setApplicationCounts({ ...teamCounts, ...playerCounts }))
        .catch((err: unknown) => {
          // No crítico — el botón simplemente no muestra el número. Pero un
          // "Ver postulaciones" sin contador es indistinguible de un post sin
          // postulaciones, y ése es justo el caso que el capitán no revisa.
          Logger.warn('No se pudieron cargar los contadores de postulaciones', {
            scope: 'market.loadData',
            profileId: profile.id,
            error: err,
          });
        });
    } catch (err) {
      Logger.error('No se pudo cargar la información del mercado', {
        scope: 'market.loadData',
        profileId: profile.id,
        filterZone,
        filterSort,
        error: err,
      });
      showAlert('Error', 'No se pudo cargar la informacion del mercado.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [profile, filterZone, filterSort, showAlert]);

  // Unica fuente de carga. El useEffect que habia aca abajo era redundante:
  // `loadMarketData` ya declara profile/filterZone/filterSort en sus deps, asi que
  // cambiar un filtro regenera la callback y vuelve a disparar este focus effect.
  // Tener los dos significaba dos rondas completas de fetch por cada entrada.
  useFocusEffect(
    useCallback(() => {
      void loadMarketData(true);
    }, [loadMarketData])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    void loadMarketData(false);
  };

  const handleCreatePost = () => {
    const isTeamCreationFlow = activeTab === 'TEAMS_LOOKING';
    const canCreateTeamPost = (viewData?.managedTeams?.length ?? 0) > 0;

    if (isTeamCreationFlow && !canCreateTeamPost) {
      showAlert('Acceso restringido', 'Debes ser Capitan o Subcapitan de un equipo para crear esta publicacion.');
      return;
    }

    const typeToCreate = activeTab === 'TEAMS_LOOKING' ? 'TEAM' : 'PLAYER';
    router.push({
      pathname: '/(modals)/market-create',
      params: { type: typeToCreate }
    });
  };

  // El chat es el paso secundario y se abre SIEMPRE después de la postulación.
  // Si falla, no se lo trata como error: la postulación ya está registrada y
  // decirle "no pudimos postularte" a alguien que sí quedó postulado es peor
  // que no abrirle el chat.
  const openMarketChat = async (playerProfileId: string, teamId: string) => {
    try {
      const chat = await getOrCreateMarketChat(playerProfileId, teamId);
      router.push(`/market-chats/${chat.id}` as any);
    } catch (err) {
      Logger.warn('Postulación registrada pero no se pudo abrir el chat', {
        scope: 'market.openMarketChat',
        playerProfileId,
        teamId,
        error: err,
      });
    }
  };

  const showApplyError = (err: unknown) => {
    // Los errores de dominio (post vencido/cerrado) traen un texto propio y no
    // son un fallo del usuario: merecen otro título. Todo se muestra con el
    // CustomAlert del UIContext — nunca con Alert.alert del sistema.
    showAlert(
      err instanceof MarketApplicationError ? 'Publicación no disponible' : 'No pudimos postularte',
      getMarketApplicationErrorMessage(err),
    );
  };

  // M3: la postulación se disparaba con `void` — sin await y sin catch. El botón
  // dice "Postularme" pero lo único que se esperaba era la apertura del chat: si
  // el INSERT fallaba (RLS, red, sesión vencida) el usuario veía el chat abierto
  // y creía haberse postulado, mientras el capitán nunca recibía nada.
  // M8: además, deja de correr en paralelo con el chat. Primero se registra la
  // postulación —que ahora puede rechazarse por post vencido o cerrado— y recién
  // después se abre la conversación. En paralelo, un post vencido igual dejaba
  // una conversación viva sobre un partido que ya se jugó.
  const handleContactTeam = async (teamId: string, postId: string) => {
    if (!profile) return;
    showLoader('Enviando postulación...');
    try {
      const applyResult = await applyToTeamPost(postId, teamId);
      Logger.info('Postulación a publicación de equipo registrada', {
        scope: 'market.handleContactTeam',
        postId,
        teamId,
        profileId: profile.id,
        applyResult,
      });
      await openMarketChat(profile.id, teamId);

      showAlert(
        applyResult === 'DUPLICADA' ? 'Ya te habías postulado' : '¡Postulación enviada!',
        applyResult === 'DUPLICADA'
          ? 'Tu postulación a esta publicación ya estaba registrada. Podés seguir la conversación por el chat.'
          : 'El equipo ya la ve en su lista de postulaciones. Aprovechá el chat para coordinar.',
      );
    } catch (err) {
      Logger.error('No se pudo postular a la publicación de equipo', {
        scope: 'market.handleContactTeam',
        postId,
        teamId,
        profileId: profile.id,
        error: err,
      });
      showApplyError(err);
    } finally {
      hideLoader();
    }
  };

  const handleContactPlayer = async (playerProfileId: string, postId: string) => {
    if (!profile || !viewData) return;

    // M7: el `activeTeamId ?? activeCaptainTeamId ?? managedTeams[0]` de antes
    // podía devolver un equipo donde el usuario es sólo JUGADOR — el activo del
    // store no está filtrado por rol. La policy de INSERT exige
    // CAPITAN/SUBCAPITAN, así que el INSERT rebotaba. Ahora el equipo sale
    // siempre de `managedTeams`, que es exactamente esa lista.
    const applicantTeam = resolveApplicantTeam(viewData.managedTeams, activeTeamId, activeCaptainTeamId);

    if (!applicantTeam) {
      // No se resolvió ningún equipo gestionado: la postulación no se intenta.
      Logger.warn('No se pudo resolver el equipo postulante', {
        scope: 'market.handleContactPlayer',
        postId,
        activeTeamId,
        activeCaptainTeamId,
        managedTeamsCount: viewData.managedTeams.length,
      });
      showAlert('Sin equipos', 'Debes ser Capitan o Subcapitan de un equipo para contactar jugadores.');
      return;
    }

    showLoader('Enviando postulación...');
    try {
      const applyResult = await applyToPlayerPost(postId, applicantTeam.id, playerProfileId);
      Logger.info('Postulación a publicación de jugador registrada', {
        scope: 'market.handleContactPlayer',
        postId,
        applicantTeamId: applicantTeam.id,
        playerProfileId,
        applyResult,
      });
      await openMarketChat(playerProfileId, applicantTeam.id);

      // El nombre del equipo va en el mensaje porque puede no ser el activo: si
      // el activo es uno que no gestiona, se postula con otro, y tiene que
      // enterarse acá y no cuando el rival le pregunte quiénes son.
      showAlert(
        applyResult === 'DUPLICADA' ? 'Ya te habías postulado' : '¡Postulación enviada!',
        applyResult === 'DUPLICADA'
          ? `${applicantTeam.name} ya estaba postulado a esta publicación. Podés seguir la conversación por el chat.`
          : `Te postulaste con ${applicantTeam.name}. El jugador ya la ve en su lista de postulaciones y podés coordinar por el chat.`,
      );
    } catch (err) {
      Logger.error('No se pudo postular a la publicación de jugador', {
        scope: 'market.handleContactPlayer',
        postId,
        applicantTeamId: applicantTeam.id,
        playerProfileId,
        error: err,
      });
      showApplyError(err);
    } finally {
      hideLoader();
    }
  };

  const handleViewTeamStats = (teamId: string) => {
    router.push({
      pathname: '/team-stats',
      params: { teamId }
    });
  };

  const handleViewPlayerStats = (playerProfileId: string) => {
    router.push({
      pathname: '/profile-stats',
      params: { profileId: playerProfileId }
    });
  };

  const handleViewApplications = (postId: string, postType: 'TEAM' | 'PLAYER') => {
    router.push({
      pathname: '/market-applications',
      params: { postId, postType },
    } as any);
  };

  const handleDeletePost = (postId: string, isTeamPost: boolean) => {
    setPostPendingDelete({ id: postId, isTeamPost });
  };

  const confirmDeletePost = async () => {
    if (!postPendingDelete) return;
    showLoader('Cancelando publicación...');
    try {
      await togglePostStatus(postPendingDelete.id, postPendingDelete.isTeamPost, false);
      setViewData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          teamPosts: prev.teamPosts.filter((p) => p.id !== postPendingDelete.id),
          playerPosts: prev.playerPosts.filter((p) => p.id !== postPendingDelete.id),
        };
      });
      setPostPendingDelete(null);
    } catch (err) {
      Logger.error('No se pudo cancelar la publicación del mercado', {
        scope: 'market.cancelPost',
        postId: postPendingDelete.id,
        isTeamPost: postPendingDelete.isTeamPost,
        error: err,
      });
      showAlert('Error', 'No se pudo cancelar la publicación.');
    } finally {
      hideLoader();
    }
  };

  const memberStatusMap = useMemo(() => {
    const map: Record<string, 'own_team' | 'own_player'> = {};
    if (!viewData) return map;

    if (activeTab === 'TEAMS_LOOKING') {
      for (const post of viewData.teamPosts) {
        if (viewData.myTeamIds.includes(post.team_id)) {
          map[post.id] = 'own_team';
        }
      }
    } else {
      for (const post of viewData.playerPosts) {
        if (viewData.myManagedTeamsMemberProfileIds.includes(post.profile_id)) {
          map[post.id] = 'own_player';
        }
      }
    }
    return map;
  }, [viewData, activeTab]);

  if (!profile && !loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Mercado no disponible</Text>
      </View>
    );
  }

  const rawTeamPosts = viewData?.teamPosts ?? [];
  const teamPosts = filterDays.length > 0 ? filterPostsByDay(rawTeamPosts, filterDays) : rawTeamPosts;
  const posts = activeTab === 'TEAMS_LOOKING' ? teamPosts : (viewData?.playerPosts ?? []);
  const canCreateTeamPost = (viewData?.managedTeams?.length ?? 0) > 0;
  const showCreateButton = activeTab === 'TEAMS_LOOKING' ? canCreateTeamPost : true;

  const hasActiveFilters = filterZone !== null || filterDays.length > 0 || filterSort !== 'recent';

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader isMarketTab />
      <View className="px-4 pt-4 pb-2 z-10">
        <View className="flex-row items-center gap-2 mb-6">
          <View className="flex-1">
            <MarketTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </View>
          {/* M4 — Entrada a "Mis postulaciones". El postulante no tenía dónde
              ver el estado de lo que mandó: el estado se escribía bien desde
              M5/M6 pero moría en la notificación. */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/market-my-applications')}
            accessibilityLabel="Mis postulaciones"
            className="h-[48px] w-[48px] items-center justify-center rounded-xl border border-transparent bg-surface-low"
          >
            <AppIcon family="material-community" name="send-check-outline" size={20} color="#BCCBB9" />
          </TouchableOpacity>
          {/* Botón Filtro Cuadrado */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowFilterModal(true)}
            className={`h-[48px] w-[48px] items-center justify-center rounded-xl border ${hasActiveFilters ? 'border-brand-primary/30 bg-brand-primary/10' : 'border-transparent bg-surface-low'
              }`}
          >
            <AppIcon family="material-community" name="tune" size={20} color={hasActiveFilters ? '#53E076' : '#BCCBB9'} />
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1 px-4 z-0">
        <MarketListSection
          isLoading={loading && !isRefreshing}
          isRefreshing={isRefreshing}
          posts={posts}
          activeTab={activeTab}
          currentProfileId={profile?.id ?? ''}
          onRefresh={onRefresh}
          onContactTeam={handleContactTeam}
          onContactPlayer={handleContactPlayer}
          onViewTeamStats={handleViewTeamStats}
          onViewPlayerStats={handleViewPlayerStats}
          onDeletePost={handleDeletePost}
          onViewApplications={handleViewApplications}
          onModeratePost={openModeration}
          memberStatusMap={memberStatusMap}
          applicationCounts={applicationCounts}
          resolveDistanceLabel={distanceLabel}
        />
      </View>

      {showCreateButton ? (
        <TouchableOpacity
          onPress={handleCreatePost}
          activeOpacity={0.9}
          className="items-center justify-center z-50 bg-brand-primary"
          /* `bottom: 110` fijo pisaba la Tab Bar en los equipos con inset
             grande: la barra mide 62 + insets.bottom, o sea hasta 110 en un
             iPhone con Home Indicator. Se calcula con el mismo helper que usan
             las pantallas para su paddingBottom. */
          style={{
            position: 'absolute', bottom: fabBottom, right: 20, height: 56, width: 56,
            borderRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 5, elevation: 5,
          }}
        >
          <AppIcon family="material-icons" name="add" size={28} color="#003914" />
        </TouchableOpacity>
      ) : null}

      <FilterModal
        visible={showFilterModal}
        activeTab={activeTab}
        zone={filterZone}
        selectedDays={filterDays}
        sortBy={filterSort}
        onApply={(zone, days, sortBy) => {
          setFilterZone(zone);
          setFilterDays(days);
          setFilterSort(sortBy);
        }}
        onClose={() => setShowFilterModal(false)}
      />

      <Modal
        visible={!!postPendingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setPostPendingDelete(null)}
      >
        <View className="flex-1 bg-black/65 items-center justify-center px-6">
          <View className="w-full rounded-2xl border border-surface-high bg-surface-container p-5">
            <Text className="text-neutral-on-surface font-displayBlack text-lg mb-2">Cancelar publicación</Text>
            <Text className="text-neutral-on-surface-variant font-ui text-sm mb-5">
              ¿Seguro que querés cancelar tu publicación? Esta acción la va a sacar del mercado.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setPostPendingDelete(null)}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl bg-surface-high items-center"
              >
                <Text className="text-neutral-on-surface font-uiBold">Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDeletePost}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl items-center"
                style={{ backgroundColor: 'rgba(255,84,73,0.2)', borderWidth: 1, borderColor: 'rgba(255,84,73,0.5)' }}
              >
                <Text className="text-[#FF8A80] font-uiBold">Sí, cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Moderación del Mercado. El target vive acá y no en la lista porque los
          dos sheets son `<Modal>` nativos y tienen que montarse fuera del
          FlatList; `sheet` distingue cuál está abierto, porque abrir los dos a
          la vez deja el segundo debajo del backdrop en iOS. */}
      {moderationTarget && (
        <>
          <UserActionsSheet
            visible={sheet === 'actions'}
            onClose={closeModeration}
            targetProfileId={moderationTarget.authorProfileId}
            targetName={moderationTarget.authorName}
            // Siempre `false` y no una consulta: las publicaciones de gente
            // bloqueada no llegan al feed —las policies RESTRICTIVE las filtran
            // del lado del servidor—, así que todo lo que se ve acá es de
            // alguien con quien no hay bloqueo. Preguntarlo sería una consulta
            // por tarjeta para una respuesta que ya conocemos.
            isBlocked={false}
            onReport={() => setSheet('report')}
            // Al bloquear, la publicación desaparece del feed por las policies
            // del servidor: alcanza con volver a pedir los datos.
            onBlockChanged={() => {
              setModerationTarget(null);
              void loadMarketData(false);
            }}
          />

          <ReportModal
            visible={sheet === 'report'}
            onClose={closeModeration}
            entityType={moderationTarget.entityType}
            entityId={moderationTarget.postId}
          />
        </>
      )}
    </View>
  );
}
