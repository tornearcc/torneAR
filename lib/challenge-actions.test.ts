import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import {
  sendChallenge,
  acceptChallengeWithNotification,
  updateChallengeStatus,
  cancelChallenge,
  getActiveChallengeWithTeam,
  fetchChallengesInbox,
  getChallengeErrorMessage,
  isChallengeRuleRejection,
} from './challenge-actions';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));
// El DAL usa supabase.rpc() tipado; el alias conserva legible el resto del archivo.
const supabaseRpcMock = supabaseMock.rpc;

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/lib/supabase-storage', () => ({
  getSupabaseStorageUrl: (bucket: string, path: string) => `URL:${bucket}/${path}`,
}));

// El módulo real importa `react-native` (Platform), que no existe en el runtime
// `node` de este proyecto de tests. Se moquea la superficie pública completa.
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // notifyTeamLeaders es fire-and-forget: por defecto no hace nada (team_members vacío).
  supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }));
});

describe('sendChallenge', () => {
  it('llama a send_challenge con los parámetros correctos y devuelve el resultado', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: { challengeId: 'c1', eloDiffWarning: true },
      error: null,
    });

    const result = await sendChallenge('teamA', 'teamB', 'RANKING');

    expect(supabaseRpcMock).toHaveBeenCalledWith('send_challenge', {
      p_from_team_id: 'teamA',
      p_to_team_id: 'teamB',
      p_match_type: 'RANKING',
    });
    expect(result).toEqual({ challengeId: 'c1', eloDiffWarning: true });
  });

  it('propaga el error del RPC (ej. cooldown o anti-farming rechazado en el backend)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('cooldown activo') });

    await expect(sendChallenge('teamA', 'teamB', 'RANKING')).rejects.toThrow('cooldown activo');
  });

  it('propaga el rechazo por partido de ranking sin resolver contra el mismo rival', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('RANKING_MATCH_ACTIVE: ya hay un partido de ranking sin resolver contra este equipo.'),
    });

    await expect(sendChallenge('teamA', 'teamB', 'RANKING')).rejects.toThrow('RANKING_MATCH_ACTIVE');
  });
});

describe('getChallengeErrorMessage', () => {
  // El caso que motiva el código: send_challenge rechaza el desafío de ranking
  // porque el par ya tiene un partido sin resolver (PENDIENTE / CONFIRMADO /
  // EN_VIVO / EN_DISPUTA). El usuario tiene que entender qué hacer, no leer el
  // texto del RAISE EXCEPTION.
  it('traduce RANKING_MATCH_ACTIVE a un mensaje accionable', () => {
    const error = new Error(
      'RANKING_MATCH_ACTIVE: ya hay un partido de ranking sin resolver contra este equipo.',
    );

    const message = getChallengeErrorMessage(error);

    expect(message).toBe(
      'Ya tenés un partido de ranking sin resolver contra este equipo. Jugalo y cargá el resultado antes de volver a desafiarlos.',
    );
    // Nunca el texto crudo del servidor, ni el código pelado.
    expect(message).not.toContain('RANKING_MATCH_ACTIVE');
  });

  it('traduce los otros códigos de las RPCs de desafío', () => {
    expect(getChallengeErrorMessage(new Error('TEAM_INACTIVE: ese equipo está dado de baja.')))
      .toContain('dado de baja');
    expect(getChallengeErrorMessage(new Error('TEAM_NOT_FOUND: alguno de los equipos no existe')))
      .toContain('No encontramos');
  });

  it('deja pasar los mensajes de dominio que ya vienen redactados', () => {
    // Sin prefijo de código: el texto de la RPC es la explicación. Mandarlo al
    // traductor genérico lo reemplazaría por "No se pudo completar la operación".
    const cooldown = 'Deben pasar 30 días desde el último partido de ranking entre estos equipos.';

    expect(getChallengeErrorMessage(new Error(cooldown))).toBe(cooldown);
  });

  it('usa el traductor genérico para los errores técnicos', () => {
    expect(getChallengeErrorMessage(new Error('Network request failed')))
      .toContain('No hay conexion con el servidor');
    expect(getChallengeErrorMessage(new Error('new row violates row-level security policy')))
      .toContain('No tienes permisos');
  });

  it('cae al fallback cuando el error no trae mensaje', () => {
    expect(getChallengeErrorMessage({}, 'No se pudo enviar el desafío.')).toBe(
      'No se pudo enviar el desafío.',
    );
  });
});

describe('isChallengeRuleRejection', () => {
  // Forma real del error que devuelve supabase-js cuando una RPC hace
  // RAISE EXCEPTION: el SQLSTATE de plpgsql sin código explícito es P0001.
  const rpcError = (message: string, code = 'P0001') => ({
    code,
    details: null,
    hint: null,
    message,
  });

  it('reconoce los frenos de negocio por el SQLSTATE P0001', () => {
    expect(
      isChallengeRuleRejection(
        rpcError('RANKING_MATCH_ACTIVE: ya hay un partido de ranking sin resolver contra este equipo.'),
      ),
    ).toBe(true);

    // Los que no llevan prefijo de código también entran: lo que los define es
    // el P0001, no el texto.
    expect(
      isChallengeRuleRejection(
        rpcError('Deben pasar 30 días desde el último partido de ranking entre estos equipos.'),
      ),
    ).toBe(true);
    expect(isChallengeRuleRejection(rpcError('Máximo 3 partidos de ranking por temporada entre los mismos equipos.'))).toBe(true);
  });

  it('NO marca como regla de negocio a las fallas del sistema', () => {
    // Unique violation, RLS y red: esos sí tienen que seguir siendo `error`.
    expect(isChallengeRuleRejection(rpcError('duplicate key value violates unique constraint', '23505'))).toBe(false);
    expect(isChallengeRuleRejection(rpcError('new row violates row-level security policy', '42501'))).toBe(false);
    expect(isChallengeRuleRejection(new Error('Network request failed'))).toBe(false);
    expect(isChallengeRuleRejection(null)).toBe(false);
    expect(isChallengeRuleRejection('boom')).toBe(false);
  });

  it('cae al prefijo de dominio si se perdió el `code` en el camino', () => {
    // Un wrapper que sólo conserva el mensaje sigue siendo reconocible.
    expect(
      isChallengeRuleRejection(new Error('RANKING_MATCH_ACTIVE: ya hay un partido sin resolver.')),
    ).toBe(true);
    expect(isChallengeRuleRejection(new Error('TEAM_INACTIVE: ese equipo está dado de baja.'))).toBe(true);
  });
});

describe('acceptChallengeWithNotification', () => {
  it('llama a accept_challenge con p_challenge_id y devuelve matchId/conversationId', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: { matchId: 'm1', conversationId: 'conv1' },
      error: null,
    });

    const result = await acceptChallengeWithNotification('c1', 'teamFrom');

    expect(supabaseRpcMock).toHaveBeenCalledWith('accept_challenge', { p_challenge_id: 'c1' });
    expect(result).toEqual({ matchId: 'm1', conversationId: 'conv1' });
  });

  it('propaga el error del RPC (ej. usuario no autorizado del equipo receptor)', async () => {
    supabaseRpcMock.mockResolvedValueOnce({ data: null, error: new Error('No autorizado') });

    await expect(acceptChallengeWithNotification('c1', 'teamFrom')).rejects.toThrow('No autorizado');
  });

  // La guarda de partido de ranking activo vive también en accept_challenge:
  // entre el envío del desafío y su aceptación pueden pasar días.
  it('propaga el rechazo por partido de ranking sin resolver', async () => {
    supabaseRpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('RANKING_MATCH_ACTIVE: ya hay un partido de ranking sin resolver contra este equipo.'),
    });

    await expect(acceptChallengeWithNotification('c1', 'teamFrom')).rejects.toThrow(
      'RANKING_MATCH_ACTIVE',
    );
  });
});

describe('updateChallengeStatus / cancelChallenge', () => {
  it('updateChallengeStatus arma el update({status}).eq(id) correcto', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await updateChallengeStatus('c1', 'RECHAZADA');

    expect(supabaseMock.from).toHaveBeenCalledWith('challenges');
    expect(builder.update).toHaveBeenCalledWith({ status: 'RECHAZADA' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('cancelChallenge siempre manda status CANCELADA', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await cancelChallenge('c1');

    expect(builder.update).toHaveBeenCalledWith({ status: 'CANCELADA' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('propaga el error si la RLS rechaza el update', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('row-level security violation') }),
    );

    await expect(updateChallengeStatus('c1', 'RECHAZADA')).rejects.toThrow(
      'row-level security violation',
    );
  });
});

describe('getActiveChallengeWithTeam', () => {
  it('arma el filtro or() simétrico entre los dos equipos', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await getActiveChallengeWithTeam('teamA', 'teamB');

    expect(builder.eq).toHaveBeenCalledWith('status', 'ENVIADA');
    expect(builder.or).toHaveBeenCalledWith(
      'and(from_team_id.eq.teamA,to_team_id.eq.teamB),and(from_team_id.eq.teamB,to_team_id.eq.teamA)',
    );
  });

  it('devuelve true cuando hay al menos un desafío activo', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: [{ id: 'c1' }], error: null }));
    expect(await getActiveChallengeWithTeam('teamA', 'teamB')).toBe(true);
  });

  it('devuelve false cuando no hay ninguno', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));
    expect(await getActiveChallengeWithTeam('teamA', 'teamB')).toBe(false);
  });
});

describe('fetchChallengesInbox', () => {
  it('mapea snake_case a camelCase y arma la URL del escudo sólo si hay opponent_shield_url', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [
        {
          challenge_id: 'c1',
          created_at: '2026-07-01T00:00:00Z',
          status: 'ENVIADA',
          match_type: 'RANKING',
          direction: 'RECIBIDO',
          opponent_team_id: 'teamB',
          opponent_team_name: 'Rivales FC',
          opponent_shield_url: 'teamB/shield.png',
          opponent_elo: 1100,
          creator_name: 'Juan',
        },
        {
          challenge_id: 'c2',
          created_at: '2026-07-02T00:00:00Z',
          status: 'ENVIADA',
          match_type: 'AMISTOSO',
          direction: 'ENVIADO',
          opponent_team_id: 'teamC',
          opponent_team_name: 'Otro Equipo',
          opponent_shield_url: null,
          opponent_elo: 950,
          creator_name: 'Ana',
        },
      ],
      error: null,
    });

    const result = await fetchChallengesInbox('teamA');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_team_challenges_inbox', {
      p_team_id: 'teamA',
    });
    expect(result[0]).toMatchObject({
      challengeId: 'c1',
      opponentTeamId: 'teamB',
      opponentShieldUrl: 'URL:shields/teamB/shield.png',
    });
    expect(result[1].opponentShieldUrl).toBeNull();
  });

  it('propaga el error del RPC', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: new Error('rpc falló') });
    await expect(fetchChallengesInbox('teamA')).rejects.toThrow('rpc falló');
  });
});
