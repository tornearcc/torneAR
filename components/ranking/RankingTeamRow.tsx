import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { GOLD, podiumColor } from '@/constants/podium';
import { RANKING_COL, RANKING_ROW_PX } from './rankingGrid';
import type { RankingTeamEntry } from './types';

interface Props {
    entry: RankingTeamEntry;
    onPress: (teamId: string) => void;
    index?: number;
    /**
     * Entrada escalonada. En la tabla completa va apagada: el delay crece con
     * el índice y la fila 100 tardaría 5 s en aparecer.
     */
    animated?: boolean;
}

export function RankingTeamRow({ entry, onPress, index = 0, animated = true }: Props) {
    const podium = podiumColor(entry.rankPosition);
    const isTop3 = podium !== null;
    const posColor = podium ?? '#869585';
    const isChampion = entry.rankPosition === 1;

    // % Efectividad on-the-fly (seguro si no jugó partidos).
    const winRate = entry.matchesPlayed > 0
        ? Math.round((entry.seasonWins / entry.matchesPlayed) * 100)
        : 0;

    return (
        <Animated.View entering={animated ? FadeInRight.delay(index * 50).springify() : undefined} style={{ marginBottom: 6 }}>
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onPress(entry.teamId)}
            style={{ paddingHorizontal: RANKING_ROW_PX }}
            /* El campeón gana sobre "mi equipo": si mi equipo ES el 1°, la fila
               va dorada. Es la distinción más alta de la tabla y taparla con el
               verde de pertenencia sería perder justo el dato que se celebra. */
            className={`flex-row items-center overflow-hidden rounded-xl py-3 ${isChampion
                ? 'border border-brand-gold/35 bg-[#241f12]'
                : entry.isMyTeam
                    ? 'border border-brand-primary/20 bg-[#1e2a1e]'
                    : 'bg-surface-container'
                }`}
        >
            {/* Barra lateral de color (solo top 3 o mi equipo) */}
            {(isTop3 || entry.isMyTeam) && (
                <View
                    className="absolute bottom-0 left-0 top-0 w-1 rounded-l-sm"
                    style={{ backgroundColor: entry.isMyTeam && !isTop3 ? '#53E076' : posColor }}
                />
            )}

            {/* Posición — sin el `marginLeft: 4` condicional que traia antes: la
                barra lateral es `absolute`, asi que no empujaba nada y ese
                margen solo corria las filas del top 3 y la propia respecto del
                resto de la columna. */}
            <View style={{ width: RANKING_COL.position }} className="flex-row items-center gap-0.5">
                <Text
                    style={{ color: entry.isMyTeam && !isTop3 ? '#53E076' : posColor }}
                    className="font-displayBlack text-base"
                >
                    {entry.rankPosition}
                </Text>
                {/* Trofeo sólo en el 1°: el color por sí solo no distingue al
                    campeón de quien mira la tabla en escala de grises. */}
                {isChampion && (
                    <AppIcon family="material-community" name="trophy" size={11} color={GOLD} />
                )}
            </View>

            {/* Escudo — el ancho de la celda es fijo y el escudo se centra
                dentro, para que un equipo con escudo y otro sin el no corran la
                columna del nombre. */}
            <View style={{ width: RANKING_COL.shield }}>
                {entry.shieldUrl ? (
                    <ExpandablePhoto
                        uri={entry.shieldUrl}
                        subject={{ kind: 'shield', teamId: entry.teamId }}
                        title={entry.teamName}
                        hitSlop={6}
                    >
                        <Image source={{ uri: entry.shieldUrl }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" />
                    </ExpandablePhoto>
                ) : (
                    <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-surface-high">
                        <AppIcon family="material-community" name="shield" size={18} color="#869585" />
                    </View>
                )}
            </View>

            {/* Nombre e info — ya truncaba con numberOfLines; se agrega
                minWidth 0 para que tambien encoja en el target web. */}
            <View className="flex-1" style={{ minWidth: 0 }}>
                <Text className={`font-uiBold text-[13px] ${entry.isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface'}`} numberOfLines={1} ellipsizeMode="tail">
                    {entry.teamName} {entry.isMyTeam && '★'}
                </Text>
                <Text className="font-ui text-[10px] text-neutral-on-surface-variant" numberOfLines={1}>
                    {entry.seasonWins}V · {entry.seasonLosses}D · {entry.seasonDraws}E
                </Text>
            </View>

            {/* Efectividad — ancho fijo: con ancho automatico "100%" y "0%"
                median distinto y corrian la columna de Rating fila por fila. */}
            <View style={{ width: RANKING_COL.efficiency }} className="shrink-0 items-end">
                <Text
                    className={`font-displayBlack text-[15px] leading-none ${entry.isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
                    style={{ fontVariant: ['tabular-nums'] }}
                >
                    {winRate}%
                </Text>
                <Text className="mt-1 font-ui text-[10px] text-neutral-on-surface-variant">Efec.</Text>
            </View>

            {/* Rating */}
            <View style={{ width: RANKING_COL.rating }} className="shrink-0 items-end">
                <Text
                    className={`font-displayBlack text-[17px] leading-none ${entry.isMyTeam ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
                    style={{ fontVariant: ['tabular-nums'] }}
                >
                    {entry.eloRating}
                </Text>
                <Text className="mt-1 font-ui text-[10px] text-neutral-on-surface-variant">PJ {entry.matchesPlayed}</Text>
            </View>

            <View style={{ width: RANKING_COL.chevron }} className="items-end">
                <AppIcon family="material-community" name="chevron-right" size={14} color="#869585" />
            </View>
        </TouchableOpacity>
        </Animated.View>
    );
}