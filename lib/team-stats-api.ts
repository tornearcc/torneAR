import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { averageOfAges } from '@/lib/age';
import { resolveShieldUrl } from '@/lib/supabase-storage';
import { Database } from '@/types/supabase';
import type {
  TeamStatsViewData,
  TeamStatsHeader,
  TeamSeasonRecord,
  TeamRecentMatch,
  TeamMemberStat,
  FormResult,
  TeamBadgeItem,
  TeamEloPoint,
} from '@/components/team-stats/types';

type TeamRole = Database['public']['Enums']['team_role'];
type PlayerPosition = Database['public']['Enums']['player_position'];

type TeamRow = {
  id: string;
  name: string;
  zone: string;
  category: Database['public']['Enums']['team_category'];
  preferred_format: Database['public']['Enums']['team_format'];
  shield_url: string | null;
  elo_rating: number;
  fair_play_score: number;
  season_wins: number;
  season_losses: number;
  season_draws: number;
  season_goals_for: number;
  season_goals_against: number;
};

type MatchRaw = {
  id: string;
  scheduled_at: string | null;
  status: string;
  match_type: string;
  team_a_id: string;
  team_b_id: string;
  team_a: { name: string; shield_url: string | null } | null;
  team_b: { name: string; shield_url: string | null } | null;
  match_results: {
    team_id: string;
    goals_scored: number;
    goals_against: number;
    mvp: { full_name: string } | null;
  }[];
};

type MemberRaw = {
  profile_id: string;
  role: TeamRole;
  profiles: {
    full_name: string;
    username: string;
    avatar_url: string | null;
    preferred_position: PlayerPosition;
  } | null;
};

type EloHistoryRaw = {
  match_id: string;
  delta: number;
  elo_after: number;
  created_at: string;
};

function percent(n: number, d: number): string {
  if (d <= 0) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

function ratio(v: number, d: number): string {
  if (d <= 0) return '0.00';
  return (v / d).toFixed(2);
}

function matchResult(
  teamId: string,
  match: MatchRaw,
): { result: FormResult | null; goalsFor: number | null; goalsAgainst: number | null } {
  if (match.status === 'FINALIZADO') {
    const own = match.match_results.find((r) => r.team_id === teamId);
    if (!own) return { result: null, goalsFor: null, goalsAgainst: null };
    const gf = own.goals_scored;
    const ga = own.goals_against;
    return {
      result: gf > ga ? 'V' : gf < ga ? 'D' : 'E',
      goalsFor: gf,
      goalsAgainst: ga,
    };
  }
  if (match.status === 'WO_A' || match.status === 'WO_B') {
    const isTeamA = match.team_a_id === teamId;
    return {
      result: (match.status === 'WO_A') === isTeamA ? 'V' : 'D',
      goalsFor: null,
      goalsAgainst: null,
    };
  }
  return { result: null, goalsFor: null, goalsAgainst: null };
}

export async function fetchTeamStatsViewData(
  teamId: string,
  currentProfileId: string | null,
): Promise<TeamStatsViewData> {
  const [teamRes, matchesRes, membersRes, eloHistoryRes, playedRes] = await Promise.all([
    supabase
      .from('teams')
      .select(
        'id, name, zone, category, preferred_format, shield_url, elo_rating, fair_play_score, season_wins, season_losses, season_draws, season_goals_for, season_goals_against',
      )
      .eq('id', teamId)
      .single(),
    supabase
      .from('matches')
      .select(`
        id, scheduled_at, status, match_type,
        team_a_id, team_b_id,
        team_a:teams!team_a_id(name, shield_url),
        team_b:teams!team_b_id(name, shield_url),
        match_results(
          team_id, goals_scored, goals_against,
          mvp:profiles!match_results_mvp_id_fkey(full_name)
        )
      `)
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      .order('scheduled_at', { ascending: false })
      .limit(10),
    supabase
      .from('team_members')
      .select('profile_id, role, profiles(full_name, username, avatar_url, preferred_position)')
      .eq('team_id', teamId),
    supabase
      .from('elo_history')
      .select('match_id, delta, elo_after, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(10),
    // Todos los partidos que el equipo efectivamente jugó, sin `limit`: es el
    // denominador de la presencia y la población sobre la que se cuentan PJ y
    // goles de cada jugador. Sólo ids, así que traerlos completos es barato.
    supabase
      .from('matches')
      .select('id')
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      .eq('status', 'FINALIZADO'),
  ]);

  if (teamRes.error) throw teamRes.error;

  const team = teamRes.data as TeamRow;
  const matches = ((matchesRes.data as MatchRaw[]) ?? []);
  const memberRows = ((membersRes.data as MemberRaw[]) ?? []).filter((m) => !!m.profiles);

  // Edad de cada miembro: consulta aparte a `profiles_public` (no un embed a
  // `profiles`), porque `date_of_birth` de un perfil ajeno ya no es legible
  // desde el cliente (20260819100000_privacy_and_age_compliance) — la vista
  // expone `age` ya derivada. No entra en el `Promise.all` de arriba porque
  // depende de los profile_id que recién se conocen tras resolver `membersRes`.
  const memberProfileIds = memberRows.map((m) => m.profile_id);
  const agesById = new Map<string, number | null>();
  if (memberProfileIds.length > 0) {
    const { data: agesData, error: agesError } = await supabase
      .from('profiles_public')
      .select('id, age')
      .in('id', memberProfileIds);

    if (agesError) {
      Logger.warn('No se pudo leer la edad de los miembros del equipo', {
        scope: 'teamStats.fetchTeamStatsViewData',
        teamId,
        error: agesError,
      });
    } else {
      for (const row of agesData ?? []) {
        if (row.id) agesById.set(row.id, row.age);
      }
    }
  }

  // El historial es accesorio: si falla, la pantalla se muestra igual con el
  // gráfico vacío. Pero un fallo silencioso acá miente («todavía no jugó
  // ningún partido de ranking») — por eso queda registrado, no descartado.
  if (eloHistoryRes.error) {
    Logger.warn('No se pudo leer el historial de Rating del equipo', {
      scope: 'teamStats.fetchTeamStatsViewData',
      teamId,
      error: eloHistoryRes.error,
    });
  }
  const eloHistory = ((eloHistoryRes.data as EloHistoryRaw[]) ?? []);

  // Header
  const header: TeamStatsHeader = {
    id: team.id,
    name: team.name,
    zone: team.zone,
    category: team.category,
    format: team.preferred_format,
    shieldUrl: team.shield_url,
    prRating: team.elo_rating,
    fairPlayScore: Number(team.fair_play_score),
    squadAge: averageOfAges(memberRows.map((m) => agesById.get(m.profile_id) ?? null)),
  };

  // Season record
  const totalMatches = team.season_wins + team.season_draws + team.season_losses;
  const season: TeamSeasonRecord = {
    played: totalMatches,
    wins: team.season_wins,
    draws: team.season_draws,
    losses: team.season_losses,
    goalsFor: team.season_goals_for,
    goalsAgainst: team.season_goals_against,
    goalDiff: team.season_goals_for - team.season_goals_against,
    winPercent: percent(team.season_wins, totalMatches),
    avgGoals: ratio(team.season_goals_for, totalMatches),
    avgGoalsAgainst: ratio(team.season_goals_against, totalMatches),
  };

  // Build elo delta map for quick lookup
  const eloDeltaMap = new Map<string, number>(eloHistory.map((e) => [e.match_id, e.delta]));

  // eloHistory llega ordenado desc (más reciente primero) — se invierte para
  // graficar en orden cronológico (más viejo primero).
  const eloHistoryChronological: TeamEloPoint[] = [...eloHistory]
    .reverse()
    .map((e) => ({ matchId: e.match_id, createdAt: e.created_at, elo: e.elo_after }));

  // Recent matches (sorted already by scheduled_at desc)
  const recentMatches: TeamRecentMatch[] = matches.map((match) => {
    const rival = match.team_a_id === teamId ? match.team_b : match.team_a;
    const rivalName = rival?.name ?? 'Rival';
    const { result, goalsFor, goalsAgainst } = matchResult(teamId, match);
    return {
      id: match.id,
      scheduledAt: match.scheduled_at,
      status: match.status,
      matchType: match.match_type,
      rivalName,
      rivalShieldUrl: resolveShieldUrl(rival?.shield_url),
      rivalTeamId: match.team_a_id === teamId ? match.team_b_id : match.team_a_id,
      // MVP que cargó ESTE equipo, no el del rival: cada `match_results` trae
      // el suyo y mostrar el del otro lado sería premiar al contrario.
      mvpName: match.match_results.find((r) => r.team_id === teamId)?.mvp?.full_name ?? null,
      goalsFor,
      goalsAgainst,
      result,
      prDelta: eloDeltaMap.get(match.id) ?? null,
    };
  });

  // Form: last 5 finished results
  const form: FormResult[] = recentMatches
    .filter((m) => m.result !== null)
    .slice(0, 5)
    .map((m) => m.result!);

  /*
   * Presencia, PJ y goles del plantel.
   *
   * Los tres se miden sobre LA MISMA población: los partidos que el equipo
   * efectivamente jugó (`FINALIZADO`). Antes cada número salía de un universo
   * distinto y por eso la presencia daba mal:
   *
   *   · El numerador contaba todas las filas de `match_participants` del
   *     jugador en el equipo, de siempre y sin mirar el estado del partido —
   *     entraban convocatorias a partidos pendientes, cancelados y de
   *     temporadas anteriores.
   *   · El denominador era `season_wins + draws + losses`, que es de la
   *     temporada EN CURSO y `transition_season` lo resetea a cero.
   *
   * Con el reset de temporada el numerador seguía acumulando contra un
   * denominador en cero, así que el porcentaje se disparaba muy por encima de
   * 100 apenas empezaba una temporada nueva.
   *
   * Acotando el numerador a `playedMatchIds` queda contenido en el denominador
   * por construcción: la presencia no puede pasar de 100%.
   *
   * Los W.O. no cuentan como partido disputado: nadie los jugó, y sumarlos al
   * denominador bajaría la presencia de todo el plantel por un partido que no
   * existió.
   */
  if (playedRes.error) {
    Logger.warn('No se pudieron leer los partidos jugados del equipo; presencia y goles quedan en cero', {
      scope: 'teamStats.fetchTeamStatsViewData',
      teamId,
      error: playedRes.error,
    });
  }
  const playedMatchIds = ((playedRes.data as { id: string }[]) ?? []).map((row) => row.id);
  const totalTeamMatches = playedMatchIds.length;

  const profileIds = memberRows.map((m) => m.profile_id);
  const participationMap = new Map<string, { matchesPlayed: number; goals: number }>();

  if (profileIds.length > 0 && playedMatchIds.length > 0) {
    const [participantsRes, resultsRes] = await Promise.all([
      supabase
        .from('match_participants')
        .select('profile_id')
        .eq('team_id', teamId)
        .in('profile_id', profileIds)
        .in('match_id', playedMatchIds),
      // Goals from match_results scorers jsonb
      supabase
        .from('match_results')
        .select('scorers')
        .eq('team_id', teamId)
        .in('match_id', playedMatchIds),
    ]);

    if (!participantsRes.error) {
      const rows = participantsRes.data as { profile_id: string }[];
      for (const row of rows) {
        const current = participationMap.get(row.profile_id) ?? { matchesPlayed: 0, goals: 0 };
        participationMap.set(row.profile_id, {
          ...current,
          matchesPlayed: current.matchesPlayed + 1,
        });
      }
    }

    if (!resultsRes.error && resultsRes.data) {
      for (const row of resultsRes.data as { scorers: { profile_id: string; goals: number }[] }[]) {
        for (const scorer of row.scorers ?? []) {
          const current = participationMap.get(scorer.profile_id) ?? {
            matchesPlayed: 0,
            goals: 0,
          };
          participationMap.set(scorer.profile_id, {
            ...current,
            goals: current.goals + (scorer.goals ?? 0),
          });
        }
      }
    }
  }

  const members: TeamMemberStat[] = memberRows.map((m) => {
    const stats = participationMap.get(m.profile_id) ?? { matchesPlayed: 0, goals: 0 };
    return {
      profileId: m.profile_id,
      fullName: m.profiles!.full_name,
      username: m.profiles!.username,
      avatarUrl: m.profiles!.avatar_url,
      position: m.profiles!.preferred_position,
      role: m.role,
      age: agesById.get(m.profile_id) ?? null,
      matchesPlayed: stats.matchesPlayed,
      goals: stats.goals,
      presencePercent: percent(stats.matchesPlayed, totalTeamMatches),
    };
  });

  // Sort members: captains first, then by matches played desc
  members.sort((a, b) => {
    const roleOrder = { CAPITAN: 0, SUBCAPITAN: 1, DIRECTOR_TECNICO: 2, JUGADOR: 3 };
    const roleDiff = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
    if (roleDiff !== 0) return roleDiff;
    return b.matchesPlayed - a.matchesPlayed;
  });

  // Is this the current user's team?
  const isOwnTeam = currentProfileId
    ? memberRows.some((m) => m.profile_id === currentProfileId)
    : false;

  return {
    header,
    season,
    form,
    recentMatches,
    members,
    isOwnTeam,
    badges: [],
    eloHistory: eloHistoryChronological,
  };
}

export async function fetchTeamBadges(teamId: string): Promise<TeamBadgeItem[]> {
  const { data, error } = await supabase.rpc(
    'get_team_badges' as Parameters<typeof supabase.rpc>[0],
    { p_team_id: teamId },
  );
  if (error) throw error;
  return ((data ?? []) as {
    id: string; slug: string; name: string;
    criteria_description: string; icon_url: string;
    entity_type: string; is_earned: boolean;
  }[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    criteriaDescription: r.criteria_description,
    iconUrl: r.icon_url,
    entityType: r.entity_type,
    isEarned: r.is_earned,
  }));
}
