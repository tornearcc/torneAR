import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import { CensusRow } from '@/components/census/CensusRow';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchFavoriteTeamCensus, type CensusViewData } from '@/lib/census-data';
import { Logger } from '@/lib/logger';

/**
 * Censo del fútbol argentino — cuántos usuarios hinchan de cada club.
 *
 * El GROUP BY vive en `get_favorite_team_census()`, no acá: contar en el
 * cliente obligaría a bajar una fila por usuario para mostrar 28 números.
 *
 * La pantalla no usa `GlobalHeader` a propósito. Es una pantalla de stack a la
 * que se entra desde el Inicio, así que lo que hace falta es volver, no las
 * notificaciones ni el selector de equipo — mismo criterio que `faq.tsx`.
 */
export default function CensoScreen() {
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();
  const profileId = profile?.id;

  const [data, setData] = useState<CensusViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cadena de promesas y no `async`/`await`: llamada desde un efecto, todo lo
  // que un `async` hace antes de suspenderse cuenta como setState síncrono
  // dentro del efecto. En los callbacks de `.then`/`.catch`/`.finally` no, que
  // es donde vive acá cada actualización de estado.
  //
  // Tampoco recibe ya un modo: el `setRefreshing(true)` del pull-to-refresh
  // vive en su propio handler, que es un evento y es donde corresponde.
  const loadCensus = useCallback(
    () =>
      fetchFavoriteTeamCensus()
        .then(setData)
        .catch((error: unknown) => {
          Logger.error('No se pudo cargar el censo de cuadros favoritos', {
            scope: 'censo.loadCensus',
            profileId,
            error,
          });
          showAlert(
            'Error al cargar el censo',
            getGenericSupabaseErrorMessage(error, 'No se pudo cargar el censo.'),
          );
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        }),
    [profileId, showAlert],
  );

  useEffect(() => {
    void loadCensus();
  }, [loadCensus]);

  if (loading) return <GlobalLoader label="Contando hinchas..." />;

  const entries = data?.entries ?? [];
  const leaderPercentage = entries[0]?.percentage ?? 0;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Censo del fútbol argentino"
        subtitle="De qué cuadro es la comunidad de torneAR."
      />

      <FlatList
        className="px-2"
        data={entries}
        keyExtractor={(entry) => entry.teamName}
        contentContainerStyle={{ paddingBottom: 52 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadCensus();
            }}
            tintColor="#53E076"
            colors={['#53E076']}
          />
        }
        ListHeaderComponent={
          <View className="pt-4 pb-3">
            {data && data.totalFans > 0 && (
              <View className="flex-row items-center rounded-2xl bg-surface-container px-4 py-3">
                <View className="h-8 w-8 items-center justify-center rounded-xl bg-[#53E076]/10">
                  <AppIcon
                    family="material-community"
                    name="account-group"
                    size={18}
                    color="#53E076"
                  />
                </View>

                <Text className="font-ui ml-3 flex-1 text-[13px] leading-5 text-neutral-on-surface-variant">
                  <Text className="font-uiBold text-neutral-on-surface">
                    {data.totalFans}
                  </Text>
                  {data.totalFans === 1 ? ' hincha censado' : ' hinchas censados'} en{' '}
                  <Text className="font-uiBold text-neutral-on-surface">
                    {entries.length}
                  </Text>
                  {entries.length === 1 ? ' club' : ' clubes'}
                </Text>
              </View>
            )}

            {entries.length > 0 && (
              <View className="mt-5 mb-1 flex-row items-center">
                <View className="h-px flex-1 bg-neutral-outline/10" />

                <Text className="font-uiBold mx-3 text-[10px] uppercase tracking-[1.2px] text-neutral-on-surface-variant">
                  Ranking
                </Text>

                <View className="h-px flex-1 bg-neutral-outline/10" />
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <CensusRow
            entry={item}
            leaderPercentage={leaderPercentage}
            isMine={profile?.favorite_team === item.teamName}
          />
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center px-8 pt-16">
            <View className="h-20 w-20 items-center justify-center rounded-3xl bg-surface-container">
              <AppIcon
                family="material-community"
                name="account-question"
                size={38}
                color="#869585"
              />
            </View>

            <Text className="font-displayBlack mt-5 text-center text-lg uppercase tracking-tight text-neutral-on-surface">
              El censo está vacío
            </Text>

            <Text className="font-ui mt-2 max-w-[300px] text-center text-[13px] leading-5 text-neutral-on-surface-variant">
              Todavía nadie cargó su cuadro favorito. Completá el tuyo desde tu perfil y sé el
              primero del censo.
            </Text>
          </View>
        }
      />

      {AlertComponent}
    </SafeAreaView>
  );
}