import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { Database } from '@/types/supabase';
import {
  toPublishParams,
  type MatchTypePref,
  type RivalPostDraft,
  type TeamFormat,
  type TimeSlot,
} from '@/lib/rival-posts-utils';

/**
 * «Buscan rival» y «Rival sugerido» (P3-19, D-76) — acceso a datos.
 *
 * Todo pasa por RPCs (`20261125120000_rival_posts.sql`): las tablas no tienen
 * grants para el cliente. El desafío en sí sigue saliendo por
 * `sendChallenge` desde la ficha del equipo; acá no se crea nada más que la
 * publicación.
 */

type Functions = Database['public']['Functions'];
type RivalPostRow = Functions['get_rival_posts']['Returns'][number];
type SuggestedRivalRow = Functions['get_suggested_rivals']['Returns'][number];

export interface RivalPost {
  teamId: string;
  teamName: string;
  shieldUrl: string | null;
  teamZone: string;
  category: Database['public']['Enums']['team_category'];
  format: TeamFormat;
  days: number[];
  timeSlots: TimeSlot[];
  matchDate: string | null;
  matchTime: string | null;
  /** «sáb y dom · tarde», armado por el servidor. */
  whenLabel: string;
  postZone: string;
  venueId: string | null;
  venueName: string | null;
  matchTypePref: MatchTypePref;
  note: string | null;
  publishedAt: string;
  expiresAt: string;
  alertedCount: number;
  distanceKm: number | null;
  eloRating: number;
  matchesPlayed: number;
  memberCount: number;
  isOwn: boolean;
}

export interface SuggestedRival {
  teamId: string;
  teamName: string;
  shieldUrl: string | null;
  zone: string;
  preferredFormat: TeamFormat;
  eloRating: number;
  matchesPlayed: number;
  memberCount: number;
  distanceKm: number | null;
  hasRivalPost: boolean;
  rivalPostWhen: string | null;
  score: number;
  /** Motivos para mostrar como etiquetas, el más fuerte primero. */
  reasons: string[];
}

function shield(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : getSupabaseStorageUrl('shields', path);
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapRivalPostRow(row: RivalPostRow): RivalPost {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    shieldUrl: shield(row.shield_url),
    teamZone: row.team_zone,
    category: row.category,
    format: row.format,
    days: row.days ?? [],
    timeSlots: (row.time_slots ?? []) as TimeSlot[],
    matchDate: row.match_date,
    matchTime: row.match_time,
    whenLabel: row.when_label,
    postZone: row.post_zone,
    venueId: row.venue_id,
    venueName: row.venue_name,
    matchTypePref: (row.match_type_pref as MatchTypePref) ?? 'AMBOS',
    note: row.note,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    alertedCount: row.alerted_count ?? 0,
    distanceKm: toNumberOrNull(row.distance_km),
    eloRating: row.elo_rating ?? 1000,
    matchesPlayed: row.matches_played ?? 0,
    memberCount: row.member_count ?? 0,
    isOwn: row.is_own ?? false,
  };
}

export function mapSuggestedRivalRow(row: SuggestedRivalRow): SuggestedRival {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    shieldUrl: shield(row.shield_url),
    zone: row.zone,
    preferredFormat: row.preferred_format,
    eloRating: row.elo_rating ?? 1000,
    matchesPlayed: row.matches_played ?? 0,
    memberCount: row.member_count ?? 0,
    distanceKm: toNumberOrNull(row.distance_km),
    hasRivalPost: row.has_rival_post ?? false,
    rivalPostWhen: row.rival_post_when,
    score: Number(row.score ?? 0),
    reasons: row.reasons ?? [],
  };
}

export interface RivalPostFilters {
  zone?: string | null;
  format?: TeamFormat | null;
}

/** La vidriera, ordenada por cercanía al equipo que mira (la propia primero). */
export async function fetchRivalPosts(
  viewerTeamId: string | null,
  filters: RivalPostFilters = {},
): Promise<RivalPost[]> {
  const { data, error } = await supabase.rpc('get_rival_posts', {
    p_viewer_team_id: viewerTeamId ?? undefined,
    p_zone: filters.zone ?? undefined,
    p_format: filters.format ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map(mapRivalPostRow);
}

/** La publicación vigente de un equipo, o `null` si no tiene. */
export async function fetchTeamRivalPost(
  teamId: string,
  viewerTeamId: string | null = null,
): Promise<RivalPost | null> {
  const { data, error } = await supabase.rpc('get_rival_posts', {
    p_only_team_id: teamId,
    p_viewer_team_id: viewerTeamId ?? undefined,
  });
  if (error) throw error;
  const row = data?.[0];
  return row ? mapRivalPostRow(row) : null;
}

/** Ids de los equipos con publicación vigente (punto verde del ranking). */
export async function fetchRivalPostTeamIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_rival_post_team_ids');
  if (error) throw error;
  return new Set((data ?? []) as string[]);
}

export interface PublishRivalPostResult {
  expiresAt: string;
  /** Equipos avisados. 0 al editar una publicación vigente. */
  alerted: number;
  isNew: boolean;
}

export async function publishRivalPost(draft: RivalPostDraft): Promise<PublishRivalPostResult> {
  const { data, error } = await supabase.rpc('publish_rival_post', toPublishParams(draft));
  if (error) throw error;
  const result = (data ?? {}) as { expiresAt?: string; alerted?: number; isNew?: boolean };
  return {
    expiresAt: result.expiresAt ?? '',
    alerted: Number(result.alerted ?? 0),
    isNew: Boolean(result.isNew),
  };
}

export async function closeRivalPost(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('close_rival_post', { p_team_id: teamId });
  if (error) throw error;
}

export async function fetchSuggestedRivals(teamId: string, limit = 10): Promise<SuggestedRival[]> {
  const { data, error } = await supabase.rpc('get_suggested_rivals', {
    p_team_id: teamId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map(mapSuggestedRivalRow);
}
