import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';
import { submitContentReport, type ReportEntityType } from '@/lib/reports-data';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Qué se está denunciando. Decide los motivos y el encabezado. */
  entityType: ReportEntityType;
  entityId: string;
}

/**
 * Motivos por tipo de contenido.
 *
 * Antes eran tres genéricos para todo. Se abrieron por tipo porque la
 * guideline 1.2 espera ver las categorías que describen abuso real —acoso,
 * discurso de odio, contenido sexual, estafa, suplantación— y «Comportamiento
 * antideportivo» no dice nada de eso. Ofrecer la lista equivocada también
 * ensucia la cola de moderación: el motivo es lo único que orienta al que
 * revisa antes de abrir el contenido.
 */
const REASONS: Record<ReportEntityType, readonly string[]> = {
  USER: [
    'Acoso o amenazas',
    'Discurso de odio o discriminación',
    'Suplantación de identidad',
    'Comportamiento antideportivo',
    'Spam',
  ],
  MESSAGE: [
    'Acoso o amenazas',
    'Discurso de odio o discriminación',
    'Contenido sexual',
    'Estafa o engaño',
    'Spam',
  ],
  MARKET_TEAM_POST: [
    'Contenido inapropiado',
    'Discurso de odio o discriminación',
    'Contenido sexual',
    'Estafa o engaño',
    'Spam',
  ],
  MARKET_PLAYER_POST: [
    'Contenido inapropiado',
    'Discurso de odio o discriminación',
    'Contenido sexual',
    'Estafa o engaño',
    'Spam',
  ],
  TEAM: [
    'Nombre o escudo inapropiado',
    'Discurso de odio o discriminación',
    'Suplantación o uso de una marca ajena',
    'Spam',
  ],
  MATCH: [
    'Resultado falso',
    'Comportamiento antideportivo',
    'Contenido inapropiado',
  ],
};

const PROMPTS: Record<ReportEntityType, string> = {
  USER: '¿Por qué querés denunciar este perfil?',
  MESSAGE: '¿Por qué querés denunciar este mensaje?',
  MARKET_TEAM_POST: '¿Por qué querés denunciar esta publicación?',
  MARKET_PLAYER_POST: '¿Por qué querés denunciar esta publicación?',
  TEAM: '¿Por qué querés denunciar este equipo?',
  MATCH: '¿Por qué querés denunciar este partido?',
};

/**
 * Modal de denuncia. Elegir un motivo ES el envío: no hay un segundo paso de
 * confirmar, porque agregarlo sólo hace que menos gente termine de denunciar.
 *
 * Ya no recibe `reporterId`: quien denuncia lo resuelve el servidor desde la
 * sesión (ver `submitContentReport`), junto con el autor del contenido y la
 * copia del texto denunciado.
 */
export function ReportModal({ visible, onClose, entityType, entityId }: Props) {
  const [submittingReason, setSubmittingReason] = useState<string | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  async function handleSelectReason(reason: string) {
    if (submittingReason) return;
    setSubmittingReason(reason);
    try {
      await submitContentReport({ entityType, entityId, reason });
      Logger.info('Denuncia enviada', {
        scope: 'ReportModal.handleSelectReason',
        entityType,
        entityId,
        reason,
      });
      onClose();
      // Después de cerrar el sheet: un alert propio DENTRO del <Modal> quedaría
      // detrás al desmontarse junto con él.
      showAlert(
        'Denuncia enviada',
        'Gracias por avisarnos. Nuestro equipo la revisa dentro de las 24 horas y, si corresponde, elimina el contenido y da de baja la cuenta responsable.',
      );
    } catch (error) {
      Logger.error('No se pudo enviar la denuncia', {
        scope: 'ReportModal.handleSelectReason',
        entityType,
        entityId,
        reason,
        error,
      });
      showAlert(
        'No se pudo enviar',
        getGenericSupabaseErrorMessage(error, 'No pudimos registrar la denuncia. Intentá de nuevo.'),
      );
    } finally {
      setSubmittingReason(null);
    }
  }

  return (
    <SafeAreaBottomSheet visible={visible} onClose={onClose} maxHeight="70%" overlay={AlertComponent}>
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Denunciar</Text>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} disabled={!!submittingReason}>
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <View className="px-5 pb-2">
        <Text className="font-ui mb-4 text-sm text-neutral-on-surface-variant">
          {PROMPTS[entityType]}
        </Text>

        <View className="gap-2">
          {REASONS[entityType].map((reason) => (
            <TouchableOpacity
              key={reason}
              onPress={() => void handleSelectReason(reason)}
              disabled={!!submittingReason}
              activeOpacity={0.8}
              className={`flex-row items-center justify-between rounded-xl bg-surface-high p-4 ${
                submittingReason && submittingReason !== reason ? 'opacity-40' : ''
              }`}
            >
              <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface">{reason}</Text>
              {submittingReason === reason ? (
                <AppIcon family="material-community" name="progress-clock" size={18} color="#869585" />
              ) : (
                <AppIcon family="material-icons" name="chevron-right" size={20} color="#869585" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaBottomSheet>
  );
}
