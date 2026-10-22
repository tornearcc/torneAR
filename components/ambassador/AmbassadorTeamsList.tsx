import { Text, View } from 'react-native';
import { formatArs } from '@/components/ambassador/format';
import type { AmbassadorBroughtTeam } from '@/lib/schemas/ambassador';

type AmbassadorTeamsListProps = {
  teams: AmbassadorBroughtTeam[];
};

const STATE_LABEL: Record<AmbassadorBroughtTeam['state'], string> = {
  ESPERANDO: 'Esperando',
  PENDIENTE: 'Por cobrar',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
};

const STATE_COLOR: Record<AmbassadorBroughtTeam['state'], string> = {
  ESPERANDO: 'text-neutral-on-surface-variant',
  PENDIENTE: 'text-warning-tertiary',
  PAGADO: 'text-brand-primary',
  RECHAZADO: 'text-danger-error',
};

/** Equipos traídos y en qué estado está el premio de cada uno. */
export function AmbassadorTeamsList({ teams }: AmbassadorTeamsListProps) {
  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <Text className="font-uiBold text-sm text-neutral-on-surface">Equipos que trajiste</Text>
      {teams.length === 0 ? (
        <Text className="font-ui mt-2 text-xs leading-5 text-neutral-on-surface-variant">
          Todavía no trajiste ninguno. Compartí tu invitación para empezar.
        </Text>
      ) : (
        teams.map((team) => {
          const missing =
            team.state === 'ESPERANDO' && team.members_needed !== null && team.members_now < team.members_needed;
          return (
            <View key={team.team_id} className="mt-3 border-t border-neutral-outline-variant pt-3">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface" numberOfLines={1}>
                  {team.name}
                </Text>
                <Text className={`font-uiBold text-xs ${STATE_COLOR[team.state]}`}>
                  {STATE_LABEL[team.state]}
                  {team.amount !== null ? ` ${formatArs(team.amount)}` : ''}
                </Text>
              </View>
              {team.state === 'ESPERANDO' && (
                <Text className="font-ui mt-1 text-[11px] text-neutral-on-surface-variant">
                  Falta que jueguen su primer partido
                </Text>
              )}
              {missing && (
                <Text className="font-ui mt-0.5 text-[11px] text-warning-tertiary">
                  Tienen {team.members_now} de {team.members_needed} integrantes
                </Text>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}
