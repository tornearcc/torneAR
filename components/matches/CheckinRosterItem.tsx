import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import type { CheckinRosterPlayer, CheckinLineupState } from '@/components/matches/types';

interface Props {
  player: CheckinRosterPlayer;
  state: CheckinLineupState;
  // Un tap avanza el ciclo AFUERA → TITULAR → SUPLENTE → AFUERA
  onCycle: (profileId: string) => void;
  disabled?: boolean;
}

const STATE_STYLES: Record<CheckinLineupState, { container: string; pill: string; pillText: string; label: string }> = {
  AFUERA: {
    container: 'border-neutral-outline/20 bg-surface-container',
    pill: 'border border-neutral-outline/40 bg-surface-high',
    pillText: 'text-neutral-outline',
    label: 'Afuera',
  },
  TITULAR: {
    container: 'border-brand-primary/40 bg-brand-primary/10',
    pill: 'bg-brand-primary',
    pillText: 'text-[#003914]',
    label: 'Titular',
  },
  SUPLENTE: {
    container: 'border-info-secondary/40 bg-info-secondary/10',
    pill: 'bg-info-secondary/25 border border-info-secondary/50',
    pillText: 'text-info-secondary',
    label: 'Suplente',
  },
};

const ROLE_LABELS: Record<string, string> = {
  CAPITAN: 'Capitán',
  SUBCAPITAN: 'Subcapitán',
  DIRECTOR_TECNICO: 'DT',
};

export function CheckinRosterItem({ player, state, onCycle, disabled }: Props) {
  const styles = STATE_STYLES[state];
  const roleLabel = player.isGuest ? 'Invitado' : ROLE_LABELS[player.teamRole ?? ''];

  return (
    <TouchableOpacity
      onPress={() => onCycle(player.profileId)}
      activeOpacity={0.8}
      disabled={disabled}
      className={`mb-2 flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${styles.container} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {/* Sin visor a propósito: acá tocar la fila (foto incluida) cambia el
          estado del jugador en la lista de buena fe. */}
      <Avatar uri={player.avatarUrl} size={40} />

      <View className="flex-1">
        <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={1}>
          {player.fullName}
        </Text>
        <View className="flex-row items-center gap-2">
          {player.username ? (
            <Text className="font-ui text-xs text-neutral-on-surface-variant" numberOfLines={1}>
              @{player.username}
            </Text>
          ) : null}
          {roleLabel ? (
            <Text className="font-uiBold text-[10px] uppercase tracking-wider text-warning-tertiary">
              {roleLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <View className={`min-w-[86px] items-center rounded-full px-3 py-1.5 ${styles.pill}`}>
        <Text className={`font-uiBold text-xs ${styles.pillText}`}>{styles.label}</Text>
      </View>
    </TouchableOpacity>
  );
}
