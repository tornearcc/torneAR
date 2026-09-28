import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { blockUser, unblockUser } from '@/lib/blocks-data';
import { Logger } from '@/lib/logger';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** `profiles.id` de la persona sobre la que se actúa. */
  targetProfileId: string;
  /** Nombre visible, para que el diálogo diga a quién se bloquea. */
  targetName: string;
  /** `true` si ya hay un bloqueo con esta persona: la acción pasa a desbloquear. */
  isBlocked: boolean;
  /** Abre el modal de denuncia. Lo resuelve el padre — ver el comentario. */
  onReport: () => void;
  /** Se llama después de bloquear o desbloquear, para refrescar la pantalla. */
  onBlockChanged: () => void;
}

/**
 * Menú de acciones de moderación sobre otra persona: denunciar y bloquear.
 *
 * Las dos precauciones que pide la guideline 1.2 viven en el mismo lugar, que
 * es donde el usuario las busca y donde el reviewer las va a filmar.
 *
 * ## Por qué denunciar se delega al padre
 *
 * `ReportModal` es a su vez un `SafeAreaBottomSheet`, o sea otro `<Modal>`
 * nativo. Montar uno dentro del otro deja el de adentro debajo del backdrop en
 * iOS. Así que este sheet sólo avisa —`onReport()`— y el padre alterna cuál de
 * los dos está abierto. El bloqueo, en cambio, se resuelve acá: su
 * confirmación es un `ConfirmDialog` que va por la prop `overlay`, que existe
 * justamente para renderizar dentro del mismo `<Modal>`.
 *
 * ## El desbloqueo no pide confirmación
 *
 * Bloquear tiene consecuencias —desaparecen las publicaciones y los chats de
 * las dos partes— y por eso se confirma. Desbloquear sólo devuelve las cosas a
 * como estaban y es trivialmente reversible.
 */
export function UserActionsSheet({
  visible,
  onClose,
  targetProfileId,
  targetName,
  isBlocked,
  onReport,
  onBlockChanged,
}: Props) {
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [working, setWorking] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();

  async function applyBlockChange(nextBlocked: boolean) {
    if (working) return;
    setWorking(true);

    try {
      if (nextBlocked) {
        await blockUser(targetProfileId);
      } else {
        await unblockUser(targetProfileId);
      }

      Logger.info(nextBlocked ? 'Usuario bloqueado' : 'Usuario desbloqueado', {
        scope: 'UserActionsSheet.applyBlockChange',
        targetProfileId,
      });

      setConfirmingBlock(false);
      onClose();
      onBlockChanged();

      // Después de cerrar el sheet, igual que hace ReportModal: un alert
      // montado adentro se desmonta junto con él y no llega a verse.
      showAlert(
        nextBlocked ? 'Usuario bloqueado' : 'Usuario desbloqueado',
        nextBlocked
          ? `Ya no vas a ver las publicaciones ni los mensajes de ${targetName}, y esa persona no va a poder escribirte. Podés deshacerlo desde Preferencias.`
          : `Volvés a ver las publicaciones y los mensajes de ${targetName}.`,
        undefined,
        'success',
      );
    } catch (error) {
      Logger.error('No se pudo cambiar el bloqueo', {
        scope: 'UserActionsSheet.applyBlockChange',
        targetProfileId,
        nextBlocked,
        error,
      });
      setConfirmingBlock(false);
      showAlert(
        'No se pudo completar',
        getGenericSupabaseErrorMessage(error, 'No pudimos actualizar el bloqueo. Intentá de nuevo.'),
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaBottomSheet
      visible={visible}
      onClose={onClose}
      maxHeight="60%"
      overlay={
        <>
          <ConfirmDialog
            visible={confirmingBlock}
            title={`¿Bloquear a ${targetName}?`}
            message={`No vas a ver más sus publicaciones ni sus mensajes, y esa persona no va a poder escribirte ni postularse a tus búsquedas. Se le avisa al equipo de moderación de TorneAR. Podés deshacerlo cuando quieras desde Preferencias.`}
            confirmLabel="Bloquear"
            confirmTone="danger"
            loading={working}
            onConfirm={() => void applyBlockChange(true)}
            onCancel={() => setConfirmingBlock(false)}
          />
          {AlertComponent}
        </>
      }
    >
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">{targetName}</Text>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} disabled={working}>
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <View className="gap-2 px-5 pb-2">
        <TouchableOpacity
          onPress={onReport}
          disabled={working}
          activeOpacity={0.8}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-xl bg-surface-high p-4"
        >
          <AppIcon family="material-community" name="flag-outline" size={20} color="#FABD32" />
          <View className="flex-1">
            <Text className="font-uiBold text-sm text-neutral-on-surface">Denunciar</Text>
            <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant">
              Avisanos si publicó contenido inapropiado o se comportó de forma abusiva.
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => (isBlocked ? void applyBlockChange(false) : setConfirmingBlock(true))}
          disabled={working}
          activeOpacity={0.8}
          accessibilityRole="button"
          className={`flex-row items-center gap-3 rounded-xl bg-surface-high p-4 ${working ? 'opacity-40' : ''}`}
        >
          <AppIcon
            family="material-community"
            name={isBlocked ? 'account-check-outline' : 'account-cancel-outline'}
            size={20}
            color={isBlocked ? '#53E076' : '#FFB4AB'}
          />
          <View className="flex-1">
            <Text className="font-uiBold text-sm text-neutral-on-surface">
              {isBlocked ? 'Desbloquear' : 'Bloquear'}
            </Text>
            <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant">
              {isBlocked
                ? 'Volvés a ver sus publicaciones y sus mensajes.'
                : 'Dejás de ver sus publicaciones y sus mensajes al instante.'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaBottomSheet>
  );
}
