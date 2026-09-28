import { Text, View } from 'react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { RankingTeamRow } from './RankingTeamRow';
import { SeeFullTableButton } from './SeeFullTableButton';
import { RANKING_COL, RANKING_ROW_PX } from './rankingGrid';
import type { RankingTeamEntry } from './types';

interface Props {
    entries: RankingTeamEntry[];
    onTeamPress: (teamId: string) => void;
    topLimit?: number;
    /** Permite ofrecer "limpiar filtros" desde el estado vacio. */
    onClearFilters?: () => void;
    hasActiveFilters?: boolean;
    /** Abre la tabla completa. Sólo se ofrece si hay más filas que el top. */
    onSeeAll?: () => void;
}

export function RankingTable({ entries, onTeamPress, topLimit = 5, onClearFilters, hasActiveFilters, onSeeAll }: Props) {
    if (entries.length === 0) {
        return (
            <View>
                <Text className="mb-2.5 font-displayBlack text-base uppercase tracking-widest text-neutral-on-surface">
                    🏆 Mejores equipos
                </Text>
                {/* Con zona + formato + categoria es facil llegar a cero equipos. Sin
                    este bloque la pantalla quedaba en blanco y el usuario no tenia
                    forma de saber que el problema eran sus propios filtros. */}
                <EmptyState
                    icon={hasActiveFilters ? 'filter-remove-outline' : 'trophy-outline'}
                    title={hasActiveFilters ? 'Sin resultados' : 'Ranking vacío'}
                    description={
                        hasActiveFilters
                            ? 'Ningún equipo coincide con la zona, el formato y la categoría que elegiste. Probá quitando alguno de los filtros para ampliar la búsqueda.'
                            : 'Todavía no hay equipos rankeados en esta temporada. Jugá tu primer partido oficial para aparecer en la tabla.'
                    }
                    actionLabel={hasActiveFilters && onClearFilters ? 'Limpiar filtros' : undefined}
                    onAction={hasActiveFilters ? onClearFilters : undefined}
                />
            </View>
        );
    }

    const myTeamIndex = entries.findIndex((e) => e.isMyTeam);
    const myTeam = myTeamIndex !== -1 ? entries[myTeamIndex] : null;
    const topTeams = entries.slice(0, topLimit);
    const isMyTeamOutsideTop = myTeamIndex >= topLimit;
    const teamsInBetween = isMyTeamOutsideTop ? myTeamIndex - topLimit : 0;

    return (
        <View>
            <Text className="mb-2.5 font-displayBlack text-base uppercase tracking-widest text-neutral-on-surface">
                🏆 Mejores equipos
            </Text>
            <RankingColumnsHeader />

            {topTeams.map((entry, index) => (
                <RankingTeamRow key={entry.teamId} entry={entry} onPress={onTeamPress} index={index} />
            ))}

            {isMyTeamOutsideTop && myTeam && (
                <View>
                    <View className="my-2 flex-row items-center justify-center gap-2 py-2">
                        <View className="h-px flex-1 bg-surface-high" />
                        <Text className="font-displayBlack text-[10px] uppercase tracking-widest text-neutral-outline">
                            · · · {teamsInBetween} equipos · · ·
                        </Text>
                        <View className="h-px flex-1 bg-surface-high" />
                    </View>
                    <RankingTeamRow key={myTeam.teamId} entry={myTeam} onPress={onTeamPress} index={topTeams.length} />
                </View>
            )}

            {onSeeAll && entries.length > topLimit && (
                <SeeFullTableButton onPress={onSeeAll} total={entries.length} />
            )}
        </View>
    );
}

/**
 * Títulos de columna de la tabla de equipos. Exportado porque la tabla
 * completa (app/ranking-full) lo usa como encabezado fijo sobre la lista.
 */
export function RankingColumnsHeader() {
    // Cada columna lee su ancho de RANKING_COL, igual que RankingTeamRow:
    // es lo que garantiza que los titulos caigan sobre sus valores.
    return (
        <View
            className="mb-2 flex-row items-center"
            style={{ paddingHorizontal: RANKING_ROW_PX }}
        >
            <Text
                style={{ width: RANKING_COL.position }}
                className="font-uiBold text-xs uppercase text-neutral-on-surface-variant"
            >
                #
            </Text>
            <View style={{ width: RANKING_COL.shield }} />
            <Text
                style={{ minWidth: 0 }}
                className="flex-1 font-uiBold text-xs uppercase text-neutral-on-surface-variant"
            >
                Equipo
            </Text>
            <Text
                style={{ width: RANKING_COL.efficiency }}
                className="font-uiBold text-right text-xs uppercase text-neutral-on-surface-variant"
            >
                EF%
            </Text>
            <Text
                style={{ width: RANKING_COL.rating }}
                className="font-uiBold text-right text-xs uppercase text-neutral-on-surface-variant"
            >
                Rating
            </Text>
            <View style={{ width: RANKING_COL.chevron }} />
        </View>
    );
}