import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { Logger } from '@/lib/logger';
import {
  fetchActiveSeason, fetchActiveTeamRankingInfo, fetchRankingWithFilters,
  fetchPlayerLeaderboardPage, appendLeaderboardPage, loadLeaderboardUntilMine,
  leaderboardEntryKey,
} from '@/lib/ranking-data';
import { parseRankingFullParams } from '@/lib/ranking-params';
import { RankingFilterModal } from '@/components/ranking/RankingFilterModal';
import { RankingColumnsHeader } from '@/components/ranking/RankingTable';
import { RankingTeamRow } from '@/components/ranking/RankingTeamRow';
import { PlayerLeaderboardRow } from '@/components/ranking/PlayerLeaderboardRow';
import { RankingRowSkeleton } from '@/components/ranking/RankingRowSkeleton';
import {
  LeaderboardCategoryChips, LeaderboardStatChips, getStatTab,
} from '@/components/ranking/PlayerLeaderboard';
import { RankingContextChips, buildRankingChips } from '@/components/ranking/RankingContextChips';
import type {
  LeaderboardStat, PlayerLeaderboardEntry, RankingFiltersState, RankingTeamEntry,
} from '@/components/ranking/types';

/**
 * "Ver tabla completa" de la pestaña Ranking.
 *
 * Pantalla aparte y no expansión inline: la pestaña es un ScrollView con dos
 * modos y dos tablas, y una FlatList adentro pierde la virtualización. Acá la
 * lista es la raíz y el encabezado (filtros + columnas) queda fijo arriba.
 *
 * Llega con los filtros de la pestaña por params (`buildRankingFullParams`) y
 * se pueden cambiar desde el mismo modal sin volver.
 *
 * · Equipos: `get_team_ranking` no tiene límite y la pestaña ya baja la tabla
 *   entera, así que se pide una vez y se virtualiza en el cliente. "Rivales
 *   ideales" sigue filtrando en el cliente, igual que en la pestaña.
 * · Jugadores: paginado contra `get_player_leaderboard` (scroll infinito).
 */

type PlayersState = {
  entries: PlayerLeaderboardEntry[];
  /** Filas que devolvió el servidor: es el offset de la próxima página. */
  nextOffset: number;
  hasMore: boolean;
};

const EMPTY_PLAYERS: PlayersState = { entries: [], nextOffset: 0, hasMore: false };

export default function RankingFullScreen() {
  const params = useLocalSearchParams<{
    kind?: string; zone?: string; category?: string; format?: string; ideales?: string; stat?: string;
  }>();
  // Los params se leen una sola vez: después, filtros y stat son estado de la
  // pantalla y los cambia el usuario.
  const [initial] = useState(() => parseRankingFullParams(params));
  const kind = initial.kind;

  const { profile } = useAuth();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const { showAlert, AlertComponent } = useCustomAlert();

  const [filters, setFilters] = useState<RankingFiltersState>(initial.filters);
  const [stat, setStat] = useState<LeaderboardStat>(initial.stat);
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);

  const [season, setSeason] = useState<{ id: string; name: string } | null>(null);
  const [seasonLoaded, setSeasonLoaded] = useState(false);

  const [teams, setTeams] = useState<RankingTeamEntry[]>([]);
  const [players, setPlayers] = useState<PlayersState>(EMPTY_PLAYERS);
  // Clave de la consulta cuyo resultado está en pantalla. `loading` se deriva
  // de ella: mientras no coincida con la consulta actual (al abrir o al cambiar
  // filtros/stat) se muestra el esqueleto. El pull-to-refresh no cambia la
  // clave, así que la lista queda visible con el spinner nativo.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locating, setLocating] = useState(false);

  // Id de la carga vigente: una respuesta de filtros viejos no puede pisar la
  // de los filtros nuevos (mismo patrón que la búsqueda de rivales).
  const requestRef = useRef(0);
  const teamsListRef = useRef<FlatList<RankingTeamEntry>>(null);
  const playersListRef = useRef<FlatList<PlayerLeaderboardEntry>>(null);

  const myProfileId = profile?.id ?? null;
  const queryKey = JSON.stringify([kind, filters, stat, season?.id ?? null]);
  const loading = !seasonLoaded || loadedKey !== queryKey;

  // ── Temporada (sólo la usa la tabla de jugadores, igual que la pestaña) ─────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const active = await fetchActiveSeason();
        if (!cancelled) setSeason(active);
      } catch (error) {
        // Sin temporada la tabla igual carga: el RPC la toma como "todas".
        Logger.warn('No se pudo leer la temporada activa en la tabla completa', {
          scope: 'ranking-full.season',
          error,
        });
      } finally {
        if (!cancelled) setSeasonLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Carga (primera página / tabla entera) ───────────────────────────────────
  // Corre al abrir, al cambiar filtros o stat, y con cada pull-to-refresh
  // (`refreshToken`). Se espera a la temporada: la consulta depende de ella, y
  // arrancar antes haría una primera carga que se descarta en cuanto llega.
  useEffect(() => {
    if (!seasonLoaded) return;

    const requestId = ++requestRef.current;
    const isStale = () => requestId !== requestRef.current;

    void (async () => {
      try {
        if (kind === 'teams') {
          const elo = filters.rivalesIdeales && activeTeamId
            ? (await fetchActiveTeamRankingInfo(activeTeamId))?.eloRating ?? null
            : null;
          const teamIds = useTeamStore.getState().myTeams.map((t) => t.id);
          const rows = await fetchRankingWithFilters(filters, teamIds, elo);
          if (isStale()) return;
          setTeams(rows);
        } else {
          const page = await fetchPlayerLeaderboardPage({
            stat, filters, seasonId: season?.id ?? null, myProfileId, offset: 0,
          });
          if (isStale()) return;
          setPlayers({ entries: page.entries, nextOffset: page.entries.length, hasMore: page.hasMore });
        }
      } catch (error) {
        Logger.error('No se pudo cargar la tabla completa', {
          scope: 'ranking-full.load',
          kind,
          filters,
          stat,
          error,
        });
        if (!isStale()) showAlert('Error', 'No se pudo cargar la tabla. Probá de nuevo.');
      } finally {
        if (!isStale()) {
          // También con error: si no, el esqueleto quedaría para siempre.
          setLoadedKey(queryKey);
          setRefreshing(false);
        }
      }
    })();
  }, [seasonLoaded, kind, filters, stat, season, activeTeamId, myProfileId, queryKey, refreshToken, showAlert]);

  // ── Scroll infinito (jugadores) ─────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (kind !== 'players' || loading || loadingMore || !players.hasMore) return;
    const requestId = requestRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchPlayerLeaderboardPage({
        stat, filters, seasonId: season?.id ?? null, myProfileId, offset: players.nextOffset,
      });
      if (requestId !== requestRef.current) return;
      setPlayers((current) => ({
        entries: appendLeaderboardPage(current.entries, page.entries),
        nextOffset: current.nextOffset + page.entries.length,
        hasMore: page.hasMore,
      }));
    } catch (error) {
      Logger.error('No se pudo cargar la siguiente página de jugadores', {
        scope: 'ranking-full.loadMore',
        offset: players.nextOffset,
        error,
      });
      // Se corta el scroll infinito en vez de reintentar en loop contra un
      // servidor que está fallando; el pull-to-refresh lo vuelve a habilitar.
      if (requestId === requestRef.current) setPlayers((current) => ({ ...current, hasMore: false }));
    } finally {
      setLoadingMore(false);
    }
  }, [kind, loading, loadingMore, players, stat, filters, season, myProfileId]);

  // ── Ir a mi equipo / mi posición ────────────────────────────────────────────
  const myTeamIndex = teams.findIndex((t) => t.isMyTeam);

  function scrollToRow(list: FlatList<RankingTeamEntry> | FlatList<PlayerLeaderboardEntry> | null, index: number) {
    list?.scrollToIndex({ index, viewPosition: 0.4, animated: true });
  }

  // Las filas no tienen alto fijo (no hay getItemLayout): si el índice todavía
  // no está medido, se salta a una posición estimada y se reintenta.
  function handleScrollToIndexFailed(
    list: FlatList<RankingTeamEntry> | FlatList<PlayerLeaderboardEntry> | null,
    info: { index: number; averageItemLength: number },
  ) {
    list?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    setTimeout(() => scrollToRow(list, info.index), 120);
  }

  async function handleLocateMe() {
    if (kind === 'teams') {
      if (myTeamIndex !== -1) scrollToRow(teamsListRef.current, myTeamIndex);
      return;
    }

    const requestId = requestRef.current;
    setLocating(true);
    try {
      const result = await loadLeaderboardUntilMine(players, (offset) =>
        fetchPlayerLeaderboardPage({ stat, filters, seasonId: season?.id ?? null, myProfileId, offset }),
      );
      if (requestId !== requestRef.current) return;
      setPlayers({ entries: result.entries, nextOffset: result.nextOffset, hasMore: result.hasMore });

      if (result.index === -1) {
        showAlert(
          'No aparecés en esta tabla',
          result.hasMore
            ? 'No estás entre los primeros puestos con estos filtros.'
            : 'Todavía no sumaste en esta estadística con estos filtros.',
        );
        return;
      }
      // Un frame para que la FlatList reciba las filas nuevas antes de scrollear.
      requestAnimationFrame(() => scrollToRow(playersListRef.current, result.index));
    } catch (error) {
      Logger.error('No se pudo ubicar al usuario en la tabla de jugadores', {
        scope: 'ranking-full.locateMe',
        error,
      });
      showAlert('Error', 'No pudimos encontrar tu posición. Probá de nuevo.');
    } finally {
      setLocating(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    setRefreshToken((token) => token + 1);
  }

  const statTab = getStatTab(stat);
  const hasActiveFilters = Boolean(
    filters.zone || filters.category || filters.format || (kind === 'teams' && filters.rivalesIdeales),
  );
  const chips = buildRankingChips(filters, kind === 'players' ? season?.name ?? null : null, {
    forPlayers: kind === 'players',
  });
  const canLocate = kind === 'teams' ? myTeamIndex !== -1 : myProfileId !== null;

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#53E076" colors={['#53E076']} />
  );

  const emptyState = (
    <EmptyState
      icon={hasActiveFilters ? 'filter-remove-outline' : 'trophy-outline'}
      title="Sin resultados"
      description={
        hasActiveFilters
          ? 'Nada coincide con estos filtros. Probá quitando alguno para ampliar la tabla.'
          : 'Todavía no hay datos en esta tabla.'
      }
      actionLabel={hasActiveFilters ? 'Limpiar filtros' : undefined}
      onAction={
        hasActiveFilters
          ? () => setFilters({ zone: null, category: null, format: null, rivalesIdeales: false })
          : undefined
      }
    />
  );

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title={kind === 'teams' ? 'Tabla de equipos' : 'Tabla de jugadores'}
        subtitle={kind === 'teams' ? 'Posiciones completas del ranking' : statTab.label}
        rightSlot={
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setFilterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Filtros"
            className={`h-9 w-9 items-center justify-center rounded-xl border ${hasActiveFilters ? 'border-brand-primary/30 bg-brand-primary/10' : 'border-transparent bg-surface-low'}`}
          >
            <AppIcon family="material-community" name="tune" size={18} color={hasActiveFilters ? '#53E076' : '#BCCBB9'} />
          </TouchableOpacity>
        }
      />

      {/* Encabezado fijo: filtros activos, stat y columnas. */}
      <View className="px-4 pt-3">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <RankingContextChips chips={chips} />
          </View>
          {canLocate && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => void handleLocateMe()}
              disabled={locating || loading}
              accessibilityRole="button"
              className="mt-2 flex-row items-center gap-1 rounded-full bg-brand-primary/15 px-3 py-1.5"
            >
              {locating
                ? <ActivityIndicator size="small" color="#53E076" />
                : <AppIcon family="material-community" name="crosshairs-gps" size={13} color="#53E076" />}
              <Text className="font-uiBold text-[11px] text-brand-primary">
                {kind === 'teams' ? 'Mi equipo' : 'Mi posición'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {kind === 'players' && (
          <View className="mt-3">
            <LeaderboardStatChips activeStat={stat} onStatChange={setStat} />
            <LeaderboardCategoryChips
              activeCategory={filters.category}
              onCategoryChange={(category) => setFilters((current) => ({ ...current, category }))}
            />
          </View>
        )}
        {kind === 'teams' && (
          <View className="mt-3">
            <RankingColumnsHeader />
          </View>
        )}
      </View>

      {loading ? (
        <View className="px-4">
          {Array.from({ length: 8 }).map((_, i) => <RankingRowSkeleton key={i} />)}
        </View>
      ) : kind === 'teams' ? (
        <FlatList
          ref={teamsListRef}
          className="px-4"
          data={teams}
          keyExtractor={(entry) => entry.teamId}
          renderItem={({ item }) => (
            <RankingTeamRow
              entry={item}
              animated={false}
              onPress={(id) => router.push({ pathname: '/team-stats', params: { teamId: id, viewerTeamId: activeTeamId || '' } })}
            />
          )}
          onScrollToIndexFailed={(info) => handleScrollToIndexFailed(teamsListRef.current, info)}
          ListEmptyComponent={emptyState}
          refreshControl={refreshControl}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          ref={playersListRef}
          className="px-4"
          data={players.entries}
          keyExtractor={leaderboardEntryKey}
          renderItem={({ item }) => (
            <PlayerLeaderboardRow entry={item} statLabel={statTab.valueLabel} isPercent={statTab.isPercent} animated={false} />
          )}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          onScrollToIndexFailed={(info) => handleScrollToIndexFailed(playersListRef.current, info)}
          ListEmptyComponent={emptyState}
          ListFooterComponent={
            loadingMore ? <View className="py-4"><ActivityIndicator color="#53E076" /></View> : null
          }
          refreshControl={refreshControl}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <RankingFilterModal
        visible={isFilterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApply={setFilters}
      />
      {AlertComponent}
    </SafeAreaView>
  );
}
