import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { ScorerMvpPicker } from '@/components/matches/ScorerMvpPicker';
import type { MatchResultFormData, ScorerPickerPerson } from '@/components/matches/types';
import { Logger } from '@/lib/logger';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: MatchResultFormData) => Promise<void>;
  // Plantel completo de mi equipo (team_roster), no la convocatoria: bug 4.
  myParticipants: ScorerPickerPerson[];
}

/**
 * Rediseño (pendiente del 25/11): un paso por pantalla en vez de un formulario
 * largo. Resultado → Goleadores → MVP. Goleadores se saltea si el equipo no hizo
 * goles, y los dos últimos si no hay plantel para elegir.
 */
type Step = 'result' | 'scorers' | 'mvp';

const STEP_TITLES: Record<Step, string> = {
  result: '¿Cómo salió?',
  scorers: '¿Quién hizo los goles?',
  mvp: '¿Quién fue la figura?',
};

function buildSteps(goalsScored: number, hasParticipants: boolean): Step[] {
  if (!hasParticipants) return ['result'];
  return goalsScored > 0 ? ['result', 'scorers', 'mvp'] : ['result', 'mvp'];
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View className="flex-1 items-center rounded-xl bg-surface-high p-4">
      <Text className="font-ui mb-3 text-xs uppercase tracking-widest text-neutral-outline">
        {label}
      </Text>
      <View className="flex-row items-center gap-4">
        {/* 36x36 visual + hitSlop 4 = 44x44 tactil. No se agranda el pill porque
            las dos tarjetas de stepper ya ocupan el ancho completo del modal. */}
        <TouchableOpacity
          onPress={() => onChange(Math.max(0, value - 1))}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-container"
        >
          <AppIcon family="material-community" name="minus" size={18} color="#BCCBB9" />
        </TouchableOpacity>
        <Text className="font-displayBlack w-8 text-center text-3xl text-neutral-on-surface">
          {value}
        </Text>
        <TouchableOpacity
          onPress={() => onChange(value + 1)}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          className="h-9 w-9 items-center justify-center rounded-full bg-brand-primary"
        >
          <AppIcon family="material-community" name="plus" size={18} color="#003914" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ResultModal({ visible, onClose, onSubmit, myParticipants }: Props) {
  const [goalsScored, setGoalsScored] = useState(0);
  const [goalsAgainst, setGoalsAgainst] = useState(0);
  const [scorers, setScorers] = useState<Record<string, number>>({});
  const [mvpId, setMvpId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('result');
  const [loading, setLoading] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();

  // Guard SÍNCRONO contra el doble tap. `disabled={loading}` no alcanza: entre
  // el tap y el re-render que aplica setLoading(true) hay una ventana en la que
  // el segundo tap ya disparó su propio submit.
  const submittingRef = useRef(false);

  // Reset al reabrir: sin esto el modal arrastra los goles de una carga
  // anterior y el usuario podría enviar sin querer un resultado viejo. Se
  // ajusta durante el render, en el flanco de apertura, en vez de copiar los
  // valores desde un efecto.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setGoalsScored(0);
      setGoalsAgainst(0);
      setScorers({});
      setMvpId(null);
      setStep('result');
    }
  }

  // El guard de doble tap se libera aparte: escribir una ref durante el render
  // no está permitido, y en un efecto no molesta a nadie (nada lo lee hasta el
  // primer tap).
  useEffect(() => {
    if (visible) submittingRef.current = false;
  }, [visible]);

  const steps = buildSteps(goalsScored, myParticipants.length > 0);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const isLastStep = stepIndex === steps.length - 1;

  // Sin goles propios no hay goleadores: si alguien cargó goleadores y después
  // volvió a bajar el marcador a 0, se descartan en vez de trabar el envío.
  const scorerEntries = goalsScored === 0
    ? []
    : myParticipants
      .filter((p) => (scorers[p.profileId] ?? 0) > 0)
      .map((p) => ({ profileId: p.profileId, goals: scorers[p.profileId] ?? 0 }));
  const totalScorerGoals = scorerEntries.reduce((sum, s) => sum + s.goals, 0);

  function setScorerGoals(profileId: string, goals: number) {
    setScorers((prev) => ({ ...prev, [profileId]: Math.max(0, goals) }));
  }

  /** La suma de goleadores tiene que cerrar con el marcador (o quedar vacía). */
  function scorersAreConsistent(): boolean {
    if (totalScorerGoals > 0 && totalScorerGoals !== goalsScored) {
      showAlert(
        'Goles inconsistentes',
        `Los goles de los anotadores suman ${totalScorerGoals} pero cargaste ${goalsScored} gol${goalsScored !== 1 ? 'es' : ''}. Revisá los goleadores.`,
      );
      return false;
    }
    return true;
  }

  function goBack() {
    if (stepIndex > 0) setStep(steps[stepIndex - 1]);
  }

  function goNext() {
    if (step === 'scorers' && !scorersAreConsistent()) return;
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    setStep(steps[stepIndex + 1]);
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    if (!scorersAreConsistent()) {
      if (steps.includes('scorers')) setStep('scorers');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      await onSubmit({
        goalsScored,
        goalsAgainst,
        scorers: scorerEntries,
        mvpProfileId: mvpId,
      });
      Logger.info('Resultado confirmado desde el modal', {
        scope: 'ResultModal.handleSubmit',
        goalsScored,
        goalsAgainst,
        scorersCount: scorerEntries.length,
        hasMvp: mvpId !== null,
      });
      onClose();
    } catch (err) {
      Logger.error('No se pudo guardar el resultado del partido', {
        scope: 'ResultModal.handleSubmit',
        goalsScored,
        goalsAgainst,
        error: err,
      });
      // El modal queda abierto para que el usuario corrija sin recargar todo, asi
      // que el error tiene que mostrarse ACA: el alert de match-detail vive fuera
      // de este <Modal> nativo y quedaria detras, invisible.
      submittingRef.current = false;
      showAlert(
        'No se pudo cargar el resultado',
        getGenericSupabaseErrorMessage(err, 'No pudimos guardar el resultado. Intenta de nuevo.'),
      );
    } finally {
      setLoading(false);
    }
  }

  // En goleadores y MVP los dos son opcionales: el botón lo dice para que nadie
  // crea que tiene que elegir a alguien para poder seguir.
  const skippable =
    (step === 'scorers' && totalScorerGoals === 0) || (step === 'mvp' && mvpId === null);
  let nextLabel: string;
  if (loading) nextLabel = 'Enviando...';
  else if (isLastStep) nextLabel = skippable ? 'Confirmar sin MVP' : 'Confirmar resultado';
  else nextLabel = skippable ? 'Saltear' : 'Siguiente';

  return (
    <SafeAreaBottomSheet visible={visible} onClose={onClose} overlay={AlertComponent}>
      {/* Header: paso actual + barra de progreso */}
      <View className="px-5 pb-3 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-ui text-xs uppercase tracking-widest text-neutral-outline">
            Cargar resultado · Paso {stepIndex + 1} de {steps.length}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <AppIcon family="material-community" name="close" size={22} color="#869585" />
          </TouchableOpacity>
        </View>
        <Text className="font-uiBold mt-1 text-lg text-neutral-on-surface">{STEP_TITLES[step]}</Text>
        <View className="mt-3 flex-row gap-1.5">
          {steps.map((s, i) => (
            <View
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-brand-primary' : 'bg-surface-high'}`}
            />
          ))}
        </View>
      </View>

      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'result' ? (
          <View className="mb-4 flex-row gap-3">
            <Stepper label="Mis goles" value={goalsScored} onChange={setGoalsScored} />
            <Stepper label="Goles rival" value={goalsAgainst} onChange={setGoalsAgainst} />
          </View>
        ) : (
          // Recordatorio del marcador en los pasos siguientes.
          <View className="mb-4 flex-row items-center justify-center gap-3 rounded-xl bg-surface-high py-2.5">
            <Text className="font-ui text-xs uppercase tracking-widest text-neutral-outline">Resultado</Text>
            <Text className="font-displayBlack text-xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
              {goalsScored} - {goalsAgainst}
            </Text>
          </View>
        )}

        {step === 'scorers' && (
          <ScorerMvpPicker
            section="scorers"
            participants={myParticipants}
            scorers={scorers}
            onScorerGoalsChange={setScorerGoals}
            mvpId={mvpId}
            onMvpChange={setMvpId}
            goalCap={goalsScored}
          />
        )}

        {step === 'mvp' && (
          <ScorerMvpPicker
            section="mvp"
            participants={myParticipants}
            scorers={scorers}
            onScorerGoalsChange={setScorerGoals}
            mvpId={mvpId}
            onMvpChange={setMvpId}
          />
        )}

        {/* Botones: atrás (gris) + el próximo paso (verde) */}
        <View className="flex-row gap-3">
          {stepIndex > 0 && (
            <TouchableOpacity
              onPress={goBack}
              disabled={loading}
              activeOpacity={0.8}
              className="rounded-xl bg-surface-high px-5 py-3.5"
            >
              <Text className="font-uiBold text-center text-sm text-neutral-on-surface-variant">Atrás</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={goNext}
            disabled={loading}
            activeOpacity={0.8}
            className="flex-1 rounded-xl bg-brand-primary py-3.5"
          >
            <Text className="font-uiBold text-center text-sm text-[#003914]">
              {nextLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaBottomSheet>
  );
}
