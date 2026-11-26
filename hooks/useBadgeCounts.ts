import { useCallback, useEffect, useState } from 'react';

import { fetchChallengesInbox } from '@/lib/challenge-actions';
import { fetchUnreadChatCount } from '@/lib/chat-api';
import { Logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';

/**
 * Contadores que antes vivían en el header (rediseño, etapa 5; spec §6): los
 * desafíos recibidos van al badge de la pestaña Partidos y los mensajes sin leer
 * a Perfil › Mensajes. Misma consulta y misma suscripción en vivo que tenía
 * `GlobalHeader`. Cadena de promesas y no `async`: se llaman desde un efecto.
 */

export function useReceivedChallengesCount(activeTeamId: string | null): number {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    if (!activeTeamId) return;
    fetchChallengesInbox(activeTeamId)
      .then((inbox) => setCount(inbox.filter((c) => c.direction === 'RECIBIDO' && c.status === 'ENVIADA').length))
      .catch((error: unknown) => {
        Logger.warn('No se pudo contar los desafíos recibidos; el badge queda en 0', { scope: 'useReceivedChallengesCount', activeTeamId, error });
        setCount(0);
      });
  }, [activeTeamId]);

  useEffect(() => {
    if (!activeTeamId) return;
    load();
    const channel = supabase
      .channel(`challenges-badge-${activeTeamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `to_team_id=eq.${activeTeamId}` }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeTeamId, load]);

  return activeTeamId ? count : 0;
}

export function useUnreadChatsCount(profileId: string | null): number {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    if (!profileId) return;
    fetchUnreadChatCount()
      .then(setCount)
      .catch((error: unknown) => {
        Logger.warn('No se pudo contar los chats sin leer; el badge queda en 0', { scope: 'useUnreadChatsCount', profileId, error });
        setCount(0);
      });
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    load();
    const channel = supabase
      .channel(`market-messages-badge-${profileId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, load]);

  return profileId ? count : 0;
}
