import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import type { PlayerLeaderboardEntry } from './types';

interface Props {
    entry: PlayerLeaderboardEntry;
    statLabel: string;
    isPercent?: boolean;
    index?: number;
    /** Entrada escalonada; apagada en la tabla completa (ver RankingTeamRow). */
    animated?: boolean;
}

export function PlayerLeaderboardRow({ entry, statLabel, isPercent = false, index = 0, animated = true }: Props) {
    const isTop3 = entry.rankPosition <= 3;
    const colors = ['#FABD32', '#C0C0C0', '#CD7F32'] as const;
    const posColor = isTop3 ? colors[entry.rankPosition - 1] : '#869585';

    const subline = [
        entry.username ? `@${entry.username}` : entry.teamName,
        entry.zone,
    ].filter(Boolean).join(' · ');

    return (
        <Animated.View entering={animated ? FadeInRight.delay(index * 50).springify() : undefined} style={{ marginBottom: 6 }}>
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/profile-stats', params: { profileId: entry.profileId } })}
            className={`flex-row items-center rounded-xl px-3 py-2.5 ${entry.isMyPlayer ? 'border border-brand-primary/20 bg-[#1e2a1e]' : 'bg-surface-container'}`}
        >
            <Text style={{ color: entry.isMyPlayer && !isTop3 ? '#53E076' : posColor, width: 22 }} className="font-displayBlack text-sm">
                {entry.rankPosition}
            </Text>

            {/* La foto abre el visor; el resto de la fila, el perfil. */}
            <View className="mr-2.5">
                <Avatar uri={entry.avatarUrl} size={30} profileId={entry.profileId} name={entry.fullName} expandable />
            </View>

            <View className="flex-1">
                <Text className={`font-uiBold text-xs ${entry.isMyPlayer ? 'text-brand-primary' : 'text-neutral-on-surface'}`} numberOfLines={1}>
                    {entry.fullName} {entry.isMyPlayer && '★'}
                </Text>
                <Text className="font-ui text-[10px] text-neutral-on-surface-variant" numberOfLines={1}>
                    {subline}
                </Text>
            </View>

            <View className="items-end">
                <Text className="font-displayBlack text-xl leading-none text-brand-primary">
                    {entry.value}{isPercent ? '%' : ''}
                </Text>
                <Text className="mt-0.5 font-ui text-[9px] text-neutral-on-surface-variant">{statLabel}</Text>
            </View>
        </TouchableOpacity>
        </Animated.View>
    );
}
