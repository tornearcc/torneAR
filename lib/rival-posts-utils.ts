import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import type { Database } from '@/types/supabase';

/**
 * «Buscan rival» (P3-19, D-76) — lógica pura del formulario y de la vidriera.
 *
 * Separada de `rival-posts-api.ts` para poder testearla sin moquear Supabase.
 * Lo que decide quién ve qué vive en Postgres (`publish_rival_post`,
 * `get_rival_posts`, `get_suggested_rivals`): acá sólo se arma el pedido y se
 * traduce la respuesta a texto de pantalla.
 */

export type TeamFormat = Database['public']['Enums']['team_format'];
export type TimeSlot = 'MANANA' | 'TARDE' | 'NOCHE';
export type MatchTypePref = 'AMISTOSO' | 'RANKING' | 'AMBOS';

export const RIVAL_POST_NOTE_MAX_LENGTH = 140;

/** Días en el orden en que se muestran (lunes primero). `value` es Date.getDay(). */
export const WEEK_DAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: 'L', label: 'Lunes' },
  { value: 2, short: 'M', label: 'Martes' },
  { value: 3, short: 'M', label: 'Miércoles' },
  { value: 4, short: 'J', label: 'Jueves' },
  { value: 5, short: 'V', label: 'Viernes' },
  { value: 6, short: 'S', label: 'Sábado' },
  { value: 0, short: 'D', label: 'Domingo' },
];

export const TIME_SLOTS: { value: TimeSlot; label: string }[] = [
  { value: 'MANANA', label: 'Mañana' },
  { value: 'TARDE', label: 'Tarde' },
  { value: 'NOCHE', label: 'Noche' },
];

export const MATCH_TYPE_PREFS: { value: MatchTypePref; label: string }[] = [
  { value: 'AMBOS', label: 'Cualquiera' },
  { value: 'AMISTOSO', label: 'Amistoso' },
  { value: 'RANKING', label: 'Ranking' },
];

const MATCH_TYPE_CHIP: Record<MatchTypePref, string> = {
  AMBOS: 'Amistoso o ranking',
  AMISTOSO: 'Amistoso',
  RANKING: 'Ranking',
};

export function matchTypePrefLabel(pref: string): string {
  return MATCH_TYPE_CHIP[pref as MatchTypePref] ?? MATCH_TYPE_CHIP.AMBOS;
}

/** `FUTBOL_7` → `F7`. */
export function shortFormat(format: string): string {
  return format.replace('FUTBOL_', 'F');
}

/** `FUTBOL_7` → `Fútbol 7`. */
export function longFormat(format: string): string {
  return format.replace('FUTBOL_', 'Fútbol ');
}

/**
 * Distancia para mostrar. La calcula el servidor entre centros de zona (o
 * desde la cancha elegida), así que es aproximada: nunca con decimales.
 */
export function formatDistanceKm(km: number | null | undefined): string | null {
  if (km === null || km === undefined || Number.isNaN(km)) return null;
  if (km === 0) return 'En tu zona';
  if (km < 1) return 'a menos de 1 km';
  return `a ${Math.round(km)} km`;
}

/** «hace 2 h», «ayer», «hace 3 días». */
export function formatPublishedAgo(isoDate: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(isoDate).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return minutes <= 1 ? 'recién' : `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

/** «vence hoy», «vence mañana», «vence en 5 días». */
export function formatExpiresIn(isoDate: string, now: Date = new Date()): string {
  const days = Math.ceil((new Date(isoDate).getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return 'vence hoy';
  if (days === 1) return 'vence mañana';
  return `vence en ${days} días`;
}

const DAY_NAME_TO_INDEX: Record<string, number> = Object.fromEntries(
  WEEK_DAYS.map((day) => [day.label, day.value]),
);

/**
 * Filtro de días del Mercado aplicado a Buscan rival. El filtro trae nombres
 * («Sábado»); una publicación entra si alguno de sus días (o el día de su
 * fecha puntual) está elegido.
 */
export function filterRivalPostsByDay<T extends { days: number[]; matchDate: string | null }>(
  posts: T[],
  selectedDayNames: string[],
): T[] {
  if (selectedDayNames.length === 0) return posts;
  const wanted = new Set(
    selectedDayNames.map((name) => DAY_NAME_TO_INDEX[name]).filter((value) => value !== undefined),
  );
  return posts.filter((post) => {
    if (post.matchDate) {
      const [y, m, d] = post.matchDate.split('-').map(Number);
      return wanted.has(new Date(y, m - 1, d).getDay());
    }
    return post.days.some((day) => wanted.has(day));
  });
}

// ─── Formulario ───────────────────────────────────────────────────────────────

export type RivalPostMode = 'DAYS' | 'DATE';

export interface RivalPostDraft {
  teamId: string;
  format: TeamFormat | null;
  /** DAYS: días y franjas que suelen poder. DATE: un día puntual. */
  mode: RivalPostMode;
  days: number[];
  timeSlots: TimeSlot[];
  matchDate: Date | null;
  matchTime: Date | null;
  zone: string;
  venueId: string | null;
  matchTypePref: MatchTypePref;
  note: string;
}

/** Devuelve el primer problema del borrador, o `null` si se puede publicar. */
export function validateRivalPostDraft(draft: RivalPostDraft): string | null {
  if (!draft.format) return 'Elegí el formato.';
  if (draft.mode === 'DAYS' && draft.days.length === 0) return 'Elegí al menos un día.';
  if (draft.mode === 'DATE' && !draft.matchDate) return 'Elegí la fecha.';
  if (!draft.zone.trim()) return 'Elegí la zona.';
  if (draft.note.trim().length > RIVAL_POST_NOTE_MAX_LENGTH) {
    return `El mensaje puede tener hasta ${RIVAL_POST_NOTE_MAX_LENGTH} caracteres.`;
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha local del dispositivo como `YYYY-MM-DD` (sin pasar por UTC). */
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type PublishRivalPostParams =
  Database['public']['Functions']['publish_rival_post']['Args'];

/**
 * Arma los parámetros de `publish_rival_post`. En modo fecha no viajan días;
 * en modo días no viaja fecha. Las franjas viajan en los dos (con una hora
 * exacta el servidor las ignora al armar el texto). Lo que no viaja toma el
 * DEFAULT de la función (vacío o NULL).
 *
 * Se llama sólo con un borrador que pasó `validateRivalPostDraft`.
 */
export function toPublishParams(draft: RivalPostDraft): PublishRivalPostParams {
  const byDate = draft.mode === 'DATE' && draft.matchDate !== null;
  const note = draft.note.trim();
  const params: PublishRivalPostParams = {
    p_team_id: draft.teamId,
    p_format: draft.format ?? 'FUTBOL_5',
    p_zone: draft.zone,
    p_days: byDate ? [] : [...draft.days].sort((a, b) => a - b),
    p_time_slots: draft.timeSlots,
    p_match_type_pref: draft.matchTypePref,
  };
  if (byDate && draft.matchDate) {
    params.p_match_date = toLocalIsoDate(draft.matchDate);
    if (draft.matchTime) {
      params.p_match_time = `${pad(draft.matchTime.getHours())}:${pad(draft.matchTime.getMinutes())}`;
    }
  }
  if (draft.venueId) params.p_venue_id = draft.venueId;
  if (note.length > 0) params.p_note = note;
  return params;
}

// ─── Errores ──────────────────────────────────────────────────────────────────

const PASSTHROUGH_PREFIXES = ['RIVAL_POST_INVALID', 'TEAM_INACTIVE', 'No autorizado'];

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Los rechazos de `publish_rival_post` y `close_rival_post` ya vienen
 * redactados para el usuario después del prefijo: se muestra ese texto. El
 * resto (red, sesión, filtro de palabras) pasa por el traductor genérico.
 */
export function getRivalPostErrorMessage(
  error: unknown,
  fallback = 'No pudimos guardar la publicación. Probá de nuevo.',
): string {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (raw.startsWith(`${prefix}:`)) {
      const rest = raw.slice(prefix.length + 1).trim();
      return rest.length > 0 ? `${capitalize(rest)}.` : fallback;
    }
  }

  return getGenericSupabaseErrorMessage(error, fallback);
}
