import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Mantiene el detalle de partido sincronizado en vivo.
 *
 * Resuelve la mitad "fantasma" del bug 8: cuando el rival cargaba su resultado,
 * el partido pasaba a FINALIZADO / EN_DISPUTA en la base pero esta pantalla
 * seguía mostrando EN_VIVO con el botón de cargar habilitado hasta que el
 * usuario salía y volvía a entrar.
 *
 * Requiere la migración 20260723120000: en el schema original las tablas
 * `matches` y `match_results` NO estaban en la publicación supabase_realtime
 * (las líneas del ALTER PUBLICATION quedaron comentadas), así que una
 * suscripción se conectaba sin error y no emitía jamás.
 *
 * @param matchId  Partido a observar. `undefined` no suscribe nada.
 * @param onChange Callback a disparar ante cualquier cambio relevante.
 */
export function useMatchRealtime(matchId: string | undefined, onChange: () => void): void {
  // La callback suele ser una función nueva en cada render del padre. Guardarla
  // en una ref evita desuscribir y volver a suscribir el canal continuamente.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`match_live_${matchId}`)
      // Cambios de estado del partido: CONFIRMADO → EN_VIVO → FINALIZADO /
      // EN_DISPUTA / WO_A / WO_B.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        () => onChangeRef.current(),
      )
      // Alta o corrección de un resultado (propio o del rival). Llega antes de
      // que el trigger resolve_match decida el estado final, así que la UI se
      // entera del "el rival ya cargó" incluso si todavía no hay veredicto.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_results', filter: `match_id=eq.${matchId}` },
        () => onChangeRef.current(),
      )
      // Propuestas: alta, contrapropuesta, aceptación, rechazo y cancelación.
      // Una propuesta nueva NO toca `matches` (el partido sigue PENDIENTE hasta
      // que alguien acepta), así que sin esto el rival veía "Sin propuesta
      // activa" con una propuesta esperándolo. Requiere la migración
      // 20260728130000, que publica la tabla en supabase_realtime.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_proposals', filter: `match_id=eq.${matchId}` },
        () => onChangeRef.current(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId]);
}
