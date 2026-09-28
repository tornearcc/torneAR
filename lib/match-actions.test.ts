import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder, createStorageMock } from './test-utils/supabase-mock';
import {
  submitProposal,
  acceptProposal,
  rejectProposal,
  cancelProposal,
  getProposalErrorMessage,
  doCheckin,
  submitMatchResult,
  requestCancellation,
  respondToCancellationRequest,
  joinMatchAsGuest,
  submitDisputeVote,
  claimWo,
  ResultAlreadySubmittedError,
} from './match-actions';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    storage: { from: vi.fn() },
  },
}));
// El DAL usa supabase.rpc() tipado; el alias conserva legible el resto del archivo.
const supabaseRpcMock = supabaseMock.rpc;

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

// El módulo real importa `react-native` (Platform), que no existe en el runtime
// `node` de este proyecto de tests. Se moquea la superficie pública completa.
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const AUTH_USER = { id: 'auth-1' };
const PROFILE = { id: 'profile-1' };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
});

describe('submitProposal', () => {
  const formData = {
    format: 'FUTBOL_5' as const,
    matchType: 'RANKING' as const,
    scheduledAt: new Date('2026-08-01T15:00:00Z'),
    durationMinutes: 60,
    venueId: 'venue-1',
    location: null,
    signalAmount: null,
    totalCost: null,
  };

  it('lanza si no hay sesión activa', async () => {
    supabaseMock.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(submitProposal('m1', 'teamA', formData)).rejects.toThrow('No autenticado');
  });

  it('busca el profile por auth_user_id e inserta la propuesta con las columnas correctas', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from
      .mockReturnValueOnce(profileBuilder) // .from('profiles')
      .mockReturnValueOnce(insertBuilder); // .from('match_proposals')

    await submitProposal('m1', 'teamA', formData);

    expect(profileBuilder.eq).toHaveBeenCalledWith('auth_user_id', AUTH_USER.id);
    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'match_proposals');
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: 'm1',
        proposed_by: PROFILE.id,
        from_team_id: 'teamA',
        format: 'FUTBOL_5',
        match_type: 'RANKING',
        duration_minutes: 60,
        venue_id: 'venue-1',
      }),
    );
  });
});

describe('acceptProposal / rejectProposal / cancelProposal', () => {
  it('acceptProposal llama a confirm_match_proposal con los ids correctos', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await acceptProposal('prop1', 'm1');
    expect(supabaseRpcMock).toHaveBeenCalledWith('confirm_match_proposal', {
      p_proposal_id: 'prop1',
      p_match_id: 'm1',
    });
  });

  it('acceptProposal propaga el error si el invocador no es del equipo receptor', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('No autorizado') });
    await expect(acceptProposal('prop1', 'm1')).rejects.toThrow('No autorizado');
  });

  it('rejectProposal y cancelProposal actualizan status a RECHAZADA sobre match_proposals', async () => {
    const rejectBuilder = createQueryBuilder({ data: null, error: null });
    const cancelBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(rejectBuilder).mockReturnValueOnce(cancelBuilder);

    await rejectProposal('prop1');
    await cancelProposal('prop2');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(1, 'match_proposals');
    expect(rejectBuilder.update).toHaveBeenCalledWith({ status: 'RECHAZADA' });
    expect(rejectBuilder.eq).toHaveBeenCalledWith('id', 'prop1');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'match_proposals');
    expect(cancelBuilder.update).toHaveBeenCalledWith({ status: 'RECHAZADA' });
    expect(cancelBuilder.eq).toHaveBeenCalledWith('id', 'prop2');
  });
});

describe('doCheckin', () => {
  it('omite p_lat/p_lng cuando no hay coords (args opcionales: DEFAULT NULL server-side)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await doCheckin('m1', 'teamA');
    expect(supabaseRpcMock).toHaveBeenCalledWith('checkin_team', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_lat: undefined,
      p_lng: undefined,
    });
  });

  it('manda las coords cuando se proveen', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await doCheckin('m1', 'teamA', { lat: -34.6, lng: -58.4 });
    expect(supabaseRpcMock).toHaveBeenCalledWith('checkin_team', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_lat: -34.6,
      p_lng: -58.4,
    });
  });

  it('propaga el error del RPC (ej. fuera del geofence o equipo no autorizado)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('Fuera de rango') });
    await expect(doCheckin('m1', 'teamA')).rejects.toThrow('Fuera de rango');
  });

  // ─── D9: el check-in individual ya no sella al equipo ──────────────────────

  it('mapea el desenlace cuando el check-in completa el quórum', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: {
        checkedInPlayers: 4,
        minPlayers: 4,
        teamSealed: true,
        justSealed: true,
        matchStatus: 'EN_VIVO',
      },
      error: null,
    });

    await expect(doCheckin('m1', 'teamA')).resolves.toEqual({
      checkedInPlayers: 4,
      minPlayers: 4,
      teamSealed: true,
      justSealed: true,
      matchStatus: 'EN_VIVO',
      // Servidor sin las claves de F3 (o equipo no MIXTO): nada que reclamar.
      compositionOk: true,
      compositionMissing: null,
    });
  });

  it('F3: con el quórum alcanzado pero sin la composición mixta, informa cuántos faltan', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: {
        checkedInPlayers: 4,
        minPlayers: 4,
        teamSealed: false,
        justSealed: false,
        matchStatus: 'CONFIRMADO',
        compositionOk: false,
        compositionMissing: { male: 1, female: 0, total: 1 },
      },
      error: null,
    });

    await expect(doCheckin('m1', 'teamA')).resolves.toMatchObject({
      teamSealed: false,
      compositionOk: false,
      compositionMissing: { male: 1, female: 0, total: 1 },
    });
  });

  it('mapea el desenlace cuando todavía falta gente: el equipo NO queda presentado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: {
        checkedInPlayers: 1,
        minPlayers: 4,
        teamSealed: false,
        justSealed: false,
        matchStatus: 'CONFIRMADO',
      },
      error: null,
    });

    const result = await doCheckin('m1', 'teamA');
    expect(result.teamSealed).toBe(false);
    expect(result.minPlayers - result.checkedInPlayers).toBe(3);
  });

  // Defensivo: si la RPC vieja (RETURNS void) sigue desplegada, `data` viene
  // null. Sin este default el cliente rompía con "cannot read properties of
  // null" en vez de degradar a un check-in sin contadores.
  it('no rompe si la RPC no devuelve payload', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(doCheckin('m1', 'teamA')).resolves.toMatchObject({
      checkedInPlayers: 0,
      teamSealed: false,
      justSealed: false,
    });
  });
});

describe('submitMatchResult', () => {
  const formData = {
    goalsScored: 3,
    goalsAgainst: 1,
    scorers: [{ profileId: 'p1', goals: 2 }, { profileId: 'p2', goals: 1 }],
    mvpProfileId: 'p1',
  };

  it('arma el insert con los scorers en snake_case y el mvp_id', async () => {
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(profileBuilder).mockReturnValueOnce(insertBuilder);

    await submitMatchResult('m1', 'teamA', formData);

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      match_id: 'm1',
      team_id: 'teamA',
      submitted_by: PROFILE.id,
      goals_scored: 3,
      goals_against: 1,
      scorers: [
        { profile_id: 'p1', goals: 2 },
        { profile_id: 'p2', goals: 1 },
      ],
      mvp_id: 'p1',
    });
  });

  // Contrato invertido a propósito (bug 8, 2026-07-23): antes el 23505 se
  // tragaba como "reintento idempotente tras timeout de red", pero eso también
  // enmascaraba el doble envío real y la UI mostraba "Resultado cargado" dos
  // veces. Ahora se tipa para que la pantalla distinga ese caso y resincronice.
  it('convierte 23505 (unique_violation) en ResultAlreadySubmittedError', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '23505' } }));

    await expect(submitMatchResult('m1', 'teamA', formData)).rejects.toBeInstanceOf(
      ResultAlreadySubmittedError,
    );
  });

  it('relanza cualquier otro código de error', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(
        createQueryBuilder({ data: null, error: { code: '23503', message: 'fk violation' } }),
      );

    await expect(submitMatchResult('m1', 'teamA', formData)).rejects.toMatchObject({
      code: '23503',
    });
  });
});

describe('requestCancellation / joinMatchAsGuest / submitDisputeVote', () => {
  it('requestCancellation llama a request_match_cancellation con reason/notes (el partido no se cancela acá)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await requestCancellation('m1', 'teamA', { reason: 'MUTUO_ACUERDO', notes: 'ok' }, 'teamB');
    expect(supabaseRpcMock).toHaveBeenCalledWith('request_match_cancellation', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_reason: 'MUTUO_ACUERDO',
      p_notes: 'ok',
    });
  });

  it('requestCancellation propaga el error del RPC (ej. ya hay una solicitud pendiente)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('Ya existe una solicitud de cancelación pendiente'),
    });
    await expect(
      requestCancellation('m1', 'teamA', { reason: 'MUTUO_ACUERDO', notes: null }, 'teamB'),
    ).rejects.toThrow('Ya existe una solicitud de cancelación pendiente');
  });

  it('respondToCancellationRequest llama a respond_to_cancellation_request y devuelve el nuevo status', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: 'ACEPTADA', error: null });
    const result = await respondToCancellationRequest('req-1', true, 'teamA');
    expect(supabaseRpcMock).toHaveBeenCalledWith('respond_to_cancellation_request', {
      p_request_id: 'req-1',
      p_accept: true,
    });
    expect(result).toBe('ACEPTADA');
  });

  it('respondToCancellationRequest propaga el error (ej. la solicitud ya fue respondida)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('La solicitud ya fue respondida'),
    });
    await expect(respondToCancellationRequest('req-1', false, 'teamA')).rejects.toThrow(
      'La solicitud ya fue respondida',
    );
  });

  it('joinMatchAsGuest llama a join_match_as_guest con el código y el lado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: { matchId: 'm1', teamId: 'teamA', teamSide: 'A', teamAName: 'A', teamBName: 'B' },
      error: null,
    });
    const result = await joinMatchAsGuest('ABC123', 'A');
    expect(supabaseRpcMock).toHaveBeenCalledWith('join_match_as_guest', {
      p_unique_code: 'ABC123',
      p_team_side: 'A',
    });
    expect(result.matchId).toBe('m1');
  });

  it('submitDisputeVote llama a submit_dispute_vote con match y equipo votado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: null });
    await submitDisputeVote('m1', 'teamA');
    expect(supabaseRpcMock).toHaveBeenCalledWith('submit_dispute_vote', {
      p_match_id: 'm1',
      p_voted_team_id: 'teamA',
    });
  });

  // El test de `resolveMatchDispute` se eliminó con la función: la disputa la
  // cierra el cron `sweep_disputed_matches` a las 24 h y ya no hay ninguna
  // resolución disparable desde el cliente (migración 20260803150000).
});

describe('claimWo', () => {
  it('sube la foto y luego llama a la RPC claim_wo mapeando goleadores y MVP', async () => {
    supabaseMock.storage.from.mockReturnValue(
      createStorageMock({ data: { path: 'm1/teamA_123.jpg' }, error: null }).from('wo_evidences'),
    );
    supabaseRpcMock.mockResolvedValueOnce({ data: 'claim-1', error: null });

    await claimWo('m1', 'teamA', {
      reason: 'NO_PRESENTACION',
      photoBase64: Buffer.from('fake-image').toString('base64'),
      photoMimeType: 'image/jpeg',
      notes: null,
      scorers: [
        { profileId: 'p1', goals: 2 },
        { profileId: 'p2', goals: 1 },
      ],
      mvpProfileId: 'p1',
    });

    expect(supabaseMock.storage.from).toHaveBeenCalledWith('wo_evidences');
    expect(supabaseRpcMock).toHaveBeenCalledWith('claim_wo', {
      p_match_id: 'm1',
      p_team_id: 'teamA',
      p_reason: 'NO_PRESENTACION',
      p_photo_url: 'm1/teamA_123.jpg',
      p_scorers: [
        { profile_id: 'p1', goals: 2 },
        { profile_id: 'p2', goals: 1 },
      ],
      p_mvp_id: 'p1',
    });
  });

  it('envía scorers vacío y omite el mvp cuando no se cargan goleadores', async () => {
    supabaseMock.storage.from.mockReturnValue(
      createStorageMock({ data: { path: 'm1/teamA_123.jpg' }, error: null }).from('wo_evidences'),
    );
    supabaseRpcMock.mockResolvedValueOnce({ data: 'claim-2', error: null });

    await claimWo('m1', 'teamA', {
      reason: 'NO_PRESENTACION',
      photoBase64: Buffer.from('fake-image').toString('base64'),
      photoMimeType: 'image/jpeg',
      notes: null,
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'claim_wo',
      expect.objectContaining({ p_scorers: [], p_mvp_id: undefined }),
    );
  });

  it('propaga el error si falla el upload y no llama a la RPC', async () => {
    supabaseMock.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: new Error('upload falló') }),
    });

    await expect(
      claimWo('m1', 'teamA', {
        reason: 'ABANDONO',
        photoBase64: Buffer.from('fake-image').toString('base64'),
        photoMimeType: 'image/jpeg',
        notes: null,
      }),
    ).rejects.toThrow('upload falló');

    expect(supabaseRpcMock).not.toHaveBeenCalled(); // nunca llega a la RPC
  });
});

// ─── E1/D7/D8: mapper de errores de confirm_match_proposal ────────────────────

describe('getProposalErrorMessage', () => {
  it('conserva el detalle de SQUAD_TOO_SMALL (nombre del equipo y mínimo)', () => {
    const msg = getProposalErrorMessage({
      message: 'SQUAD_TOO_SMALL: Los Pibes tiene 3 jugador(es) y FUTBOL_11 necesita al menos 7 para presentarse',
    });

    // El detalle es el único lugar donde viaja A QUIÉN le falta gente.
    expect(msg).toContain('Los Pibes');
    expect(msg).toContain('7');
    expect(msg).not.toContain('SQUAD_TOO_SMALL');
  });

  it('mapea los códigos sin detalle a su mensaje estable', () => {
    expect(getProposalErrorMessage({ message: 'PROPOSAL_MATCH_MISMATCH: no pertenece' })).toContain(
      'no corresponde a este partido',
    );
    expect(getProposalErrorMessage({ message: 'INVALID_MATCH_STATUS: estado CANCELADO' })).toContain(
      'ya no está pendiente',
    );
  });

  it('F3: la composición mixta conserva el detalle del servidor', () => {
    expect(
      getProposalErrorMessage({
        message: 'MIXED_COMPOSITION: Los Pibes no cumple la composición mínima de un equipo mixto',
      }),
    ).toBe('Los Pibes no cumple la composición mínima de un equipo mixto.');
    expect(getProposalErrorMessage({ message: 'MIXED_COMPOSITION:' })).toContain('composición mínima');
  });

  it('deja pasar los mensajes en castellano que la RPC ya devolvía', () => {
    const autorizacion = 'No autorizado: solo el equipo receptor puede confirmar esta propuesta';
    expect(getProposalErrorMessage({ message: autorizacion })).toBe(autorizacion);
  });

  it('cae al genérico ante un error desconocido', () => {
    expect(getProposalErrorMessage({ message: 'boom' })).toBe(
      'No se pudo completar la operacion. Intentalo nuevamente.',
    );
  });

  // ─── D13: fecha vencida y choque de agenda ────────────────────────────────

  it('traduce PROPOSAL_DATE_IN_PAST', () => {
    const msg = getProposalErrorMessage({
      message: 'PROPOSAL_DATE_IN_PAST: la fecha propuesta (2020-01-01 20:00:00+00) ya pasó',
    });
    expect(msg).toContain('ya pasaron');
    expect(msg).not.toContain('PROPOSAL_DATE_IN_PAST');
  });

  // El nombre del equipo comprometido es lo que permite entender el choque:
  // sin él, "chocan los horarios" no dice de quién ni con qué.
  it('conserva el nombre del equipo en TEAM_SCHEDULE_CONFLICT', () => {
    const msg = getProposalErrorMessage({
      message: 'TEAM_SCHEDULE_CONFLICT: Los Pibes ya tiene un partido confirmado en ese horario',
    });
    expect(msg).toContain('Los Pibes');
    expect(msg).not.toContain('TEAM_SCHEDULE_CONFLICT');
  });
});
