import { View, Text, TouchableOpacity } from 'react-native';
import { canLoadResultFromCard } from '@/lib/match-permissions';
import type { MatchCardEntry } from './types';
import { TeamShield } from '@/components/ui/TeamShield';

interface Props {
  match: MatchCardEntry;
  myTeamId: string;
  /**
   * D10: el gating por rol ya no se hace omitiendo `onLoadResult` desde la
   * pantalla — se decide acá, con la misma regla que el resto de la app.
   * R6: el banner sólo ofrece cargar el resultado, así que le alcanza con
   * `isStaff` (incluye al DIRECTOR_TECNICO). No recibe `canManage` porque no
   * dibuja ninguna acción de coordinación.
   */
  isStaff: boolean;
  onPress: (matchId: string) => void;
  onLoadResult?: (matchId: string) => void;
}

export function LiveMatchBanner({ match, myTeamId, isStaff, onPress, onLoadResult }: Props) {
  const scoreA = match.resultTeamA !== null ? match.resultTeamA : '?';
  const scoreB = match.resultTeamB !== null ? match.resultTeamB : '?';
  const isMyTeamA = match.teamA.id === myTeamId;
  const isMyTeamB = match.teamB.id === myTeamId;

  // D10: antes bastaba con que el banner existiera (siempre es EN_VIVO) para
  // ofrecer "Cargar resultado", así que el botón seguía ahí después de que mi
  // equipo ya lo hubiera cargado. El helper mira también eso.
  const showLoadResult = canLoadResultFromCard(match, myTeamId, isStaff);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(match.id)}
      className="mb-4 rounded-2xl border border-danger-error/30 bg-danger-error/10 p-4"
    >
      {/* Live indicator */}
      <View className="mb-3 flex-row items-center gap-2">
        <View className="h-2 w-2 rounded-full bg-danger-error" />
        <Text className="font-displayBlack text-[11px] uppercase tracking-widest text-danger-error">
          En vivo
        </Text>
      </View>

      {/* Teams + Score */}
      <View className="flex-row items-center">
        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={match.teamA.shieldUrl} size={52} isMyTeam={isMyTeamA} teamId={match.teamA.id} viewerTitle={match.teamA.name} expandable />
          <Text
            className="font-uiBold text-[13px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {match.teamA.name}
          </Text>
        </View>

        <View className="w-24 items-center">
          <Text className="font-displayBlack text-[32px] leading-none text-danger-error">
            {scoreA} – {scoreB}
          </Text>
        </View>

        <View className="flex-1 items-center gap-1.5">
          <TeamShield shieldUrl={match.teamB.shieldUrl} size={52} isMyTeam={isMyTeamB} teamId={match.teamB.id} viewerTitle={match.teamB.name} expandable />
          <Text
            className="font-uiBold text-[13px] text-neutral-on-surface"
            numberOfLines={1}
            style={{ maxWidth: 90 }}
          >
            {match.teamB.name}
          </Text>
        </View>
      </View>

      {/* Load result button — gateado por la regla unificada (D10). Antes se
          renderizaba siempre y, sin `onLoadResult`, era un botón muerto. */}
      {showLoadResult && onLoadResult && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onLoadResult(match.id)}
          className="mt-4 items-center rounded-xl border border-danger-error/50 py-3"
        >
          <Text className="font-uiBold text-[13px] text-danger-error">→ Cargar resultado</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
