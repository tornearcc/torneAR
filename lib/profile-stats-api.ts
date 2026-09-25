import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { resolveShieldUrl } from '@/lib/supabase-storage';
import { Database } from '@/types/supabase';
import type {
  ProfileStatsViewData,
  PublicProfileRow,
  RecentMatchResult,
  EarnedBadge,
  TeamEntry,
} from '@/components/profile-stats/types';

type TeamRole = Database['public']['Enums']['team_role'];

type RawScorer = { profile_id: string; goals: number };

type ParticipantRaw = {
  team_id: string;
  matches: {
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
      mvp_id: string | null;
      scorers: RawScorer[] | null;
    }[];
  } | null;
};

type EloHistoryRaw = { match_id: string; team_id: string; delta: number };

type BadgeRpcRow = {
  id: string; slug: string; name: string;
  criteria_description: string; icon_url: string;
  entity_type: string; is_earned: boolean;
};

type TeamRaw = {
  role: TeamRole;
  teams: { id: string; name: string; elo_rating: number; shield_url: string | null } | null;
};

function percent(n: number, d: number): string {
  if (d <= 0) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

function ratio(v: number, d: number): string {
  if (d <= 0) return '0.00';
  return (v / d).toFixed(2);
}

/**
 * Columnas que esta pantalla necesita del perfil, todas dentro de lo que
 * `profiles_public` expone. Se listan explicitas y NUNCA `*`: el `*` de la
 * vista traeria tambien `age`, que va separada en `ProfileStatsViewData`, y
 * dejar el `*` invita a que la proxima columna sensible que se agregue a la
 * vista viaje sola hasta el cliente.
 *
 * Sin `gender` desde F3: la vista lo devuelve NULL (20260925160000) y la
 * columna sigue ahi solo porque las versiones instaladas la piden.
 */
const PROFILE_PUBLIC_COLUMNS =
  'id, username, full_name, avatar_url, zone, preferred_position, favorite_team, strong_foot, created_at, age';

export async function fetchProfileStatsViewData(profileId: string): Promise<ProfileStatsViewData> {
  const [profileRes, statsRes, participantsRes, badgesRpcRes, teamsRes] = await Promise.all([
    // `profiles_public` y no `profiles`: desde
    // 20260819100000_privacy_and_age_compliance el SELECT sobre la tabla base
    // es por columna, asi que el `select('*')` que habia aca respondia 42501
    // (`permission denied for table profiles`) al expandirse a
    // `date_of_birth`/`expo_push_token`. La vista corre con privilegio de
    // owner y ya devuelve `age` derivada — por eso tambien desaparecio la
    // segunda consulta que buscaba la edad por separado.
    supabase.from('profiles_public').select(PROFILE_PUBLIC_COLUMNS).eq('id', profileId).single(),
    supabase
      .from('v_player_stats')
      .select('matches_played, total_goals, total_mvps, total_wins')
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabase
      .from('match_participants')
      .select(`
        team_id,
        matches(
          id, scheduled_at, status, match_type,
          team_a_id, team_b_id,
          team_a:teams!team_a_id(name, shield_url),
          team_b:teams!team_b_id(name, shield_url),
          match_results(team_id, goals_scored, goals_against, mvp_id, scorers)
        )
      `)
      .eq('profile_id', profileId)
      .limit(30),
    supabase.rpc(
      'get_player_badges' as Parameters<typeof supabase.rpc>[0],
      { p_profile_id: profileId },
    ),
    supabase
      .from('team_members')
      .select('role, teams(id, name, elo_rating, shield_url)')
      .eq('profile_id', profileId),
  ]);

  if (profileRes.error) throw profileRes.error;

  // La vista tipa todas sus columnas como nullable (ver `PublicProfileRow`).
  // `age` se separa del resto acá: el contrato de `ProfileStatsViewData` la
  // lleva en su propia clave, no adentro de `profile`.
  const { age, ...publicProfile } = profileRes.data;

  const s = statsRes.data as {
    matches_played: number;
    total_goals: number;
    total_mvps: number;
    total_wins: number;
  } | null;

  const matchesPlayed = Number(s?.matches_played ?? 0);
  const goals = Number(s?.total_goals ?? 0);
  const mvps = Number(s?.total_mvps ?? 0);
  const wins = Number(s?.total_wins ?? 0);

  const participantRows = ((participantsRes.data as ParticipantRaw[]) ?? []).filter(
    (row) => !!row.matches,
  );

  // Movimiento de Ranking por partido. Va en una consulta aparte porque
  // `elo_history` no cuelga de `match_participants` y los ids no se conocen
  // hasta que vuelve la consulta de arriba.
  //
  // La clave es match_id + team_id: la tabla guarda una fila por equipo y por
  // partido, asi que filtrar solo por match_id traeria tambien el delta del
  // rival — que es justo el numero opuesto al que hay que mostrar.
  const rankDeltaByMatch = new Map<string, number>();
  const matchIds = participantRows.map((row) => row.matches!.id);

  if (matchIds.length > 0) {
    const eloRes = await supabase
      .from('elo_history')
      .select('match_id, team_id, delta')
      .in('match_id', matchIds);

    if (eloRes.error) {
      // Accesorio: sin esto el historial se muestra igual, solo que sin el
      // badge de Ranking. Queda registrado para no confundir "no se pudo leer"
      // con "este partido no movio el Ranking".
      Logger.warn('No se pudo leer el movimiento de Ranking del historial', {
        scope: 'profileStats.fetchProfileStatsViewData',
        profileId,
        error: eloRes.error,
      });
    }

    for (const row of (eloRes.data as EloHistoryRaw[]) ?? []) {
      rankDeltaByMatch.set(`${row.match_id}:${row.team_id}`, row.delta);
    }
  }

  const recentMatches: RecentMatchResult[] = participantRows
    .map((row) => {
      const match = row.matches!;
      const isTeamA = match.team_a_id === row.team_id;
      const rival = isTeamA ? match.team_b : match.team_a;
      const rivalName = rival?.name ?? 'Rival';

      let result: 'V' | 'E' | 'D' | null = null;
      let goalsFor: number | null = null;
      let goalsAgainst: number | null = null;

      // El resultado del equipo propio es tambien el que trae al MVP y a los
      // goleadores: `match_results` tiene una fila por equipo y cada capitan
      // carga la suya.
      const own = match.match_results.find((r) => r.team_id === row.team_id);

      if (match.status === 'FINALIZADO') {
        if (own) {
          goalsFor = own.goals_scored;
          goalsAgainst = own.goals_against;
          result = goalsFor > goalsAgainst ? 'V' : goalsFor < goalsAgainst ? 'D' : 'E';
        }
      } else if (match.status === 'WO_A' || match.status === 'WO_B') {
        result = (match.status === 'WO_A') === isTeamA ? 'V' : 'D';
      }

      const playerGoals = (own?.scorers ?? [])
        .filter((scorer) => scorer.profile_id === profileId)
        .reduce((total, scorer) => total + Number(scorer.goals ?? 0), 0);

      return {
        id: match.id,
        scheduledAt: match.scheduled_at,
        status: match.status,
        matchType: match.match_type,
        rivalName,
        rivalShieldUrl: resolveShieldUrl(rival?.shield_url ?? null),
        rivalTeamId: isTeamA ? match.team_b_id : match.team_a_id,
        goalsFor,
        goalsAgainst,
        result,
        playerGoals,
        isMvp: own?.mvp_id === profileId,
        rankDelta: rankDeltaByMatch.get(`${match.id}:${row.team_id}`) ?? null,
      };
    })
    .sort((a, b) => {
      const at = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const bt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, 10);

  const badges: EarnedBadge[] = ((badgesRpcRes.data ?? []) as BadgeRpcRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    iconUrl: r.icon_url,
    criteriaDescription: r.criteria_description,
    earnedAt: '',   // RPC doesn't track earned_at; kept for type compat
    isEarned: r.is_earned,
  }));

  const teams: TeamEntry[] = ((teamsRes.data as TeamRaw[]) ?? [])
    .filter((row) => !!row.teams)
    .map((row) => ({
      id: row.teams!.id,
      name: row.teams!.name,
      prRating: row.teams!.elo_rating,
      shieldUrl: row.teams!.shield_url,
      role: row.role,
    }));

  return {
    profile: publicProfile as PublicProfileRow,
    age: age ?? null,
    stats: {
      matchesPlayed,
      goals,
      mvps,
      wins,
      avgGoals: ratio(goals, matchesPlayed),
      winPercent: percent(wins, matchesPlayed),
    },
    recentMatches,
    badges,
    teams,
  };
}
