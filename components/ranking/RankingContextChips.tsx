import { Text, View } from 'react-native';
import type { RankingFiltersState } from './types';

interface Chip {
    label: string;
    accent: boolean;
}

const getCategoryLabel = (cat: string) => cat.charAt(0) + cat.slice(1).toLowerCase();

/**
 * Chips del contexto activo (temporada + filtros).
 *
 * En la tabla de jugadores se apagan dos: "Rivales ideales", que es un rango
 * de ELO de equipo y esa tabla ignora, y la categoría, que ahí tiene sus
 * propios chips seleccionables (LeaderboardCategoryChips).
 */
export function buildRankingChips(
    filters: RankingFiltersState,
    seasonName: string | null,
    options: { forPlayers: boolean } = { forPlayers: false },
): Chip[] {
    return [
        seasonName ? { label: seasonName, accent: false } : null,
        filters.zone ? { label: filters.zone, accent: true } : { label: 'Global', accent: false },
        filters.format ? { label: filters.format.replace('FUTBOL_', 'F'), accent: true } : null,
        !options.forPlayers && filters.category ? { label: getCategoryLabel(filters.category), accent: true } : null,
        !options.forPlayers && filters.rivalesIdeales ? { label: '🎯 Ideales', accent: true } : null,
    ].filter((chip): chip is Chip => chip !== null);
}

export function RankingContextChips({ chips }: { chips: Chip[] }) {
    return (
        <View className="mt-2.5 flex-row flex-wrap gap-1.5 px-0.5">
            {chips.map((chip) => (
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
    );
}
