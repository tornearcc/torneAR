import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { AppIcon } from '@/components/ui/AppIcon';
import { buildReferralMessage } from '@/lib/referral-link';
import { shareActivityType, trackShareIntent } from '@/lib/share-analytics';
import { Logger } from '@/lib/logger';

type ProfileInviteCardProps = {
  /** `profiles.id` del usuario actual, para la instrumentación del compartido. */
  profileId: string;
  /** Username del usuario actual. Es también su código de referido. */
  username: string;
  /**
   * `profiles.full_name`, el mismo que muestra `ProfileHeader`. Al link sólo
   * llega el nombre de pila como `?n=` (ver `inviterFirstName` en
   * lib/referral-link.ts): el apellido nunca sale del teléfono.
   */
  displayName: string | null;
  /** Ya tiene la insignia Embajador: cambia el copy de "meta" a "logro". */
  isEmbajador: boolean;
  onError: (message: string) => void;
};

/** Cuánto dura el estado "¡Copiado!" antes de volver a mostrar el código. */
const COPIED_FEEDBACK_MS = 1800;

/**
 * Invitación de referidos dentro del perfil.
 *
 * Va justo debajo de las insignias a propósito: la recompensa de invitar es
 * precisamente una insignia (Embajador, a los 3 jugadores — ver
 * `20260817181000_embajador_badge.sql`), así que la tarjeta queda leyéndose
 * como la continuación natural de esa sección en vez de como un banner suelto.
 *
 * El feedback de copiado es un cambio de texto en el mismo botón y no un
 * `showAlert`: copiar es una micro-acción y un modal a pantalla completa para
 * confirmarla obliga al usuario a descartar algo que no pidió. El alert queda
 * reservado para el caso de error real, vía `onError`.
 */
export function ProfileInviteCard({
  profileId,
  username,
  displayName,
  isEmbajador,
  onError,
}: ProfileInviteCardProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  // El timeout se guarda en una ref para poder limpiarlo: sin esto, salir del
  // perfil dentro de la ventana de feedback dejaba un setState apuntando a un
  // componente ya desmontado, y dos toques seguidos encimaban dos timers (el
  // primero en vencer cortaba el feedback del segundo).
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(username);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch (error) {
      Logger.error('No se pudo copiar el código de referido', {
        scope: 'ProfileInviteCard.handleCopy',
        error,
      });
      onError('No pudimos copiar el código. Probá compartir el enlace.');
    }
  }, [username, onError]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    let activityType: string | undefined;
    try {
      // `Share` es API del core de React Native, no un módulo nativo aparte:
      // no depende del rebuild del Dev Client como `react-native-share`.
      // Cancelar el menú resuelve normal (`dismissedAction`), así que cerrar
      // sin compartir no entra por el catch.
      const result = await Share.share({ message: buildReferralMessage(username, displayName) });
      activityType = shareActivityType(result);
    } catch (error) {
      Logger.error('No se pudo compartir la invitación', {
        scope: 'ProfileInviteCard.handleShare',
        error,
      });
      onError('No pudimos abrir el menú de compartir. Intentá de nuevo.');
    } finally {
      // En `finally` y no antes de abrir la hoja: el destino (iOS) recién se
      // conoce cuando se cierra. Un share que falló también cuenta como
      // intención, igual que en `ShareMatchButton`. Ver `lib/share-analytics.ts`.
      trackShareIntent({ target: 'generic', contentType: 'referral', profileId, activityType });
      setSharing(false);
    }
  }, [sharing, username, displayName, profileId, onError]);

  return (
    <View className="mt-8 rounded-2xl border border-brand-primary/40 bg-surface-container p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/15">
          <AppIcon
            family="material-community"
            name="account-multiple-plus-outline"
            size={22}
            color="#53E076"
          />
        </View>
        <View className="flex-1">
          <Text className="font-uiBold text-sm text-neutral-on-surface">Invitá amigos</Text>
          <Text className="font-ui mt-0.5 text-xs leading-4 text-neutral-on-surface-variant">
            {isEmbajador
              ? 'Ya sos Embajador. Seguí sumando jugadores a la liga.'
              : 'Invitá a 3 jugadores y ganás la insignia Embajador.'}
          </Text>
        </View>
        {isEmbajador && (
          <AppIcon family="material-community" name="account-star-outline" size={20} color="#FABD32" />
        )}
      </View>

      {/* La fila entera del código es el botón de copiar: el área táctil útil
          es mucho mayor que la de un ícono suelto, y el código es lo que el
          usuario está mirando cuando decide copiarlo. */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => void handleCopy()}
        accessibilityRole="button"
        accessibilityLabel={`Copiar tu código de referido: ${username}`}
        className="mt-4 flex-row items-center justify-between rounded-xl border border-brand-primary/25 bg-brand-primary/8 px-4 py-3"
      >
        <View className="flex-1 pr-3">
          <Text className="font-ui text-[10px] uppercase tracking-widest text-brand-primary opacity-70">
            Tu código
          </Text>
          <Text
            className="font-displayBlack mt-0.5 text-2xl uppercase tracking-tight text-brand-primary"
            numberOfLines={1}
          >
            {username}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <AppIcon
            family="material-community"
            name={copied ? 'check-circle' : 'content-copy'}
            size={16}
            color="#53E076"
          />
          <Text className="font-uiBold text-xs text-brand-primary">
            {copied ? '¡Copiado!' : 'Copiar'}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={sharing}
        onPress={() => void handleShare()}
        accessibilityRole="button"
        className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5"
      >
        <AppIcon family="material-community" name="share-variant" size={18} color="#003914" />
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">
          Compartir invitación
        </Text>
      </TouchableOpacity>

      <Text className="font-ui mt-2 text-center text-[10px] leading-4 text-neutral-outline">
        Quien use tu código queda vinculado a vos al crear la cuenta.
      </Text>
    </View>
  );
}
