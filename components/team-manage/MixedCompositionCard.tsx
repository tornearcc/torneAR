import { View, Text } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import {
  describeCompositionMissing,
  describeRule,
  type MixedCompositionStatus,
} from '@/lib/mixed-composition';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface Props {
  status: MixedCompositionStatus;
}

/**
 * F3 — composición del plantel de un equipo MIXTO, para sus integrantes.
 *
 * Muestra cantidades por género, nunca quién es quién: es lo único que devuelve
 * `get_mixed_composition_status`. Tres estados:
 *   · cumple → confirmación discreta;
 *   · no cumple y la regla ya se exige → aviso: el equipo no puede desafiar,
 *     aceptar ni confirmar partidos;
 *   · no cumple y todavía no se exige → aviso anticipado (período de aviso).
 */
export function MixedCompositionCard({ status }: Props) {
  const { counts } = status;
  if (!status.applies || !counts) return null;

  const rule = describeRule(counts.minPerGender);
  const missing = describeCompositionMissing({
    male: counts.missingMale,
    female: counts.missingFemale,
    total: counts.missingTotal,
  });

  const blocking = !status.ok && status.enforced;
  const color = status.ok ? '#53E076' : blocking ? '#FFB4AB' : '#FABD32';

  return (
    <View
      className="mt-4 rounded-xl bg-surface-low p-4"
      accessibilityLabel="Composición mixta"
      testID="mixed-composition-card"
    >
      <View className="mb-2 flex-row items-center gap-2">
        <AppIcon
          family="material-community"
          name={status.ok ? 'check-circle-outline' : 'alert-circle-outline'}
          size={18}
          color={color}
        />
        <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
          Composición mixta
        </Text>
      </View>

      <Text className="font-ui text-sm text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
        Masculino {counts.male} · Femenino {counts.female} · Otro {counts.other}
      </Text>

      <Text className="font-ui mt-2 text-xs text-neutral-on-surface-variant">
        {status.ok
          ? `El plantel cumple el mínimo de un equipo mixto: ${rule}.`
          : blocking
            ? `${capitalize(missing)} para poder desafiar, aceptar desafíos y confirmar partidos. Un equipo mixto necesita ${rule}.`
            : `Pronto se va a exigir ${rule} para jugar. Hoy ${missing}.`}
      </Text>

      {!counts.xCountsAsAny && counts.other > 0 && (
        <Text className="font-ui mt-1 text-xs text-neutral-outline">
          Los jugadores con género «Otro» cuentan para completar el equipo, no para estos mínimos.
        </Text>
      )}
    </View>
  );
}
