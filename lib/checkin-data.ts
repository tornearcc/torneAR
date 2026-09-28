import { supabase } from '@/lib/supabase';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { getMixedCompositionErrorMessage } from '@/lib/mixed-composition';
import { fetchMixedCompositionStatus } from '@/lib/mixed-composition-data';
import type { Database } from '@/types/supabase';
import type {
  CheckinViewData,
  CheckinRosterPlayer,
  FormatRulesEntry,
  TeamCheckinSummary,
} from '@/components/matches/types';

type TeamFormat = Database['public']['Enums']['team_format'];
type LineupRole = Database['public']['Enums']['lineup_role'];

// ─── Errores estables de submit_team_checkin ─────────────────────────────────
// La RPC lanza con prefijo estable ("CODIGO: detalle"). Acá se mapea cada
// código a un mensaje amigable sin parsear texto libre del servidor.

export const CHECKIN_ERROR_CODES = [
  'MATCH_NOT_FOUND',
  'TEAM_NOT_IN_MATCH',
  'INVALID_MATCH_STATUS',
  'FORMAT_NOT_SET',
  'PROFILE_NOT_FOUND',
  'NOT_TEAM_ADMIN',
  'INVALID_PAYLOAD',
  'DUPLICATE_PLAYER',
  'FORMAT_RULES_MISSING',
  'MIN_STARTERS_NOT_MET',
  'TOO_MANY_STARTERS',
  'SQUAD_LIMIT_EXCEEDED',
  'PLAYER_NOT_IN_TEAM',
  'GEOFENCE_FAILED',
  // Desde 20260728140000: si el partido tiene venue con coordenadas, mandar
  // coords deja de ser opcional. Antes, omitirlas salteaba el geofence entero.
  'LOCATION_REQUIRED',
  'VENUE_REQUIRED',
  // F3 (20260925160000): los titulares de un equipo MIXTO no cumplen la
  // composición. El detalle dice cuántos faltan y se conserva.
  'MIXED_COMPOSITION',
] as const;

export type CheckinErrorCode = (typeof CHECKIN_ERROR_CODES)[number];

const CHECKIN_ERROR_MESSAGES: Record<CheckinErrorCode, string> = {
  MATCH_NOT_FOUND: 'No encontramos el partido. Actualizá la pantalla e intentá de nuevo.',
  TEAM_NOT_IN_MATCH: 'Tu equipo no participa de este partido.',
  INVALID_MATCH_STATUS: 'La lista solo se puede presentar con el partido confirmado.',
  FORMAT_NOT_SET: 'El partido todavía no tiene formato definido. Acordalo con el rival primero.',
  PROFILE_NOT_FOUND: 'No pudimos identificar tu perfil. Cerrá sesión y volvé a entrar.',
  // R6: el DT también presenta la lista. El texto tiene que nombrarlo, si no
  // el mensaje niega un permiso que el servidor sí concede.
  NOT_TEAM_ADMIN: 'Solo el capitán, el subcapitán o el DT puede presentar la lista del equipo.',
  INVALID_PAYLOAD: 'La lista tiene datos inválidos. Rearmala e intentá de nuevo.',
  DUPLICATE_PLAYER: 'Hay jugadores repetidos en la lista.',
  FORMAT_RULES_MISSING: 'No hay reglas cargadas para este formato. Contactá al equipo de torneAR.',
  MIN_STARTERS_NOT_MET: 'No llegás al mínimo de titulares para presentar equipo.',
  TOO_MANY_STARTERS: 'Marcaste más titulares de los que entran en la cancha.',
  SQUAD_LIMIT_EXCEEDED: 'Superaste el máximo de convocados para este formato.',
  PLAYER_NOT_IN_TEAM: 'Hay jugadores en la lista que no son miembros ni invitados del equipo.',
  // Sin distancia hardcodeada: el radio vive en app_settings y viaja en el
  // detalle del error del servidor. Repetir "150m" acá era una cuarta fuente de
  // verdad que quedaba desactualizada al primer ajuste.
  GEOFENCE_FAILED: 'Estás demasiado lejos de la cancha para hacer el check-in.',
  LOCATION_REQUIRED:
    'Este partido se juega en un complejo registrado: necesitamos tu ubicación para confirmar que estás ahí.',
  VENUE_REQUIRED:
    'Los partidos de ranking necesitan una cancha del catálogo. Acordá el complejo con el rival antes de confirmar.',
  // No se usa: el detalle del servidor dice cuántos faltan (getCheckinErrorMessage).
  MIXED_COMPOSITION: 'Los titulares no cumplen la composición mínima de un equipo mixto.',
};

export class CheckinError extends Error {
  readonly code: CheckinErrorCode;

  constructor(code: CheckinErrorCode, message: string) {
    super(message);
    this.name = 'CheckinError';
    this.code = code;
  }
}

function parseCheckinErrorCode(error: unknown): CheckinErrorCode | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const prefix = message.split(':')[0]?.trim();
  return (CHECKIN_ERROR_CODES as readonly string[]).includes(prefix)
    ? (prefix as CheckinErrorCode)
    : null;
}

// Mensaje para mostrar en UI: código estable si lo hay, genérico si no.
export function getCheckinErrorMessage(error: unknown): string {
  if (error instanceof CheckinError) return error.message;
  const code = parseCheckinErrorCode(error);
  if (code === 'MIXED_COMPOSITION') {
    return getMixedCompositionErrorMessage(String((error as { message?: unknown }).message ?? ''));
  }
  return code ? CHECKIN_ERROR_MESSAGES[code] : getGenericSupabaseErrorMessage(error);
}

// ─── Reglas de formato ────────────────────────────────────────────────────────

export async function fetchFormatRules(format: TeamFormat): Promise<FormatRulesEntry> {
  const { data, error } = await supabase
    .from('format_rules')
    .select('format, players_on_field, min_players_to_start, max_squad_size')
    .eq('format', format)
    .single();
  if (error) throw error;
  return {
    format: data.format,
    playersOnField: data.players_on_field,
    minPlayersToStart: data.min_players_to_start,
    maxSquadSize: data.max_squad_size,
  };
}

// ─── View data de la pantalla de convocatoria ────────────────────────────────
// Todo en una sola llamada: estado del partido + reglas del formato + plantel
// (miembros e invitados ya registrados) con su lineup_role actual si el
// capitán ya presentó una lista antes (re-presentación).

interface RawTeamMember {
  role: Database['public']['Enums']['team_role'];
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

interface RawParticipant {
  profile_id: string;
  is_guest: boolean;
  lineup_role: LineupRole;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export async function fetchCheckinViewData(
  matchId: string,
  teamId: string,
): Promise<CheckinViewData> {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, status, format, venue_id, scheduled_at, team_a_id, checkin_team_a_at, checkin_team_b_at')
    .eq('id', matchId)
    .single();
  if (matchError) throw matchError;

  if (!match.format) {
    throw new CheckinError('FORMAT_NOT_SET', CHECKIN_ERROR_MESSAGES.FORMAT_NOT_SET);
  }

  const [rules, membersRes, participantsRes, mixedStatus] = await Promise.all([
    fetchFormatRules(match.format),
    supabase
      .from('team_members')
      .select('role, profiles(id, full_name, username, avatar_url)')
      .eq('team_id', teamId),
    supabase
      .from('match_participants')
      .select('profile_id, is_guest, lineup_role, profiles(full_name, username, avatar_url)')
      .eq('match_id', matchId)
      .eq('team_id', teamId),
    fetchMixedCompositionStatus(teamId, match.format),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (participantsRes.error) throw participantsRes.error;

  const members = (membersRes.data ?? []) as RawTeamMember[];
  const participants = (participantsRes.data ?? []) as RawParticipant[];

  // lineup_role actual por perfil (si ya hay lista presentada)
  const currentLineup = new Map(participants.map((p) => [p.profile_id, p.lineup_role]));

  const roster: CheckinRosterPlayer[] = members
    .filter((m) => m.profiles !== null)
    .map((m) => ({
      profileId: m.profiles!.id,
      fullName: m.profiles!.full_name ?? m.profiles!.username ?? 'Jugador',
      username: m.profiles!.username ?? '',
      avatarUrl: m.profiles!.avatar_url,
      teamRole: m.role,
      isGuest: false,
      currentLineupRole: currentLineup.get(m.profiles!.id) ?? null,
    }));

  // Invitados registrados vía código único que no son miembros
  const memberIds = new Set(roster.map((r) => r.profileId));
  for (const p of participants) {
    if (p.is_guest && !memberIds.has(p.profile_id)) {
      roster.push({
        profileId: p.profile_id,
        fullName: p.profiles?.full_name ?? p.profiles?.username ?? 'Invitado',
        username: p.profiles?.username ?? '',
        avatarUrl: p.profiles?.avatar_url ?? null,
        teamRole: null,
        isGuest: true,
        currentLineupRole: currentLineup.get(p.profile_id) ?? null,
      });
    }
  }

  const isMyTeamA = match.team_a_id === teamId;
  return {
    matchId: match.id,
    matchStatus: match.status,
    format: match.format,
    scheduledAt: match.scheduled_at,
    venueId: match.venue_id,
    myTeamCheckinAt: isMyTeamA ? match.checkin_team_a_at : match.checkin_team_b_at,
    rules,
    roster,
    mixedMinPerGender:
      mixedStatus?.applies && mixedStatus.enforced && mixedStatus.counts
        ? mixedStatus.counts.minPerGender
        : null,
  };
}

// ─── RPC submit_team_checkin ──────────────────────────────────────────────────
// SECURITY DEFINER: valida cupos contra format_rules server-side y reemplaza
// la lista del equipo de forma atómica. Los errores llegan con código estable.

export async function submitTeamCheckin(
  matchId: string,
  teamId: string,
  players: { profileId: string; lineupRole: LineupRole }[],
  coords?: { lat: number; lng: number },
): Promise<TeamCheckinSummary> {
  const { data, error } = await supabase.rpc('submit_team_checkin', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_players: players.map((p) => ({ profile_id: p.profileId, lineup_role: p.lineupRole })),
    p_lat: coords?.lat,
    p_lng: coords?.lng,
  });
  if (error) {
    const code = parseCheckinErrorCode(error);
    if (code) throw new CheckinError(code, CHECKIN_ERROR_MESSAGES[code]);
    throw error;
  }
  return data as TeamCheckinSummary;
}
