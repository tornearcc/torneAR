import { supabase } from '@/lib/supabase';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';
import { getMixedCompositionErrorMessage } from '@/lib/mixed-composition';
import type { MatchResultFormData, CancellationFormData, WoClaimFormData } from '@/components/matches/types';
import type { Database } from '@/types/supabase';

type NotificationType = Database['public']['Enums']['notification_type'];

// Notifica a CAPITAN/SUBCAPITAN de un equipo. Silencioso: nunca bloquea el flujo principal.
//
// R8: sigue siendo silencioso para el USUARIO —el aviso es un efecto secundario
// del flujo, no su objetivo— pero ya no es silencioso para nosotros. El `catch {}`
// vacío original hacía que la no entrega de avisos críticos del ciclo del
// partido ("el rival quiere cancelar el partido de mañana") fuera literalmente
// inobservable: si la policy `notifications_insert_authenticated` rechazaba el
// INSERT por alguna rama no contemplada, nadie se enteraba nunca.
//
// El destino final sigue siendo mover estos avisos a triggers server-side
// (patrón de 20260711034845_g1_b2_match_status_notifications.sql); hasta
// entonces, al menos queda registro de cada fallo.
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
        scope: 'match-actions.notifyTeamLeaders',
        teamId,
        type,
        error: membersError,
      });
      return;
    }

    // Un equipo sin capitán ni subcapitán es un dato de dominio anómalo, no un
    // error de red: el aviso simplemente no tiene a quién llegar.
    if (!members || members.length === 0) {
      Logger.warn('Notificación sin destinatarios: el equipo no tiene capitán ni subcapitán', {
        scope: 'match-actions.notifyTeamLeaders',
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
        scope: 'match-actions.notifyTeamLeaders',
        teamId,
        type,
        recipients: members.length,
        error: insertError,
      });
    }
  } catch (error) {
    Logger.error('Error enviando notificación', {
      scope: 'match-actions.notifyTeamLeaders',
      teamId,
      type,
      error,
    });
  }
}

// ─── Proposal ────────────────────────────────────────────────────────────────

export async function submitProposal(
  matchId: string,
  fromTeamId: string,
  data: import('@/components/matches/types').MatchProposalFormData,
): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) throw new Error('No autenticado');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile) throw new Error('Perfil no encontrado');

  const { error } = await supabase.from('match_proposals').insert({
    match_id: matchId,
    proposed_by: profile.id,
    from_team_id: fromTeamId,
    format: data.format,
    match_type: data.matchType,
    scheduled_at: data.scheduledAt.toISOString(),
    duration_minutes: data.durationMinutes,
    location: data.location,
    venue_id: data.venueId,
    signal_amount: data.signalAmount,
    total_cost: data.totalCost,
  });
  if (error) throw error;
}

// ─── Errores estables de confirm_match_proposal ──────────────────────────────
// Desde 20260728171000 la RPC rechaza la confirmación si algún plantel no llega
// al mínimo del formato (E1), si la propuesta no es de ese partido (D7) o si el
// partido ya no está PENDIENTE (D8). Sin este mapper el usuario veía el
// fallback genérico de getGenericSupabaseErrorMessage, que se traga el motivo
// real — justo el dato que necesita para poder actuar.

export const PROPOSAL_ERROR_CODES = [
  'SQUAD_TOO_SMALL',
  'PROPOSAL_MATCH_MISMATCH',
  'INVALID_MATCH_STATUS',
  'MATCH_NOT_FOUND',
  // D13 (20260728221000): los emiten el trigger de match_proposals al proponer
  // y confirm_match_proposal al confirmar. El mismo código en los dos momentos,
  // porque para el usuario es el mismo problema.
  'PROPOSAL_DATE_IN_PAST',
  'PROPOSAL_DATE_REQUIRED',
  'TEAM_SCHEDULE_CONFLICT',
  // Lo emite el trigger `trg_matches_ranking_requires_venue` (20260728140000),
  // no la RPC: salta en el UPDATE a CONFIRMADO y aborta la confirmación entera.
  // El código ya estaba mapeado en lib/checkin-data.ts, pero ése es el
  // diccionario del check-in y `handleAcceptProposal` no lo consulta — así que
  // acá caía igual en el genérico de Supabase.
  'VENUE_REQUIRED',
  // F3 (20260925160000): composición de los equipos MIXTO con el formato
  // acordado, detrás de app_settings.mixed_composition_enforced.
  'MIXED_COMPOSITION',
] as const;

export type ProposalErrorCode = (typeof PROPOSAL_ERROR_CODES)[number];

const PROPOSAL_ERROR_MESSAGES: Record<ProposalErrorCode, string> = {
  // El detalle del servidor nombra al equipo corto y el mínimo exigido, así que
  // se conserva tal cual: es la única forma de saber a quién le falta gente.
  SQUAD_TOO_SMALL: 'No alcanza el plantel para este formato.',
  PROPOSAL_MATCH_MISMATCH:
    'Esta propuesta no corresponde a este partido. Actualizá la pantalla e intentá de nuevo.',
  INVALID_MATCH_STATUS: 'El partido ya no está pendiente: no se puede confirmar esta propuesta.',
  MATCH_NOT_FOUND: 'No encontramos el partido. Actualizá la pantalla e intentá de nuevo.',
  PROPOSAL_DATE_IN_PAST:
    'La fecha y hora propuestas ya pasaron. Proponé un horario futuro para poder coordinar.',
  PROPOSAL_DATE_REQUIRED: 'La propuesta necesita fecha y hora.',
  // El detalle del servidor nombra al equipo comprometido; se conserva igual
  // que en SQUAD_TOO_SMALL, porque saber cuál de los dos es el del conflicto
  // es justo lo que permite resolverlo.
  TEAM_SCHEDULE_CONFLICT: 'Ese horario choca con otro partido confirmado.',
  VENUE_REQUIRED:
    'Los partidos de Ranking exigen tener una cancha asignada. Volvé a proponer eligiendo zona y complejo del catálogo.',
  // Sólo si el servidor no manda detalle: el detalle nombra al equipo y, si es
  // el propio, cuántos faltan de cada género (ver getMixedCompositionErrorMessage).
  MIXED_COMPOSITION: 'Uno de los equipos no cumple la composición mínima de un equipo mixto.',
};

/** Mensaje presentable para un error de confirmación de propuesta. */
export function getProposalErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const [prefix, ...rest] = message.split(':');
  const code = prefix?.trim();

  if ((PROPOSAL_ERROR_CODES as readonly string[]).includes(code)) {
    const detail = rest.join(':').trim();
    if (code === 'MIXED_COMPOSITION') {
      return detail
        ? getMixedCompositionErrorMessage(message)
        : PROPOSAL_ERROR_MESSAGES.MIXED_COMPOSITION;
    }
    // SQUAD_TOO_SMALL trae el nombre del equipo y el mínimo en el detalle;
    // TEAM_SCHEDULE_CONFLICT, el nombre del equipo ya comprometido.
    if ((code === 'SQUAD_TOO_SMALL' || code === 'TEAM_SCHEDULE_CONFLICT') && detail) {
      return `${PROPOSAL_ERROR_MESSAGES[code as ProposalErrorCode]} ${detail.charAt(0).toUpperCase()}${detail.slice(1)}.`;
    }
    return PROPOSAL_ERROR_MESSAGES[code as ProposalErrorCode];
  }

  // Mensajes sin prefijo estable que la RPC ya devolvía en castellano
  // ("No autorizado…", "La propuesta ya no está pendiente…").
  if (message.startsWith('No autorizado') || message.startsWith('La propuesta')) return message;

  return getGenericSupabaseErrorMessage(error);
}

export async function acceptProposal(proposalId: string, matchId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_match_proposal', {
    p_proposal_id: proposalId,
    p_match_id: matchId,
  });
  if (error) throw error;
}

export async function rejectProposal(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('match_proposals')
    .update({ status: 'RECHAZADA' })
    .eq('id', proposalId);
  if (error) throw error;
}

export async function cancelProposal(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from('match_proposals')
    .update({ status: 'RECHAZADA' })
    .eq('id', proposalId);
  if (error) throw error;
}

// ─── Check-in ─────────────────────────────────────────────────────────────────
// Registra la llegada INDIVIDUAL del caller y lo habilita como result-loader.
//
// D9: el sello de presencia del EQUIPO (`checkin_team_X_at`, que es lo que lee
// el WO automático del barrido) ya no lo pone un tap suelto: hace falta que el
// equipo junte `min_players_to_start` check-ins. Por eso la RPC dejó de
// devolver void — el jugador necesita saber si su llegada alcanzó para
// presentar al equipo o cuántos faltan todavía.

export interface CheckinTeamResult {
  checkedInPlayers: number;
  minPlayers: number;
  /** El equipo ya está presentado (por quórum ahora o por la lista del capitán antes). */
  teamSealed: boolean;
  /** Este check-in fue el que completó el quórum. */
  justSealed: boolean;
  matchStatus: string;
  /**
   * F3: en un equipo MIXTO con la regla activa, los presentes cumplen la
   * composición. `true` cuando la regla no aplica (y con un servidor anterior
   * a 20260925160000, que no manda la clave).
   */
  compositionOk: boolean;
  /** Cuántos faltan de cada género entre los presentes; `null` si la regla no aplica. */
  compositionMissing: { male: number; female: number; total: number } | null;
}

function parseCompositionMissing(raw: unknown): CheckinTeamResult['compositionMissing'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    male: Number(r.male ?? 0),
    female: Number(r.female ?? 0),
    total: Number(r.total ?? 0),
  };
}

export async function doCheckin(
  matchId: string,
  teamId: string,
  coords?: { lat: number; lng: number },
): Promise<CheckinTeamResult> {
  // p_lat/p_lng son args opcionales del RPC tipado: undefined = omitidos en el
  // body y toman el DEFAULT NULL del servidor (misma semántica que antes).
  const { data, error } = await supabase.rpc('checkin_team', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_lat: coords?.lat,
    p_lng: coords?.lng,
  });
  if (error) throw error;

  const raw = (data ?? {}) as Partial<Record<keyof CheckinTeamResult, unknown>>;
  return {
    checkedInPlayers: Number(raw.checkedInPlayers ?? 0),
    minPlayers: Number(raw.minPlayers ?? 0),
    teamSealed: raw.teamSealed === true,
    justSealed: raw.justSealed === true,
    matchStatus: String(raw.matchStatus ?? ''),
    compositionOk: raw.compositionOk !== false,
    compositionMissing: parseCompositionMissing(raw.compositionMissing),
  };
}

// ─── Result ──────────────────────────────────────────────────────────────────
// RLS allows CAPITAN/SUBCAPITAN to insert results regardless of is_result_loader.
// resolve_match trigger fires automatically and handles FINALIZADO / EN_DISPUTA / ELO.

/**
 * El equipo ya tiene un resultado cargado para este partido (UNIQUE match_id +
 * team_id). Se expone como error tipado para que la UI distinga "ya estaba
 * cargado" de un fallo real y refresque el estado en vez de mostrar un genérico.
 */
export class ResultAlreadySubmittedError extends Error {
  constructor() {
    super('Tu equipo ya cargó el resultado de este partido.');
    this.name = 'ResultAlreadySubmittedError';
  }
}

export async function submitMatchResult(
  matchId: string,
  teamId: string,
  data: MatchResultFormData,
): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) throw new Error('No autenticado');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile) throw new Error('Perfil no encontrado');

  const scorersJson = (data.scorers ?? []).map((s) => ({
    profile_id: s.profileId,
    goals: s.goals,
  }));

  const { error } = await supabase.from('match_results').insert({
    match_id: matchId,
    team_id: teamId,
    submitted_by: profile.id,
    goals_scored: data.goalsScored,
    goals_against: data.goalsAgainst,
    scorers: scorersJson,
    mvp_id: data.mvpProfileId ?? null,
  });

  if (error) {
    // Código 23505 = unique_violation: el resultado ya fue enviado (UNIQUE match_id + team_id).
    //
    // Antes se tragaba con un `return` silencioso, asumiendo un reintento tras
    // timeout de red. Pero eso también enmascaraba el doble envío real: la UI
    // mostraba "Resultado cargado" dos veces y el usuario creía haber
    // registrado dos resultados distintos. Ahora se tipa y decide el caller
    // (que refresca el estado y avisa que ya estaba cargado).
    if (error.code === '23505') throw new ResultAlreadySubmittedError();
    throw error;
  }
}

// ─── Cancellation ─────────────────────────────────────────────────────────────
// SECURITY DEFINER RPC. Doble consentimiento: crea la solicitud en PENDIENTE,
// el partido NO se cancela hasta que el equipo rival responda (ver
// respondToCancellationRequest más abajo).

export async function requestCancellation(
  matchId: string,
  teamId: string,
  data: CancellationFormData,
  opponentTeamId: string,
): Promise<void> {
  const { error } = await supabase.rpc('request_match_cancellation', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_reason: data.reason,
    p_notes: data.notes ?? undefined,
  });
  if (error) throw error;

  void notifyTeamLeaders(
    opponentTeamId,
    'CANCELACION_SOLICITADA',
    '⚠️ Solicitud de cancelación',
    'El equipo rival solicitó cancelar el partido. Revisá los detalles y respondé.',
    { matchId },
  );
}

// El equipo rival acepta o rechaza. Si acepta, el partido pasa a CANCELADO
// (y si la cancelación es tardía, ahí recién se aplica la penalización de
// Fair Play — no al pedirla). Si rechaza, el partido sigue en pie.
export async function respondToCancellationRequest(
  requestId: string,
  accept: boolean,
  requestedByTeamId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('respond_to_cancellation_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) throw error;

  void notifyTeamLeaders(
    requestedByTeamId,
    accept ? 'PARTIDO_CANCELADO' : 'CANCELACION_RECHAZADA',
    accept ? '✅ Cancelación aceptada' : '❌ Cancelación rechazada',
    accept
      ? 'El equipo rival aceptó cancelar el partido.'
      : 'El equipo rival rechazó tu solicitud de cancelación. El partido sigue en pie.',
    { requestId },
  );

  return data as string;
}

// ─── Guest join ───────────────────────────────────────────────────────────────
// SECURITY DEFINER RPC — any authenticated user can join via unique code.

// type (no interface): habilita el cast directo desde el Json tipado del RPC.
export type GuestJoinResult = {
  matchId: string;
  teamId: string;
  teamSide: 'A' | 'B';
  teamAName: string;
  teamBName: string;
};

export async function joinMatchAsGuest(
  uniqueCode: string,
  teamSide: 'A' | 'B',
): Promise<GuestJoinResult> {
  const { data, error } = await supabase.rpc('join_match_as_guest', {
    p_unique_code: uniqueCode,
    p_team_side: teamSide,
  });
  if (error) throw error;
  return data as GuestJoinResult;
}

// ─── Dispute ──────────────────────────────────────────────────────────────────

export async function submitDisputeVote(matchId: string, votedTeamId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_dispute_vote', {
    p_match_id: matchId,
    p_voted_team_id: votedTeamId,
  });
  if (error) throw error;
}

// `resolveMatchDispute` se eliminó junto con su RPC (migración 20260803150000).
//
// El escrutinio corría en el instante en que un capitán apretaba el botón, y
// como el desempate cae en Fair Play cuando los votos están igualados —y 0 a 0
// es el estado en que nace toda disputa— el primero en apretar se llevaba el
// partido. Ahora lo cierra el cron `sweep_disputed_matches` a las 24 h, que no
// es invocable desde el cliente. La única resolución manual que queda es
// `admin_resolve_dispute`, admin-gated.

// ─── WO Claim ─────────────────────────────────────────────────────────────────
// La foto se sube al bucket wo_evidences y luego se llama a la RPC claim_wo
// (SECURITY DEFINER), que valida autorización + pertenencia de goleadores/MVP
// server-side e inserta el reclamo. claimed_by se deriva de auth.uid() en la RPC.

export async function claimWo(
  matchId: string,
  teamId: string,
  data: WoClaimFormData,
): Promise<void> {
  // Upload evidence photo
  let photoUrl = '';
  if (data.photoBase64) {
    const fileName = `${matchId}/${teamId}_${Date.now()}.jpg`;
    const binaryStr = atob(data.photoBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('wo_evidences')
      .upload(fileName, bytes.buffer, {
        contentType: data.photoMimeType,
        upsert: true,
      });
    if (uploadError) throw uploadError;
    photoUrl = uploadData?.path ?? fileName;
  }

  const scorers = (data.scorers ?? []).map((s) => ({ profile_id: s.profileId, goals: s.goals }));

  // p_mvp_id es opcional en el RPC tipado: undefined = omitido (DEFAULT NULL).
  const { error } = await supabase.rpc('claim_wo', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_reason: data.reason,
    p_photo_url: photoUrl,
    p_scorers: scorers,
    p_mvp_id: data.mvpProfileId ?? undefined,
  });
  if (error) throw error;
}
