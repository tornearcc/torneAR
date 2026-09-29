import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useEvidencePhoto } from '@/hooks/useEvidencePhoto';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { ScorerMvpPicker } from '@/components/matches/ScorerMvpPicker';
import type { WoClaimFormData, WoClaimEntry, ScorerPickerPerson } from '@/components/matches/types';
import { Logger } from '@/lib/logger';

type WoReason = WoClaimEntry['reason'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: WoClaimFormData) => Promise<void>;
  // Sólo se necesitan profileId/fullName para cargar goleadores del 3-0.
  myParticipants: ScorerPickerPerson[];
}

const REASONS: { value: WoReason; label: string; description: string }[] = [
  {
    value: 'NO_PRESENTACION',
    label: 'No presentación',
    description: 'El rival no se presentó al partido',
  },
  // E5: el motivo existía en el tipo, en la pantalla de admin y en el enum de
  // cancelaciones — pero no en este selector, así que nunca se podía registrar
  // un WO por falta de quórum. Sin esta opción la escala de Fair Play por
  // motivo sería inalcanzable desde la app.
  {
    value: 'FALTA_QUORUM',
    label: 'Falta de quórum',
    description: 'El rival avisó que no llegaba a juntar jugadores',
  },
  {
    value: 'ABANDONO',
    label: 'Abandono',
    description: 'El rival abandonó el partido en curso',
  },
  {
    value: 'INCIDENTE_CONDUCTA',
    label: 'Incidente de conducta',
    description: 'Conducta antideportiva grave del rival',
  },
];

export function WoModal({ visible, onClose, onSubmit, myParticipants }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<WoReason>('NO_PRESENTACION');
  const [scorers, setScorers] = useState<Record<string, number>>({});
  const [mvpId, setMvpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();
  const { photoBase64, photoUri, photoMimeType, pickImage, takePhoto } = useEvidencePhoto(showAlert);

  function close() {
    setStep(1);
    onClose();
  }

  function setScorerGoals(profileId: string, goals: number) {
    setScorers((prev) => ({ ...prev, [profileId]: Math.max(0, goals) }));
  }

  function goToStep2() {
    if (!photoBase64) {
      showAlert('Foto requerida', 'Debés adjuntar una foto como evidencia para reclamar un WO.', undefined, 'warning');
      return;
    }
    setStep(2);
  }

  // includeScorers=false → "Omitir y enviar" (reclamo sin goleadores).
  async function submitClaim(includeScorers: boolean) {
    if (!photoBase64) {
      showAlert('Foto requerida', 'Debés adjuntar una foto como evidencia para reclamar un WO.', undefined, 'warning');
      setStep(1);
      return;
    }
    setLoading(true);
    try {
      const scorerEntries = includeScorers
        ? myParticipants
            .filter((p) => (scorers[p.profileId] ?? 0) > 0)
            .map((p) => ({ profileId: p.profileId, goals: scorers[p.profileId] ?? 0 }))
        : [];
      await onSubmit({
        reason,
        photoBase64,
        photoMimeType,
        notes: null,
        scorers: scorerEntries,
        mvpProfileId: includeScorers ? mvpId : null,
      });
      Logger.info('Reclamo de WO confirmado desde el modal', {
        scope: 'WoModal.submitClaim',
        reason,
        includeScorers,
        scorersCount: scorerEntries.length,
      });
      close();
    } catch (err) {
      Logger.error('No se pudo enviar el reclamo de WO', {
        scope: 'WoModal.submitClaim',
        reason,
        includeScorers,
        error: err,
      });
      // Antes no habia catch y el `onSubmit` del caller tampoco: un fallo de red
      // terminaba en un unhandled rejection con el sheet abierto, la foto cargada
      // y cero feedback. El alert interno ya se renderiza dentro del <Modal>.
      showAlert(
        'No se pudo enviar el reclamo',
        getGenericSupabaseErrorMessage(err, 'No pudimos enviar el reclamo WO. Intenta de nuevo.'),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaBottomSheet visible={visible} onClose={close} overlay={AlertComponent}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <View className="flex-row items-center gap-2">
          {step === 2 && (
            <TouchableOpacity onPress={() => setStep(1)} activeOpacity={0.7}>
              <AppIcon family="material-community" name="chevron-left" size={24} color="#869585" />
            </TouchableOpacity>
          )}
          <Text className="font-uiBold text-lg text-neutral-on-surface">
            {step === 1 ? 'Reclamar WO' : 'Goleadores del 3-0'}
          </Text>
        </View>
        <TouchableOpacity onPress={close} activeOpacity={0.7}>
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 ? (
          <>
            {/* Info banner */}
            <View className="mb-4 rounded-xl bg-info-secondary/10 p-4">
              <View className="mb-2 flex-row items-center gap-2">
                <AppIcon family="material-community" name="information" size={18} color="#8CCDFF" />
                <Text className="font-uiBold text-sm text-info-secondary">Reglas del WO</Text>
              </View>
              <Text className="font-ui text-sm leading-5 text-neutral-on-surface-variant">
                Un WO se otorga cuando el equipo rival no cumple sus obligaciones deportivas. La
                solicitud será revisada por administración. Se requiere evidencia fotográfica.
                Reclamar falsamente puede resultar en penalización de Fair Play.
              </Text>
            </View>

            {/* E5 — la escala tiene que ser visible ANTES de elegir: el
                motivo determina cuánto Fair Play pierde el rival, y quien
                reclama es el único que puede reflejar si le avisaron. */}
            <View className="mb-4 flex-row items-start gap-2 rounded-xl bg-surface-high/60 px-4 py-3">
              <AppIcon family="material-community" name="scale-balance" size={16} color="#BCCBB9" />
              <Text className="font-ui flex-1 text-xs leading-5 text-neutral-on-surface-variant">
                El motivo define la multa: si el rival avisó que no juntaba jugadores
                (falta de quórum) pierde 5 puntos de Fair Play; si directamente no se
                presentó, pierde 15.
              </Text>
            </View>

            {/* Reason selector */}
            <Text className="font-ui mb-3 text-xs uppercase tracking-widest text-neutral-outline">
              Motivo
            </Text>
            <View className="mb-4 gap-2">
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  activeOpacity={0.8}
                  className={`flex-row items-center gap-3 rounded-xl p-3 ${
                    reason === r.value
                      ? 'border border-brand-primary/40 bg-brand-primary/10'
                      : 'bg-surface-high'
                  }`}
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                      reason === r.value ? 'border-brand-primary' : 'border-neutral-outline'
                    }`}
                  >
                    {reason === r.value && (
                      <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-uiBold text-sm text-neutral-on-surface">{r.label}</Text>
                    <Text className="font-ui text-xs text-neutral-on-surface-variant">
                      {r.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Photo upload area */}
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Evidencia fotográfica *
            </Text>
            <View
              className={`overflow-hidden rounded-xl border-2 border-dashed ${
                photoUri ? 'border-brand-primary' : 'border-neutral-outline/40 bg-surface-high'
              }`}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: '100%', height: 160 }}
                  contentFit="cover"
                />
              ) : (
                <View className="items-center justify-center py-8">
                  <AppIcon family="material-community" name="camera-plus" size={32} color="#869585" />
                  <Text className="font-ui mt-2 text-sm text-neutral-outline">
                    Agregá tu evidencia
                  </Text>
                </View>
              )}
            </View>
            <View className="mb-4 mt-2 flex-row gap-2">
              <TouchableOpacity
                onPress={() => void pickImage()}
                activeOpacity={0.8}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-high py-2.5"
              >
                <AppIcon family="material-community" name="image-outline" size={18} color="#BCCBB9" />
                <Text className="font-uiBold text-sm text-neutral-on-surface">Galería</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void takePhoto()}
                activeOpacity={0.8}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-high py-2.5"
              >
                <AppIcon family="material-community" name="camera-outline" size={18} color="#BCCBB9" />
                <Text className="font-uiBold text-sm text-neutral-on-surface">Cámara</Text>
              </TouchableOpacity>
            </View>

            {/* Acción principal del paso 1 */}
            {myParticipants.length > 0 ? (
              <TouchableOpacity
                onPress={goToStep2}
                activeOpacity={0.8}
                className="rounded-xl bg-warning-tertiary/80 py-3.5"
              >
                <Text className="font-uiBold text-center text-sm text-surface-base">Continuar</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => void submitClaim(false)}
                disabled={loading}
                activeOpacity={0.8}
                className="rounded-xl bg-warning-tertiary/80 py-3.5"
              >
                <Text className="font-uiBold text-center text-sm text-surface-base">
                  {loading ? 'Enviando...' : 'Enviar reclamo WO'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {/* Paso 2: goleadores + MVP (opcional) */}
            <Text className="font-ui mb-4 text-sm leading-5 text-neutral-on-surface-variant">
              Ganás 3-0. Cargá quién metió los goles y elegí un MVP. Es opcional: podés omitirlo.
            </Text>

            <ScorerMvpPicker
              participants={myParticipants}
              scorers={scorers}
              onScorerGoalsChange={setScorerGoals}
              mvpId={mvpId}
              onMvpChange={setMvpId}
              goalCap={3}
              scorersLabel="Goleadores del 3-0"
              mvpLabel="MVP (opcional)"
            />

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => void submitClaim(false)}
                disabled={loading}
                activeOpacity={0.8}
                className="flex-1 rounded-xl bg-surface-high py-3.5"
              >
                <Text className="font-uiBold text-center text-sm text-neutral-on-surface">
                  Omitir y enviar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitClaim(true)}
                disabled={loading}
                activeOpacity={0.8}
                className="flex-1 rounded-xl bg-warning-tertiary/80 py-3.5"
              >
                <Text className="font-uiBold text-center text-sm text-surface-base">
                  {loading ? 'Enviando...' : 'Enviar reclamo'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaBottomSheet>
  );
}
