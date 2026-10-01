import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { ENGAGED_DAYS_THRESHOLD, recordActiveDay } from '@/lib/active-days';
import { requestEngagedReturnReviewOnce } from '@/lib/store-review';

/**
 * Pedido de valoración «usuario frecuente» (D-63), para la pestaña Inicio.
 *
 * Cada vez que Inicio toma foco registra el día de uso. El pedido se hace al
 * VOLVER a Inicio (desde otra pestaña o pantalla), nunca en el primer foco,
 * que es el de abrir la app: las tiendas piden no interrumpir al entrar. A
 * partir del 5.º día distinto, una vez por sesión; el resto de los filtros los
 * aplica `claim_review_prompt`.
 */
export function useEngagedReviewPrompt(): void {
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const returning = !isFirstFocus.current;
      isFirstFocus.current = false;

      void recordActiveDay().then((days) => {
        if (!cancelled && returning && days >= ENGAGED_DAYS_THRESHOLD) {
          requestEngagedReturnReviewOnce();
        }
      });

      return () => {
        cancelled = true;
      };
    }, []),
  );
}
