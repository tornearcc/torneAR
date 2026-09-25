import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { MatchCardEntry } from './types';
import { MatchStatusBadge } from './MatchStatusBadge';
import { TeamShield } from '@/components/ui/TeamShield';
import { MatchCardCenter } from './MatchCardCenter';
import { MatchCardFooter } from './MatchCardFooter';

const FORMAT_SHORT: Record<string, string> = {
  FUTBOL_5: 'F5', FUTBOL_6: 'F6', FUTBOL_7: 'F7',
  FUTBOL_8: 'F8', FUTBOL_9: 'F9', FUTBOL_11: 'F11',
};

const MATCH_TYPE_LABEL: Record<string, string> = {
  RANKING: 'Ranking',
  AMISTOSO: 'Amistoso',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface Props {
  entry: MatchCardEntry;
  myTeamId: string;
  /** CAPITAN/SUBCAPITAN del equipo activo: habilita coordinar el partido (R2). */
  canManage?: boolean;
  /** CAPITAN/SUBCAPITAN/DIRECTOR_TECNICO: habilita cargar el resultado (R6). */
  isStaff?: boolean;
  onPress: (matchId: string) => void;
  onProposePress?: (matchId: string) => void;
  onAcceptProposal?: (proposalId: string, matchId: string) => void;
  onRejectProposal?: (proposalId: string, matchId: string) => void;
  onCancelProposal?: (proposalId: string, matchId: string) => void;
  onLoadResult?: (matchId: string) => void;
  index?: number;
}

export function MatchCard({
  entry,
  myTeamId,
  canManage = false,
  isStaff = false,
  onPress,
  onProposePress,
  onAcceptProposal,
  onRejectProposal,
  onCancelProposal,
  onLoadResult,
  index = 0,
}: Props) {
  const isMyTeamA = entry.teamA.id === myTeamId;
  const isMyTeamB = entry.teamB.id === myTeamId;

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).springify()} style={{ marginBottom: 12 }}>
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(entry.id)}
      className="rounded-2xl bg-surface-container p-4"
    >
      {/* Header — dos filas.
          Antes eran cinco elementos en un solo `flex-row` sin `flex-wrap`:
          badge de estado, badge de cancelación, tipo/formato, fecha (`ml-auto`)
          y predio. Ninguno podía encoger, así que con un nombre de complejo
          largo la fila se pasaba del ancho de la tarjeta. El predio además
          quedaba DESPUÉS del `ml-auto` de la fecha, rompiendo la alineación.
          Separar metadatos (arriba) de lugar y hora (abajo) hace que quepan por
          diseño, no por truncado agresivo. */}
      <View className="mb-2 flex-row flex-wrap items-center gap-2">
        <MatchStatusBadge status={entry.status} />
        {entry.hasPendingCancellation && (
          <View className="shrink-0 flex-row items-center rounded bg-warning-tertiary/20 px-2 py-0.5">
            <Text className="font-displayBlack text-[9px] uppercase tracking-wide text-warning-tertiary">
              Cancelación pendiente
            </Text>
          </View>
        )}
        <Text className="font-uiBold shrink-0 text-[11px] text-neutral-on-surface-variant">
          {MATCH_TYPE_LABEL[entry.matchType] ?? entry.matchType}
          {entry.format ? ` · ${FORMAT_SHORT[entry.format] ?? entry.format}` : ''}
        </Text>
      </View>

      {(entry.scheduledAt || entry.venue) && (
        <View className="mb-3 flex-row items-center gap-2">
          {entry.scheduledAt && (
            <Text className="font-ui shrink-0 text-[10px] text-neutral-outline">
              {formatDate(entry.scheduledAt)}
            </Text>
          )}
          {entry.venue && (
            <View className="flex-1" style={{ minWidth: 0 }}>
              <Text
                className="font-ui text-[10px] text-neutral-outline"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {entry.venue}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Body: Team A | Center | Team B */}
      <View className="flex-row items-center">
        {/* Team A */}
        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={entry.teamA.shieldUrl} size={48} isMyTeam={isMyTeamA} teamId={entry.teamA.id} viewerTitle={entry.teamA.name} expandable />
          <Text
            className="font-uiBold text-[12px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {entry.teamA.name}
          </Text>
          <Text className="font-ui text-[10px] text-neutral-outline">{entry.teamA.eloRating}</Text>
        </View>

        {/* Center */}
        <View className="w-20 items-center">
          <MatchCardCenter entry={entry} />
        </View>

        {/* Team B */}
        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={entry.teamB.shieldUrl} size={48} isMyTeam={isMyTeamB} teamId={entry.teamB.id} viewerTitle={entry.teamB.name} expandable />
          <Text
            className="font-uiBold text-[12px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {entry.teamB.name}
          </Text>
          <Text className="font-ui text-[10px] text-neutral-outline">{entry.teamB.eloRating}</Text>
        </View>
      </View>

      {/* Footer (contextual actions) */}
      <MatchCardFooter
        entry={entry}
        myTeamId={myTeamId}
        canManage={canManage}
        isStaff={isStaff}
        onProposePress={onProposePress}
        onAcceptProposal={onAcceptProposal}
        onRejectProposal={onRejectProposal}
        onCancelProposal={onCancelProposal}
        onLoadResult={onLoadResult}
      />
    </TouchableOpacity>
    </Animated.View>
  );
}
