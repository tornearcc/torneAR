import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Mantiene la lista de partidos de un equipo sincronizada en vivo.
 *
 * La tab de Partidos sólo recargaba con `useFocusEffect`: mientras el usuario
 * miraba la lista, que el rival aceptara una propuesta, hiciera su check-in o
 * cargara el resultado no producía ningún cambio en pantalla. Había que cambiar
 * de tab y volver.
 *
 * ── Por qué dos canales y no un filtro ──────────────────────────────────────
 * `postgres_changes` sólo admite un filtro de igualdad sobre UNA columna, y un
 * partido referencia al equipo por `team_a_id` O `team_b_id`. No hay forma de
 * expresar ese OR en un filtro, así que se abren dos suscripciones. La
 * alternativa —escuchar `matches` sin filtro— traería el tráfico de todos los
 * partidos de la plataforma a cada cliente.
 *
 * ── Alcance deliberado: sólo `matches` ──────────────────────────────────────
 * No se escucha `match_proposals` acá. Esa tabla no tiene una columna que
 * identifique al equipo receptor (sólo `from_team_id`), así que no se puede
 * filtrar por equipo y habría que traer todas las propuestas de la plataforma.
 * La contrapartida es acotada: una propuesta NUEVA no refresca la lista sola
 * (sí llega como notificación push), pero todo lo que cambia el ESTADO del
 * partido —aceptar, confirmar, check-in, resultado, cancelación— sí, porque
 * escribe en `matches`. En el detalle del partido, donde el filtro por
 * `match_id` sí existe, `useMatchRealtime` cubre las propuestas.
 *
 * @param teamId   Equipo activo. `undefined` no suscribe nada.
 * @param onChange Callback a disparar ante cualquier cambio relevante.
 */
export function useTeamMatchesRealtime(teamId: string | undefined, onChange: () => void): void {
  // La callback suele ser una función nueva en cada render del padre. Guardarla
  // en una ref evita desuscribir y volver a suscribir los canales de continuo.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!teamId) return;

    const notify = () => onChangeRef.current();

    const channel = supabase
      .channel(`team_matches_${teamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `team_a_id=eq.${teamId}` },
        notify,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `team_b_id=eq.${teamId}` },
        notify,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teamId]);
}
