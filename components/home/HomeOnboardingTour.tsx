import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface TourStep {
  icon: string;
  color: string;
  tag: string;
  title: string;
  description: string;
}

/**
 * Los tres pasos de la guía, en el mismo orden en que las tarjetas aparecen al
 * scrollear la Home. Es un carrusel nativo a propósito: un tooltip anclado a
 * cada tarjeta obligaba a sumar una dependencia y a medir posiciones que
 * cambian según haya o no partido próximo.
 */
const STEPS: TourStep[] = [
  {
    icon: 'timer-outline',
    color: '#53E076',
    tag: 'Paso 1 de 3',
    title: 'Tu próximo partido',
    description:
      'Arriba de todo vas a encontrar el partido que viene, con una cuenta regresiva en vivo hasta el pitazo inicial. Tocala para abrir el detalle y coordinar con el rival.',
  },
  {
    icon: 'trophy-outline',
    color: '#FABD32',
    tag: 'Paso 2 de 3',
    title: 'El top 3 de tu formato',
    description:
      'Justo debajo está el podio del ranking en el formato que juega tu equipo. Tocá la tarjeta para ver la tabla completa y buscar tu próximo rival.',
  },
  {
    icon: 'lightning-bolt-outline',
    color: '#8CCDFF',
    tag: 'Paso 3 de 3',
    title: 'Acciones rápidas',
    description:
      'Al final tenés los tres atajos que más vas a usar: desafiar a un rival, buscar jugadores en el Mercado y gestionar tus equipos.',
  },
];

interface Props {
  visible: boolean;
  /** Se dispara tanto al terminar como al omitir: en ambos casos la guía ya no vuelve. */
  onDismiss: () => void;
}

export function HomeOnboardingTour({ visible, onDismiss }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onDismiss();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center bg-black/80 px-6">
        <View className="w-full overflow-hidden rounded-3xl bg-surface-container p-6">
          {/* Ícono del paso */}
          <View
            className="mb-4 h-16 w-16 items-center justify-center self-center rounded-full"
            style={{ backgroundColor: `${step.color}1F` }}
          >
            <AppIcon family="material-community" name={step.icon} size={32} color={step.color} />
          </View>

          <Text
            className="font-ui mb-1.5 text-center text-[11px] uppercase tracking-widest"
            style={{ color: step.color }}
          >
            {step.tag}
          </Text>

          <Text className="font-displayBlack mb-2.5 text-center text-2xl uppercase text-neutral-on-surface">
            {step.title}
          </Text>

          <Text className="font-ui mb-6 text-center text-[13px] leading-5 text-neutral-on-surface-variant">
            {step.description}
          </Text>

          {/* Indicador de progreso */}
          <View className="mb-6 flex-row items-center justify-center gap-2">
            {STEPS.map((s, index) => (
              <View
                key={s.title}
                className={`h-1.5 rounded-full ${
                  index === stepIndex ? 'w-6 bg-brand-primary' : 'w-1.5 bg-neutral-outline/50'
                }`}
              />
            ))}
          </View>

          {/* Acciones */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleNext}
            className="mb-2 items-center rounded-2xl bg-brand-primary py-3.5"
          >
            <Text className="font-uiBold text-[14px] text-surface-base">
              {isLastStep ? 'Empezar' : 'Siguiente'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.7} onPress={onDismiss} className="items-center py-2.5">
            <Text className="font-uiBold text-[13px] text-neutral-on-surface-variant">Omitir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
