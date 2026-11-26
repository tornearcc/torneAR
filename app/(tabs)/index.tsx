import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { GlobalHeader } from '@/components/GlobalHeader';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useAppFonts } from '@/hooks/useAppFonts';
import { useEngagedReviewPrompt } from '@/hooks/useEngagedReviewPrompt';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchHomeViewData } from '@/lib/home-data';
import { otherPendingActions, resolveHomeNextStep, resolveJourney } from '@/lib/home-next-step';
import { Logger } from '@/lib/logger';
import type { HomeViewData, PendingAction } from '@/components/home/types';
import { HomeOnboardingState } from '@/components/home/HomeOnboardingState';
import { CensusEntryCard } from '@/components/home/CensusEntryCard';
import { JourneyBar } from '@/components/home/JourneyBar';
import { NextStepCard, type NextStepTarget } from '@/components/home/NextStepCard';
import { OtherPendingList } from '@/components/home/OtherPendingList';
import { TeamSummaryRow } from '@/components/home/TeamSummaryRow';
import { shareTeamInvite } from '@/lib/share-team-invite';
import { SuggestedRivalsCard } from '@/components/rival/SuggestedRivalsCard';
import { fetchSuggestedRivals, type SuggestedRival } from '@/lib/rival-posts-api';

/**
 * Inicio (rediseño, etapa 1; spec docs/superpowers/specs/2026-11-25-rediseno-design.md §8).
 * Un solo «próximo paso» según dónde está la persona (`lib/home-next-step.ts`),
 * la barra de 3 pasos, lo demás pendiente en una lista corta, tus equipos en una
 * línea, rivales sugeridos y el censo. Lo que antes vivía acá (mini-ranking,
 * próximos partidos, accesos rápidos) sigue en su pestaña.
 */

/** "vie 8 ago · 21:30". */
function formatMatchDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  // D-63: pedido de valoración al volver a Inicio, desde el 5.º día de uso.
  useEngagedReviewPrompt();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const fontsReady = useAppFonts();
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<HomeViewData | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();
  const [suggestedRivals, setSuggestedRivals] = useState<SuggestedRival[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [suggestionsTeamId, setSuggestionsTeamId] = useState<string | null>(null);
  const [sharingInvite, setSharingInvite] = useState(false);

  const loadData = useCallback(async () => {
    // `profile` puede llegar como una fila de NULLs (get_own_profile sin fila):
    // sin id no se consulta nada. Ver el historial de este archivo.
    const profileId = profile?.id ?? null;
    if (!profileId) {
      setViewData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchHomeViewData(profileId);
      setViewData(data);

      // «Sugeridos para tu equipo» (P3-19): del equipo activo, o del primero.
      const teamId =
        activeTeamId && data.myTeams.some((team) => team.id === activeTeamId) ? activeTeamId : (data.myTeams[0]?.id ?? null);
      setSuggestionsTeamId(teamId);
      if (!teamId) {
        setSuggestedRivals([]);
        setSuggestedLoading(false);
      } else {
        void fetchSuggestedRivals(teamId, 3)
          .catch((suggestionsError: unknown) => {
            Logger.warn('No se pudieron cargar los rivales sugeridos del inicio', {
              scope: 'tabs.index.loadSuggestedRivals',
              profileId,
              teamId,
              error: suggestionsError,
            });
            return [] as SuggestedRival[];
          })
          .then((rows) => {
            setSuggestedRivals(rows);
            setSuggestedLoading(false);
          });
      }
    } catch (error) {
      Logger.error('No se pudo cargar la pantalla de inicio', { scope: 'tabs.index.loadData', profileId, error });
      showAlert('Error al cargar inicio', getGenericSupabaseErrorMessage(error, 'No se pudo cargar la pantalla de inicio.'));
    } finally {
      setLoading(false);
    }
  }, [profile, activeTeamId, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const next = useMemo(() => (viewData ? resolveHomeNextStep(viewData) : null), [viewData]);
  const journey = useMemo(() => (viewData ? resolveJourney(viewData) : null), [viewData]);
  const others = useMemo(() => (viewData && next ? otherPendingActions(viewData, next) : []), [viewData, next]);

  // ─── Navegación ────────────────────────────────────────────────────────────
  // `router.navigate` (no `push`) para ir a una pestaña: reutiliza la instancia
  // y no apila otra encima de Inicio.

  // Cada señal lleva al lugar donde SE RESUELVE (D12).
  const handlePendingAction = (action: PendingAction) => {
    switch (action.type) {
      case 'DISPUTE':
      case 'LIVE_RESULT':
      case 'MATCH_PROPOSAL':
      case 'CANCELLATION_REQUEST':
        if (action.matchId) router.push({ pathname: '/match-detail', params: { matchId: action.matchId } });
        else router.navigate('/(tabs)/matches');
        break;
      case 'CHALLENGE_RECEIVED':
        router.push('/challenge-inbox');
        break;
      case 'MARKET_APPLICATION':
        // Todas de un mismo aviso: directo a su lista. Si no, al Mercado.
        if (action.postId && action.postType) {
          router.push({ pathname: '/market-applications', params: { postId: action.postId, postType: action.postType } });
        } else {
          router.navigate('/(tabs)/market');
        }
        break;
      case 'TEAM_REQUEST': {
        const teamId = viewData?.incompleteTeam?.id ?? viewData?.myTeams[0]?.id;
        if (teamId) router.push({ pathname: '/team-manage', params: { teamId } });
        else router.navigate('/(tabs)/profile');
        break;
      }
    }
  };

  const handleInvite = async () => {
    const team = viewData?.incompleteTeam;
    if (!team || sharingInvite) return;
    try {
      setSharingInvite(true);
      await shareTeamInvite({ team, profile: profile ?? null, surface: 'home_next_step' });
    } catch (error) {
      Logger.error('No se pudo compartir la invitación del equipo desde Inicio', { scope: 'tabs.index.handleInvite', teamId: team.id, error });
      showAlert('No se pudo compartir', getGenericSupabaseErrorMessage(error, 'Intenta nuevamente en unos segundos.'));
    } finally {
      setSharingInvite(false);
    }
  };

  const handleCopyCode = async () => {
    const code = viewData?.incompleteTeam?.inviteCode;
    if (!code) return;
    await Clipboard.setStringAsync(code);
    showAlert('Código copiado', `Pasáselo a tus amigos: con ${code} entran al equipo.`);
  };

  const handleNextStep = (target: NextStepTarget) => {
    if (!next) return;
    switch (target) {
      case 'join_code':
        router.push('/team-join');
        break;
      case 'team_create':
        router.push('/team-create');
        break;
      case 'invite':
        void handleInvite();
        break;
      case 'copy_code':
        void handleCopyCode();
        break;
      case 'pending':
        if ('action' in next) handlePendingAction(next.action);
        break;
      case 'match':
        if (next.kind === 'NEXT_MATCH') router.push({ pathname: '/match-detail', params: { matchId: next.match.id } });
        break;
      case 'find_rival':
        router.navigate({ pathname: '/(tabs)/market', params: { tab: 'rivales', ts: String(Date.now()) } });
        break;
    }
  };

  const goToCensus = () => router.push('/censo');
  const goToRanking = () => router.navigate('/(tabs)/ranking');

  // ─── Render ────────────────────────────────────────────────────────────────

  // Solo la PRIMERA carga muestra esqueleto; los refrescos por foco actualizan en silencio.
  const isInitialLoad = loading && !viewData;
  const hasNoTeams = !viewData || viewData.myTeams.length === 0;

  // Sin las fuentes no se dibuja ningún texto (M-02, ver `useAppFonts`).
  if (!fontsReady) return <View className="flex-1 bg-surface-base" />;

  const nextMatch = next?.kind === 'NEXT_MATCH' ? next.match : null;
  const matchDateLabel = nextMatch ? (nextMatch.scheduledAt ? formatMatchDate(nextMatch.scheduledAt) : 'Sin fecha todavía') : undefined;
  const showRivals = next?.kind === 'FIND_RIVAL' || next?.kind === 'NEXT_MATCH' || next?.kind === 'ASK_CAPTAIN';

  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader />

      {isInitialLoad ? (
        <HomeSkeleton />
      ) : hasNoTeams ? (
        <HomeOnboardingState
          onCreateTeam={() => router.push('/team-create')}
          onJoinTeam={() => router.push('/team-join')}
          onGoToMarket={() => router.navigate('/(tabs)/market')}
          onGoToRanking={goToRanking}
          onGoToCensus={goToCensus}
          pendingTransfers={viewData?.pendingTransfers ?? 0}
          onConfirmTransfer={() => router.push('/team-requests')}
          marketApplication={viewData?.pendingActions.find((a) => a.type === 'MARKET_APPLICATION') ?? null}
          onOpenApplication={handlePendingAction}
        />
      ) : (
        <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 114 }} showsVerticalScrollIndicator={false}>
          {journey && <JourneyBar step={journey.step} teamProgress={journey.teamProgress} />}
          {next && <NextStepCard next={next} onAction={handleNextStep} matchDateLabel={matchDateLabel} />}
          <OtherPendingList actions={others} onPress={handlePendingAction} />

          {viewData.myTeams.map((team) => (
            <TeamSummaryRow key={team.id} team={team} onPress={() => router.push({ pathname: '/team-manage', params: { teamId: team.id } })} />
          ))}

          {showRivals && (
            <View className="mt-2.5">
              <SuggestedRivalsCard
                rivals={suggestedRivals}
                loading={suggestedLoading}
                onPressRival={(teamId) => router.push({ pathname: '/team-stats', params: { teamId, viewerTeamId: suggestionsTeamId ?? '' } })}
                onSeeMore={() => router.push('/rival-search')}
              />
            </View>
          )}

          <CensusEntryCard onPress={goToCensus} className="mt-2.5" />
        </ScrollView>
      )}

      {AlertComponent}
    </View>
  );
}
