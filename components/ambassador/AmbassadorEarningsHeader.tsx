import { Text, View } from 'react-native';
import { formatArs } from '@/components/ambassador/format';

type AmbassadorEarningsHeaderProps = {
  earnedTotal: number;
  paidTotal: number;
  slotsLeft: number;
  teamsCounted: number;
  nextBonusAt: number | null;
};

/** Texto de la barra de bonos: «3 de 5 equipos para el bono de $5.000», «7 de 10…» o «Ganaste los dos bonos». */
export function bonusProgressLabel(teamsCounted: number, nextBonusAt: number | null): string {
  if (nextBonusAt === null) return 'Ganaste los dos bonos';
  return `${teamsCounted} de ${nextBonusAt} equipos para el bono de $5.000`;
}

/** Ganado, pagado, lugares que quedan y progreso hacia los bonos de 5 y 10 equipos. */
export function AmbassadorEarningsHeader({
  earnedTotal,
  paidTotal,
  slotsLeft,
  teamsCounted,
  nextBonusAt,
}: AmbassadorEarningsHeaderProps) {
  const label = bonusProgressLabel(teamsCounted, nextBonusAt);
  const ratio = nextBonusAt === null ? 1 : Math.min(teamsCounted / nextBonusAt, 1);

  return (
    <View className="rounded-2xl border border-brand-primary/40 bg-surface-container p-4">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-outline">Ganado</Text>
          <Text className="font-displayBlack text-3xl text-brand-primary">{formatArs(earnedTotal)}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-outline">Pagado</Text>
          <Text className="font-displayBlack text-3xl text-neutral-on-surface">{formatArs(paidTotal)}</Text>
        </View>
      </View>

      <View className="mt-4">
        <Text className="font-uiBold text-xs text-neutral-on-surface">{label}</Text>
        <View className="mt-2 h-2 overflow-hidden rounded-full bg-surface-high">
          <View className="h-2 rounded-full bg-brand-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </View>
      </View>

      <Text className="font-ui mt-3 text-[11px] text-neutral-on-surface-variant">
        {slotsLeft === 1 ? 'Queda 1 lugar' : `Quedan ${slotsLeft} lugares`} en el programa
      </Text>
    </View>
  );
}
