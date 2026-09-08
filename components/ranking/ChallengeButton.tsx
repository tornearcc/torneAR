import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import {
  sendChallenge,
  fetchSquadReadiness,
  getChallengeErrorMessage,
  isChallengeRuleRejection,
  type SquadReadiness,
} from '@/lib/challenge-actions';
import { Logger } from '@/lib/logger';

const FORMAT_SHORT: Record<string, string> = {
  FUTBOL_5: 'F5', FUTBOL_6: 'F6', FUTBOL_7: 'F7',
  FUTBOL_8: 'F8', FUTBOL_9: 'F9', FUTBOL_11: 'F11',
};

interface Props {
  challengerTeamId: string;
  opponentTeamId: string;
  matchType: 'RANKING' | 'AMISTOSO';
  showAlert: (title: string, message: string, onClose?: () => void) => void;
  onSuccess?: () => void;
  alreadyChallenged?: boolean;
}

export function ChallengeButton({
  challengerTeamId,
  opponentTeamId,
  matchType,
  showAlert,
  onSuccess,
  alreadyChallenged,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [readiness, setReadiness] = useState<SquadReadiness | null>(null);

  const isRanking = matchType === 'RANKING';

  // El cupo se consulta al abrir la confirmación, no en cada render: así es una
  // query por tap en vez de una por tarjeta del listado.
  async function handleInitiate() {
    setConfirming(true);
    setReadiness(await fetchSquadReadiness(challengerTeamId));
  }

  async function handleConfirm() {
    setConfirming(false);
    try {
      setLoading(true);
      const result = await sendChallenge(challengerTeamId, opponentTeamId, matchType);
      const extra = result.eloDiffWarning
        ? '\n\n⚠️ Diferencia de Rating > 400 pts. Bajo impacto en el ranking.'
        : '';
      Logger.info('Desafío enviado', {
        scope: 'ChallengeButton.handleConfirm',
        challengerTeamId,
        opponentTeamId,
        matchType,
        eloDiffWarning: result.eloDiffWarning,
      });
      showAlert('¡Enviado!', `El desafío fue enviado correctamente al rival.${extra}`, onSuccess);
    } catch (error: unknown) {
      const detail = {
        scope: 'ChallengeButton.handleConfirm',
        challengerTeamId,
        opponentTeamId,
        matchType,
        error,
      };

      // Chocar contra una regla (cooldown, partido de ranking sin resolver,
      // tope por temporada) no es un incidente: es el servidor haciendo su
      // trabajo. Va como `info` para que el panel de errores siga midiendo
      // sólo lo que de verdad se rompe — y de paso queda medible cuántas veces
      // se topa la gente con cada regla.
      if (isChallengeRuleRejection(error)) {
        Logger.info('Desafío rechazado por una regla de negocio', detail);
      } else {
        Logger.error('No se pudo enviar el desafío', detail);
      }

      // El traductor del DAL: los rechazos con código (RANKING_MATCH_ACTIVE,
      // TEAM_INACTIVE…) salen con texto propio y el resto conserva el mensaje
      // de la RPC, que ya está escrito para el usuario.
      showAlert('Error', getChallengeErrorMessage(error, 'No se pudo enviar el desafío.'));
    } finally {
      setLoading(false);
    }
  }

  if (alreadyChallenged) {
    return (
      <View
        className={`items-center rounded-xl py-3 ${isRanking ? 'bg-surface-high' : 'border border-neutral-outline/20 bg-transparent'}`}
      >
        <Text className="font-displayBlack text-[12px] uppercase tracking-widest text-neutral-on-surface-variant">
          {isRanking ? '⏳ Desafío enviado' : '⏳ Amistoso enviado'}
        </Text>
      </View>
    );
  }

  if (confirming) {
    return (
      <View
        className={`rounded-xl px-4 py-3 ${isRanking ? 'border border-brand-primary/30 bg-brand-primary/10' : 'border border-info-secondary/20 bg-transparent'}`}
      >
        <Text className="mb-2 text-center font-ui text-xs text-neutral-on-surface-variant">
          ¿Confirmar desafío {isRanking ? 'por el ranking' : 'amistoso'}?
        </Text>

        {/* E1: aviso NO bloqueante. El freno duro está en la confirmación de la
            propuesta; acá sólo se adelanta para no llegar a esa pared. */}
        {readiness && !readiness.ok && (
          <View className="mb-2 rounded-lg border border-warning-tertiary/30 bg-warning-tertiary/10 px-3 py-2">
            <Text className="font-ui text-[11px] leading-4 text-warning-tertiary">
              ⚠️ Tenés {readiness.memberCount} jugador{readiness.memberCount === 1 ? '' : 'es'} en el
              plantel y {FORMAT_SHORT[readiness.format] ?? readiness.format} necesita al menos{' '}
              {readiness.minRequired} para presentarse. Podés desafiar igual, pero no vas a poder
              confirmar el partido hasta sumar gente o acordar un formato más chico.
            </Text>
          </View>
        )}

        <View className="flex-row gap-2">
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setConfirming(false)}
            className="flex-1 items-center rounded-lg border border-neutral-outline/30 py-2"
          >
            <Text className="font-uiBold text-[11px] text-neutral-on-surface-variant">
              Cancelar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleConfirm}
            className={`flex-1 items-center rounded-lg py-2 ${isRanking ? 'bg-brand-primary' : 'bg-info-secondary/20'}`}
          >
            <Text
              className={`font-displayBlack text-[11px] uppercase tracking-widest ${isRanking ? 'text-surface-base' : 'text-info-secondary'}`}
            >
              ✓ Enviar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={loading}
      onPress={() => void handleInitiate()}
      className={`items-center rounded-xl py-3 ${isRanking ? 'bg-brand-primary' : 'border border-info-secondary/30 bg-transparent'}`}
    >
      {loading ? (
        <ActivityIndicator color={isRanking ? '#131313' : '#8CCDFF'} size="small" />
      ) : (
        <Text
          className={`font-displayBlack uppercase tracking-widest ${isRanking ? 'text-[13px] text-surface-base' : 'text-[12px] text-info-secondary'}`}
        >
          {isRanking ? '⚔️ Desafiar al ranking' : 'Desafiar amistoso'}
        </Text>
      )}
    </TouchableOpacity>
  );
}
