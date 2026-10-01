import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
  teamName: string;
  sharing: boolean;
  onInvite: () => void;
}

/**
 * Tarjeta de Inicio para el capitán de un equipo que todavía tiene un solo
 * integrante (Tanda 7, P1-11). Al 29/09, 16 de los 17 equipos reales estaban
 * así: sin compañeros no hay partidos. Comparte el mismo link que la gestión
 * del equipo (`lib/share-team-invite.ts`) y desaparece sola cuando entra el
 * segundo integrante.
 */
export function SoloTeamInviteCard({ teamName, sharing, onInvite }: Props) {
  return (
    <View className="mb-5 rounded-2xl border border-brand-primary/40 bg-brand-primary/10 p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-primary/15">
          <AppIcon family="material-community" name="account-multiple-plus" size={24} color="#53E076" />
        </View>
        <View className="flex-1">
          <Text className="font-displayBlack text-base uppercase tracking-wide text-neutral-on-surface">
            Tu equipo necesita jugadores
          </Text>
          <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
            En {teamName} estás solo vos. Mandales el link a tus compañeros: lo tocan, se bajan la app y te piden entrar.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onInvite}
        disabled={sharing}
        accessibilityRole="button"
        accessibilityLabel={`Invitar compañeros a ${teamName}`}
        className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3"
      >
        {sharing ? (
          <ActivityIndicator size="small" color="#0E0E0E" />
        ) : (
          <AppIcon family="material-community" name="share-variant" size={18} color="#0E0E0E" />
        )}
        <Text className="font-uiBold text-sm uppercase tracking-wide text-surface-lowest">Invitar compañeros</Text>
      </TouchableOpacity>
    </View>
  );
}
