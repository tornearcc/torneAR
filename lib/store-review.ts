import { AppState } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getCurrentAppVersion, getCurrentPlatform } from '@/lib/app-version';

/**
 * Pedido de valoración en la tienda (D-50).
 *
 * El criterio de "¿corresponde ahora?" NO vive acá: lo decide la RPC
 * `claim_review_prompt` (migración *_review_prompts), que además deja el pedido
 * registrado en el mismo acto. Este módulo sólo junta los datos del dispositivo,
 * pregunta, y si la respuesta es `true` abre el diálogo nativo.
 *
 * Reglas de las tiendas que condicionan cómo se llama:
 *  · No se le pregunta nada al usuario antes ("¿te gusta la app?"). Los filtros
 *    son señales ya registradas, y están en la RPC.
 *  · No se dispara desde un botón de "Calificanos": los llamadores son
 *    momentos del flujo (terminar de compartir, un partido que quedó cerrado).
 *  · `requestReview()` no informa nada: ni si se mostró ni si calificó. Por eso
 *    no hay nada que hacer con su resultado.
 */

// engaged_return (D-63): al volver a Inicio desde el 5.º día distinto de uso
// (hooks/useEngagedReviewPrompt.ts). Los otros dos son los momentos de D-50.
export type ReviewPromptTrigger = 'match_shared' | 'result_confirmed' | 'engaged_return';

/**
 * Pausa antes de reclamar y abrir el diálogo. El llamador suele venir de cerrar
 * algo (la vista previa de la tarjeta, un alert): sin la pausa, el diálogo se
 * monta encima de una animación de salida y en iOS puede no llegar a
 * presentarse.
 */
const PRESENT_DELAY_MS = 700;

// Dos momentos pueden coincidir (compartir justo después de cargar el
// resultado). La RPC ya serializa por perfil con un advisory lock; esto evita
// además el round-trip de más.
let inFlight = false;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Por qué no se pidió la valoración en una oportunidad válida. */
type ReviewPromptSkipReason = 'app_not_active' | 'store_review_unavailable' | 'gate_denied';

/**
 * Deja rastro de cada oportunidad que NO terminó en diálogo.
 *
 * Al 27/09 `review_prompts` estaba vacía y no se podía saber por qué: el
 * cliente descartaba en silencio los tres caminos de abajo (tarjeta #75). Con
 * esto, `app_logs` (event `review_prompt.skipped`) dice cuál corta. Para
 * `gate_denied` el motivo exacto lo da la RPC en la base (edad de la cuenta,
 * tope por versión o por año, señales negativas); acá sólo se registra que dijo
 * que no. Nivel `info`: es un dato de diagnóstico, no un error.
 */
function logSkip(
  reason: ReviewPromptSkipReason,
  trigger: ReviewPromptTrigger,
  platform: string,
  appVersion: string,
) {
  Logger.info('Pedido de valoración no mostrado', {
    scope: 'store-review.runStoreReviewPrompt',
    event: 'review_prompt.skipped',
    reason,
    trigger,
    platform,
    appVersion,
  });
}

/**
 * Versión awaitable, para los tests. En la app se usa
 * `requestStoreReviewIfEligible`. Nunca tira: un pedido de valoración que falla
 * no puede romper el flujo que lo disparó.
 *
 * @returns si llegó a pedirse el diálogo nativo.
 */
export async function runStoreReviewPrompt(
  trigger: ReviewPromptTrigger,
  delayMs: number = PRESENT_DELAY_MS,
): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;

  try {
    const platform = getCurrentPlatform();
    const appVersion = getCurrentAppVersion();
    if (!platform || !appVersion) return false;

    await wait(delayMs);

    // Con la app en segundo plano (el usuario se fue a Instagram) ni iOS ni
    // Play muestran el diálogo. Se mira ANTES de reclamar, porque la RPC gasta
    // el pedido de esta versión aunque el diálogo nunca aparezca.
    if (AppState.currentState !== 'active') {
      logSkip('app_not_active', trigger, platform, appVersion);
      return false;
    }

    // El dispositivo antes que la RPC: la RPC GASTA el pedido de esta versión.
    // En TestFlight `isAvailableAsync` da false, y reclamar ahí quemaría el
    // cupo de la versión sin que nadie viera el diálogo.
    if (!(await StoreReview.isAvailableAsync())) {
      logSkip('store_review_unavailable', trigger, platform, appVersion);
      return false;
    }

    const { data, error } = await supabase.rpc('claim_review_prompt', {
      p_trigger: trigger,
      p_platform: platform,
      p_app_version: appVersion,
    });

    if (error) {
      // warn y no error: quedarse sin pedido es inocuo para el usuario.
      Logger.warn('No se pudo consultar el gate del pedido de valoración', {
        scope: 'store-review.runStoreReviewPrompt',
        trigger,
        error,
      });
      return false;
    }
    if (data !== true) {
      logSkip('gate_denied', trigger, platform, appVersion);
      return false;
    }

    await StoreReview.requestReview();

    // Es la única traza de que el gate dijo que sí Y el cliente llamó a la API.
    // La fila de `review_prompts` se escribe antes, así que no distingue un
    // `requestReview` que falló.
    Logger.info('Pedido de valoración enviado al sistema', {
      scope: 'store-review.runStoreReviewPrompt',
      event: 'review_prompt.requested',
      trigger,
      platform,
      appVersion,
    });
    return true;
  } catch (error) {
    Logger.warn('Fallo el pedido de valoración', {
      scope: 'store-review.runStoreReviewPrompt',
      trigger,
      error,
    });
    return false;
  } finally {
    inFlight = false;
  }
}

/** Dispara el pedido sin bloquear al llamador. */
export function requestStoreReviewIfEligible(trigger: ReviewPromptTrigger): void {
  void runStoreReviewPrompt(trigger);
}

// Una vez por sesión: volver a Inicio pasa muchas veces y cada intento sería
// un round-trip de más (el gate igual diría que no después del primero).
let engagedRequestedThisSession = false;

/** Pedido «usuario frecuente» (D-63): como mucho una vez por sesión. */
export function requestEngagedReturnReviewOnce(): void {
  if (engagedRequestedThisSession) return;
  engagedRequestedThisSession = true;
  requestStoreReviewIfEligible('engaged_return');
}
