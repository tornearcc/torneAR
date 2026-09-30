import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { fetchGuestMatchSides } from '@/lib/guest-matches-data';
import { resolveBestFormatRanking, type FormatRankingRow } from '@/lib/team-ranking-format';
import type { Database } from '@/types/supabase';
import type {
  HomeViewData,
  HomeTeamSnapshot,
  HomeMatchEntry,
  HomeSoloTeam,
  PendingAction,
  PendingActionType,
} from '@/components/home/types';

type TeamRole = Database['public']['Enums']['team_role'];
type MatchStatus = Database['public']['Enums']['match_status'];

// ─── Raw DB row types ─────────────────────────────────────────────────────────

type TeamMemberRow = {
  team_id: string;
  role: TeamRole;
  teams: {
    id: string;
    name: string;
    elo_rating: number;
    shield_url: string | null;
    // Columns added by Phase 3 triggers — not yet in generated types
    fair_play_score: number;
    season_wins: number;
    season_draws: number;
    season_losses: number;
    preferred_format: Database['public']['Enums']['team_format'];
  } | null;
};

type MatchRow = {
  id: string;
  status: MatchStatus;
  match_type: string;
  scheduled_at: string | null;
  format: string | null;
  team_a_id: string;
  team_b_id: string;
};

type TeamSnapshotRow = {
  id: string;
  name: string;
  shield_url: string | null;
  elo_rating: number;
};

// ─── D12: filas de las señales nuevas de la bandeja ───────────────────────────

type OpenMatchRow = {
  id: string;
  status: MatchStatus;
  team_a_id: string;
  team_b_id: string;
};

type ProposalRow = { id: string; match_id: string; from_team_id: string };

type CancellationRow = { id: string; match_id: string; requested_by_team_id: string };

type ResultRow = { match_id: string; team_id: string };

// Status order for client-side sort: EN_VIVO always first
const STATUS_PRIORITY: Partial<Record<MatchStatus, number>> = {
  EN_VIVO: 0,
  CONFIRMADO: 1,
  PENDIENTE: 2,
};

/** Estados de un partido "vivo": los únicos sobre los que queda algo por hacer. */
const OPEN_MATCH_STATUSES: MatchStatus[] = ['PENDIENTE', 'CONFIRMADO', 'EN_VIVO'];

/** Una postulación sigue esperando respuesta mientras no la respondan (M6: `VISTA` cuenta). */
const OPEN_APPLICATION_STATUSES = ['PENDIENTE', 'VISTA'];

// ─── D12: armado de la bandeja ────────────────────────────────────────────────

/**
 * Entrada cruda de la bandeja: un conteo y, si la acción es única, el partido.
 * `buildPendingActions` se encarga del texto.
 */
export interface PendingActionInput {
  type: PendingActionType;
  count: number;
  matchId?: string | null;
}

/**
 * Singular/plural de cada señal, en un solo lugar y sin tocar la base.
 *
 * Está exportado a propósito: es la única parte de `fetchHomeViewData` que se
 * puede probar sin fabricar seis respuestas de Supabase encadenadas, y es la
 * que concentra las decisiones de producto (qué se muestra, con qué palabras y
 * en qué orden).
 *
 * **El orden del array es el de la pantalla**, y es deliberado: primero lo que
 * está ocurriendo o a punto de vencer (partido en vivo, disputa), después lo
 * que espera una respuesta mía, y al final lo que puede esperar.
 */
export function buildPendingActions(inputs: PendingActionInput[]): PendingAction[] {
  const label = (type: PendingActionType, n: number): string => {
    switch (type) {
      case 'LIVE_RESULT':
        return n === 1
          ? '1 partido en vivo sin resultado cargado'
          : `${n} partidos en vivo sin resultado cargado`;
      case 'DISPUTE':
        return n === 1 ? '1 partido en disputa' : `${n} partidos en disputa`;
      case 'MATCH_PROPOSAL':
        return n === 1
          ? '1 propuesta de partido esperando tu respuesta'
          : `${n} propuestas de partido esperando tu respuesta`;
      case 'CANCELLATION_REQUEST':
        return n === 1
          ? '1 pedido de cancelación esperando tu respuesta'
          : `${n} pedidos de cancelación esperando tu respuesta`;
      case 'CHALLENGE_RECEIVED':
        return n === 1 ? '1 desafío recibido' : `${n} desafíos recibidos`;
      case 'TEAM_REQUEST':
        return n === 1
          ? '1 solicitud de ingreso pendiente'
          : `${n} solicitudes de ingreso pendientes`;
      case 'MARKET_APPLICATION':
        return n === 1
          ? '1 postulación sin responder en el Mercado'
          : `${n} postulaciones sin responder en el Mercado`;
    }
  };

  const ORDER: PendingActionType[] = [
    'LIVE_RESULT',
    'DISPUTE',
    'MATCH_PROPOSAL',
    'CANCELLATION_REQUEST',
    'CHALLENGE_RECEIVED',
    'TEAM_REQUEST',
    'MARKET_APPLICATION',
  ];

  return inputs
    .filter((entry) => entry.count > 0)
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .map((entry) => ({
      type: entry.type,
      count: entry.count,
      label: label(entry.type, entry.count),
      // El atajo directo sólo tiene sentido cuando no hay ambigüedad.
      matchId: entry.count === 1 ? (entry.matchId ?? null) : null,
    }));
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchHomeViewData(profileId: string): Promise<HomeViewData> {
  // Step 1 — load team memberships (all subsequent queries depend on team IDs)
  const { data: memberData, error: memberError } = await supabase
    .from('team_members')
    .select(
      'team_id, role, teams(id, name, elo_rating, shield_url, fair_play_score, season_wins, season_draws, season_losses, preferred_format)',
    )
    .eq('profile_id', profileId);

  if (memberError) throw memberError;

  const memberRows = ((memberData as unknown as TeamMemberRow[]) ?? []).filter(
    (r) => r.teams !== null,
  );

  // Traspasos aprobados esperando confirmación del jugador. Se resuelve ANTES
  // del corte por "no tiene equipos": el jugador recién aceptado no pertenece a
  // ningún plantel todavía, así que si esto viviera más abajo nunca se
  // calcularía justo para quien más lo necesita.
  const myTeamIds = new Set(memberRows.map((r) => r.team_id));
  const { data: acceptedRequests, error: acceptedError } = await supabase
    .from('team_join_requests')
    .select('team_id')
    .eq('profile_id', profileId)
    .eq('status', 'ACEPTADA');

  if (acceptedError) throw acceptedError;

  // Una solicitud ACEPTADA no se cierra al entrar: filtramos las de equipos en
  // los que ya milita para no contar traspasos que en realidad ya se hicieron.
  const pendingTransfers = (acceptedRequests ?? []).filter(
    (r) => !myTeamIds.has(r.team_id),
  ).length;

  // Partidos donde entré con código de invitado. Se resuelve ANTES del corte por
  // "no tiene equipos" por el mismo motivo que los traspasos: el invitado no
  // pertenece a ningún plantel, así que más abajo nunca se calcularía justo para
  // quien sólo tiene estos partidos (auditoría E2E, módulo 6.3).
  const guestSideByMatchId = await fetchGuestMatchSides(profileId);
  const guestMatchIds = Object.keys(guestSideByMatchId);

  if (memberRows.length === 0 && guestMatchIds.length === 0) {
    return { myTeams: [], upcomingMatches: [], pendingActions: [], pendingTransfers };
  }

  const teamIds = memberRows.map((r) => r.team_id);
  const captainTeamIds = memberRows
    .filter((r) => r.role === 'CAPITAN' || r.role === 'SUBCAPITAN')
    .map((r) => r.team_id);

  // Filtro .or() de los partidos que me incumben: los de mis equipos y los que
  // canjeé como invitado. Se arma por partes porque cualquiera de las dos puede
  // venir vacía —un invitado sin club, o un jugador que nunca usó un código— y
  // un `in.()` sin elementos es sintaxis inválida para PostgREST.
  const matchOrClauses: string[] = [];
  if (teamIds.length > 0) {
    const teamInFilter = teamIds.join(',');
    matchOrClauses.push(`team_a_id.in.(${teamInFilter})`, `team_b_id.in.(${teamInFilter})`);
  }
  if (guestMatchIds.length > 0) {
    matchOrClauses.push(`id.in.(${guestMatchIds.join(',')})`);
  }
  const matchOrFilter = matchOrClauses.join(',');

  // El equipo del que soy CAPITAN/SUBCAPITAN es el único que puede responder
  // propuestas, cancelaciones, desafíos y disputas. Sin este filtro la bandeja
  // le pedía acciones imposibles a los jugadores (D12).
  const captainInFilter = captainTeamIds.join(',');
  const captainMatchOrFilter = `team_a_id.in.(${captainInFilter}),team_b_id.in.(${captainInFilter})`;

  // Step 2 — parallel queries that only depend on team IDs
  const parallelQueries = [
    // A: upcoming active matches
    supabase
      .from('matches')
      .select('id, status, match_type, scheduled_at, format, team_a_id, team_b_id')
      .in('status', OPEN_MATCH_STATUSES)
      .or(matchOrFilter)
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(10),

    // B: matches in dispute
    // D12: sólo los de equipos que gestiono. La disputa la resuelve un capitán;
    // mostrarle la tarjeta a un jugador era pedirle algo que la RPC le rechaza.
    captainTeamIds.length > 0
      ? supabase
          .from('matches')
          .select('id')
          .eq('status', 'EN_DISPUTA')
          .or(captainMatchOrFilter)
      : Promise.resolve({ data: [], error: null }),

    // C: received challenges (ENVIADA → requires captain action)
    // Guardado por equipos: un invitado sin club llega hasta acá desde el corte
    // de arriba, y `in.()` vacío es sintaxis inválida.
    teamIds.length > 0
      ? supabase
          .from('challenges')
          .select('id')
          .in('to_team_id', teamIds)
          .eq('status', 'ENVIADA')
      : Promise.resolve({ data: [], error: null }),

    // D: pending team join requests (captains/subcaptains only)
    captainTeamIds.length > 0
      ? supabase
          .from('team_join_requests')
          .select('id')
          .in('team_id', captainTeamIds)
          .eq('status', 'PENDIENTE')
      : Promise.resolve({ data: [], error: null }),

    // E (D12): todos los partidos abiertos de los equipos que gestiono —sin el
    // `limit(10)` de A, que es para pintar la sección de próximos partidos y no
    // sirve como universo de acciones pendientes.
    captainTeamIds.length > 0
      ? supabase
          .from('matches')
          .select('id, status, team_a_id, team_b_id')
          .in('status', OPEN_MATCH_STATUSES)
          .or(captainMatchOrFilter)
      : Promise.resolve({ data: [], error: null }),

    // F (D12): mis avisos abiertos en el Mercado — de equipo (los gestiono) y
    // propios. Sus postulaciones sin responder son la cuarta señal que faltaba.
    captainTeamIds.length > 0
      ? supabase
          .from('market_team_posts')
          .select('id')
          .in('team_id', captainTeamIds)
          .eq('is_active', true)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from('market_player_posts')
      .select('id')
      .eq('profile_id', profileId)
      .eq('is_active', true),
  ] as const;

  const [
    matchesRes,
    disputesRes,
    challengesRes,
    requestsRes,
    openMatchesRes,
    myTeamPostsRes,
    myPlayerPostsRes,
  ] = await Promise.all(parallelQueries);

  // ─── Step 2b (D12) — señales que dependen de los partidos abiertos ─────────
  const captainTeamIdSet = new Set(captainTeamIds);

  const openMatchRows = ((openMatchesRes.data ?? []) as unknown as OpenMatchRow[]);
  const openMatchIds = openMatchRows.map((m) => m.id);
  // `myTeamId` por partido: es contra ESE equipo que se mide "ya cargué el
  // resultado" y "la propuesta la mandó el rival". Mismo criterio que R9 en el
  // detalle del partido: nunca se infiere del equipo activo del store.
  const myTeamByMatch = new Map<string, string>(
    openMatchRows.map((m) => [m.id, captainTeamIdSet.has(m.team_a_id) ? m.team_a_id : m.team_b_id]),
  );
  const liveMatchIds = openMatchRows.filter((m) => m.status === 'EN_VIVO').map((m) => m.id);

  const myPostIds = {
    TEAM: ((myTeamPostsRes.data ?? []) as { id: string }[]).map((p) => p.id),
    PLAYER: ((myPlayerPostsRes.data ?? []) as { id: string }[]).map((p) => p.id),
  };

  const [proposalsRes, cancellationsRes, liveResultsRes, teamAppsRes, playerAppsRes] =
    await Promise.all([
      // Propuestas que mandó el rival y todavía nadie respondió.
      openMatchIds.length > 0
        ? supabase
            .from('match_proposals')
            .select('id, match_id, from_team_id')
            .eq('status', 'PENDIENTE')
            .in('match_id', openMatchIds)
        : Promise.resolve({ data: [], error: null }),

      // Pedidos de cancelación del rival esperando mi respuesta (doble consentimiento).
      openMatchIds.length > 0
        ? supabase
            .from('cancellation_requests')
            .select('id, match_id, requested_by_team_id')
            .eq('status', 'PENDIENTE')
            .in('match_id', openMatchIds)
        : Promise.resolve({ data: [], error: null }),

      // Resultados ya cargados en los partidos EN_VIVO: lo que falta es la señal.
      liveMatchIds.length > 0
        ? supabase.from('match_results').select('match_id, team_id').in('match_id', liveMatchIds)
        : Promise.resolve({ data: [], error: null }),

      myPostIds.TEAM.length > 0
        ? supabase
            .from('market_team_post_applications')
            .select('id')
            .in('post_id', myPostIds.TEAM)
            .in('status', OPEN_APPLICATION_STATUSES)
        : Promise.resolve({ data: [], error: null }),

      myPostIds.PLAYER.length > 0
        ? supabase
            .from('market_player_post_applications')
            .select('id')
            .in('post_id', myPostIds.PLAYER)
            .in('status', OPEN_APPLICATION_STATUSES)
        : Promise.resolve({ data: [], error: null }),
    ]);

  // Una propuesta propia no requiere mi respuesta: la espero yo del rival.
  const incomingProposals = ((proposalsRes.data ?? []) as unknown as ProposalRow[]).filter(
    (p) => !captainTeamIdSet.has(p.from_team_id),
  );

  const incomingCancellations = (
    (cancellationsRes.data ?? []) as unknown as CancellationRow[]
  ).filter((c) => !captainTeamIdSet.has(c.requested_by_team_id));

  // "Sin resultado cargado por MI equipo": el del rival no me libera de cargar
  // el mío — es justamente lo que evita que el partido termine en disputa.
  const loadedByMe = new Set(
    ((liveResultsRes.data ?? []) as unknown as ResultRow[]).map(
      (r) => `${r.match_id}:${r.team_id}`,
    ),
  );
  const liveWithoutMyResult = liveMatchIds.filter(
    (matchId) => !loadedByMe.has(`${matchId}:${myTeamByMatch.get(matchId)}`),
  );

  const marketApplicationCount =
    ((teamAppsRes.data ?? []) as { id: string }[]).length +
    ((playerAppsRes.data ?? []) as { id: string }[]).length;

  // Step 3 — fetch team details for all teams referenced in upcoming matches
  // (needed for opponent names/shields that aren't in my team list)
  const upcomingRows = ((matchesRes.data ?? []) as unknown as MatchRow[]);
  const allMatchTeamIds = [
    ...new Set([...upcomingRows.map((m) => m.team_a_id), ...upcomingRows.map((m) => m.team_b_id)]),
  ];

  const teamsMap = new Map<string, TeamSnapshotRow>();
  if (allMatchTeamIds.length > 0) {
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name, shield_url, elo_rating')
      .in('id', allMatchTeamIds);
    ((teamsData ?? []) as TeamSnapshotRow[]).forEach((t) => teamsMap.set(t.id, t));
  }

  // ─── Build HomeViewData ───────────────────────────────────────────────────

  const myTeamIdSet = new Set(teamIds);

  // Sort: EN_VIVO first, then by scheduled_at (already ordered by DB)
  const sortedMatches = upcomingRows
    .slice()
    .sort(
      (a, b) =>
        (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3),
    )
    .slice(0, 5);

  const upcomingMatches: HomeMatchEntry[] = sortedMatches.map((m) => {
    // `HomeMatchEntry.myTeamId` ya era por entrada, así que el invitado entra sin
    // tocar el tipo: cuando ninguno de los dos equipos es mío, el lado sale de
    // por dónde entré. Sin esto caía siempre en `team_b_id` y la tarjeta se
    // orientaba desde el rival.
    const myTeamId = myTeamIdSet.has(m.team_a_id)
      ? m.team_a_id
      : myTeamIdSet.has(m.team_b_id)
        ? m.team_b_id
        : guestSideByMatchId[m.id] ?? m.team_b_id;
    const teamAData = teamsMap.get(m.team_a_id);
    const teamBData = teamsMap.get(m.team_b_id);
    return {
      id: m.id,
      status: m.status,
      matchType: m.match_type as HomeMatchEntry['matchType'],
      scheduledAt: m.scheduled_at,
      format: m.format as HomeMatchEntry['format'],
      teamA: {
        id: m.team_a_id,
        name: teamAData?.name ?? 'Equipo A',
        shieldUrl: teamAData?.shield_url
          ? getSupabaseStorageUrl('shields', teamAData.shield_url)
          : null,
        eloRating: teamAData?.elo_rating ?? 1000,
      },
      teamB: {
        id: m.team_b_id,
        name: teamBData?.name ?? 'Equipo B',
        shieldUrl: teamBData?.shield_url
          ? getSupabaseStorageUrl('shields', teamBData.shield_url)
          : null,
        eloRating: teamBData?.elo_rating ?? 1000,
      },
      myTeamId,
    };
  });

  const disputeRows = (disputesRes.data ?? []) as { id: string }[];

  const pendingActions = buildPendingActions([
    {
      type: 'LIVE_RESULT',
      count: liveWithoutMyResult.length,
      matchId: liveWithoutMyResult[0] ?? null,
    },
    { type: 'DISPUTE', count: disputeRows.length, matchId: disputeRows[0]?.id ?? null },
    {
      type: 'MATCH_PROPOSAL',
      count: incomingProposals.length,
      matchId: incomingProposals[0]?.match_id ?? null,
    },
    {
      type: 'CANCELLATION_REQUEST',
      count: incomingCancellations.length,
      matchId: incomingCancellations[0]?.match_id ?? null,
    },
    { type: 'CHALLENGE_RECEIVED', count: (challengesRes.data ?? []).length },
    { type: 'TEAM_REQUEST', count: (requestsRes.data ?? []).length },
    { type: 'MARKET_APPLICATION', count: marketApplicationCount },
  ]);

  /*
   * RANKING de la tarjeta: el del MEJOR formato, no `teams.elo_rating`.
   *
   * El widget de Top 3 de esta misma pantalla resuelve el puntaje contra
   * `team_rankings` por formato, y la tarjeta leía el ELO global: el mismo
   * equipo aparecía con 1000 arriba y 961 abajo, a dos bloques de distancia.
   * Los dos números eran ciertos y por eso la incoherencia parecía un bug de
   * datos y no de criterio.
   *
   * Una sola consulta para todos los equipos del usuario en vez de una por
   * tarjeta: son pocas filas y ya se conocen los `teamIds`.
   */
  const { data: formatRankings, error: formatRankingsError } = await supabase
    .from('team_rankings')
    .select('team_id, format, elo_score')
    .in('team_id', teamIds);

  if (formatRankingsError) {
    // Degradar al ELO global es exactamente el comportamiento anterior, así que
    // la Home se muestra igual. Queda registrado porque el síntoma —la cifra
    // vuelve a discrepar con el widget— es idéntico al bug que esto arregla.
    Logger.warn('No se pudieron leer los ELO por formato; se usa el ELO global del equipo', {
      scope: 'home-data.fetchHomeViewData',
      profileId,
      error: formatRankingsError,
    });
  }

  const rankingsByTeam = new Map<string, FormatRankingRow[]>();
  for (const row of (formatRankings ?? []) as (FormatRankingRow & { team_id: string })[]) {
    const current = rankingsByTeam.get(row.team_id) ?? [];
    current.push({ format: row.format, elo_score: row.elo_score });
    rankingsByTeam.set(row.team_id, current);
  }

  const myTeams: HomeTeamSnapshot[] = memberRows.map((r) => {
    const team = r.teams!;
    const ranking = resolveBestFormatRanking(rankingsByTeam.get(team.id) ?? [], {
      eloRating: team.elo_rating,
      format: team.preferred_format,
    });

    return {
      id: team.id,
      name: team.name,
      shieldUrl: team.shield_url ? getSupabaseStorageUrl('shields', team.shield_url) : null,
      eloRating: ranking.eloRating,
      // `null` cuando el equipo nunca jugó un partido de ranking: la tarjeta no
      // rotula con un formato que todavía no disputó.
      rankingFormat: ranking.isFallback ? null : ranking.format,
      fairPlayScore: team.fair_play_score ?? 100,
      seasonWins: team.season_wins ?? 0,
      seasonDraws: team.season_draws ?? 0,
      seasonLosses: team.season_losses ?? 0,
      role: r.role,
    };
  });

  const soloTeam = await fetchSoloCaptainTeam(profileId, captainTeamIds);

  return { myTeams, upcomingMatches, pendingActions, pendingTransfers, soloTeam };
}

/**
 * De los equipos que la persona capitanea o subcapitanea, el primero que
 * todavía tiene un solo integrante (Tanda 7, P1-11: al 29/09, 16 de los 17
 * equipos reales estaban así). Un fallo acá devuelve `null` y queda
 * registrado: la tarjeta es un extra, no puede tirar abajo la Home.
 *
 * Exportada para el test.
 */
export async function fetchSoloCaptainTeam(
  profileId: string,
  captainTeamIds: string[],
): Promise<HomeSoloTeam | null> {
  if (captainTeamIds.length === 0) return null;

  try {
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('team_id')
      .in('team_id', captainTeamIds);
    if (membersError) throw membersError;

    const countByTeam = new Map<string, number>();
    for (const row of members ?? []) {
      countByTeam.set(row.team_id, (countByTeam.get(row.team_id) ?? 0) + 1);
    }
    const soloTeamId = captainTeamIds.find((id) => countByTeam.get(id) === 1);
    if (!soloTeamId) return null;

    // Las solicitudes pendientes no se cuentan acá: ya las muestra la bandeja
    // de acciones (TEAM_REQUEST).
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, invite_code, is_active')
      .eq('id', soloTeamId)
      .maybeSingle();
    if (teamError) throw teamError;
    if (!team || !team.is_active) return null;

    return { id: team.id, name: team.name, inviteCode: team.invite_code };
  } catch (error) {
    Logger.warn('No se pudo calcular el equipo de un solo integrante para la Home', {
      scope: 'home-data.fetchSoloCaptainTeam',
      profileId,
      error,
    });
    return null;
  }
}
