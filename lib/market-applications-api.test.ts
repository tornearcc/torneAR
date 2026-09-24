import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryBuilder } from './test-utils/supabase-mock';
import {
  applyToTeamPost,
  applyToPlayerPost,
  fetchApplicationsForPost,
  fetchApplicationCounts,
  fetchMyMarketApplications,
  markApplicationsAsSeen,
  respondToApplication,
  MarketApplicationError,
  getMarketApplicationErrorMessage,
} from './market-applications-api';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

// El módulo real importa `react-native` (Platform), que no existe en el runtime
// `node` de este proyecto de tests. Se moquea la superficie pública completa.
vi.mock('@/lib/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// El builder de `createQueryBuilder` no simula `supabase.storage`; acá sólo
// interesa que el path se resuelva contra el bucket correcto (M4).
vi.mock('@/lib/supabase-storage', () => ({
  getSupabaseStorageUrl: (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`,
}));

const AUTH_USER = { id: 'auth-1' };
const PROFILE = { id: 'profile-1' };

// M8: post de equipo vigente — activo y con el partido lejos en el futuro.
const OPEN_TEAM_POST = { is_active: true, match_date: '2099-01-01', match_time: '20:00' };
const OPEN_PLAYER_POST = { is_active: true };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
  // notifyTeamLeaders/notifyProfile son fire-and-forget: por defecto no rompen nada.
  supabaseMock.from.mockReturnValue(createQueryBuilder({ data: [], error: null }));
});

describe('applyToTeamPost', () => {
  it('inserta la postulación con el profile resuelto', async () => {
    const postBuilder = createQueryBuilder({ data: OPEN_TEAM_POST, error: null });
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from
      .mockReturnValueOnce(postBuilder)
      .mockReturnValueOnce(profileBuilder)
      .mockReturnValueOnce(insertBuilder);

    await expect(applyToTeamPost('post-1', 'team-1')).resolves.toBe('CREADA');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(1, 'market_team_posts');
    expect(supabaseMock.from).toHaveBeenNthCalledWith(3, 'market_team_post_applications');
    expect(insertBuilder.insert).toHaveBeenCalledWith({ post_id: 'post-1', profile_id: PROFILE.id });
  });

  // M3: el duplicado ya no es un no-op mudo. Sigue sin ser un error —la
  // postulación existe—, pero la pantalla necesita poder decir "ya te habías
  // postulado" en vez de "¡enviada!" por segunda vez.
  it('distingue 23505 (ya postulado) devolviendo DUPLICADA', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: OPEN_TEAM_POST, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '23505' } }));

    await expect(applyToTeamPost('post-1', 'team-1')).resolves.toBe('DUPLICADA');
  });

  it('relanza cualquier otro error', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: OPEN_TEAM_POST, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '42501', message: 'rls' } }));

    await expect(applyToTeamPost('post-1', 'team-1')).rejects.toMatchObject({ code: '42501' });
  });

  // ─── M8: vigencia del post antes de tocar la tabla de postulaciones ────────

  it('rechaza el post cuya match_date ya pasó, sin insertar nada', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: { is_active: true, match_date: '2020-01-01', match_time: '20:00' },
        error: null,
      }),
    );

    await expect(applyToTeamPost('post-1', 'team-1')).rejects.toMatchObject({
      name: 'MarketApplicationError',
      code: 'POST_VENCIDO',
    });
    // La guarda corta antes de resolver el perfil: una sola query, cero INSERT.
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('rechaza el post ya cerrado (is_active = false)', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: { is_active: false, match_date: '2099-01-01', match_time: null }, error: null }),
    );

    await expect(applyToTeamPost('post-1', 'team-1')).rejects.toMatchObject({ code: 'POST_CERRADO' });
  });

  it('rechaza el post inexistente', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));

    await expect(applyToTeamPost('post-1', 'team-1')).rejects.toMatchObject({ code: 'POST_INEXISTENTE' });
  });

  it('acepta el post sin match_date: no hay agenda que vencer', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: { is_active: true, match_date: null, match_time: null }, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));

    await expect(applyToTeamPost('post-1', 'team-1')).resolves.toBe('CREADA');
  });
});

describe('applyToPlayerPost', () => {
  it('inserta la postulación con team_id y applicant_profile_id', async () => {
    const postBuilder = createQueryBuilder({ data: OPEN_PLAYER_POST, error: null });
    const profileBuilder = createQueryBuilder({ data: PROFILE, error: null });
    const insertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from
      .mockReturnValueOnce(postBuilder)
      .mockReturnValueOnce(profileBuilder)
      .mockReturnValueOnce(insertBuilder);

    await expect(applyToPlayerPost('post-2', 'team-1', 'owner-profile')).resolves.toBe('CREADA');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(1, 'market_player_posts');
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      post_id: 'post-2',
      team_id: 'team-1',
      applicant_profile_id: PROFILE.id,
    });
  });

  it('distingue 23505 devolviendo DUPLICADA', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: OPEN_PLAYER_POST, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: { code: '23505' } }));

    await expect(applyToPlayerPost('post-2', 'team-1', 'owner-profile')).resolves.toBe('DUPLICADA');
  });

  // M8: los posts de jugador no tienen match_date — la vigencia es is_active,
  // que es lo que apagan tanto el barrido de 14 días como el cierre de M5.
  it('rechaza el post de jugador ya cerrado, sin insertar nada', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: { is_active: false }, error: null }));

    await expect(applyToPlayerPost('post-2', 'team-1', 'owner-profile')).rejects.toMatchObject({
      code: 'POST_CERRADO',
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});

describe('getMarketApplicationErrorMessage', () => {
  // La razón de existir de MarketApplicationError: el traductor genérico
  // descarta el message y devuelve su fallback.
  it('conserva el texto de los errores de dominio', () => {
    const error = new MarketApplicationError('POST_VENCIDO', 'La fecha de este partido ya pasó.');
    expect(getMarketApplicationErrorMessage(error)).toBe('La fecha de este partido ya pasó.');
  });

  it('delega el resto en el traductor genérico de Supabase', () => {
    expect(getMarketApplicationErrorMessage({ message: 'row-level security policy' })).toBe(
      'No tienes permisos para realizar esta accion.',
    );
  });
});

describe('fetchApplicationsForPost', () => {
  it('mapea postulaciones a un post de EQUIPO — notifyProfileId y displayId son el profile del jugador', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: 'app-1',
            status: 'PENDIENTE',
            created_at: '2026-07-01T00:00:00Z',
            profile_id: 'player-1',
            profiles: { full_name: 'Juan', avatar_url: 'p/juan.jpg', preferred_position: 'DELANTERO' },
          },
        ],
        error: null,
      }),
    );

    const result = await fetchApplicationsForPost('post-1', 'TEAM');

    expect(result[0]).toEqual({
      id: 'app-1',
      status: 'PENDIENTE',
      createdAt: '2026-07-01T00:00:00Z',
      notifyProfileId: 'player-1',
      displayId: 'player-1',
      displayName: 'Juan',
      displayAvatarOrShieldUrl: 'p/juan.jpg',
      displaySubtitle: 'DELANTERO',
    });
  });

  it('mapea postulaciones a un post de JUGADOR — notifyProfileId es el capitán, displayId es el equipo', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: [
          {
            id: 'app-2',
            status: 'PENDIENTE',
            created_at: '2026-07-02T00:00:00Z',
            team_id: 'team-9',
            applicant_profile_id: 'captain-9',
            teams: { name: 'Equipo Rival', zone: 'CABA', shield_url: 't/shield.png' },
          },
        ],
        error: null,
      }),
    );

    const result = await fetchApplicationsForPost('post-2', 'PLAYER');

    expect(result[0]).toEqual({
      id: 'app-2',
      status: 'PENDIENTE',
      createdAt: '2026-07-02T00:00:00Z',
      notifyProfileId: 'captain-9',
      displayId: 'team-9',
      displayName: 'Equipo Rival',
      displayAvatarOrShieldUrl: 't/shield.png',
      displaySubtitle: 'CABA',
    });
  });
});

describe('fetchMyMarketApplications (M4)', () => {
  const TEAM_APP_ROW = {
    id: 'app-1',
    status: 'VISTA',
    created_at: '2026-07-02T00:00:00Z',
    post_id: 'post-1',
    market_team_posts: {
      is_active: true,
      position_wanted: 'ARQUERO',
      teams: { id: 'team-pibes', name: 'Los Pibes', zone: 'CABA', shield_url: 't/shield.png' },
    },
  };

  const PLAYER_APP_ROW = {
    id: 'app-2',
    status: 'RECHAZADA',
    created_at: '2026-07-01T00:00:00Z',
    post_id: 'post-2',
    teams: { name: 'Mi Equipo' },
    market_player_posts: {
      is_active: false,
      position: 'DELANTERO',
      profiles: { id: 'profile-juan', full_name: 'Juan', avatar_url: 'p/juan.jpg' },
    },
  };

  it('filtra por MI perfil en las dos tablas, con la columna que le corresponde a cada una', async () => {
    const teamBuilder = createQueryBuilder({ data: [TEAM_APP_ROW], error: null });
    const playerBuilder = createQueryBuilder({ data: [PLAYER_APP_ROW], error: null });
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(teamBuilder)
      .mockReturnValueOnce(playerBuilder);

    await fetchMyMarketApplications();

    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'market_team_post_applications');
    expect(teamBuilder.eq).toHaveBeenCalledWith('profile_id', PROFILE.id);
    expect(supabaseMock.from).toHaveBeenNthCalledWith(3, 'market_player_post_applications');
    // En posts de jugador el postulante viaja en `applicant_profile_id`: el
    // `profile_id` de esa tabla no existe (el que aplica es un equipo).
    expect(playerBuilder.eq).toHaveBeenCalledWith('applicant_profile_id', PROFILE.id);
  });

  it('mapea un post de EQUIPO: el objetivo es el equipo dueño del aviso', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [TEAM_APP_ROW], error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    const [entry] = await fetchMyMarketApplications();

    expect(entry).toEqual({
      id: 'app-1',
      status: 'VISTA',
      createdAt: '2026-07-02T00:00:00Z',
      postType: 'TEAM',
      postId: 'post-1',
      postIsActive: true,
      targetName: 'Los Pibes',
      targetId: 'team-pibes',
      targetImageUrl: 'https://cdn.test/shields/t/shield.png',
      targetSubtitle: 'Busca arquero',
      appliedWithTeamName: null,
    });
  });

  it('mapea un post de JUGADOR: el objetivo es el jugador, y se dice con qué equipo me postulé', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [PLAYER_APP_ROW], error: null }));

    const [entry] = await fetchMyMarketApplications();

    expect(entry).toEqual({
      id: 'app-2',
      status: 'RECHAZADA',
      createdAt: '2026-07-01T00:00:00Z',
      postType: 'PLAYER',
      postId: 'post-2',
      postIsActive: false,
      targetName: 'Juan',
      targetId: 'profile-juan',
      targetImageUrl: 'https://cdn.test/avatars/p/juan.jpg',
      targetSubtitle: 'DELANTERO',
      appliedWithTeamName: 'Mi Equipo',
    });
  });

  // Para el usuario "mis postulaciones" es una sola lista, aunque abajo sean
  // dos tablas que no se pueden ordenar juntas en la base.
  it('mezcla las dos fuentes ordenadas por fecha descendente', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [TEAM_APP_ROW], error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: [PLAYER_APP_ROW], error: null }));

    const result = await fetchMyMarketApplications();

    expect(result.map((r) => r.id)).toEqual(['app-1', 'app-2']);
  });

  it('sobrevive a un aviso borrado: el embed viene null y no rompe la lista', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(
        createQueryBuilder({
          data: [{ ...TEAM_APP_ROW, market_team_posts: null }],
          error: null,
        }),
      )
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    const [entry] = await fetchMyMarketApplications();

    expect(entry.targetName).toBe('Equipo');
    expect(entry.targetId).toBeNull();
    expect(entry.targetImageUrl).toBeNull();
    expect(entry.postIsActive).toBe(false);
  });

  it('propaga el error de cualquiera de las dos consultas', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: PROFILE, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: new Error('rls: mis apps') }))
      .mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    await expect(fetchMyMarketApplications()).rejects.toThrow('rls: mis apps');
  });
});

describe('fetchApplicationCounts', () => {
  it('devuelve {} sin consultar si no hay postIds', async () => {
    const result = await fetchApplicationCounts([], 'TEAM');
    expect(result).toEqual({});
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('agrega el conteo de postulaciones por post_id', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ post_id: 'post-1' }, { post_id: 'post-1' }, { post_id: 'post-2' }],
        error: null,
      }),
    );

    const result = await fetchApplicationCounts(['post-1', 'post-2'], 'TEAM');

    expect(supabaseMock.from).toHaveBeenCalledWith('market_team_post_applications');
    expect(result).toEqual({ 'post-1': 2, 'post-2': 1 });
  });
});

describe('respondToApplication', () => {
  it('actualiza el status en la tabla correcta según postType', async () => {
    const builder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    await respondToApplication('app-1', 'PLAYER', 'ACEPTADA', 'captain-9', 'post-2');

    expect(supabaseMock.from).toHaveBeenCalledWith('market_player_post_applications');
    expect(builder.update).toHaveBeenCalledWith({ status: 'ACEPTADA' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'app-1');
    // Un post de JUGADOR no da de alta a nadie: el aceptado es el equipo.
    expect(supabaseMock.from).not.toHaveBeenCalledWith('team_join_requests');
  });

  it('propaga el error del update', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('rls violation') }),
    );
    await expect(
      respondToApplication('app-1', 'TEAM', 'RECHAZADA', 'player-1', 'post-1'),
    ).rejects.toThrow('rls violation');
  });

  // ─── M1: aceptar una postulación de EQUIPO engancha con los traspasos ──────

  it('aceptar un post de EQUIPO crea la solicitud de unión ACEPTADA del jugador', async () => {
    const updateBuilder = createQueryBuilder({ data: null, error: null });
    const postBuilder = createQueryBuilder({ data: { team_id: 'team-7' }, error: null });
    const joinBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from
      .mockReturnValueOnce(updateBuilder)
      .mockReturnValueOnce(postBuilder)
      .mockReturnValueOnce(joinBuilder);

    await respondToApplication('app-1', 'TEAM', 'ACEPTADA', 'player-1', 'post-1');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'market_team_posts');
    expect(supabaseMock.from).toHaveBeenNthCalledWith(3, 'team_join_requests');
    expect(joinBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: 'team-7',
        profile_id: 'player-1',
        status: 'ACEPTADA',
      }),
      { onConflict: 'team_id,profile_id' },
    );
  });

  it('rechazar un post de EQUIPO no crea ninguna solicitud de unión', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));

    await respondToApplication('app-1', 'TEAM', 'RECHAZADA', 'player-1', 'post-1');

    expect(supabaseMock.from).not.toHaveBeenCalledWith('team_join_requests');
  });

  it('si la solicitud de unión falla, revierte la postulación a PENDIENTE y relanza', async () => {
    const updateBuilder = createQueryBuilder({ data: null, error: null });
    const postBuilder = createQueryBuilder({ data: { team_id: 'team-7' }, error: null });
    const joinBuilder = createQueryBuilder({ data: null, error: new Error('rls: join request') });
    const revertBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from
      .mockReturnValueOnce(updateBuilder)
      .mockReturnValueOnce(postBuilder)
      .mockReturnValueOnce(joinBuilder)
      .mockReturnValueOnce(revertBuilder);

    await expect(
      respondToApplication('app-1', 'TEAM', 'ACEPTADA', 'player-1', 'post-1'),
    ).rejects.toThrow('rls: join request');

    // Sin la solicitud, "ACEPTADA" no produce ningún efecto: la postulación
    // vuelve a quedar accionable en vez de morir en un estado terminal vacío.
    expect(revertBuilder.update).toHaveBeenCalledWith({ status: 'PENDIENTE' });
    expect(revertBuilder.eq).toHaveBeenCalledWith('id', 'app-1');
  });

  // ─── M5: aceptar cierra el aviso y rechaza a los que quedaban ──────────────

  it('aceptar desactiva el post y rechaza las postulaciones abiertas restantes', async () => {
    const updateBuilder = createQueryBuilder({ data: null, error: null });
    const postLookupBuilder = createQueryBuilder({ data: { team_id: 'team-7' }, error: null });
    const joinBuilder = createQueryBuilder({ data: null, error: null });
    const deactivateBuilder = createQueryBuilder({ data: null, error: null });
    const siblingsBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from
      .mockReturnValueOnce(updateBuilder)
      .mockReturnValueOnce(postLookupBuilder)
      .mockReturnValueOnce(joinBuilder)
      .mockReturnValueOnce(deactivateBuilder)
      .mockReturnValueOnce(siblingsBuilder);

    await respondToApplication('app-1', 'TEAM', 'ACEPTADA', 'player-1', 'post-1');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(4, 'market_team_posts');
    expect(deactivateBuilder.update).toHaveBeenCalledWith({ is_active: false });
    expect(deactivateBuilder.eq).toHaveBeenCalledWith('id', 'post-1');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(5, 'market_team_post_applications');
    expect(siblingsBuilder.update).toHaveBeenCalledWith({ status: 'RECHAZADA' });
    expect(siblingsBuilder.eq).toHaveBeenCalledWith('post_id', 'post-1');
    // VISTA también: con M6 andando, lo que el capitán ya miró no está PENDIENTE.
    expect(siblingsBuilder.in).toHaveBeenCalledWith('status', ['PENDIENTE', 'VISTA']);
    // La aceptada no se autorrechaza.
    expect(siblingsBuilder.neq).toHaveBeenCalledWith('id', 'app-1');
  });

  it('aceptar un post de JUGADOR también lo cierra', async () => {
    const updateBuilder = createQueryBuilder({ data: null, error: null });
    const deactivateBuilder = createQueryBuilder({ data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(updateBuilder).mockReturnValueOnce(deactivateBuilder);

    await respondToApplication('app-2', 'PLAYER', 'ACEPTADA', 'captain-9', 'post-2');

    expect(supabaseMock.from).toHaveBeenNthCalledWith(2, 'market_player_posts');
    expect(deactivateBuilder.update).toHaveBeenCalledWith({ is_active: false });
  });

  it('rechazar no toca el post ni las demás postulaciones', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));

    await respondToApplication('app-1', 'TEAM', 'RECHAZADA', 'player-1', 'post-1');

    expect(supabaseMock.from).not.toHaveBeenCalledWith('market_team_posts');
  });

  // El cierre es best-effort: la aceptación ya ocurrió y ya dejó la solicitud de
  // unión creada. Hacer fallar la promesa mostraría un error por algo que anduvo.
  it('no falla si la limpieza del post falla — sólo queda en telemetría', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: new Error('rls: post update') }))
      .mockReturnValueOnce(createQueryBuilder({ data: null, error: new Error('rls: siblings') }));

    await expect(
      respondToApplication('app-2', 'PLAYER', 'ACEPTADA', 'captain-9', 'post-2'),
    ).resolves.toBeUndefined();
  });
});

describe('markApplicationsAsSeen', () => {
  // M6: el único evento que produce el estado VISTA.
  it('pasa a VISTA sólo las PENDIENTE del post y devuelve los ids tocados', async () => {
    const builder = createQueryBuilder({ data: [{ id: 'app-1' }, { id: 'app-2' }], error: null });
    supabaseMock.from.mockReturnValueOnce(builder);

    const result = await markApplicationsAsSeen('post-1', 'TEAM');

    expect(supabaseMock.from).toHaveBeenCalledWith('market_team_post_applications');
    expect(builder.update).toHaveBeenCalledWith({ status: 'VISTA' });
    expect(builder.eq).toHaveBeenCalledWith('post_id', 'post-1');
    // Sin este filtro, abrir la lista pisaría ACEPTADA/RECHAZADA con VISTA.
    expect(builder.eq).toHaveBeenCalledWith('status', 'PENDIENTE');
    expect(result).toEqual(['app-1', 'app-2']);
  });

  it('usa la tabla de posts de jugador para postType PLAYER', async () => {
    supabaseMock.from.mockReturnValueOnce(createQueryBuilder({ data: [], error: null }));

    await expect(markApplicationsAsSeen('post-2', 'PLAYER')).resolves.toEqual([]);
    expect(supabaseMock.from).toHaveBeenCalledWith('market_player_post_applications');
  });

  it('propaga el error para que la pantalla lo registre en telemetría', async () => {
    supabaseMock.from.mockReturnValueOnce(
      createQueryBuilder({ data: null, error: new Error('rls: seen') }),
    );

    await expect(markApplicationsAsSeen('post-1', 'TEAM')).rejects.toThrow('rls: seen');
  });
});
