import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import type { HomeMatchEntry } from './types';
import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];

const STATUS_LABEL: Partial<Record<MatchStatus, string>> = {
  EN_VIVO: 'En Vivo',
  CONFIRMADO: 'Confirmado',
  PENDIENTE: 'Pendiente',
};

const STATUS_STYLE: Partial<Record<MatchStatus, { dot: string; text: string }>> = {
  EN_VIVO: {
    dot: 'bg-brand-primary',
    text: 'text-brand-primary',
  },
  CONFIRMADO: {
    dot: 'bg-info-secondary',
    text: 'text-info-secondary',
  },
  PENDIENTE: {
    dot: 'bg-neutral-outline',
    text: 'text-neutral-outline',
  },
};

const FORMAT_SHORT: Record<string, string> = {
  FUTBOL_5: 'F5',
  FUTBOL_6: 'F6',
  FUTBOL_7: 'F7',
  FUTBOL_8: 'F8',
  FUTBOL_9: 'F9',
  FUTBOL_11: 'F11',
};

function formatDate(iso: string): string {
  const d = new Date(iso);

  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

interface MatchRowProps {
  entry: HomeMatchEntry;
  onPress: (matchId: string) => void;
}

function HomeMatchRow({ entry, onPress }: MatchRowProps) {
  const statusStyle =
    STATUS_STYLE[entry.status] ?? {
      dot: 'bg-neutral-outline',
      text: 'text-neutral-outline',
    };

  const statusLabel = STATUS_LABEL[entry.status] ?? entry.status;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(entry.id)}
      className="flex-row items-center gap-3 px-4 py-3"
    >
      {/* Team A */}
      <TeamShield
        shieldUrl={entry.teamA.shieldUrl}
        size={38}
        isMyTeam={entry.myTeamId === entry.teamA.id}
        teamId={entry.teamA.id}
        viewerTitle={entry.teamA.name}
        expandable
      />

      {/* Match info */}
      <View className="min-w-0 flex-1">
        <Text
          className="font-uiBold text-[13px] leading-[18px] text-neutral-on-surface"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {entry.teamA.name} vs {entry.teamB.name}
        </Text>

        <View className="mt-1 flex-row items-center">
          {/* Status */}
          <View className={`mr-1.5 h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />

          <Text
            className={`font-ui text-[11px] ${statusStyle.text}`}
            numberOfLines={1}
          >
            {statusLabel}
          </Text>

          {entry.format && (
            <>
              <Text className="mx-1 text-[10px] text-neutral-outline/60">
                •
              </Text>
              <Text
                className="font-ui text-[11px] text-neutral-outline"
                numberOfLines={1}
              >
                {FORMAT_SHORT[entry.format] ?? entry.format}
              </Text>
            </>
          )}

          {entry.scheduledAt && (
            <>
              <Text className="mx-1 text-[10px] text-neutral-outline/60">
                •
              </Text>
              <Text
                className="font-ui text-[11px] text-neutral-outline"
                numberOfLines={1}
              >
                {formatDate(entry.scheduledAt)}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Team B */}
      <TeamShield
        shieldUrl={entry.teamB.shieldUrl}
        size={38}
        isMyTeam={entry.myTeamId === entry.teamB.id}
        teamId={entry.teamB.id}
        viewerTitle={entry.teamB.name}
        expandable
      />

      {/* Navigation */}
      <AppIcon
        family="material-community"
        name="chevron-right"
        size={16}
        color="#869585"
      />
    </TouchableOpacity>
  );
}

interface Props {
  matches: HomeMatchEntry[];
  onMatchPress: (matchId: string) => void;
  onSeeAll: () => void;
}

export function UpcomingMatchesSection({
  matches,
  onMatchPress,
  onSeeAll,
}: Props) {
  return (
    <View className="mb-5">
      {/* Section header */}
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-displayBlack text-[12px] uppercase tracking-wider text-neutral-on-surface-variant">
          Próximos Partidos
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onSeeAll}
          className="flex-row items-center gap-0.5"
        >
          <Text className="font-uiBold text-[12px] text-info-secondary">
            Ver todos
          </Text>

          <AppIcon
            family="material-community"
            name="chevron-right"
            size={14}
            color="#8CCDFF"
          />
        </TouchableOpacity>
      </View>

      {matches.length === 0 ? (
        <View className="items-center rounded-2xl bg-surface-container px-4 py-8">
          <AppIcon
            family="material-community"
            name="calendar-blank-outline"
            size={30}
            color="#869585"
          />

          <Text className="font-ui mt-2 text-center text-sm text-neutral-on-surface-variant">
            No tenés partidos próximos
          </Text>
        </View>
      ) : (
        <View className="overflow-hidden rounded-2xl bg-surface-container">
          {matches.map((match, index) => {
            const isLast = index === matches.length - 1;

            return (
              <View key={match.id}>
                <HomeMatchRow
                  entry={match}
                  onPress={onMatchPress}
                />

                {!isLast && (
                  <View className="mx-4 h-px bg-neutral-outline/20" />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}