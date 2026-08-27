import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { GlobalHeader } from '@/components/GlobalHeader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import {
  fetchRankingWithFilters, searchRivalTeams, fetchPlayerLeaderboard,
  fetchActiveSeason, fetchActiveTeamRankingInfo,
} from '@/lib/ranking-data';
import { Logger } from '@/lib/logger';
import type { RankingFiltersState, RankingMode, LeaderboardStat, RankingTeamEntry, RivalTeamEntry, PlayerLeaderboardEntry } from '@/components/ranking/types';

import { RankingFilterModal } from '@/components/ranking/RankingFilterModal';
import { RankingTable } from '@/components/ranking/RankingTable';
import { RankingRowSkeleton } from '@/components/ranking/RankingRowSkeleton';
import { RivalSearchBar } from '@/components/ranking/RivalSearchBar';
import { RivalTeamCard } from '@/components/ranking/RivalTeamCard';
import { PlayerLeaderboard } from '@/components/ranking/PlayerLeaderboard';

// Ventana de espera antes de pegarle a la BD mientras el usuario tipea. Un nombre
// de 12 caracteres pasaba de 12 requests a 1.
const SEARCH_DEBOUNCE_MS = 300;

// Helper para parsear la categoría para el texto
const getCategoryLabel = (cat: string | null) => {
  if (!cat) return 'Todas las categorías';
  return cat.charAt(0) + cat.slice(1).toLowerCase();
};

// ── Contexto entrante por navegación (Home → "Ver la tabla completa") ─────────
// Los params se validan contra los valores conocidos en vez de castearse: van
// derecho como argumento enum de `get_team_ranking`, y un valor basura (deep
// link a mano, param viejo) haría fallar la RPC y dejaría la pantalla en error.
// Lo que no reconocemos vale null = "sin filtro".

const TEAM_CATEGORIES = ['HOMBRES', 'MUJERES', 'MIXTO'] as const;
const TEAM_FORMATS = [
  'FUTBOL_5', 'FUTBOL_6', 'FUTBOL_7', 'FUTBOL_8', 'FUTBOL_9', 'FUTBOL_11',
] as const;

type RouteParam = string | string[] | undefined;

/** Un param vacío es "sin filtro", no un filtro por string vacío. */
function paramToNullable(value: RouteParam): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function parseCategoryParam(value: RouteParam): RankingFiltersState['category'] {
  const raw = paramToNullable(value);
  return TEAM_CATEGORIES.find((category) => category === raw) ?? null;
}

function parseFormatParam(value: RouteParam): RankingFiltersState['format'] {
  const raw = paramToNullable(value);
  return TEAM_FORMATS.find((format) => format === raw) ?? null;
}

export default function RankingScreen() {
  const { profile } = useAuth();
  const { activeTeamId, myTeams } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  // Contexto con el que llega el usuario desde el widget del Inicio. `ts` es el
  // nonce que emite la Home: identifica CADA navegación, y es lo que permite
  // re-aplicar el contexto sin pisar los filtros que el usuario toca a mano.
  const { zone: zoneParam, category: categoryParam, format: formatParam, ts: tsParam } =
    useLocalSearchParams<{ zone?: string; category?: string; format?: string; ts?: string }>();

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RankingMode>('RANKING');

  const [filters, setFilters] = useState<RankingFiltersState>({
    zone: null, category: null, format: null, rivalesIdeales: false,
  });
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);

  const [rankingEntries, setRankingEntries] = useState<RankingTeamEntry[]>([]);
  const [activeTeamElo, setActiveTeamElo] = useState<number | null>(null);
  const tabBarInset = useTabBarInset();
  const [activeSeason, setActiveSeason] = useState<{ id: string; name: string } | null>(null);

  // NUEVO: Estado para guardar las zonas de la BD

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RivalTeamEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [leaderboardStat, setLeaderboardStat] = useState<LeaderboardStat>('goals');
  const [leaderboardEntries, setLeaderboardEntries] = useState<PlayerLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // `bootstrapped` habilita los efectos de datos: evita que corran con los filtros
  // vacios del primer render, antes de conocer los del equipo activo.
  const [bootstrapped, setBootstrapped] = useState(false);
  // Token de refresco. El focus effect lo incrementa para recargar datos SIN
  // tocar los filtros elegidos por el usuario.
  const [refreshToken, setRefreshToken] = useState(0);
  // Equipo cuyos filtros por defecto ya aplicamos. Es el guard que impide que un
  // re-render vuelva a pisar la seleccion del usuario.
  const bootstrappedTeamRef = useRef<string | null>(null);
  // Ultimo nonce de navegacion ya aplicado. Los params quedan pegados en la ruta
  // despues de consumirlos, asi que sin esto un cambio de equipo activo volveria
  // a aplicar el contexto viejo de la Home en vez de los defaults del equipo.
  const consumedNonceRef = useRef<string | null>(null);
  const isFirstFocus = useRef(true);
  // Id incremental de request de busqueda. Solo la respuesta cuyo id coincide con
  // el ultimo emitido puede escribir en el estado.
  const searchRequestRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeRole = myTeams.find(t => t.id === activeTeamId)?.role;
  const canChallenge = activeRole === 'CAPITAN' || activeRole === 'SUBCAPITAN';

  // ── 1) Bootstrap: temporada, zonas, ELO y filtros por defecto del equipo ─────
  // Corre UNA sola vez por `activeTeamId`. Es el unico punto que llama a
  // setFilters() de forma automatica; cualquier otra escritura nace de una accion
  // explicita del usuario. Antes esto vivia dentro de la misma funcion que cargaba
  // los datos y se re-ejecutaba en cada focus, revirtiendo los filtros aplicados.
  useEffect(() => {
    if (!profile) return;

    // Dos disparadores independientes, cada uno con su guard:
    //   · cambió el equipo activo            → filtros por defecto de ese equipo
    //   · llegó una navegación desde la Home → contexto que traen los params
    // Un focus normal no es ninguno de los dos, y por eso sigue sin tocar los
    // filtros que el usuario haya elegido a mano.
    const incomingNonce = paramToNullable(tsParam);
    const teamKey = activeTeamId ?? '__sin-equipo__';
    const hasFreshParams = incomingNonce !== null && consumedNonceRef.current !== incomingNonce;
    const needsTeamBootstrap = bootstrappedTeamRef.current !== teamKey;

    if (!hasFreshParams && !needsTeamBootstrap) return;

    /*
     * Los guards se marcan como consumidos ANTES de arrancar el trabajo async
     * (si no, un segundo render dispararia una carga duplicada), pero eso deja
     * una ventana peligrosa: si esta corrida se cancela a mitad de camino, los
     * refs quedan marcados y la corrida siguiente sale por el `return` de
     * arriba sin haber cargado nada. `bootstrapped` se queda en false para
     * siempre, el efecto 2 nunca corre y `loading` nunca vuelve a false — la
     * carga infinita al entrar desde el widget de la Home.
     *
     * Pasa justo por esa via y no desde la tab porque la navegacion con params
     * suma cuatro dependencias mas (`ts`, `zone`, `category`, `format`) que la
     * ruta va publicando en mas de un render: alcanza con que una llegue un
     * tick despues para cancelar la corrida en vuelo. Entrando por la tab no
     * hay params y el efecto corre una sola vez.
     *
     * Por eso se guarda el valor anterior y se restaura si la corrida no llego
     * a publicar su resultado.
     */
    const previousTeamKey = bootstrappedTeamRef.current;
    const previousNonce = consumedNonceRef.current;
    bootstrappedTeamRef.current = teamKey;
    if (hasFreshParams) consumedNonceRef.current = incomingNonce;

    let cancelled = false;
    /** La corrida llego a publicar su resultado (exito o error manejado). */
    let settled = false;
    setBootstrapped(false);

    void (async () => {
      try {
        setLoading(true);
        // El catálogo de zonas ya no se pide acá: el sheet de filtros lo carga
        // por su cuenta (cacheado por sesión en `fetchZoneCatalog`) y así el
        // ranking no espera una query que sólo se usa al abrir los filtros.
        const season = await fetchActiveSeason();
        if (cancelled) return;

        setActiveSeason(season);

        let elo: number | null = null;
        let defaults: RankingFiltersState = { zone: null, category: null, format: null, rivalesIdeales: false };

        if (activeTeamId) {
          const team = await fetchActiveTeamRankingInfo(activeTeamId);
          if (cancelled) return;
          if (team) {
            elo = team.eloRating;
            /*
             * Sólo la CATEGORÍA se hereda del equipo activo. `zone` y `format`
             * arrancan en null = Global.
             *
             * Antes se precargaban los tres y el resultado era una tabla vacía
             * para casi todo el mundo: con el volumen del MVP, la intersección
             * "mi zona × mi formato × mi categoría" suele tener uno o dos
             * equipos —o ninguno—, y el usuario leía eso como "el ranking no
             * funciona", no como "todavía no hay equipos acá". Un ranking
             * global con equipos adentro comunica mucho mejor que uno perfecto
             * y vacío, y el usuario puede angostar solo desde el modal.
             *
             * La categoría SÍ se retiene porque no es un recorte de volumen
             * sino de pertinencia: a un equipo de MUJERES no le sirve un
             * ranking encabezado por equipos de HOMBRES, por más lleno que
             * esté. Es el único filtro donde ver de más es peor que ver de
             * menos.
             *
             * `elo` se sigue resolviendo igual (arriba): "rivales ideales" lo
             * necesita y ese filtro no cambia.
             */
            defaults = { zone: null, category: team.category, format: null, rivalesIdeales: false };
          } else {
            // Hay equipo activo seleccionado pero no se resolvió su info: el
            // ranking arranca con filtros vacíos y parece "mal ordenado".
            Logger.warn('No se pudo resolver la info de ranking del equipo activo', {
              scope: 'tabs.ranking.bootstrap',
              activeTeamId,
            });
          }
        }

        // El contexto que viene por navegación gana sobre los defaults del
        // equipo: el usuario tocó "Ver la tabla completa" en un widget que ya
        // decía qué tabla era, y tiene que caer en ESA. El ELO ya se resolvió
        // arriba porque "rivales ideales" lo necesita igual.
        if (hasFreshParams) {
          defaults = {
            zone: paramToNullable(zoneParam),
            category: parseCategoryParam(categoryParam),
            format: parseFormatParam(formatParam),
            rivalesIdeales: false,
          };
        }

        setActiveTeamElo(elo);
        setFilters(defaults);
        settled = true;
        setBootstrapped(true);
      } catch (error: any) {
        if (cancelled) return;
        settled = true;
        Logger.error('Fallo el bootstrap del ranking', {
          scope: 'tabs.ranking.bootstrap',
          activeTeamId,
          error,
        });
        // Liberamos el guard para poder reintentar en el proximo focus.
        bootstrappedTeamRef.current = null;
        setLoading(false);
        showAlert('Error', error?.message || 'No se pudo cargar el ranking.');
      }
    })();

    return () => {
      cancelled = true;
      // Corrida abortada: se devuelven los guards a su estado anterior para que
      // la proxima pueda volver a entrar en vez de quedar bloqueada.
      if (!settled) {
        bootstrappedTeamRef.current = previousTeamKey;
        consumedNonceRef.current = previousNonce;
      }
    };
  }, [profile, activeTeamId, refreshToken, showAlert, tsParam, zoneParam, categoryParam, formatParam]);

  // ── 2) Tabla de ranking: sigue a los filtros ─────────────────────────────────
  useEffect(() => {
    if (!bootstrapped) return;

    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        // `myTeams` se lee del store bajo demanda en lugar de declararlo como
        // dependencia: fetchMyTeams devuelve un array nuevo en cada llamada, asi
        // que tenerlo en deps re-disparaba esta carga aunque los equipos fueran
        // exactamente los mismos.
        const teamIds = useTeamStore.getState().myTeams.map(t => t.id);
        const ranking = await fetchRankingWithFilters(filters, teamIds, activeTeamElo);
        if (cancelled) return;
        setRankingEntries(ranking);
      } catch (error: any) {
        Logger.error('No se pudo cargar el ranking de equipos', {
          scope: 'tabs.ranking.loadRanking',
          filters,
          error,
        });
        if (!cancelled) showAlert('Error', error?.message || 'No se pudo cargar el ranking.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [bootstrapped, filters, activeTeamElo, refreshToken, showAlert]);

  // ── 3) Leaderboard de jugadores: sigue a la zona y al stat elegido ───────────
  useEffect(() => {
    if (!bootstrapped || !profile) return;

    let cancelled = false;
    void (async () => {
      try {
        setLeaderboardLoading(true);
        const activeTeamName = useTeamStore.getState().myTeams.find(t => t.id === activeTeamId)?.name ?? null;
        const players = await fetchPlayerLeaderboard(
          leaderboardStat,
          filters.zone,
          activeSeason?.id ?? null,
          {
            profileId: profile.id,
            fullName: profile.full_name,
            avatarUrl: profile.avatar_url ?? null,
            teamId: activeTeamId ?? null,
            teamName: activeTeamName,
          },
        );
        if (cancelled) return;
        setLeaderboardEntries(players);
      } catch (error: any) {
        Logger.error('No se pudo cargar el leaderboard de jugadores', {
          scope: 'tabs.ranking.loadLeaderboard',
          leaderboardStat,
          zone: filters.zone,
          error,
        });
        if (!cancelled) showAlert('Error', error?.message || 'Error al cargar jugadores.');
      } finally {
        if (!cancelled) setLeaderboardLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [bootstrapped, profile, activeTeamId, filters.zone, leaderboardStat, activeSeason?.id, refreshToken, showAlert]);

  // ── 4) Refresco al volver a la pantalla ──────────────────────────────────────
  // La callback tiene deps vacias a proposito: useFocusEffect se re-ejecuta cuando
  // cambia su identidad, no solo al cambiar el foco. Con una callback inestable
  // corria en cada render y arrastraba consigo el reseteo de filtros.
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return; // el bootstrap ya se encarga de la carga inicial
      }
      setRefreshToken((token) => token + 1);
    }, []),
  );

  // ── 5) Busqueda de rivales ───────────────────────────────────────────────────
  // Cada llamada toma un id incremental. Al volver la respuesta, si el id ya no
  // es el ultimo emitido significa que el usuario siguio escribiendo (o cambio
  // los filtros) y esa respuesta quedo obsoleta: se descarta en silencio. Sin
  // esto, la respuesta lenta de "Bo" podia llegar despues de la de "Boca" y
  // dejar en pantalla resultados que no correspondian al texto del input.
  const runSearch = useCallback(
    async (query: string, currentFilters: RankingFiltersState) => {
      const requestId = ++searchRequestRef.current;
      const isStale = () => requestId !== searchRequestRef.current;

      try {
        setSearchLoading(true);
        const teamIds = useTeamStore.getState().myTeams.map(t => t.id);
        const results = await searchRivalTeams(query, currentFilters, teamIds, activeTeamElo);
        if (isStale()) return;
        setSearchResults(results);
      } catch (error: any) {
        Logger.error('Fallo la búsqueda de rivales', {
          scope: 'tabs.ranking.runSearch',
          query,
          error,
        });
        if (isStale()) return;
        showAlert('Error', error?.message || 'Error en la búsqueda.');
      } finally {
        // Solo la request vigente puede apagar el spinner: si lo hiciera una vieja,
        // la UI diria "listo" mientras la busqueda actual sigue en vuelo.
        if (!isStale()) setSearchLoading(false);
      }
    },
    [activeTeamElo, showAlert],
  );

  function handleSearchQueryChange(query: string) {
    // El input se actualiza al instante; la red espera al debounce.
    setSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchLoading(true); // feedback inmediato mientras corre la ventana
    searchDebounceRef.current = setTimeout(() => {
      void runSearch(query, filters);
    }, SEARCH_DEBOUNCE_MS);
  }

  // Timer pendiente al desmontar: sin esto quedaria un setState sobre una
  // pantalla que ya no existe.
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  function handleApplyFilters(newFilters: RankingFiltersState) {
    // Solo movemos el estado: los efectos 2 y 3 reaccionan y recargan.
    setFilters(newFilters);
    if (mode === 'RIVALES') {
      // Aplicar filtros es una accion explicita: no la hacemos esperar el
      // debounce, y cancelamos el que hubiera pendiente del tipeo.
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      void runSearch(searchQuery, newFilters);
    }
  }

  function handleStatChange(stat: LeaderboardStat) {
    // El efecto 3 recarga el leaderboard al cambiar `leaderboardStat`.
    setLeaderboardStat(stat);
  }

  // Saber si hay filtros activos para prender el icono
  const hasActiveFilters = Boolean(filters.zone || filters.category || filters.format || filters.rivalesIdeales);

  // Chips de contexto activo
  const contextChips = [
    activeSeason?.name ? { label: activeSeason.name, accent: false } : null,
    filters.zone ? { label: filters.zone, accent: true } : { label: 'Global', accent: false },
    filters.format ? { label: filters.format.replace('FUTBOL_', 'F'), accent: true } : null,
    filters.category ? { label: getCategoryLabel(filters.category), accent: true } : null,
    filters.rivalesIdeales ? { label: '🎯 Ideales', accent: true } : null,
  ].filter(Boolean) as { label: string; accent: boolean }[];


  return (
    <View className="flex-1 bg-surface-base">
      <GlobalHeader isRankingTab={true} />

      {/* La ultima fila de la tabla quedaba tapada por la Tab Bar: el 120 fijo
          no contemplaba el inset del dispositivo. */}
      <ScrollView className="px-4 pt-4" contentContainerStyle={{ paddingBottom: tabBarInset }} keyboardShouldPersistTaps="handled">

        {/* Nueva cabecera: Tabs + Botón Filtro + Texto */}
        <View className="mb-3">
          <View className="flex-row items-center gap-2">

            {/* Tabs (Mismo diseño que Market) */}
            <View className="flex-1 flex-row gap-2 rounded-xl bg-surface-low p-1">
              <TouchableOpacity
                className="flex-1 items-center rounded-lg py-3"
                style={mode === 'RANKING' ? { backgroundColor: '#53E076' } : undefined}
                onPress={() => setMode('RANKING')}
                activeOpacity={0.8}
              >
                <Text className="font-uiBold text-sm" style={{ color: mode === 'RANKING' ? '#003914' : '#BCCBB9' }}>
                  Ranking
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 items-center rounded-lg py-3"
                style={mode === 'RIVALES' ? { backgroundColor: '#53E076' } : undefined}
                onPress={() => setMode('RIVALES')}
                activeOpacity={0.8}
              >
                <Text className="font-uiBold text-sm" style={{ color: mode === 'RIVALES' ? '#003914' : '#BCCBB9' }}>
                  Buscar Rival
                </Text>
              </TouchableOpacity>
            </View>

            {/* Botón Filtro Cuadrado */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setFilterModalVisible(true)}
              className={`h-[48px] w-[48px] items-center justify-center rounded-xl border ${hasActiveFilters ? 'border-brand-primary/30 bg-brand-primary/10' : 'border-transparent bg-surface-low'
                }`}
            >
              <AppIcon family="material-community" name="tune" size={20} color={hasActiveFilters ? '#53E076' : '#BCCBB9'} />
            </TouchableOpacity>

          </View>

          {/* Chips de contexto */}
          <View className="mt-2.5 flex-row flex-wrap gap-1.5 px-0.5">
            {contextChips.map((chip) => (
              <View
                key={chip.label}
                className={`rounded-full px-2.5 py-1 ${chip.accent ? 'bg-brand-primary/15' : 'bg-surface-high'}`}
              >
                <Text className={`font-uiBold text-[10px] ${chip.accent ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                  {chip.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* MODO RANKING */}
        {mode === 'RANKING' && (
          <>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <RankingRowSkeleton key={i} />)
            ) : (
              <>
                <RankingTable
                  entries={rankingEntries}
                  onTeamPress={(id: string) => router.push({ pathname: '/team-stats', params: { teamId: id, viewerTeamId: activeTeamId || '' } })}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={() => handleApplyFilters({ zone: null, category: null, format: null, rivalesIdeales: false })}
                />
                <PlayerLeaderboard entries={leaderboardEntries} activeStat={leaderboardStat} onStatChange={handleStatChange} loading={leaderboardLoading} />
              </>
            )}
          </>
        )}

        {/* MODO RIVALES */}
        {mode === 'RIVALES' && (
          <>
            <RivalSearchBar value={searchQuery} onChangeText={handleSearchQueryChange} />

            {searchLoading ? (
              <View className="mt-2">
                {Array.from({ length: 5 }).map((_, i) => <RankingRowSkeleton key={i} />)}
              </View>
            ) : searchResults.length === 0 ? (
              <Text className="mt-8 text-center font-ui text-sm text-neutral-on-surface-variant">
                {searchQuery ? 'No se encontraron equipos con ese nombre o filtros.' : 'Escribí el nombre de un equipo para buscar.'}
              </Text>
            ) : (
              <View className="mt-2">
                {searchResults.map(entry => (
                  <RivalTeamCard
                    key={entry.teamId}
                    entry={entry}
                    canChallenge={canChallenge}
                    onPress={(id) => router.push({ pathname: '/team-stats', params: { teamId: id, viewerTeamId: activeTeamId || '' } })}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <RankingFilterModal
        visible={isFilterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApply={handleApplyFilters}
      />
      {AlertComponent}
    </View>
  );
}