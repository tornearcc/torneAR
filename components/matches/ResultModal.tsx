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
    }
  }

  // El guard de doble tap se libera aparte: escribir una ref durante el render
  // no está permitido, y en un efecto no molesta a nadie (nada lo lee hasta el
  // primer tap).
  useEffect(() => {
    if (visible) submittingRef.current = false;
  }, [visible]);

  function setScorerGoals(profileId: string, goals: number) {
    setScorers((prev) => ({ ...prev, [profileId]: Math.max(0, goals) }));
  }

  async function handleSubmit() {
    if (submittingRef.current) return;

    const scorerEntries = myParticipants
      .filter((p) => (scorers[p.profileId] ?? 0) > 0)
      .map((p) => ({ profileId: p.profileId, goals: scorers[p.profileId] ?? 0 }));

    const totalScorerGoals = scorerEntries.reduce((sum, s) => sum + s.goals, 0);
    if (totalScorerGoals > 0 && totalScorerGoals !== goalsScored) {
      showAlert(
        'Goles inconsistentes',
        `Los goles de los anotadores suman ${totalScorerGoals} pero cargaste ${goalsScored} gol${goalsScored !== 1 ? 'es' : ''}. Revisá los goleadores.`,
      );
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

  return (
    <SafeAreaBottomSheet visible={visible} onClose={onClose} overlay={AlertComponent}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Cargar resultado</Text>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Goals steppers */}
        <View className="mb-4 flex-row gap-3">
          <Stepper label="Mis goles" value={goalsScored} onChange={setGoalsScored} />
          <Stepper label="Goles rival" value={goalsAgainst} onChange={setGoalsAgainst} />
        </View>

        {/* Scorers + MVP (componente compartido) */}
        <ScorerMvpPicker
          participants={myParticipants}
          scorers={scorers}
          onScorerGoalsChange={setScorerGoals}
          mvpId={mvpId}
          onMvpChange={setMvpId}
        />

        {/* Submit */}
        <TouchableOpacity
          onPress={() => void handleSubmit()}
          disabled={loading}
          activeOpacity={0.8}
          className="rounded-xl bg-brand-primary py-3.5"
        >
          <Text className="font-uiBold text-center text-sm text-[#003914]">
            {loading ? 'Enviando...' : 'Confirmar resultado'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaBottomSheet>
  );
}
