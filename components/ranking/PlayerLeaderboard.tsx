import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { leaderboardEntryKey } from '@/lib/ranking-data';
import { PlayerLeaderboardRow } from './PlayerLeaderboardRow';
import { RankingRowSkeleton } from './RankingRowSkeleton';
import { SeeFullTableButton } from './SeeFullTableButton';
import type { PlayerLeaderboardEntry, LeaderboardStat, RankingFiltersState } from './types';

export const STAT_TABS: { key: LeaderboardStat; label: string; valueLabel: string; isPercent?: boolean }[] = [
    { key: 'goals', label: 'Goleadores', valueLabel: 'goles' },
    { key: 'mvps', label: 'MVPs', valueLabel: 'MVPs' },
    { key: 'matches', label: 'Partidos', valueLabel: 'partidos' },
    { key: 'clean_sheets', label: 'Vallas', valueLabel: 'vallas' },
    { key: 'win_rate', label: 'Efectividad', valueLabel: 'efectividad', isPercent: true },
];

export function getStatTab(stat: LeaderboardStat) {
    return STAT_TABS.find(t => t.key === stat) ?? STAT_TABS[0];
}

/** Chips de stat. Los usa la pestaña y la tabla completa de jugadores. */
export function LeaderboardStatChips({ activeStat, onStatChange }: {
    activeStat: LeaderboardStat;
    onStatChange: (stat: LeaderboardStat) => void;
}) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-3"
            contentContainerStyle={{ gap: 8 }}
        >
            {STAT_TABS.map(tab => (
                <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.7}
                    onPress={() => onStatChange(tab.key)}
                    className={`rounded-full px-3 py-1.5 ${activeStat === tab.key ? 'bg-brand-primary' : 'bg-surface-high'}`}
                >
                    <Text className={`font-uiBold text-[11px] ${activeStat === tab.key ? 'text-surface-base' : 'text-neutral-on-surface-variant'}`}>
                        {tab.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

type LeaderboardCategory = RankingFiltersState['category'];

const CATEGORY_OPTIONS: { value: LeaderboardCategory; label: string }[] = [
    { value: null, label: 'Todas' },
    { value: 'HOMBRES', label: 'Hombres' },
    { value: 'MUJERES', label: 'Mujeres' },
    { value: 'MIXTO', label: 'Mixto' },
];

/**
 * Categoría de la tabla de jugadores: la del equipo con el que sumó cada uno.
 * Es un filtro propio de esta sección y arranca en "Todas" —a diferencia de la
 * tabla de equipos, que hereda la categoría del equipo activo—.
 */
export function LeaderboardCategoryChips({ activeCategory, onCategoryChange }: {
    activeCategory: LeaderboardCategory;
    onCategoryChange: (category: LeaderboardCategory) => void;
}) {
    return (
        <View className="mb-3 flex-row flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map(option => {
                const selected = option.value === activeCategory;
                return (
                    <TouchableOpacity
                        key={option.label}
                        activeOpacity={0.7}
                        onPress={() => onCategoryChange(option.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className={`rounded-full border px-2.5 py-1 ${selected ? 'border-brand-primary/40 bg-brand-primary/15' : 'border-neutral-outline/20'}`}
                    >
                        <Text className={`font-uiBold text-[10px] ${selected ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

interface Props {
    entries: PlayerLeaderboardEntry[];
    activeStat: LeaderboardStat;
    onStatChange: (stat: LeaderboardStat) => void;
    activeCategory: LeaderboardCategory;
    onCategoryChange: (category: LeaderboardCategory) => void;
    loading: boolean;
    /** Abre la tabla completa. Sólo se ofrece si hay más filas que el top. */
    onSeeAll?: () => void;
}

export function PlayerLeaderboard({
    entries, activeStat, onStatChange, activeCategory, onCategoryChange, loading, onSeeAll,
}: Props) {
    const activeTab = getStatTab(activeStat);
    const myPlayerIndex = entries.findIndex(e => e.isMyPlayer);
    const myPlayer = myPlayerIndex !== -1 ? entries[myPlayerIndex] : null;

    // Lógica de "salto" parecida a la de los equipos
    const topLimit = 5;
    const topPlayers = entries.slice(0, topLimit);
    const isMyPlayerOutsideTop = myPlayerIndex >= topLimit;

    return (
        <View className="mt-5">
            <Text className="mb-2.5 font-displayBlack text-base uppercase tracking-widest text-neutral-on-surface">
                ⚽ Mejores jugadores
            </Text>

            <LeaderboardStatChips activeStat={activeStat} onStatChange={onStatChange} />
            <LeaderboardCategoryChips activeCategory={activeCategory} onCategoryChange={onCategoryChange} />

            {loading ? (
                Array.from({ length: 5 }).map((_, i) => <RankingRowSkeleton key={i} />)
            ) : entries.length === 0 ? (
                <Text className="font-display text-base text-neutral-on-surface-variant text-center py-4">Sin datos registrados.</Text>
            ) : (
                <View>
                    {topPlayers.map((entry, index) => (
                        <PlayerLeaderboardRow key={leaderboardEntryKey(entry)} entry={entry} statLabel={activeTab.valueLabel} isPercent={activeTab.isPercent} index={index} />
                    ))}

                    {isMyPlayerOutsideTop && myPlayer && (
                        <View>
                            <View className="my-1.5 flex-row items-center justify-center gap-2 py-1.5">
                                <View className="h-px flex-1 bg-surface-high" />
                                <Text className="font-displayBlack text-[10px] uppercase tracking-widest text-neutral-outline">
                                    · · · {myPlayerIndex - topLimit} jugadores · · ·
                                </Text>
                                <View className="h-px flex-1 bg-surface-high" />
                            </View>
                            <PlayerLeaderboardRow entry={myPlayer} statLabel={activeTab.valueLabel} isPercent={activeTab.isPercent} index={topLimit} />
                        </View>
                    )}

                    {onSeeAll && entries.length > topLimit && <SeeFullTableButton onPress={onSeeAll} />}
                </View>
            )}
        </View>
    );
}