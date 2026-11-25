import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTeamStore } from '@/stores/teamStore';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { searchRivalTeams } from '@/lib/ranking-data';
import { Logger } from '@/lib/logger';
import type { RivalTeamEntry } from '@/components/ranking/types';
import { RankingRowSkeleton } from '@/components/ranking/RankingRowSkeleton';
import { RivalSearchBar } from '@/components/ranking/RivalSearchBar';
import { RivalTeamCard } from '@/components/ranking/RivalTeamCard';
import { SuggestedRivalsStrip } from '@/components/rival/SuggestedRivalsStrip';
import { fetchRivalPostTeamIds, fetchSuggestedRivals, type SuggestedRival } from '@/lib/rival-posts-api';

const SEARCH_DEBOUNCE_MS = 300;
const NO_FILTERS = { zone: null, category: null, format: null, rivalesIdeales: false } as const;

/**
 * Buscar › Rival › «Buscar un equipo por nombre» (rediseño, etapa 3; spec §6).
 * Era el modo «Buscar Rival» de la pestaña Ranking: se mudó acá para que todo lo
 * de buscar rival viva en un solo lugar. Mismos datos: sugeridos para el equipo
 * activo, búsqueda por nombre y la tarjeta con «Desafiar» (capitán o subcapitán).
 */
export default function RivalSearchScreen() {
  const { activeTeamId, myTeams } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();
  const activeTeam = myTeams.find((t) => t.id === activeTeamId);
  const canChallenge = activeTeam?.role === 'CAPITAN' || activeTeam?.role === 'SUBCAPITAN';

  const [suggested, setSuggested] = useState<SuggestedRival[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(Boolean(activeTeamId));
  const [seekingRivalIds, setSeekingRivalIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RivalTeamEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (activeTeamId) {
      fetchSuggestedRivals(activeTeamId, 10)
        .then((rows) => !cancelled && setSuggested(rows))
        .catch((error: unknown) => Logger.warn('No se pudieron cargar los rivales sugeridos', { scope: 'rival-search.suggested', activeTeamId, error }))
        .finally(() => !cancelled && setSuggestedLoading(false));
    }
    fetchRivalPostTeamIds()
      .then((ids) => !cancelled && setSeekingRivalIds(ids))
      .catch((error: unknown) => Logger.warn('No se pudieron cargar los equipos que buscan rival', { scope: 'rival-search.seeking', error }));
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeTeamId]);

  // Cada búsqueda lleva un número: una respuesta vieja («Bo») no pisa a una nueva («Boca»).
  const runSearch = useCallback(
    async (text: string) => {
      const id = ++requestRef.current;
      try {
        const teamIds = myTeams.map((t) => t.id);
        const rows = await searchRivalTeams(text, NO_FILTERS, teamIds, null);
        if (id === requestRef.current) setResults(rows);
      } catch (error) {
        Logger.error('Falló la búsqueda de rivales', { scope: 'rival-search.runSearch', query: text, error });
        if (id === requestRef.current) showAlert('Error', getGenericSupabaseErrorMessage(error, 'No se pudo buscar.'));
      } finally {
        if (id === requestRef.current) setSearching(false);
      }
    },
    [myTeams, showAlert],
  );

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(() => void runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const openTeam = (teamId: string) =>
    router.push({ pathname: '/team-stats', params: { teamId, viewerTeamId: activeTeamId ?? '' } });

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader title="Buscar rival" subtitle="Sugeridos para tu equipo o buscalo por nombre." />
      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
        {activeTeamId ? (
          <SuggestedRivalsStrip rivals={suggested} loading={suggestedLoading} teamName={activeTeam?.name ?? null} onPress={openTeam} />
        ) : null}
        <RivalSearchBar value={query} onChangeText={onChangeQuery} />
        {searching ? (
          <View className="mt-2">{Array.from({ length: 5 }).map((_, i) => <RankingRowSkeleton key={i} />)}</View>
        ) : results.length === 0 ? (
          <Text className="mt-8 text-center font-ui text-sm text-neutral-on-surface-variant">
            {query ? 'No encontramos equipos con ese nombre.' : 'Escribí el nombre de un equipo para buscarlo.'}
          </Text>
        ) : (
          <View className="mt-2">
            {results.map((entry) => (
              <RivalTeamCard key={entry.teamId} entry={entry} canChallenge={canChallenge} seekingRival={seekingRivalIds.has(entry.teamId)} onPress={openTeam} />
            ))}
          </View>
        )}
      </ScrollView>
      {AlertComponent}
    </SafeAreaView>
  );
}
