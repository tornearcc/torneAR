import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  closeRivalPost,
  fetchRivalPostTeamIds,
  fetchRivalPosts,
  fetchSuggestedRivals,
  fetchTeamRivalPost,
  publishRivalPost,
} from './rival-posts-api';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { rpc: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/supabase-storage', () => ({
  getSupabaseStorageUrl: (bucket: string, path: string) => `URL:${bucket}/${path}`,
}));

const postRow = {
  team_id: 't1',
  team_name: 'Deportivo Tolosa',
  shield_url: 'shields/t1.png',
  team_zone: 'Tolosa',
  category: 'HOMBRES',
  format: 'FUTBOL_7',
  days: [6, 0],
  time_slots: ['TARDE'],
  match_date: null,
  match_time: null,
  when_label: 'sáb y dom · tarde',
  post_zone: 'La Plata',
  venue_id: 'v1',
  venue_name: 'Complejo El Potrero',
  match_type_pref: 'AMBOS',
  note: 'Tenemos cancha',
  published_at: '2026-11-25T10:00:00Z',
  expires_at: '2026-12-02T10:00:00Z',
  alerted_count: 14,
  distance_km: 3.2,
  elo_rating: 1040,
  matches_played: 3,
  member_count: 8,
  is_own: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchRivalPosts', () => {
  it('llama a get_rival_posts con el equipo y los filtros, y mapea las filas', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [postRow], error: null });

    const posts = await fetchRivalPosts('viewer', { zone: 'La Plata' });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_rival_posts', {
      p_viewer_team_id: 'viewer',
      p_zone: 'La Plata',
      p_format: undefined,
    });
    expect(posts[0]).toMatchObject({
      teamId: 't1',
      shieldUrl: 'URL:shields/shields/t1.png',
      whenLabel: 'sáb y dom · tarde',
      venueName: 'Complejo El Potrero',
      distanceKm: 3.2,
      memberCount: 8,
      isOwn: false,
    });
  });

  it('propaga el error', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await expect(fetchRivalPosts(null)).rejects.toThrow('boom');
  });
});

describe('fetchTeamRivalPost', () => {
  it('pide la de un solo equipo y devuelve null si no tiene', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(fetchTeamRivalPost('t9')).resolves.toBeNull();
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_rival_posts', {
      p_only_team_id: 't9',
      p_viewer_team_id: undefined,
    });
  });
});

describe('fetchRivalPostTeamIds', () => {
  it('devuelve un Set', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: ['a', 'b'], error: null });
    const ids = await fetchRivalPostTeamIds();
    expect(ids.has('a')).toBe(true);
    expect(ids.size).toBe(2);
  });
});

describe('publishRivalPost y closeRivalPost', () => {
  it('publica con los parámetros del borrador y devuelve cuántos equipos avisó', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: { expiresAt: '2026-12-02T10:00:00Z', alerted: 4, isNew: true },
      error: null,
    });

    const result = await publishRivalPost({
      teamId: 't1', format: 'FUTBOL_7', mode: 'DAYS', days: [6], timeSlots: [],
      matchDate: null, matchTime: null, zone: 'La Plata', venueId: null,
      matchTypePref: 'AMISTOSO', note: '',
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('publish_rival_post', {
      p_team_id: 't1', p_format: 'FUTBOL_7', p_zone: 'La Plata',
      p_days: [6], p_time_slots: [], p_match_type_pref: 'AMISTOSO',
    });
    expect(result).toEqual({ expiresAt: '2026-12-02T10:00:00Z', alerted: 4, isNew: true });
  });

  it('cierra la publicación del equipo', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: null });
    await closeRivalPost('t1');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('close_rival_post', { p_team_id: 't1' });
  });
});

describe('fetchSuggestedRivals', () => {
  it('mapea score y motivos', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{
        team_id: 't2', team_name: 'Unión Gonnet', shield_url: null, zone: 'Gonnet',
        preferred_format: 'FUTBOL_7', elo_rating: 1000, matches_played: 0, member_count: 5,
        distance_km: '6.1', has_rival_post: true, rival_post_when: 'mié · noche',
        last_active_at: null, score: '1.2345', reasons: ['Busca rival · mié · noche', 'Nivel parecido'],
      }],
      error: null,
    });

    const [rival] = await fetchSuggestedRivals('mine', 3);

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_suggested_rivals', { p_team_id: 'mine', p_limit: 3 });
    expect(rival).toMatchObject({
      teamId: 't2', shieldUrl: null, distanceKm: 6.1, score: 1.2345, hasRivalPost: true,
      reasons: ['Busca rival · mié · noche', 'Nivel parecido'],
    });
  });
});
