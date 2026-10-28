import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { imageIndexFromId, isUrgentPost, filterPostsByDay, sortPostsByNearest, filterActiveTeamPostsBySchedule, isTeamPostScheduleActive, resolveApplicantTeam, getInitials, captainOnlyNotice } from './market-utils';
import type { ManagedTeam, MarketTeamPost } from './market-api';

describe('imageIndexFromId', () => {
  it('returns 0, 1, or 2', () => {
    const indices = ['abc', 'def', 'xyz', '123', 'uuid-style-id'].map(imageIndexFromId);
    indices.forEach(i => expect(i).toBeGreaterThanOrEqual(0));
    indices.forEach(i => expect(i).toBeLessThanOrEqual(2));
  });

  it('returns same value for the same id', () => {
    expect(imageIndexFromId('test-id')).toBe(imageIndexFromId('test-id'));
  });
});

describe('isUrgentPost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns true when matchDate equals today', () => {
    expect(isUrgentPost('2026-03-24')).toBe(true);
  });

  it('returns false for a future date', () => {
    expect(isUrgentPost('2026-03-25')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isUrgentPost(null)).toBe(false);
  });

  it('returns false for freetext (non-ISO)', () => {
    expect(isUrgentPost('Viernes')).toBe(false);
  });
});

describe('filterPostsByDay', () => {
  const posts = [
    { id: '1', match_date: '2026-03-23' }, // Monday
    { id: '2', match_date: '2026-03-26' }, // Thursday
    { id: '3', match_date: null },
    { id: '4', match_date: 'Viernes' },     // freetext
  ] as unknown as MarketTeamPost[];

  it('returns all posts when selectedDays is empty', () => {
    expect(filterPostsByDay(posts, [])).toHaveLength(4);
  });

  it('returns posts matching selected day + null dates', () => {
    const result = filterPostsByDay(posts, ['Lunes']);
    expect(result.map(p => p.id)).toEqual(['1', '3', '4']);
  });

  it('supports multiple days', () => {
    const result = filterPostsByDay(posts, ['Lunes', 'Jueves']);
    expect(result.map(p => p.id)).toEqual(['1', '2', '3', '4']);
  });
});

describe('sortPostsByNearest', () => {
  const posts = [
    { id: 'a', match_date: '2026-04-01' },
    { id: 'b', match_date: null },
    { id: 'c', match_date: '2026-03-25' },
    { id: 'd', match_date: 'Viernes' },
  ] as unknown as MarketTeamPost[];

  it('sorts ISO dates ascending, nulls/freetext last', () => {
    const sorted = sortPostsByNearest(posts);
    expect(sorted[0].id).toBe('c');
    expect(sorted[1].id).toBe('a');
    // null/freetext at end
    expect(['b', 'd']).toContain(sorted[2].id);
    expect(['b', 'd']).toContain(sorted[3].id);
  });
});

describe('getInitials', () => {
  it('returns first letters of first two words', () => {
    expect(getInitials('Los Pumas FC')).toBe('LP');
    expect(getInitials('Juan Perez')).toBe('JP');
  });

  it('returns first two chars for single-word names', () => {
    expect(getInitials('Tigre')).toBe('TI');
  });

  it('uppercases the result', () => {
    expect(getInitials('los pumas')).toBe('LP');
  });

  it('handles empty string', () => {
    expect(getInitials('')).toBe('?');
  });
});

describe('filterActiveTeamPostsBySchedule', () => {
  it('filters out posts with expired match date and time', () => {
    const now = new Date('2026-03-25T18:00:00');
    const posts = [
      { id: 'expired-datetime', match_date: '2026-03-25', match_time: '17:59' },
      { id: 'active-datetime', match_date: '2026-03-25', match_time: '18:00' },
      { id: 'future-datetime', match_date: '2026-03-25', match_time: '19:30' },
    ] as unknown as MarketTeamPost[];

    const result = filterActiveTeamPostsBySchedule(posts, now);
    expect(result.map((p) => p.id)).toEqual(['active-datetime', 'future-datetime']);
  });

  it('keeps date-only posts for the whole selected day and removes past days', () => {
    const now = new Date('2026-03-25T18:00:00');
    const posts = [
      { id: 'past-day', match_date: '2026-03-24', match_time: null },
      { id: 'today-day-only', match_date: '2026-03-25', match_time: null },
      { id: 'future-day', match_date: '2026-03-26', match_time: null },
    ] as unknown as MarketTeamPost[];

    const result = filterActiveTeamPostsBySchedule(posts, now);
    expect(result.map((p) => p.id)).toEqual(['today-day-only', 'future-day']);
  });

  it('keeps posts without valid schedule metadata', () => {
    const now = new Date('2026-03-25T18:00:00');
    const posts = [
      { id: 'no-date', match_date: null, match_time: null },
      { id: 'invalid-date', match_date: 'Viernes', match_time: '12:00' },
      { id: 'invalid-time', match_date: '2026-03-25', match_time: '99:99' },
    ] as unknown as MarketTeamPost[];

    const result = filterActiveTeamPostsBySchedule(posts, now);
    expect(result.map((p) => p.id)).toEqual(['no-date', 'invalid-date', 'invalid-time']);
  });
});

describe('resolveApplicantTeam (M7)', () => {
  const managed: ManagedTeam[] = [
    { id: 'team-cap', name: 'Los Capitanes' },
    { id: 'team-sub', name: 'Los Subcapitanes' },
  ];

  it('usa el equipo activo cuando el usuario lo gestiona', () => {
    expect(resolveApplicantTeam(managed, 'team-sub')).toEqual(managed[1]);
  });

  // El caso del hallazgo: el activo del store es uno donde es sólo JUGADOR, así
  // que no está en managedTeams y la policy de INSERT lo habría rebotado.
  it('cae en un equipo gestionado cuando el activo no lo es', () => {
    expect(resolveApplicantTeam(managed, 'team-donde-es-jugador')).toEqual(managed[0]);
  });

  it('prefiere el equipo preferido de la pantalla antes que el primero', () => {
    expect(resolveApplicantTeam(managed, 'team-donde-es-jugador', 'team-sub')).toEqual(managed[1]);
  });

  it('ignora un preferido que tampoco gestiona', () => {
    expect(resolveApplicantTeam(managed, null, 'team-ajeno')).toEqual(managed[0]);
  });

  it('devuelve null si no gestiona ningún equipo: la pantalla bloquea la acción', () => {
    expect(resolveApplicantTeam([], 'team-donde-es-jugador')).toBeNull();
  });
});

describe('isTeamPostScheduleActive (M8)', () => {
  const now = new Date('2026-03-25T18:00:00');

  it('rechaza un partido cuya hora ya pasó hoy', () => {
    expect(isTeamPostScheduleActive({ match_date: '2026-03-25', match_time: '17:00' }, now)).toBe(false);
  });

  it('acepta un partido de hoy más tarde', () => {
    expect(isTeamPostScheduleActive({ match_date: '2026-03-25', match_time: '21:00' }, now)).toBe(true);
  });

  it('acepta un post sin fecha: no hay agenda que vencer', () => {
    expect(isTeamPostScheduleActive({ match_date: null, match_time: null }, now)).toBe(true);
  });
});

describe('captainOnlyNotice', () => {
  // app_logs 27/10: gente sin equipo tocaba «Contactar» varias veces seguidas y
  // el aviso no le ofrecía ninguna salida.
  it('sin equipo: invita a crear uno', () => {
    const notice = captainOnlyNotice(false);
    expect(notice.title).toBe('Necesitás un equipo');
    expect(notice.offerCreateTeam).toBe(true);
  });

  it('con equipo pero sin ser capitán ni subcapitán: no ofrece crear otro', () => {
    const notice = captainOnlyNotice(true);
    expect(notice.offerCreateTeam).toBe(false);
    expect(notice.message).toContain('capitán');
  });
});
