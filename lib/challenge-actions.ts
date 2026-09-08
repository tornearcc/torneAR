import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';
import type { ChallengeInboxEntry } from '@/components/ranking/types';
import type { Database } from '@/types/supabase';

type NotificationType = Database['public']['Enums']['notification_type'];

// ─── Errores de dominio de send_challenge / accept_challenge ─────────────────
// Las RPCs marcan con un prefijo estable los rechazos sobre los que el cliente
// tiene algo mejor que decir que el texto del servidor. El resto de los
// `RAISE EXCEPTION` de esas funciones ya vienen redactados para el usuario
// (cooldown de 30 días, tope de 3 por temporada, jugadores en común) y se
// muestran tal cual: traducirlos acá sería mantener el mismo texto dos veces.
const CHALLENGE_ERROR_CODES = ['RANKING_MATCH_ACTIVE', 'TEAM_INACTIVE', 'TEAM_NOT_FOUND'] as const;

type ChallengeErrorCode = (typeof CHALLENGE_ERROR_CODES)[number];

const CHALLENGE_ERROR_MESSAGES: Record<ChallengeErrorCode, string> = {
  RANKING_MATCH_ACTIVE:
    'Ya tenés un partido de ranking sin resolver contra este equipo. Jugalo y cargá el resultado antes de volver a desafiarlos.',
  TEAM_INACTIVE:
    'Uno de los dos equipos está dado de baja. Si es el tuyo, reactivalo desde la gestión del equipo.',
  TEAM_NOT_FOUND:
    'No encontramos alguno de los dos equipos. Actualizá la pantalla y probá de nuevo.',
};

function readErrorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
}

function parseChallengeErrorCode(message: string): ChallengeErrorCode | null {
  const prefix = message.split(':')[0]?.trim();
  return (CHALLENGE_ERROR_CODES as readonly string[]).includes(prefix ?? '')
    ? (prefix as ChallengeErrorCode)
    : null;
}

/**
 * Convierte el error de `sendChallenge` / `acceptChallengeWithNotification` en
 * un mensaje presentable.
 *
 * Tres niveles, en este orden:
 *   1. Código conocido → el texto de {@link CHALLENGE_ERROR_MESSAGES}.
 *   2. Error técnico (sin red, RLS, clave duplicada) → el traductor genérico.
 *   3. Cualquier otra cosa → el texto del `RAISE EXCEPTION`, que para estas dos
 *      RPCs ya está escrito para que lo lea un usuario.
 *
 * El paso 3 es el que evita el pantallazo de "No se pudo completar la
 * operación": `getGenericSupabaseErrorMessage` descarta el `message` de todo lo
 * que no reconoce, y acá justamente ese `message` es la explicación.
 */
export function getChallengeErrorMessage(
  error: unknown,
  fallback = 'No se pudo completar la acción sobre el desafío.',
): string {
  const raw = readErrorMessage(error).trim();

  const code = parseChallengeErrorCode(raw);
  if (code) return CHALLENGE_ERROR_MESSAGES[code];

  // Con fallback vacío, el genérico devuelve '' cuando no reconoce el error:
  // eso es la señal de "no es un error técnico, dejá pasar el texto original".
  const technical = getGenericSupabaseErrorMessage(error, '');
  if (technical) return technical;

  return raw.length > 0 ? raw : fallback;
}

/**
 * `true` si el error es una regla de negocio de `send_challenge` /
 * `accept_challenge`, y no una falla del sistema.
 *
 * Discrimina por el SQLSTATE **P0001** (`raise_exception`), que es el que
 * Postgres le asigna a un `RAISE EXCEPTION` de plpgsql sin código explícito —o
 * sea, exactamente los frenos que estas dos RPCs levantan a propósito:
 * cooldown de 30 días, tope por temporada, jugadores en común, desafío ya
 * enviado, partido de ranking sin resolver, equipo dado de baja, no autorizado.
 * Una violación de unique (23505), un rechazo de RLS (42501) o un fallo de red
 * no son P0001 y no entran acá.
 *
 * Existe para elegir el NIVEL DE LOG, no el mensaje: que un usuario choque
 * contra una regla es el sistema funcionando, no un incidente. Registrarlo como
 * `error` llena `app_logs` de ruido y le saca sentido a la métrica que se usa
 * justamente para detectar problemas reales.
 */
export function isChallengeRuleRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { code?: unknown }).code === 'P0001') return true;

  // Red de seguridad: si el `code` se pierde en el camino (un wrapper que sólo
  // conserva el `message`), el prefijo de dominio alcanza para reconocerlo.
  return parseChallengeErrorCode(readErrorMessage(error)) !== null;
}

// Row shape returned by the get_team_challenges_inbox RPC
type ChallengesInboxRow = {
  challenge_id: string;
  created_at: string;
  status: 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA';
  match_type: 'RANKING' | 'AMISTOSO';
  direction: 'ENVIADO' | 'RECIBIDO';
  opponent_team_id: string;
  opponent_team_name: string;
  opponent_shield_url: string | null;
  opponent_elo: number;
  creator_name: string;
};

export async function fetchChallengesInbox(teamId: string): Promise<ChallengeInboxEntry[]> {
  const { data, error } = await supabase.rpc('get_team_challenges_inbox', { p_team_id: teamId });
  if (error) throw error;

  return (data as ChallengesInboxRow[] ?? []).map((row) => ({
    challengeId: row.challenge_id,
    createdAt: row.created_at,
    status: row.status,
    matchType: row.match_type,
    direction: row.direction,
    opponentTeamId: row.opponent_team_id,
    opponentTeamName: row.opponent_team_name,
    opponentShieldUrl: row.opponent_shield_url
      ? getSupabaseStorageUrl('shields', row.opponent_shield_url)
      : null,
    opponentElo: row.opponent_elo,
    creatorName: row.creator_name,
  }));
}

// Direct table update — protected by RLS (to_team can only set RECHAZADA)
export async function updateChallengeStatus(challengeId: string, status: 'RECHAZADA') {
  const { error } = await supabase
    .from('challenges')
    .update({ status })
    .eq('id', challengeId);
  if (error) throw error;
}

// Direct table update — protected by RLS (from_team can only set CANCELADA)
export async function cancelChallenge(challengeId: string) {
  const { error } = await supabase
    .from('challenges')
    .update({ status: 'CANCELADA' })
    .eq('id', challengeId);
  if (error) throw error;
}

// Returns true if there is an active (ENVIADA) challenge between the two teams.
// Used for UI state only (show "already challenged" badge) — not a security gate.
export async function getActiveChallengeWithTeam(
  myTeamId: string,
  opponentTeamId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id')
    .eq('status', 'ENVIADA')
    .or(
      `and(from_team_id.eq.${myTeamId},to_team_id.eq.${opponentTeamId}),` +
      `and(from_team_id.eq.${opponentTeamId},to_team_id.eq.${myTeamId})`,
    )
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// R8: silencioso para el usuario, observable para nosotros. Un desafío que
// llega a la base pero cuyo aviso no se inserta es indistinguible, desde la
// pantalla del rival, de un desafío que nunca se mandó — y con el `catch {}`
// vacío original no quedaba rastro de la diferencia.
async function notifyTeamLeaders(
  teamId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  try {
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', teamId)
      .in('role', ['CAPITAN', 'SUBCAPITAN']);

    if (membersError) {
      Logger.error('Error enviando notificación: no se pudo leer el plantel', {
        scope: 'challenge-actions.notifyTeamLeaders',
        teamId,
        type,
        error: membersError,
      });
      return;
    }

    if (!members || members.length === 0) {
      Logger.warn('Notificación sin destinatarios: el equipo no tiene capitán ni subcapitán', {
        scope: 'challenge-actions.notifyTeamLeaders',
        teamId,
        type,
      });
      return;
    }

    const { error: insertError } = await supabase.from('notifications').insert(
      members.map((m) => ({ profile_id: m.profile_id, type, title, body, data })),
    );

    if (insertError) {
      Logger.error('Error enviando notificación', {
        scope: 'challenge-actions.notifyTeamLeaders',
        teamId,
        type,
        recipients: members.length,
        error: insertError,
      });
    }
  } catch (error) {
    Logger.error('Error enviando notificación', {
      scope: 'challenge-actions.notifyTeamLeaders',
      teamId,
      type,
      error,
    });
  }
}

// ─── E1: aviso temprano de cupo ───────────────────────────────────────────────
// `confirm_match_proposal` ahora rechaza la confirmación si algún plantel no
// llega a `format_rules.min_players_to_start` del formato acordado. Enterarse
// recién ahí es tarde: ya se mandó el desafío, el rival lo aceptó y se negoció
// la cancha. Esto anticipa el freno en el momento de desafiar.
//
// El desafío NO lleva formato (eso se acuerda después, en la propuesta), así que
// se evalúa contra el `preferred_format` del equipo, que es el que va a proponer
// por defecto. Es una ADVERTENCIA, no un bloqueo: el capitán puede desafiar
// igual y sumar gente antes de confirmar, o acordar un formato más chico.

export interface SquadReadiness {
  ok: boolean;
  memberCount: number;
  minRequired: number;
  format: Database['public']['Enums']['team_format'];
}

export async function fetchSquadReadiness(teamId: string): Promise<SquadReadiness | null> {
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('preferred_format')
    .eq('id', teamId)
    .single();
  if (teamError || !team) return null;

  const [{ count, error: countError }, { data: rules, error: rulesError }] = await Promise.all([
    supabase
      .from('team_members')
      .select('profile_id', { count: 'exact', head: true })
      .eq('team_id', teamId),
    supabase
      .from('format_rules')
      .select('min_players_to_start')
      .eq('format', team.preferred_format)
      .maybeSingle(),
  ]);

  // Ante cualquier hueco devolvemos null: el aviso se omite, pero nunca se
  // bloquea ni se miente con un número inventado.
  if (countError || rulesError || !rules || count === null) return null;

  return {
    ok: count >= rules.min_players_to_start,
    memberCount: count,
    minRequired: rules.min_players_to_start,
    format: team.preferred_format,
  };
}

// type (no interface): habilita el cast directo desde el Json tipado del RPC.
export type SendChallengeResult = {
  challengeId: string;
  eloDiffWarning: boolean;
};

// Sends a challenge via the send_challenge RPC.
// All business-rule validations run server-side (anti-farming, cooldown, season limit, auth).
export async function sendChallenge(
  fromTeamId: string,
  toTeamId: string,
  matchType: 'RANKING' | 'AMISTOSO',
): Promise<SendChallengeResult> {
  const { data, error } = await supabase.rpc('send_challenge', {
    p_from_team_id: fromTeamId,
    p_to_team_id: toTeamId,
    p_match_type: matchType,
  });
  if (error) throw error;

  const result = data as SendChallengeResult;

  const typeLabel = matchType === 'RANKING' ? 'de ranking' : 'amistoso';
  void notifyTeamLeaders(
    toTeamId,
    'DESAFIO_RECIBIDO',
    '⚔️ Nuevo desafío recibido',
    `Recibiste un desafío ${typeLabel}. ¡Aceptalo desde la pestaña de Ranking!`,
    { challengeId: result.challengeId, fromTeamId, matchType },
  );

  return result;
}

export async function acceptChallengeWithNotification(
  challengeId: string,
  fromTeamId: string,
): Promise<{ matchId: string; conversationId: string }> {
  const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: challengeId });
  if (error) throw error;

  const result = data as { matchId: string; conversationId: string };

  void notifyTeamLeaders(
    fromTeamId,
    'DESAFIO_ACEPTADO',
    '✅ ¡Desafío aceptado!',
    'Tu desafío fue aceptado. ¡Ya tienen un partido creado!',
    { challengeId, matchId: result.matchId },
  );

  return result;
}
