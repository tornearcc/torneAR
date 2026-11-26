import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';

import { TeamShield } from '@/components/ui/TeamShield';
import type { ChallengeInboxEntry } from '@/components/ranking/types';

interface Props {
  challenges: ChallengeInboxEntry[];
  /** Capitán o subcapitán: los demás ven el desafío pero no lo responden. */
  canRespond: boolean;
  busyId: string | null;
  onAccept: (c: ChallengeInboxEntry) => void;
  onDecline: (c: ChallengeInboxEntry) => void;
  onSeeAll: () => void;
}

/**
 * «Te desafiaron» arriba de Partidos (rediseño, etapa 3; spec §6). Antes vivía
 * detrás del ícono de espadas del header. Siempre deja el link a la bandeja
 * completa (enviados e historial).
 */
export function ReceivedChallengesSection({ challenges, canRespond, busyId, onAccept, onDecline, onSeeAll }: Props) {
  return (
    <View className="mb-5">
      <View className="mb-2.5 flex-row items-baseline justify-between">
        <Text className="font-uiBold text-xs uppercase tracking-wider text-warning-tertiary">
          {challenges.length > 0 ? `Te desafiaron · ${challenges.length}` : 'Desafíos'}
        </Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text className="font-uiBold text-xs text-brand-primary">Enviados e historial</Text>
        </TouchableOpacity>
      </View>
      {challenges.map((c) => {
        const busy = busyId === c.challengeId;
        return (
          <View key={c.challengeId} className="mb-2.5 rounded-2xl border border-warning-tertiary/45 bg-warning-tertiary/10 p-3.5">
            <View className="flex-row items-center gap-3">
              <TeamShield shieldUrl={c.opponentShieldUrl} size={44} name={c.opponentTeamName} />
              <View className="flex-1">
                <Text className="font-uiBold text-[15px] text-neutral-on-surface" numberOfLines={1}>{`${c.opponentTeamName} quiere jugar`}</Text>
                <Text className="font-ui mt-0.5 text-[13px] text-neutral-on-surface-variant">
                  {`${c.matchType === 'RANKING' ? 'Por el ranking' : 'Amistoso'} · Rating ${c.opponentElo}`}
                </Text>
              </View>
            </View>
            {canRespond ? (
              <View className="mt-3 flex-row gap-2.5">
                <TouchableOpacity disabled={busy} onPress={() => onAccept(c)} activeOpacity={0.85} className="h-11 flex-1 items-center justify-center rounded-xl bg-brand-primary">
                  {busy ? <ActivityIndicator size="small" color="#0E0E0E" /> : <Text className="font-uiBold text-sm text-surface-lowest">Aceptar</Text>}
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => onDecline(c)} activeOpacity={0.85} className="h-11 flex-1 items-center justify-center rounded-xl bg-surface-high">
                  <Text className="font-uiBold text-sm text-neutral-on-surface">Ahora no</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text className="font-ui mt-2.5 text-[13px] text-neutral-on-surface-variant">Lo responde el capitán del equipo.</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
