import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { TeamShield } from '@/components/ui/TeamShield';
import type { HomeNextStep } from '@/lib/home-next-step';

/** A dónde lleva cada botón de la tarjeta. La pantalla resuelve la navegación. */
export type NextStepTarget = 'join_code' | 'team_create' | 'invite' | 'copy_code' | 'pending' | 'match' | 'find_rival';

interface Props {
  next: HomeNextStep;
  onAction: (target: NextStepTarget) => void;
  /** Fecha del próximo partido ya formateada (la arma la pantalla). */
  matchDateLabel?: string;
}

const STATUS: Record<string, { label: string; className: string }> = {
  PENDIENTE: { label: 'Falta acordar día y cancha', className: 'text-warning-tertiary' },
  CONFIRMADO: { label: 'Confirmado', className: 'text-info-secondary' },
  EN_VIVO: { label: 'En vivo', className: 'text-brand-primary' },
};

/**
 * «Tu próximo paso» de Inicio (rediseño, etapa 1; spec §8). Un solo bloque
 * grande con un solo botón verde: lo que la persona tiene que hacer ahora.
 */
export function NextStepCard({ next, onAction, matchDateLabel }: Props) {
  return (
    <View className="mb-5 rounded-2xl border border-brand-primary/35 bg-brand-primary/10 p-[18px]">
      <Text className="font-uiBold mb-3 text-xs uppercase tracking-wider text-brand-primary">Tu próximo paso</Text>
      <Body next={next} onAction={onAction} matchDateLabel={matchDateLabel} />
    </View>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <Text className="font-display text-[28px] uppercase leading-none text-neutral-on-surface">{children}</Text>;
}

function Detail({ children }: { children: React.ReactNode }) {
  return <Text className="font-ui mt-2 text-sm leading-5 text-neutral-on-surface-variant">{children}</Text>;
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} className="mt-4 h-12 items-center justify-center rounded-xl bg-brand-primary">
      <Text className="font-uiBold text-[15px] text-surface-lowest">{label}</Text>
    </TouchableOpacity>
  );
}

function Body({ next, onAction, matchDateLabel }: Props) {
  switch (next.kind) {
    case 'JOIN_TEAM':
      return (
        <View>
          <Title>Sumate a un equipo</Title>
          <Detail>Sin equipo no aparecés en el ranking. Entrá al de un amigo o armá el tuyo.</Detail>
          <View className="mt-4 flex-row gap-2.5">
            <TouchableOpacity onPress={() => onAction('join_code')} activeOpacity={0.85} className="h-12 flex-1 items-center justify-center rounded-xl bg-brand-primary">
              <Text className="font-uiBold text-sm text-surface-lowest">Tengo un código</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onAction('team_create')} activeOpacity={0.85} className="h-12 flex-1 items-center justify-center rounded-xl bg-surface-high">
              <Text className="font-uiBold text-sm text-neutral-on-surface">Armar el mío</Text>
            </TouchableOpacity>
          </View>
        </View>
      );

    case 'COMPLETE_TEAM': {
      const { team } = next;
      const free = Math.max(0, team.needed - team.members);
      return (
        <View>
          <Title>Completá {team.name}</Title>
          <Detail>{`Son ${team.members} de ${team.needed}. Un F${team.needed} necesita ${team.needed} para jugar.`}</Detail>
          <View className="mt-4 flex-row flex-wrap gap-2" accessibilityLabel={`${team.members} de ${team.needed} jugadores`}>
            {Array.from({ length: team.members }, (_, i) => (
              <View key={`m${i}`} className="h-11 w-11 rounded-full bg-brand-primary" />
            ))}
            {Array.from({ length: free }, (_, i) => (
              <View key={`f${i}`} className="h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-brand-primary/40">
                <Text className="font-uiBold text-xl text-brand-primary">+</Text>
              </View>
            ))}
          </View>
          <PrimaryButton label="Invitar a mis amigos" onPress={() => onAction('invite')} />
          <View className="mt-3 flex-row items-center justify-between rounded-xl bg-surface-base px-3.5 py-2.5">
            <Text className="font-ui text-[13px] text-neutral-on-surface-variant">
              Código <Text className="font-displayBlack text-xl tracking-widest text-neutral-on-surface">{team.inviteCode}</Text>
            </Text>
            <TouchableOpacity onPress={() => onAction('copy_code')} activeOpacity={0.85} className="h-9 justify-center rounded-lg bg-surface-high px-3">
              <Text className="font-uiBold text-[13px] text-brand-primary">Copiar</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    case 'MATCH_ACTION':
    case 'TEAM_REQUEST':
    case 'MARKET_APPLICATION':
      return (
        <View>
          <Text className="font-uiBold text-lg text-warning-tertiary">{next.action.label}</Text>
          <PrimaryButton label="Ver" onPress={() => onAction('pending')} />
        </View>
      );

    case 'NEXT_MATCH': {
      const { match } = next;
      const status = STATUS[match.status];
      return (
        <View>
          {status ? <Text className={`font-uiBold text-[13px] ${status.className}`}>● {status.label}</Text> : null}
          <View className="mt-3 flex-row items-center justify-between">
            <View className="w-[42%] items-center gap-1.5">
              <TeamShield shieldUrl={match.teamA.shieldUrl} size={52} name={match.teamA.name} />
              <Text className="font-uiBold text-center text-[13px] text-neutral-on-surface" numberOfLines={2}>{match.teamA.name}</Text>
            </View>
            <Text className="font-displayBlack text-xl text-neutral-outline">VS</Text>
            <View className="w-[42%] items-center gap-1.5">
              <TeamShield shieldUrl={match.teamB.shieldUrl} size={52} name={match.teamB.name} />
              <Text className="font-uiBold text-center text-[13px] text-neutral-on-surface" numberOfLines={2}>{match.teamB.name}</Text>
            </View>
          </View>
          {matchDateLabel ? <Text className="font-uiBold mt-3 text-center text-[15px] text-neutral-on-surface">{matchDateLabel}</Text> : null}
          <PrimaryButton label="Ver el partido" onPress={() => onAction('match')} />
        </View>
      );
    }

    case 'FIND_RIVAL':
      return (
        <View>
          <Title>Buscá rival</Title>
          <Detail>Tu equipo está listo. Desafiá a uno de tu zona.</Detail>
          <PrimaryButton label="Buscar rival" onPress={() => onAction('find_rival')} />
        </View>
      );
  }
}
