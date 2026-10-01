import { Share } from 'react-native';
import { shareActivityType, trackShareIntent } from '@/lib/share-analytics';
import { buildTeamInviteMessage } from '@/lib/team-invite-link';

export type TeamInviteSurface = 'team_manage' | 'home_solo_card';

interface ShareTeamInviteInput {
  team: { id: string; name: string; inviteCode: string };
  profile: { id: string; username: string | null; full_name: string | null } | null;
  surface: TeamInviteSurface;
}

/**
 * Abre la hoja de compartir con la invitación al equipo (link + código) y
 * registra el intento. Lo usan la gestión del equipo y la tarjeta de Inicio
 * del equipo de un solo integrante (Tanda 7).
 *
 * Si `Share.share` falla, tira: el aviso lo muestra cada pantalla con su
 * `showAlert`. El registro va en el `finally`, al cerrarse la hoja, que es
 * cuando iOS informa el destino (mismo criterio que ProfileInviteCard, ver
 * `lib/share-analytics.ts`).
 */
export async function shareTeamInvite({ team, profile, surface }: ShareTeamInviteInput): Promise<void> {
  let activityType: string | undefined;
  try {
    const result = await Share.share({
      message: buildTeamInviteMessage({
        username: profile?.username ?? null,
        fullName: profile?.full_name ?? null,
        inviteCode: team.inviteCode,
        teamName: team.name,
      }),
    });
    activityType = shareActivityType(result);
  } finally {
    trackShareIntent({
      target: 'generic',
      contentType: 'team_invite',
      profileId: profile?.id ?? null,
      teamId: team.id,
      activityType,
      surface,
    });
  }
}
