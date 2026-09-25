import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { MatchDetailViewData } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  onCheckin: () => void;
  // Capitán/subcapitán: abre la pantalla de convocatoria (lista de buena fe)
  onOpenSquadList?: () => void;
  /** Perfil del usuario, para saber si ÉL marcó llegada (D9). */
  myProfileId?: string | null;
  /** format_rules.min_players_to_start del formato acordado (D9). */
  minPlayers?: number | null;
  /**
   * F3: mínimo por género si mi equipo es MIXTO y la regla ya se exige; `null`
   * si no aplica. El sello además pide esa composición entre los presentes.
   */
  mixedMinPerGender?: number | null;
}

/**
 * D9: la caja del equipo muestra dos cosas distintas que antes eran una sola.
 * El ✅ verde es "el equipo se presentó" (`checkin_team_X_at`, lo que lee el WO
 * automático); el contador de abajo es cuánta gente marcó llegada. Un solo
 * jugador ya no produce el ✅, así que sin el contador la pantalla no tendría
 * cómo explicar por qué sigue en "Pendiente" después de tocar el botón.
 */
function TeamCheckinBox({
  teamName,
  checkinAt,
  isMyTeam,
  arrivedCount,
  minPlayers,
}: {
  teamName: string;
  checkinAt: string | null;
  isMyTeam: boolean;
  arrivedCount: number;
  minPlayers?: number | null;
}) {
  const done = checkinAt !== null;
  return (
    <View
      className={`flex-1 rounded-xl p-3 ${
        isMyTeam ? 'border border-brand-primary/30 bg-brand-primary/10' : 'bg-surface-high'
      }`}
    >
      <Text
        className="font-uiBold mb-2 text-center text-xs text-neutral-on-surface"
        numberOfLines={1}
      >
        {teamName}
      </Text>
      {done ? (
        <View className="items-center gap-1">
          <AppIcon family="material-community" name="check-circle" size={22} color="#53E076" />
          <Text className="font-ui text-center text-[10px] text-brand-primary">
            {new Date(checkinAt!).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      ) : (
        <View className="items-center">
          <AppIcon family="material-community" name="clock-outline" size={22} color="#869585" />
          <Text className="font-ui mt-1 text-center text-[10px] text-neutral-outline">
            Pendiente
          </Text>
        </View>
      )}
      <Text className="font-ui mt-1 text-center text-[10px] text-neutral-on-surface-variant">
        {minPlayers ? `${arrivedCount}/${minPlayers} llegaron` : `${arrivedCount} llegaron`}
      </Text>
    </View>
  );
}

function isWithin2Hours(scheduledAt: string | null): boolean {
  if (!scheduledAt) return false;
  const diff = new Date(scheduledAt).getTime() - Date.now();
  return diff <= 2 * 60 * 60 * 1000 && diff > -60 * 60 * 1000;
}

export function CheckinSection({
  match,
  onCheckin,
  onOpenSquadList,
  myProfileId,
  minPlayers,
  mixedMinPerGender,
}: Props) {
  const { teamA, teamB, myTeamId, checkinTeamAAt, checkinTeamBAt, scheduledAt, participants } = match;

  const isMyTeamA = teamA.id === myTeamId;
  const myTeam = isMyTeamA ? teamA : teamB;
  const opponentTeam = isMyTeamA ? teamB : teamA;
  const myCheckinAt = isMyTeamA ? checkinTeamAAt : checkinTeamBAt;
  const opponentCheckinAt = isMyTeamA ? checkinTeamBAt : checkinTeamAAt;

  // D9: "mi equipo se presentó" ya NO es lo mismo que "yo llegué".
  const teamSealed = myCheckinAt !== null;
  const iCheckedIn = participants.some((p) => p.profileId === myProfileId && p.didCheckin);
  const myTeamArrived = participants.filter((p) => p.teamId === myTeam.id && p.didCheckin).length;
  const opponentArrived = participants.filter((p) => p.teamId === opponentTeam.id && p.didCheckin).length;
  const missing = minPlayers ? Math.max(minPlayers - myTeamArrived, 0) : 0;

  const canCheckin = !iCheckedIn && isWithin2Hours(scheduledAt);

  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <Text className="font-uiBold mb-3 text-base text-neutral-on-surface">Check-in</Text>
      <View className="mb-4 flex-row gap-2">
        <TeamCheckinBox
          teamName={myTeam.name}
          checkinAt={myCheckinAt}
          isMyTeam
          arrivedCount={myTeamArrived}
          minPlayers={minPlayers}
        />
        <TeamCheckinBox
          teamName={opponentTeam.name}
          checkinAt={opponentCheckinAt}
          isMyTeam={false}
          arrivedCount={opponentArrived}
          minPlayers={minPlayers}
        />
      </View>

      {!iCheckedIn && !canCheckin && (
        <View className="rounded-xl bg-surface-high px-4 py-3">
          <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
            El check-in se habilita 2 horas antes del partido
          </Text>
        </View>
      )}

      {canCheckin && (
        onOpenSquadList ? (
          <TouchableOpacity
            onPress={onOpenSquadList}
            activeOpacity={0.8}
            className="rounded-xl bg-brand-primary py-3"
          >
            <Text className="font-uiBold text-center text-sm text-[#003914]">
              Armar lista y hacer check-in
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onCheckin}
            activeOpacity={0.8}
            className="rounded-xl bg-brand-primary py-3"
          >
            <Text className="font-uiBold text-center text-sm text-[#003914]">Marcar llegada</Text>
          </TouchableOpacity>
        )
      )}

      {iCheckedIn && (
        <View className="rounded-xl bg-brand-primary/10 px-4 py-3">
          <Text className="font-uiBold text-center text-sm text-brand-primary">
            {teamSealed ? 'Tu equipo está presentado' : 'Ya marcaste tu llegada'}
          </Text>
          {/* D9: el jugador que llegó primero necesita saber que su tap no
              presentó al equipo, y cuánta gente falta para que lo haga. */}
          {!teamSealed && (
            <Text className="font-ui mt-1 text-center text-xs text-neutral-on-surface-variant">
              {minPlayers && missing === 0 && mixedMinPerGender
                ? // F3: el quórum está, lo que falta es la composición. El
                  // cliente no sabe el género de los presentes: enuncia la regla
                  // (el alert del check-in dice cuántos faltan).
                  `Ya son ${myTeamArrived}, pero para presentar a un equipo mixto entre los presentes tiene que haber al menos ${mixedMinPerGender} de género masculino y ${mixedMinPerGender} de género femenino.`
                : minPlayers
                  ? `Faltan ${missing} compañero(s) para dar por presentado al equipo (${myTeamArrived}/${minPlayers}).`
                  : 'Falta que lleguen más compañeros para dar por presentado al equipo.'}
            </Text>
          )}
          {onOpenSquadList && (
            <TouchableOpacity onPress={onOpenSquadList} activeOpacity={0.8} className="mt-2">
              <Text className="font-ui text-center text-xs text-brand-primary underline">
                Ajustar la convocatoria
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
