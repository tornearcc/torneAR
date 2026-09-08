import { useEffect, useRef, useState } from 'react';

/** Tiempo mínimo en pantalla de un indicador de carga. */
const DEFAULT_MINIMUM_MS = 500;

/**
 * Mantiene un indicador de carga en pantalla un tiempo mínimo.
 *
 * Cuando Supabase responde en 80 ms el spinner aparecía y desaparecía dentro del
 * mismo pestañeo: en vez de comunicar «estoy trabajando» se leía como un glitch
 * de la interfaz (auditoría E2E, módulo 1.1). Un parpadeo más corto que la
 * animación que lo dibuja es peor que no mostrar nada.
 *
 * Devuelve `true` mientras `active` esté encendido y hasta completar el mínimo
 * desde que se encendió. Si la operación tarda más que el mínimo no agrega
 * ninguna demora: apaga apenas termina.
 *
 * **Es un flag de presentación, no de control.** Los guards de reentrada
 * (`if (loading) return`) tienen que seguir usando el estado real, o el
 * formulario quedaría bloqueado más tiempo del que dura la operación.
 */
export function useMinimumVisible(active: boolean, minimumMs = DEFAULT_MINIMUM_MS): boolean {
  // Único estado propio: si hay que seguir mostrando el indicador DESPUÉS de
  // que `active` se apagó. Lo que devuelve el hook se deriva de `active` y de
  // esto, sin duplicar `active` en un estado espejo.
  const [holding, setHolding] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  // Arranca en `null` incluso con `active` en true: el efecto de abajo sella el
  // instante apenas monta. Llamar a `Date.now()` en el cuerpo del hook sería
  // una impureza en render, y la diferencia es el tiempo hasta el commit.
  const shownAtRef = useRef<number | null>(null);

  // El flanco se atiende durante el render y no en un efecto: sostener recién
  // en el efecto dejaría pasar un frame con el indicador apagado, que es
  // exactamente el parpadeo que este hook existe para evitar.
  if (active !== wasActive) {
    setWasActive(active);
    setHolding(!active);
  }

  useEffect(() => {
    if (active) {
      // Sólo se sella el arranque la primera vez: si `active` parpadea, el
      // mínimo se cuenta desde que el indicador se vio por primera vez.
      if (shownAtRef.current === null) shownAtRef.current = Date.now();
      return;
    }

    const shownAt = shownAtRef.current;
    if (shownAt === null) return;

    // `Math.max(0, …)`: si el mínimo ya se cumplió el timer igual se programa,
    // con 0 ms. Apagar `holding` en el cuerpo del efecto sería un setState
    // síncrono; el costo de diferirlo es un tick, imperceptible para un
    // indicador de carga.
    const remaining = Math.max(0, minimumMs - (Date.now() - shownAt));
    const timer = setTimeout(() => {
      shownAtRef.current = null;
      setHolding(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [active, minimumMs]);

  return active || holding;
}
