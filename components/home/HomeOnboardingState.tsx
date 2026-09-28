import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
  onCreateTeam: () => void;
  onJoinTeam: () => void;
  onGoToMarket: () => void;
  /** Solicitudes ya aprobadas por un equipo que esperan que el jugador confirme. */
  pendingTransfers?: number;
  onConfirmTransfer?: () => void;
}

export function HomeOnboardingState({
  onCreateTeam,
  onJoinTeam,
  onGoToMarket,
  pendingTransfers = 0,
  onConfirmTransfer,
}: Props) {
  const hasPendingTransfer = pendingTransfers > 0 && !!onConfirmTransfer;

  return (
    <View className="flex-1 items-center justify-center px-6">
      {/* Un equipo ya te aceptó y falta un paso tuyo: es lo primero que tenés que
          ver. Sin esto, la confirmación del traspaso vivía enterrada en
          Perfil → Solicitudes y el jugador no se enteraba de que existía. */}
      {hasPendingTransfer && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onConfirmTransfer}
          className="mb-8 w-full rounded-2xl border border-brand-primary bg-brand-primary/10 p-4"
        >
          <View className="flex-row items-center gap-3">
            <AppIcon family="material-community" name="check-decagram" size={26} color="#53E076" />
            <View className="flex-1">
              <Text className="font-uiBold text-base text-brand-primary">
                {pendingTransfers === 1
                  ? '¡Un equipo te aceptó!'
                  : `${pendingTransfers} equipos te aceptaron`}
              </Text>
              <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
                Confirmá el traspaso para entrar al plantel.
              </Text>
            </View>
            <AppIcon family="material-community" name="chevron-right" size={22} color="#53E076" />
          </View>
        </TouchableOpacity>
      )}

      {/* Ball icon */}
      <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-surface-container">
        <AppIcon family="material-community" name="soccer" size={44} color="#53E076" />
      </View>

      <Text className="font-displayBlack text-center text-2xl uppercase text-neutral-on-surface">
        ¡Bienvenido a TorneAR!
      </Text>
      <Text className="font-ui mt-3 text-center text-base text-neutral-on-surface-variant">
        Para empezar a jugar necesitás un equipo. Creá el tuyo, unite con un código o buscá uno en
        el Mercado.
      </Text>

      {/* Primary CTAs */}
      <View className="mt-8 w-full gap-3">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onCreateTeam}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-primary py-4"
        >
          <AppIcon family="material-community" name="shield-plus" size={20} color="#0E0E0E" />
          <Text
            style={{ includeFontPadding: false }}
            className="font-uiBold text-base text-surface-lowest pr-1"
          >
            Crear un Equipo Nuevo{" "}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onJoinTeam}
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-brand-primary py-4"
        >
          <AppIcon family="material-community" name="key-variant" size={20} color="#53E076" />
          <Text
            style={{ includeFontPadding: false }}
            className="font-uiBold text-base text-brand-primary pr-1"
          >
            Unirse con Código{" "}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onGoToMarket}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-surface-container py-4"
        >
          <AppIcon family="material-community" name="store-search" size={20} color="#BCCBB9" />
          <Text
            style={{ includeFontPadding: false }}
            className="font-uiBold text-base text-neutral-on-surface-variant pr-1"
          >
            Buscar Equipo en el Mercado{" "}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
