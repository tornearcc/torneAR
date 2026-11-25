import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';

import type { ChallengeInboxEntry } from '@/components/ranking/types';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  acceptChallengeWithNotification,
  fetchChallengesInbox,
  getChallengeErrorMessage,
  isChallengeRuleRejection,
  updateChallengeStatus,
} from '@/lib/challenge-actions';
import { Logger } from '@/lib/logger';

/**
 * Desafíos recibidos por el equipo activo, para «Te desafiaron» en Partidos
 * (rediseño, etapa 3; spec §6). Mismas funciones y mismo criterio que la bandeja
 * (`app/challenge-inbox.tsx`, que sigue para Enviados e Historial): una regla de
 * negocio al aceptar se registra como `info`, no como incidente.
 */
export function useReceivedChallenges(activeTeamId: string | null, showAlert: ReturnType<typeof useCustomAlert>['showAlert']) {
  const [received, setReceived] = useState<ChallengeInboxEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTeamId) {
      setReceived([]);
      return;
    }
    try {
      const all = await fetchChallengesInbox(activeTeamId);
      setReceived(all.filter((c) => c.direction === 'RECIBIDO' && c.status === 'ENVIADA'));
    } catch (error) {
      // La sección es un extra de Partidos: si falla, no aparece.
      Logger.warn('No se pudieron cargar los desafíos recibidos', { scope: 'useReceivedChallenges.load', activeTeamId, error });
      setReceived([]);
    }
  }, [activeTeamId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const accept = async (c: ChallengeInboxEntry, onAccepted?: () => void) => {
    try {
      setBusyId(c.challengeId);
      const { matchId } = await acceptChallengeWithNotification(c.challengeId, c.opponentTeamId);
      Logger.info('Desafío aceptado', { scope: 'useReceivedChallenges.accept', challengeId: c.challengeId, activeTeamId, matchId });
      await load();
      onAccepted?.();
      showAlert('¡Partido creado!', 'Aceptaste el desafío. Ahora acuerden el día y la cancha.', () =>
        router.push({ pathname: '/match-detail', params: { matchId } }),
      );
    } catch (error) {
      const detail = { scope: 'useReceivedChallenges.accept', challengeId: c.challengeId, activeTeamId, error };
      if (isChallengeRuleRejection(error)) Logger.info('Aceptación rechazada por una regla de negocio', detail);
      else Logger.error('No se pudo aceptar el desafío', detail);
      showAlert('Error', getChallengeErrorMessage(error, 'No se pudo aceptar el desafío.'));
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (c: ChallengeInboxEntry) => {
    try {
      setBusyId(c.challengeId);
      await updateChallengeStatus(c.challengeId, 'RECHAZADA');
      Logger.info('Desafío rechazado', { scope: 'useReceivedChallenges.decline', challengeId: c.challengeId, activeTeamId });
      await load();
    } catch (error) {
      Logger.error('No se pudo rechazar el desafío', { scope: 'useReceivedChallenges.decline', challengeId: c.challengeId, activeTeamId, error });
      showAlert('Error', getChallengeErrorMessage(error, 'No se pudo rechazar el desafío.'));
    } finally {
      setBusyId(null);
    }
  };

  return { received, busyId, accept, decline, reload: load };
}
