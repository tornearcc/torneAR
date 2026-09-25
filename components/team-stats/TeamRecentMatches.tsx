import { Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import type { TeamRecentMatch, FormResult } from './types';

function formatDate(dateIso: string | null): string {
  if (!dateIso) return '';
  const d = new Date(dateIso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function statusLabel(status: string): string {
  switch (status) {
    case 'CONFIRMADO': return 'Próx.';
    case 'CANCELADO': return 'Canc.';
    case 'WO_A': case 'WO_B': return 'W.O.';
    case 'EN_DISPUTA': return 'Disp.';
    case 'EN_VIVO': return 'En juego';
    default: return 'Pend.';
  }
}

function ResultBadge({ result }: { result: FormResult | null }) {
  if (result === 'V') {
    return (
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-primary">
        <Text className="font-displayBlack text-lg text-[#003914]">V</Text>
      </View>
    );
  }
  if (result === 'E') {
    return (
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-warning-tertiary">
        <Text className="font-displayBlack text-lg text-[#412D00]">E</Text>
      </View>
    );
  }
  if (result === 'D') {
    return (
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-danger-error/75">
        <Text className="font-displayBlack text-lg text-[#690005]">D</Text>
      </View>
    );
  }
  return (
    <View className="h-10 w-10 items-center justify-center rounded-xl bg-surface-variant">
      <AppIcon family="material-community" name="clock-outline" size={18} color="#BCCBB9" />
    </View>
  );
}

type TeamRecentMatchesProps = {
  matches: TeamRecentMatch[];
};

export function TeamRecentMatches({ matches }: TeamRecentMatchesProps) {
  return (
    <View className="mt-8">
      <Text className="font-display mb-3 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
        Últimos Partidos
      </Text>
      {matches.length === 0 ? (
        <View className="rounded-xl bg-surface-low px-4 py-5">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            Todavía no hay partidos para mostrar.
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {matches.map((match) => (
            <View
              key={match.id}
              className="flex-row items-center gap-3 rounded-xl bg-surface-low px-3 py-3"
            >
              <ResultBadge result={match.result} />

              <View className="flex-1">
                {/* Mismo orden que en el historial del jugador: "vs <escudo>
                    Rival". El escudo delante partia la frase al medio. */}
                <View className="flex-row items-center gap-2">
                  <Text className="font-ui text-sm text-neutral-on-surface-variant">vs</Text>
                  <TeamShield shieldUrl={match.rivalShieldUrl} name={match.rivalName} size={28} teamId={match.rivalTeamId} expandable />
                  <Text
                    className="font-uiBold flex-1 text-sm text-neutral-on-surface"
                    numberOfLines={1}
                  >
                    {match.rivalName}
                  </Text>
                </View>
                <View className="mt-1 flex-row items-center gap-2">
                  <Text className="font-uiBold rounded bg-surface-high px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-neutral-on-surface-variant">
                    {match.matchType === 'RANKING' ? 'Ranking' : 'Amistoso'}
                  </Text>
                  {!!match.scheduledAt && (
                    <Text className="font-ui text-[11px] text-neutral-on-surface-variant">
                      {formatDate(match.scheduledAt)}
                    </Text>
                  )}
                </View>

                {/* MVP del partido, con el mismo dorado que en el historial del
                    jugador. Solo aparece cuando se cargó: es opcional al subir
                    el resultado, y una fila de "sin MVP" en cada partido sería
                    ruido. */}
                {!!match.mvpName && (
                  <View className="mt-1 flex-row items-center">
                    <Text
                      className="font-uiBold rounded bg-brand-gold/15 px-1.5 py-0.5 text-[9px] text-brand-gold"
                      numberOfLines={1}
                    >
                      ⭐ MVP · {match.mvpName}
                    </Text>
                  </View>
                )}
              </View>

              <View className="items-end gap-1">
                {match.goalsFor !== null && match.goalsAgainst !== null ? (
                  <Text
                    className="font-displayBlack text-xl text-neutral-on-surface"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {match.goalsFor}-{match.goalsAgainst}
                  </Text>
                ) : (
                  <Text className="font-ui text-xs uppercase text-neutral-on-surface-variant">
                    {statusLabel(match.status)}
                  </Text>
                )}
                {match.prDelta !== null && match.matchType === 'RANKING' && (
                  <Text
                    className={`font-uiBold text-[10px] ${match.prDelta >= 0 ? 'text-brand-primary' : 'text-danger-error'}`}
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {match.prDelta >= 0 ? '+' : ''}{match.prDelta} Rating
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
