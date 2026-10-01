import type { Database } from '@/types/supabase';
import type { MatchCardEntry, MatchDetailViewData } from '@/components/matches/types';

type MatchStatus = Database['public']['Enums']['match_status'];

/**
 * D10 — Definición ÚNICA de "puedo cargar el resultado de este partido".
 *
 * La regla estaba escrita tres veces y distinta cada vez:
 *
 *   · `app/match-detail.tsx`            EN_VIVO && !myResult && (loader ∥ CAPITAN ∥ SUBCAPITAN)
 *   · `components/.../ResultSection`    EN_VIVO && isResultLoader && !myResult
 *   · `LiveMatchBanner` / `MatchCardFooter`   EN_VIVO a secas
 *
 * El efecto visible: un capitán que no hizo check-in veía el botón rojo
 * "Finalizar Partido" pero NO veía "Cargar resultado" en la sección de
 * resultado de la misma pantalla; y desde la pestaña Partidos cualquier
 * capitán/subcapitán veía "→ Cargar resultado" aunque su equipo ya lo hubiera
 * cargado. Este módulo es ahora la única fuente de verdad del cliente.
 *
 * ⚠️ Es gating de UI, no de seguridad. La autoridad sigue siendo la policy de
 * INSERT sobre `match_results` (CAPITAN/SUBCAPITAN **o** `is_result_loader`) y
 * el UNIQUE (match_id, team_id) que produce el 23505 →
 * `ResultAlreadySubmittedError`. Acá sólo se decide qué botón se dibuja.
 */

/**
 * R6 — Dos círculos de permiso, no uno.
 *
 * Hasta el Bloque 9 existía un solo predicado (`isTeamMatchAdmin`) y
 * `DIRECTOR_TECNICO` quedaba afuera de todo: era un `JUGADOR` con etiqueta.
 * La decisión de producto fue darle **permisos operativos del día del partido**
 * sin permisos de **gestión del club**, así que la regla se parte en dos:
 *
 * | | `isTeamMatchAdmin` | `isTeamMatchStaff` |
 * |---|---|---|
 * | Roles | CAPITAN · SUBCAPITAN | CAPITAN · SUBCAPITAN · **DIRECTOR_TECNICO** |
 * | Qué habilita | proponer, confirmar, cancelar, responder cancelaciones, resolver disputa | presentar la lista, cargar el resultado |
 * | Qué compromete | al **club**: fecha, cancha, seña, y el resultado ya cerrado | al **partido en curso** |
 *
 * El corte no es de confianza sino de **naturaleza del acto**: coordinar y
 * cancelar crean o rompen una obligación del club frente a otro club; presentar
 * la lista y cargar el resultado son actos del banco de suplentes.
 */
export function isTeamMatchAdmin(role: string | null | undefined): boolean {
  return role === 'CAPITAN' || role === 'SUBCAPITAN';
}

/**
 * "Cuerpo técnico del partido": quién puede presentar la lista y cargar el
 * resultado. Es `isTeamMatchAdmin` + `DIRECTOR_TECNICO` (R6).
 *
 * El parámetro es `string` y no el enum `team_role` porque `UserTeam.role` del
 * store de equipos está tipado así (stores/teamStore.ts). La comparación es
 * exacta contra los literales del enum, de modo que ensanchar el parámetro no
 * afloja nada: cualquier valor fuera del enum devuelve `false`.
 *
 * ⚠️ Es gating de UI. La autoridad es la policy de INSERT de `match_results` y
 * el bloque 3 de `submit_team_checkin`, los dos actualizados en la migración
 * `20260730120000`, y la policy de INSERT de `messages` para el chat del
 * partido (`20260929130000`). Este predicado tiene que quedar sincronizado con
 * ellos.
 */
export function isTeamMatchStaff(role: string | null | undefined): boolean {
  return isTeamMatchAdmin(role) || role === 'DIRECTOR_TECNICO';
}

export interface ResultLoadContext {
  status: MatchStatus;
  /** Mi equipo ya cargó SU resultado (el del rival no bloquea nada). */
  hasMyResult: boolean;
  /**
   * El usuario tocó "Marcar llegada" en este partido y quedó marcado como
   * `is_result_loader`. Sólo `get_match_detail` devuelve este dato: en la lista
   * de partidos no existe y va en `false` (ver `canLoadResultFromCard`).
   */
  isResultLoader: boolean;
  /**
   * Resultado de `isTeamMatchStaff` sobre el rol del usuario en MI equipo.
   *
   * Era `isAdmin` hasta R6. Se renombró porque el conjunto cambió: cargar el
   * resultado ya no es una atribución de la conducción del club, sino del
   * cuerpo técnico presente en la cancha.
   */
  isStaff: boolean;
}

/** La regla, una sola vez. */
export function canLoadResult(ctx: ResultLoadContext): boolean {
  return ctx.status === 'EN_VIVO' && !ctx.hasMyResult && (ctx.isResultLoader || ctx.isStaff);
}

/**
 * Adaptador para el detalle del partido, donde el payload trae todo:
 * rol propio, `is_result_loader` y el resultado ya cargado.
 */
export function canLoadResultFromDetail(match: MatchDetailViewData): boolean {
  return canLoadResult({
    status: match.status,
    hasMyResult: match.myResult !== null,
    isResultLoader: match.isResultLoader,
    isStaff: isTeamMatchStaff(match.myRole),
  });
}

/**
 * Adaptador para las tarjetas de la lista (`get_my_matches`).
 *
 * Dos diferencias con el detalle, ambas deliberadas:
 *
 *  · **`isResultLoader` se asume `false`.** La lista no sabe quién hizo el
 *    check-in — ese dato sólo viaja en `get_match_detail`. El atajo se le
 *    ofrece a quien seguro puede (el cuerpo técnico); el jugador que sí es
 *    result-loader entra al detalle y ahí lo encuentra. Es un falso negativo
 *    aceptable: nunca dibuja un botón que después rebota.
 *
 *  · **`hasMyResult` se deriva de `resultTeamA` / `resultTeamB`**, que son el
 *    `goals_scored` de cada equipo en `match_results` — no nulo exactamente
 *    cuando ese equipo ya cargó. Es el dato que faltaba mirar para que la
 *    tarjeta dejara de ofrecer "Cargar resultado" después de haberlo cargado.
 *
 * ⚠️ `isStaff` (R6) **no** es el mismo flag que gatea las acciones de propuesta
 * de la tarjeta: ése sigue siendo `isTeamMatchAdmin`. Un DT ve "Cargar
 * resultado" y no ve "Proponer detalles".
 */
export function canLoadResultFromCard(
  entry: MatchCardEntry,
  myTeamId: string,
  isStaff: boolean,
): boolean {
  const myResult = entry.teamA.id === myTeamId ? entry.resultTeamA : entry.resultTeamB;

  return canLoadResult({
    status: entry.status,
    hasMyResult: myResult !== null,
    isResultLoader: false,
    isStaff,
  });
}
