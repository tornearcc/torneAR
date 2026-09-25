import { TeamCategory, TeamFormat, TeamRole } from '@/lib/team-options';
import type { MixedCompositionStatus } from '@/lib/mixed-composition';

export type TeamDetailRow = {
  id: string;
  name: string;
  zone: string;
  category: TeamCategory;
  preferred_format: TeamFormat;
  invite_code: string;
  elo_rating: number;
  matches_played: number;
  fair_play_score: number;
  shield_url: string | null;
  /** false = equipo dado de baja: fuera del ranking, mercado y desafíos (E3). */
  is_active: boolean;
};

export type TeamMemberRow = {
  profile_id: string;
  role: TeamRole;
  joined_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    preferred_position: string | null;
    /**
     * Ya calculada server-side (vista `profiles_public`), no
     * `date_of_birth` crudo: desde 20260819100000_privacy_and_age_compliance
     * la fecha exacta de un perfil ajeno no es legible desde el cliente.
     * Alimenta el promedio de edad del plantel (lib/age.ts::averageOfAges).
     */
    age: number | null;
  } | null;
};

export type TeamJoinRequestRow = {
  id: string;
  profile_id: string;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    preferred_position: string;
    age: number | null;
  } | null;
};

export type TeamManageViewData = {
  team: TeamDetailRow | null;
  members: TeamMemberRow[];
  pendingRequests: TeamJoinRequestRow[];
  historyRequests: TeamJoinRequestRow[];
  /** F3: sólo para equipos MIXTO, y `null` si no se pudo leer. */
  mixedComposition: MixedCompositionStatus | null;
};
