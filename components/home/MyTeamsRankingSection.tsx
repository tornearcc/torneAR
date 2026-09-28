import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import { getTeamFormatShortLabel } from '@/lib/team-options';
import type { HomeTeamSnapshot } from './types';

const ROLE_LABEL: Record<string, string> = {
  CAPITAN: 'Capitán',
  SUBCAPITAN: 'Subcapitán',
  JUGADOR: 'Jugador',
  DIRECTOR_TECNICO: 'DT',
};

interface TeamCardProps {
  team: HomeTeamSnapshot;
  onPress: (teamId: string) => void;
}

function TeamRankingCard({ team, onPress }: TeamCardProps) {
  const record = `${team.seasonWins}V ${team.seasonDraws}E ${team.seasonLosses}D`;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(team.id)}
      className="w-full flex-row items-center gap-3.5 overflow-hidden rounded-2xl bg-surface-container p-4"
    >
      {/* Team shield */}
      <TeamShield
        shieldUrl={team.shieldUrl}
        size={50}
        isMyTeam
        teamId={team.id}
        viewerTitle={team.name}
        expandable
      />

      {/* Team information */}
      <View className="min-w-0 flex-1">
        <Text
          className="font-uiBold text-[15px] leading-[19px] text-neutral-on-surface"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {team.name}
        </Text>

        <Text
          className="font-ui mt-0.5 text-[11px] text-neutral-on-surface-variant"
          numberOfLines={1}
        >
          {ROLE_LABEL[team.role] ?? team.role}
        </Text>

        <View className="mt-1.5 flex-row items-center">
          <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
            {record}
          </Text>
        </View>
      </View>

      {/* Rating + Fair Play */}
      <View className="items-end">
        <Text className="font-displayBlack text-[25px] leading-[27px] text-brand-primary">
          {team.eloRating}
        </Text>

        <Text className="font-ui mt-0.5 text-[9px] uppercase tracking-wider text-neutral-on-surface-variant">
          Rating
          {team.rankingFormat
            ? ` • ${getTeamFormatShortLabel(team.rankingFormat)}`
            : ''}
        </Text>

        <View className="mt-1.5 flex-row items-center gap-1">
          <AppIcon
            family="material-community"
            name="hand-peace"
            size={12}
            color="#53E076"
          />

          <Text className="font-uiBold text-[11px] text-brand-primary">
            {team.fairPlayScore}
          </Text>

          <Text className="font-ui text-[9px] text-neutral-outline">
            FPS
          </Text>
        </View>
      </View>

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
  teams: HomeTeamSnapshot[];
  onTeamPress: (teamId: string) => void;
}

export function MyTeamsRankingSection({
  teams,
  onTeamPress,
}: Props) {
  if (teams.length === 0) return null;

  return (
    <View className="mb-5">
      {/* Section header */}
      <View className="mb-3">
        <Text className="font-displayBlack text-[12px] uppercase tracking-wider text-neutral-on-surface-variant">
          Mis Equipos
        </Text>
      </View>

      {/* Teams */}
      <View className="gap-3">
        {teams.map((team) => (
          <TeamRankingCard
            key={team.id}
            team={team}
            onPress={onTeamPress}
          />
        ))}
      </View>
    </View>
  );
}