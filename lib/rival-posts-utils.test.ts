import { describe, it, expect } from 'vitest';
import {
  filterRivalPostsByDay,
  formatDistanceKm,
  formatExpiresIn,
  formatPublishedAgo,
  getRivalPostErrorMessage,
  matchTypePrefLabel,
  shortFormat,
  toLocalIsoDate,
  toPublishParams,
  validateRivalPostDraft,
  type RivalPostDraft,
} from './rival-posts-utils';

const baseDraft: RivalPostDraft = {
  teamId: 'team-1',
  format: 'FUTBOL_7',
  mode: 'DAYS',
  days: [0, 6],
  timeSlots: ['TARDE'],
  matchDate: null,
  matchTime: null,
  zone: 'La Plata',
  venueId: null,
  matchTypePref: 'AMBOS',
  note: '',
};

describe('validateRivalPostDraft', () => {
  it('acepta un borrador completo por días', () => {
    expect(validateRivalPostDraft(baseDraft)).toBeNull();
  });

  it('pide formato, días, fecha y zona según el modo', () => {
    expect(validateRivalPostDraft({ ...baseDraft, format: null })).toBe('Elegí el formato.');
    expect(validateRivalPostDraft({ ...baseDraft, days: [] })).toBe('Elegí al menos un día.');
    expect(validateRivalPostDraft({ ...baseDraft, mode: 'DATE' })).toBe('Elegí la fecha.');
    expect(validateRivalPostDraft({ ...baseDraft, zone: '  ' })).toBe('Elegí la zona.');
  });

  it('en modo fecha no exige días', () => {
    expect(
      validateRivalPostDraft({ ...baseDraft, mode: 'DATE', days: [], matchDate: new Date(2026, 11, 5) }),
    ).toBeNull();
  });

  it('corta el mensaje en 140 caracteres', () => {
    expect(validateRivalPostDraft({ ...baseDraft, note: 'x'.repeat(141) })).toMatch(/140/);
  });
});

describe('toPublishParams', () => {
  it('por días: manda los días ordenados y no manda fecha', () => {
    const params = toPublishParams({ ...baseDraft, days: [6, 0, 3] });
    expect(params).toEqual({
      p_team_id: 'team-1',
      p_format: 'FUTBOL_7',
      p_zone: 'La Plata',
      p_days: [0, 3, 6],
      p_time_slots: ['TARDE'],
      p_match_type_pref: 'AMBOS',
    });
  });

  it('por fecha: manda fecha y hora locales y ningún día', () => {
    const params = toPublishParams({
      ...baseDraft,
      mode: 'DATE',
      matchDate: new Date(2026, 11, 5, 23, 30),
      matchTime: new Date(2026, 0, 1, 18, 5),
      venueId: 'venue-1',
      note: '  Tenemos cancha  ',
    });
    expect(params.p_days).toEqual([]);
    expect(params.p_match_date).toBe('2026-12-05');
    expect(params.p_match_time).toBe('18:05');
    expect(params.p_venue_id).toBe('venue-1');
    expect(params.p_note).toBe('Tenemos cancha');
  });

  it('un mensaje vacío no viaja', () => {
    expect(toPublishParams({ ...baseDraft, note: '   ' })).not.toHaveProperty('p_note');
  });
});

describe('textos', () => {
  it('formatDistanceKm', () => {
    expect(formatDistanceKm(null)).toBeNull();
    expect(formatDistanceKm(0)).toBe('En tu zona');
    expect(formatDistanceKm(0.4)).toBe('a menos de 1 km');
    expect(formatDistanceKm(5.2)).toBe('a 5 km');
  });

  it('formatPublishedAgo y formatExpiresIn', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    expect(formatPublishedAgo('2026-11-25T10:00:00Z', now)).toBe('hace 2 h');
    expect(formatPublishedAgo('2026-11-24T10:00:00Z', now)).toBe('ayer');
    expect(formatPublishedAgo('2026-11-25T11:59:30Z', now)).toBe('recién');
    expect(formatExpiresIn('2026-11-30T12:00:00Z', now)).toBe('vence en 5 días');
    expect(formatExpiresIn('2026-11-26T10:00:00Z', now)).toBe('vence mañana');
  });

  it('shortFormat, matchTypePrefLabel y toLocalIsoDate', () => {
    expect(shortFormat('FUTBOL_11')).toBe('F11');
    expect(matchTypePrefLabel('AMBOS')).toBe('Amistoso o ranking');
    expect(matchTypePrefLabel('RANKING')).toBe('Ranking');
    expect(toLocalIsoDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('filterRivalPostsByDay', () => {
  const posts = [
    { id: 'finde', days: [0, 6], matchDate: null },
    { id: 'miercoles', days: [3], matchDate: null },
    { id: 'fecha-sabado', days: [], matchDate: '2026-12-05' },
  ];

  it('sin días elegidos no filtra', () => {
    expect(filterRivalPostsByDay(posts, [])).toHaveLength(3);
  });

  it('cruza por días y por el día de la fecha puntual', () => {
    expect(filterRivalPostsByDay(posts, ['Sábado']).map((p) => p.id)).toEqual(['finde', 'fecha-sabado']);
    expect(filterRivalPostsByDay(posts, ['Miércoles']).map((p) => p.id)).toEqual(['miercoles']);
  });
});

describe('getRivalPostErrorMessage', () => {
  it('muestra el texto del servidor después del prefijo', () => {
    expect(getRivalPostErrorMessage({ message: 'RIVAL_POST_INVALID: elegí una zona de la lista' }))
      .toBe('Elegí una zona de la lista.');
    expect(getRivalPostErrorMessage({
      message: 'No autorizado: solo el capitán o subcapitán puede publicar que el equipo busca rival',
    })).toBe('Solo el capitán o subcapitán puede publicar que el equipo busca rival.');
  });

  it('lo que no reconoce cae al mensaje por defecto', () => {
    expect(getRivalPostErrorMessage({ message: 'algo raro' }, 'Fallback')).toBe('Fallback');
  });
});
