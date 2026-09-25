import { Text, TouchableOpacity, View } from 'react-native';
import { TeamShield } from '@/components/ui/TeamShield';
import type { RivalTeamEntry } from './types';

interface Props {
    entry: RivalTeamEntry;
    onPress: (teamId: string) => void;
    canChallenge: boolean;
}

const FORMAT_SHORT: Record<string, string> = {
    FUTBOL_5: 'F5', FUTBOL_6: 'F6', FUTBOL_7: 'F7',
    FUTBOL_8: 'F8', FUTBOL_9: 'F9', FUTBOL_11: 'F11',
};
const CAT_SHORT: Record<string, string> = {
    HOMBRES: 'Hombres', MUJERES: 'Mujeres', MIXTO: 'Mixto',
};

export function RivalTeamCard({ entry, onPress, canChallenge }: Props) {
    return (
        <TouchableOpacity activeOpacity={0.85} onPress={() => onPress(entry.teamId)} className="mb-2.5 rounded-[18px] bg-surface-container p-3.5">
            <View className="mb-3 flex-row items-center gap-3">
                {/* `name` activa el fallback a iniciales de TeamShield: en una
                    busqueda, el escudo generico se repetia identico en cada
                    tarjeta y no distinguia a ningun club. */}
                <TeamShield
                    shieldUrl={entry.shieldUrl}
                    size={46}
                    isMyTeam={entry.isMyTeam}
                    name={entry.teamName}
                    teamId={entry.teamId}
                    expandable
                />

                <View className="flex-1">
                    <Text className="font-uiBold text-[14px] text-neutral-on-surface" numberOfLines={1}>{entry.teamName}</Text>
                    <Text className="mt-0.5 font-ui text-[11px] text-neutral-on-surface-variant">
                        {entry.zone} · {FORMAT_SHORT[entry.preferredFormat] || entry.preferredFormat} · {CAT_SHORT[entry.category] || entry.category}
                    </Text>
                </View>

                <View className="items-end">
                    <Text className="font-displayBlack text-[26px] leading-none text-neutral-on-surface">{entry.eloRating}</Text>
                    <Text className="font-ui text-[9px] text-neutral-on-surface-variant">rating</Text>
                </View>
            </View>

            <View className="mb-3 flex-row items-center gap-4">
                <View className="flex-row items-baseline gap-1"><Text className="font-uiBold text-[13px] text-neutral-on-surface">{entry.seasonWins}</Text><Text className="font-ui text-[10px] text-neutral-on-surface-variant">V</Text></View>
                <View className="flex-row items-baseline gap-1"><Text className="font-uiBold text-[13px] text-neutral-on-surface">{entry.seasonLosses}</Text><Text className="font-ui text-[10px] text-neutral-on-surface-variant">D</Text></View>
                <View className="flex-row items-baseline gap-1"><Text className="font-uiBold text-[13px] text-neutral-on-surface">{entry.seasonDraws}</Text><Text className="font-ui text-[10px] text-neutral-on-surface-variant">E</Text></View>

                <View className="ml-auto flex-row items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-1">
                    <View className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
                    <Text className="font-uiBold text-[10px] text-brand-primary">Fair Play {entry.fairPlayScore.toFixed(0)}</Text>
                </View>
            </View>

            {canChallenge && !entry.isMyTeam && (
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => onPress(entry.teamId)}
                    className="items-center rounded-xl bg-brand-primary py-2.5"
                >
                    <Text className="font-displayBlack text-[13px] uppercase tracking-widest text-surface-base">⚔️ Desafiar</Text>
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
}
