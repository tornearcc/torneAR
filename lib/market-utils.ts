import type { ManagedTeam, MarketTeamPost } from './market-api';

const PITCH_META_RE = /^\[\[pitch:((?:FUTBOL_)?(?:5|6|7|8|9|11)|F(?:5|6|7|8|9|11))\]\]\s*/i;

// Deterministic index 0-2 from a UUID-like string
export function imageIndexFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 3;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns true when matchDate is today in YYYY-MM-DD format
export function isUrgentPost(matchDate: string | null | undefined): boolean {
  if (!matchDate || !ISO_DATE_RE.test(matchDate)) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return matchDate === today;
}

const DAY_MAP: Record<number, string> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves', 5: 'Viernes', 6: 'Sábado',
};

// Keeps posts whose match_date falls on a selected weekday.
// Posts with null or non-ISO dates are kept (can't determine day, don't exclude).
export function filterPostsByDay(posts: MarketTeamPost[], selectedDays: string[]): MarketTeamPost[] {
  if (selectedDays.length === 0) return posts;
  return posts.filter(post => {
    if (!post.match_date || !ISO_DATE_RE.test(post.match_date)) return true;
    const dayName = DAY_MAP[new Date(post.match_date + 'T00:00:00').getDay()];
    return selectedDays.includes(dayName);
  });
}

// Sorts posts by match_date ASC; non-ISO and null dates go last.
export function sortPostsByNearest(posts: MarketTeamPost[]): MarketTeamPost[] {
  return [...posts].sort((a, b) => {
    const aValid = a.match_date && ISO_DATE_RE.test(a.match_date);
    const bValid = b.match_date && ISO_DATE_RE.test(b.match_date);
    if (aValid && bValid) return a.match_date!.localeCompare(b.match_date!);
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });
}

export function extractPitchTypeMeta(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(PITCH_META_RE);
  if (!match) return null;
  const raw = match[1].toUpperCase();
  if (raw.startsWith('FUTBOL_')) return raw;
  if (/^F\d+$/.test(raw)) return `FUTBOL_${raw.slice(1)}`;
  return null;
}

export function sanitizeMarketDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const cleaned = description.replace(PITCH_META_RE, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseMatchDateTime(matchDate?: string | null, matchTime?: string | null): Date | null {
  if (!matchDate || !ISO_DATE_RE.test(matchDate)) return null;

  const baseDate = new Date(`${matchDate}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return null;

  if (!matchTime) return baseDate;

  const match = matchTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return baseDate;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return baseDate;
  }

  const withTime = new Date(baseDate);
  withTime.setHours(hours, minutes, 0, 0);
  return withTime;
}

function hasValidMatchTime(matchTime?: string | null): boolean {
  if (!matchTime) return false;
  const match = matchTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return !Number.isNaN(hours) && !Number.isNaN(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function getInitials(name: string): string {
  if (!name.trim()) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * ¿La fecha/hora del post sigue en el futuro?
 * - Con match_date + match_time: vigente si el datetime >= ahora.
 * - Sólo con match_date: vigente hasta el final de ese día.
 * - Sin match_date válida: vigente (no hay agenda que vencer).
 *
 * M8: esta era la regla que usaba el listado para esconder posts vencidos, pero
 * vivía enterrada dentro del `filter`. Extraerla permite aplicar exactamente el
 * mismo criterio en `applyToTeamPost` — si el listado y la postulación usaran
 * reglas distintas, el usuario vería un post que no puede postularse (o al
 * revés) sin ninguna explicación.
 */
export function isTeamPostScheduleActive(
  post: { match_date?: string | null; match_time?: string | null },
  now = new Date(),
): boolean {
  const parsed = parseMatchDateTime(post.match_date, post.match_time);
  if (!parsed) return true;

  if (hasValidMatchTime(post.match_time)) {
    return parsed.getTime() >= now.getTime();
  }

  const endOfDay = new Date(parsed);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() >= now.getTime();
}

// Keeps only active posts relative to current time when they include match date/time metadata.
export function filterActiveTeamPostsBySchedule(posts: MarketTeamPost[], now = new Date()): MarketTeamPost[] {
  return posts.filter((post) => isTeamPostScheduleActive(post, now));
}

/**
 * M7 — Elige con qué equipo se postula el usuario a un post de jugador.
 *
 * `managedTeams` ya viene filtrado por `fetchUserManagedTeams` a los equipos
 * donde es CAPITAN/SUBCAPITAN: es la única lista con la que la policy
 * `market_player_post_applications_insert` deja insertar. El equipo activo del
 * store, en cambio, puede ser uno donde el usuario es sólo JUGADOR — usarlo
 * hacía que el INSERT rebotara por RLS.
 *
 * Prioridad: equipo activo (si lo gestiona) → preferido (el que la pantalla ya
 * venía mostrando) → primero gestionado. `null` = no gestiona ninguno, la
 * pantalla tiene que bloquear la acción antes de tocar la base.
 */
export function resolveApplicantTeam(
  managedTeams: ManagedTeam[],
  activeTeamId: string | null,
  preferredTeamId?: string | null,
): ManagedTeam | null {
  if (managedTeams.length === 0) return null;
  return (
    managedTeams.find((team) => team.id === activeTeamId) ??
    managedTeams.find((team) => team.id === preferredTeamId) ??
    managedTeams[0]
  );
}

/**
 * Aviso para las acciones del Mercado que exigen ser CAPITAN o SUBCAPITAN
 * (contactar a un jugador, publicar como equipo). Quien no tiene equipo recibe
 * la salida de crear uno: antes el aviso era un callejón sin salida y lo
 * tocaban varias veces seguidas (app_logs, 27/10).
 */
export function captainOnlyNotice(hasTeam: boolean): {
  title: string;
  message: string;
  offerCreateTeam: boolean;
} {
  if (!hasTeam) {
    return {
      title: 'Necesitás un equipo',
      message: 'Para contactar jugadores y publicar como equipo tenés que tener uno. Armalo en un minuto y sumá a tus amigos.',
      offerCreateTeam: true,
    };
  }
  return {
    title: 'Solo capitanes',
    message: 'Esto lo puede hacer el capitán o el subcapitán de tu equipo. Pedile que te nombre subcapitán desde la gestión del equipo.',
    offerCreateTeam: false,
  };
}
