import { useEffect, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { TeamShield } from '@/components/ui/TeamShield';
import { LiveTimer } from '@/components/matches/LiveTimer';
import type { MatchDetailViewData } from '@/components/matches/types';

interface Props {
  match: MatchDetailViewData;
  myTeamId: string;
}

function ScoreCenter({ scoreA, scoreB }: { scoreA: number; scoreB: number }) {
  return (
    <View className="items-center">
      <Text className="font-displayBlack text-5xl text-neutral-on-surface">
        {scoreA} – {scoreB}
      </Text>
    </View>
  );
}

/**
 * Etiqueta de localía. Es ABSOLUTA: teamA siempre es LOCAL y teamB siempre
 * VISITANTE, sin importar cuál sea "mi equipo". El marcador de este Hero es
 * relativo (mi equipo a la izquierda), así que sin esta ancla la lectura choca
 * con la del listado — que es absoluta. El chip cierra esa fricción: aunque mi
 * equipo aparezca a la izquierda, el usuario ve si jugó de local o de visitante.
 */
function VenueBadge({ isHome }: { isHome: boolean }) {
  return (
    <View
      className={`rounded-full px-2 py-0.5 ${
        isHome ? 'bg-info-secondary/15' : 'bg-neutral-outline/15'
      }`}
    >
      <Text
        className={`font-uiBold text-[9px] uppercase tracking-widest ${
          isHome ? 'text-info-secondary' : 'text-neutral-on-surface-variant'
        }`}
      >
        {isHome ? 'Local' : 'Visitante'}
      </Text>
    </View>
  );
}

function LiveBadge() {
  // `useState` con inicializador lazy en vez de `useRef(new Animated.Value(1)).current`:
  // da el mismo valor estable sin leer una ref durante el render (y sin construir
  // un Animated.Value nuevo que se descarta en cada render).
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{ opacity: pulse }}
      className="mt-2 rounded-full bg-danger-error/20 px-3 py-1"
    >
      <Text className="font-uiBold text-xs uppercase tracking-widest text-danger-error">
        EN VIVO
      </Text>
    </Animated.View>
  );
}

export function MatchDetailHero({ match, myTeamId }: Props) {
  const { status, teamA, teamB, myResult, opponentResult } = match;

  const isMyTeamA = teamA.id === myTeamId;
  const myTeam = isMyTeamA ? teamA : teamB;
  const opponentTeam = isMyTeamA ? teamB : teamA;

  // ── Marcador SIEMPRE relativo a mi equipo ───────────────────────────────────
  // myResult / opponentResult ya vienen orientados por el RPC get_match_detail
  // (WHERE r.team_id = p_team_id). Este Hero además renderiza mi equipo siempre
  // a la izquierda, así que también es relativo.
  //
  // El bug 9 era aplicar isMyTeamA sobre datos YA relativizados: para el equipo
  // B eso invertía el marcador y mostraba "3-0" a favor de quien había perdido.
  // isMyTeamA acá sólo sirve para elegir escudo y nombre, nunca para el score.
  //
  // Cada equipo carga (goles a favor, goles en contra) desde su perspectiva, así
  // que el resultado del rival es el respaldo espejado si el propio falta.
  const myGoals = myResult?.goalsScored ?? opponentResult?.goalsAgainst ?? null;
  const opponentGoals = opponentResult?.goalsScored ?? myResult?.goalsAgainst ?? null;

  function renderCenter() {
    if (status === 'EN_VIVO') {
      return (
        <View className="items-center gap-1">
          <ScoreCenter scoreA={myGoals ?? 0} scoreB={opponentGoals ?? 0} />
          <LiveBadge />
          {match.startedAt && (
            <LiveTimer
              startedAt={match.startedAt}
              className="font-displayBlack text-lg text-danger-error/80"
            />
          )}
        </View>
      );
    }

    if (status === 'FINALIZADO') {
      const sA = myGoals ?? 0;
      const sB = opponentGoals ?? 0;
      const iWon = sA > sB;
      const isDraw = sA === sB;
      return (
        <View className="items-center gap-1">
          <ScoreCenter scoreA={sA} scoreB={sB} />
          {!isDraw && (
            <View
              className={`rounded-full px-3 py-1 ${iWon ? 'bg-brand-primary/20' : 'bg-danger-error/20'}`}
            >
              <Text
                className={`font-uiBold text-xs uppercase tracking-widest ${iWon ? 'text-brand-primary' : 'text-danger-error'}`}
              >
                {iWon ? 'Victoria' : 'Derrota'}
              </Text>
            </View>
          )}
          {isDraw && (
            <View className="rounded-full bg-neutral-outline/20 px-3 py-1">
              <Text className="font-uiBold text-xs uppercase tracking-widest text-neutral-on-surface-variant">
                Empate
              </Text>
            </View>
          )}
        </View>
      );
    }

    if (status === 'EN_DISPUTA') {
      return (
        <View className="items-center">
          <Text className="font-displayBlack text-5xl text-warning-tertiary">? – ?</Text>
          <View className="mt-2 rounded-full bg-warning-tertiary/20 px-3 py-1">
            <Text className="font-uiBold text-xs uppercase tracking-widest text-warning-tertiary">
              En disputa
            </Text>
          </View>
        </View>
      );
    }

    if (status === 'WO_A' || status === 'WO_B') {
      const woWinner = status === 'WO_A' ? teamA : teamB;
      const iWinByWo = woWinner.id === myTeamId;
      const myWoScore = iWinByWo ? 3 : 0;
      const theirWoScore = iWinByWo ? 0 : 3;
      return (
        <View className="items-center gap-1">
          <ScoreCenter scoreA={myWoScore} scoreB={theirWoScore} />
          <View className="rounded-full bg-warning-tertiary/20 px-3 py-1">
            <Text className="font-uiBold text-xs uppercase tracking-widest text-warning-tertiary">
              WO
            </Text>
          </View>
        </View>
      );
    }

    // PENDIENTE / CONFIRMADO
    return (
      <Text className="font-displayBlack text-3xl italic text-neutral-outline">VS</Text>
    );
  }

  const isFinalized = status === 'FINALIZADO';

  return (
    <View
      className={`items-center rounded-2xl px-6 py-8 ${
        isFinalized ? 'bg-brand-primary/5' : 'bg-surface-container'
      }`}
    >
      <View className="flex-row items-center justify-center gap-6">
        {/* My team — local si mi equipo es teamA (localía absoluta) */}
        <View className="flex-1 items-center gap-2">
          <TeamShield shieldUrl={myTeam.shieldUrl} size={72} isMyTeam />
          <VenueBadge isHome={isMyTeamA} />
          <Text
            className="font-uiBold text-center text-sm text-neutral-on-surface"
            numberOfLines={2}
          >
            {myTeam.name}
          </Text>
          <Text className="font-ui text-xs text-neutral-outline">{myTeam.eloRating} Rating</Text>
        </View>

        {/* Center */}
        <View className="items-center">{renderCenter()}</View>

        {/* Opponent team — la localía inversa a la mía */}
        <View className="flex-1 items-center gap-2">
          <TeamShield shieldUrl={opponentTeam.shieldUrl} size={72} />
          <VenueBadge isHome={!isMyTeamA} />
          <Text
            className="font-uiBold text-center text-sm text-neutral-on-surface"
            numberOfLines={2}
          >
            {opponentTeam.name}
          </Text>
          <Text className="font-ui text-xs text-neutral-outline">{opponentTeam.eloRating} Rating</Text>
        </View>
      </View>
    </View>
  );
}
