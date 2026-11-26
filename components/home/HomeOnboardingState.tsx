import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { CensusEntryCard } from '@/components/home/CensusEntryCard';
import { JourneyBar } from '@/components/home/JourneyBar';
import { NextStepCard } from '@/components/home/NextStepCard';
import type { PendingAction } from '@/components/home/types';

interface Props {
  onCreateTeam: () => void;
  onJoinTeam: () => void;
  onGoToMarket: () => void;
  onGoToRanking: () => void;
  /**
   * Abre el censo de hinchas. Va también acá porque el video del censo trae
   * gente nueva que todavía no tiene equipo: sin esto, el Inicio vacío no le
   * mostraba dónde ver a su hinchada.
   */
  onGoToCensus?: () => void;
  /** Solicitudes ya aprobadas por un equipo que esperan que el jugador confirme. */
  pendingTransfers?: number;
  onConfirmTransfer?: () => void;
  /** Equipos que se postularon a mi «busco equipo» y esperan respuesta (26/11). */
  marketApplication?: PendingAction | null;
  onOpenApplication?: (action: PendingAction) => void;
}

/**
 * Inicio sin equipo (rediseño, etapa 1; spec §8.1, pantalla 1b): la barra de 3
 * pasos, «Tu próximo paso: sumate a un equipo» y, para quien prefiere mirar
 * primero, los equipos a los que les falta uno, el ranking y el censo.
 */
export function HomeOnboardingState({
  onCreateTeam,
  onJoinTeam,
  onGoToMarket,
  onGoToRanking,
  onGoToCensus,
  pendingTransfers = 0,
  onConfirmTransfer,
  marketApplication,
  onOpenApplication,
}: Props) {
  const hasPendingTransfer = pendingTransfers > 0 && !!onConfirmTransfer;
  const application = marketApplication && onOpenApplication ? marketApplication : null;

  return (
    <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 114 }} showsVerticalScrollIndicator={false}>
      {/* Un equipo ya te aceptó y falta un paso tuyo: es lo primero que tenés que
          ver. Sin esto, la confirmación del traspaso vivía enterrada en
          Perfil → Solicitudes y el jugador no se enteraba de que existía. */}
      {hasPendingTransfer && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onConfirmTransfer}
          className="mb-5 w-full rounded-2xl border border-brand-primary bg-brand-primary/10 p-4"
        >
          <View className="flex-row items-center gap-3">
            <AppIcon family="material-community" name="check-decagram" size={26} color="#53E076" />
            <View className="flex-1">
              <Text className="font-uiBold text-base text-brand-primary">
                {pendingTransfers === 1 ? '¡Un equipo te aceptó!' : `${pendingTransfers} equipos te aceptaron`}
              </Text>
              <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
                Confirmá el traspaso para entrar al plantel.
              </Text>
            </View>
            <AppIcon family="material-community" name="chevron-right" size={22} color="#53E076" />
          </View>
        </TouchableOpacity>
      )}

      {/* Un equipo se postuló a tu «busco equipo»: respondé y entrás. Antes
          Inicio sin equipo no lo mostraba en ningún lado (26/11). */}
      {application && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onOpenApplication?.(application)}
          className="mb-5 w-full rounded-2xl border border-warning-tertiary/60 bg-warning-tertiary/10 p-4"
        >
          <View className="flex-row items-center gap-3">
            <AppIcon family="material-community" name="account-group" size={26} color="#FABD32" />
            <View className="flex-1">
              <Text className="font-uiBold text-base text-warning-tertiary">{application.label}</Text>
              <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
                Se postularon a tu publicación. Aceptá y entrás al equipo.
              </Text>
            </View>
            <AppIcon family="material-community" name="chevron-right" size={22} color="#FABD32" />
          </View>
        </TouchableOpacity>
      )}

      <JourneyBar step={1} teamProgress={0} />

      <NextStepCard
        next={{ kind: 'JOIN_TEAM' }}
        onAction={(target) => (target === 'team_create' ? onCreateTeam() : onJoinTeam())}
      />

      <LinkRow icon="account-search" color="#53E076" title="Equipos a los que les falta uno" detail="Postulate y jugá en tu zona" onPress={onGoToMarket} />
      <LinkRow icon="trophy" color="#FABD32" title="Mirá el ranking de tu zona" onPress={onGoToRanking} />
      {onGoToCensus && <CensusEntryCard onPress={onGoToCensus} className="mb-2.5 w-full" />}
    </ScrollView>
  );
}

function LinkRow({ icon, color, title, detail, onPress }: { icon: string; color: string; title: string; detail?: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} className="mb-2.5 flex-row items-center gap-3 rounded-2xl bg-surface-container px-4 py-3.5">
      <AppIcon family="material-community" name={icon} size={22} color={color} />
      <View className="flex-1">
        <Text className="font-uiBold text-sm text-neutral-on-surface">{title}</Text>
        {detail ? <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant">{detail}</Text> : null}
      </View>
      <AppIcon family="material-community" name="chevron-right" size={18} color="#869585" />
    </TouchableOpacity>
  );
}
