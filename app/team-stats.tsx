import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { ReportModal } from '@/components/reports/ReportModal';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchTeamStatsViewData, fetchTeamBadges } from '@/lib/team-stats-api';
import type { TeamStatsViewData, H2HMatch, TeamBadgeItem } from '@/components/team-stats/types';
import { TeamHeader } from '@/components/team-stats/TeamHeader';
import { TeamEloChart } from '@/components/team-stats/TeamEloChart';
import { TeamFormAndSeason } from '@/components/team-stats/TeamFormAndSeason';
import { TeamRecentMatches } from '@/components/team-stats/TeamRecentMatches';
import { TeamMembersSection } from '@/components/team-stats/TeamMembersSection';
import { TeamBadgesSection } from '@/components/team-stats/TeamBadgesSection';
import { fetchTeamH2H } from '@/lib/team-h2h-data';
import { TeamH2HSection } from '@/components/team-stats/TeamH2HSection';
import { ChallengeButton } from '@/components/ranking/ChallengeButton';
import { getActiveChallengeWithTeam } from '@/lib/challenge-actions';
import { Logger } from '@/lib/logger';

export default function TeamStatsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { teamId, viewerTeamId } = useLocalSearchParams<{ teamId: string, viewerTeamId?: string }>();

  // `loading` se deriva de si la carga del equipo pedido ya terminó. El efecto
  // no enciende ni apaga el flag desde su cuerpo síncrono —eso dispara renders
  // en cascada—: sólo lo marca como terminado desde el `.finally`.
  const [settled, setSettled] = useState(false);
  const [viewData, setViewData] = useState<TeamStatsViewData | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();
  const [h2hMatches, setH2hMatches] = useState<H2HMatch[]>([]);
  const [alreadyChallenged, setAlreadyChallenged] = useState(false);
  const [teamBadges, setTeamBadges] = useState<TeamBadgeItem[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);

  const isRival = Boolean(viewerTeamId && viewerTeamId !== teamId);
  // Se extrae el id antes del callback: con `profile?.id` directo en el array
  // de deps, el React Compiler infiere `profile` entero como dependencia
  // —menos específica que la declarada— y desactiva la memoización de la
  // pantalla. Con la variable, lo inferido y lo declarado coinciden.
  const profileId = profile?.id ?? null;

  const loading = Boolean(teamId) && !settled;

  // La parte async no toca estado: junta todo y lo devuelve. Las escrituras
  // viven en los callbacks de `.then`/`.catch`/`.finally`, que es lo único que
  // el React Compiler no considera síncrono respecto del efecto que llama a
  // esta función.
  const loadData = useCallback(() => {
    if (!teamId) return;

    const fetchAll = async () => {
      const data = await fetchTeamStatsViewData(teamId, profileId);

      // Los tres `.catch` de abajo degradan a vacío a propósito (una sección
      // secundaria no debe tumbar la pantalla), pero sin telemetría eran
      // indistinguibles de "este equipo no tiene insignias / historial".
      const badges = await fetchTeamBadges(teamId).catch((error: unknown) => {
        Logger.warn('No se pudieron cargar las insignias del equipo; se muestra vacío', {
          scope: 'team-stats.loadData',
          teamId,
          error,
        });
        return [];
      });

      if (!isRival || !viewerTeamId) {
        return { data, badges, h2h: [] as H2HMatch[], challenged: false };
      }

      const [h2h, challenged] = await Promise.all([
        fetchTeamH2H(viewerTeamId, teamId).catch((error: unknown) => {
          Logger.warn('No se pudo cargar el head-to-head; se muestra vacío', {
            scope: 'team-stats.loadData',
            teamId,
            viewerTeamId,
            error,
          });
          return [];
        }),
        getActiveChallengeWithTeam(viewerTeamId, teamId).catch((error: unknown) => {
          // Degradar a `false` habilita el botón de desafío: si ya había uno
          // activo, el usuario se come el rechazo del servidor sin saber por qué.
          Logger.warn('No se pudo verificar si ya existe un desafío activo; se asume que no', {
            scope: 'team-stats.loadData',
            teamId,
            viewerTeamId,
            error,
          });
          return false;
        }),
      ]);

      return { data, badges, h2h: h2h as H2HMatch[], challenged: challenged as boolean };
    };

    return fetchAll()
      .then(({ data, badges, h2h, challenged }) => {
        setViewData(data);
        setTeamBadges(badges);
        setH2hMatches(h2h);
        setAlreadyChallenged(challenged);
      })
      .catch((error: unknown) => {
        Logger.error('No se pudo cargar el detalle de stats del equipo', {
          scope: 'team-stats.loadData',
          teamId,
          viewerTeamId,
          error,
        });
        showAlert(
          'Error al cargar stats',
          getGenericSupabaseErrorMessage(error, 'No se pudo cargar el detalle del equipo.'),
        );
      })
      .finally(() => setSettled(true));
  }, [teamId, viewerTeamId, isRival, profileId, showAlert]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Al recargar tras un desafío se vuelve a mostrar el loader de pantalla
  // completa, como hacía el `setLoading(true)` que había al principio de la
  // carga. Va acá —en el handler del evento— y no dentro de `loadData`, que
  // también la llama el efecto.
  const reloadAfterChallenge = useCallback(() => {
    setSettled(false);
    void loadData();
  }, [loadData]);

  // Pertenencia al equipo que se está mirando. Se deriva del plantel que la
  // pantalla ya trajo, y no de `viewerTeamId`, que es un parámetro opcional y
  // no llega cuando se entra desde el ranking sin equipo activo.
  const isMemberOfTeam = Boolean(
    profileId && viewData?.members.some((member) => member.profileId === profileId),
  );

  if (loading) return <GlobalLoader label="Cargando stats del equipo" />;

  if (!viewData) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-display text-xl text-neutral-on-surface">Equipo no disponible</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          className="mt-4 rounded-lg bg-surface-high px-4 py-2"
        >
          <Text className="font-ui text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
        {AlertComponent}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      {/* Reemplaza al GlobalHeader + boton "Volver" con caja: esta es una
          pantalla de detalle a la que se llega desde otra, no una tab. */}
      <SecondaryHeader
        title="Stats del Equipo"
        // El nombre y el escudo de un equipo los carga un usuario, así que son
        // contenido denunciable como cualquier otro (guideline 1.2). Sólo
        // aparece sobre equipos ajenos: la pertenencia se deriva del plantel
        // que ya trae la pantalla, no de `viewerTeamId`, que es opcional y
        // falta cuando se llega desde el ranking sin equipo activo.
        rightSlot={
          isMemberOfTeam ? null : (
            <TouchableOpacity
              onPress={() => setShowReportModal(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Denunciar equipo"
            >
              <AppIcon family="material-community" name="flag-outline" size={20} color="#869585" />
            </TouchableOpacity>
          )
        }
      />
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 114 }}>
        <TeamHeader header={viewData.header} />
        <TeamEloChart history={viewData.eloHistory} currentElo={viewData.header.prRating} />
        <TeamFormAndSeason form={viewData.form} season={viewData.season} />
        <TeamRecentMatches matches={viewData.recentMatches} />

        {isRival && (
          <TeamH2HSection
            h2h={h2hMatches}
            myTeamId={viewerTeamId!}
            opponentName={viewData.header.name}
          />
        )}

        {/* Plantilla primero */}
        <TeamMembersSection members={viewData.members} />

        <TeamBadgesSection badges={teamBadges} />

        {/* Botones de desafío al final, después de ver la plantilla */}
        {isRival && profile && viewerTeamId && (
          <View className="mt-4 gap-3">
            <ChallengeButton
              challengerTeamId={viewerTeamId}
              opponentTeamId={teamId}
              matchType="RANKING"
              showAlert={showAlert}
              alreadyChallenged={alreadyChallenged}
              onSuccess={reloadAfterChallenge}
            />
            <ChallengeButton
              challengerTeamId={viewerTeamId}
              opponentTeamId={teamId}
              matchType="AMISTOSO"
              showAlert={showAlert}
              alreadyChallenged={alreadyChallenged}
              onSuccess={reloadAfterChallenge}
            />
          </View>
        )}

      </ScrollView>

      {!isMemberOfTeam && (
        <ReportModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          entityType="TEAM"
          entityId={teamId}
        />
      )}

      {AlertComponent}
    </View>
  );
}
