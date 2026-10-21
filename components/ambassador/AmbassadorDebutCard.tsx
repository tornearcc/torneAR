import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import type { AmbassadorRegisteredOverview } from '@/lib/schemas/ambassador';

type AmbassadorDebutCardProps = {
  debutState: AmbassadorRegisteredOverview['debut_state'];
  ownTeam: AmbassadorRegisteredOverview['own_team'];
  eligibleTeams: AmbassadorRegisteredOverview['eligible_own_teams'];
  /** Equipo que se preselecciona (el que capitanea). */
  defaultTeamId: string | null;
  saving: boolean;
  onConfirmTeam: (teamId: string) => void;
};

function TeamPicker({
  teams,
  initialId,
  saving,
  onConfirm,
}: {
  teams: AmbassadorRegisteredOverview['eligible_own_teams'];
  initialId: string | null;
  saving: boolean;
  onConfirm: (teamId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialId && teams.some((t) => t.team_id === initialId) ? initialId : (teams[0]?.team_id ?? null),
  );

  return (
    <View className="mt-3">
      {teams.map((team) => {
        const selected = team.team_id === selectedId;
        return (
          <TouchableOpacity
            key={team.team_id}
            activeOpacity={0.8}
            onPress={() => setSelectedId(team.team_id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className={`mb-2 flex-row items-center gap-3 rounded-xl border px-3 py-3 ${
              selected ? 'border-brand-primary bg-brand-primary/10' : 'border-neutral-outline-variant bg-surface-low'
            }`}
          >
            <AppIcon
              family="material-community"
              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
              size={20}
              color={selected ? '#53E076' : '#869585'}
            />
            <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface" numberOfLines={1}>
              {team.name}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!selectedId || saving}
        onPress={() => selectedId && onConfirm(selectedId)}
        accessibilityRole="button"
        className={`mt-1 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 ${
          !selectedId || saving ? 'opacity-40' : ''
        }`}
      >
        {saving && <ActivityIndicator size="small" color="#003914" />}
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">Confirmar</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Extra de debut ($5.000): según `debut_state`, elegir equipo, esperar, o resultado. */
export function AmbassadorDebutCard({
  debutState,
  ownTeam,
  eligibleTeams,
  defaultTeamId,
  saving,
  onConfirmTeam,
}: AmbassadorDebutCardProps) {
  const [changing, setChanging] = useState(false);

  let body: React.ReactNode;

  if (debutState === 'SIN_EQUIPO') {
    // Con un solo equipo elegible también se ofrece elegirlo: la asignación
    // automática no corre si ya lo tenía antes de inscribirse con dos, o si
    // sacó su equipo propio.
    body =
      eligibleTeams.length >= 1 ? (
        <>
          <Text className="font-uiBold text-sm text-neutral-on-surface">¿Cuál es tu equipo?</Text>
          <TeamPicker teams={eligibleTeams} initialId={defaultTeamId} saving={saving} onConfirm={onConfirmTeam} />
        </>
      ) : (
        <>
          <Text className="font-ui text-sm leading-5 text-neutral-on-surface">
            Sumá $5.000 extra: armá tu equipo y que su primer partido sea contra uno que trajiste
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/team-create')}
            accessibilityRole="button"
            className="mt-3 items-center rounded-xl bg-brand-primary py-3"
          >
            <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">Crear equipo</Text>
          </TouchableOpacity>
        </>
      );
  } else if (debutState === 'DISPONIBLE') {
    const canChange = eligibleTeams.length >= 2;
    body = (
      <>
        <Text className="font-ui text-sm leading-5 text-neutral-on-surface">
          Tu equipo: <Text className="font-uiBold">{ownTeam?.name ?? '-'}</Text>. Si su primer partido es contra un
          equipo que trajiste, sumás $5.000 extra
        </Text>
        {canChange && !changing && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setChanging(true)}
            accessibilityRole="button"
            className="mt-3 items-center rounded-xl border border-brand-primary/50 py-2.5"
          >
            <Text className="font-uiBold text-xs text-brand-primary">Cambiar</Text>
          </TouchableOpacity>
        )}
        {canChange && changing && (
          <TeamPicker
            teams={eligibleTeams}
            initialId={ownTeam?.team_id ?? defaultTeamId}
            saving={saving}
            onConfirm={(id) => {
              setChanging(false);
              onConfirmTeam(id);
            }}
          />
        )}
      </>
    );
  } else if (debutState === 'GANADO') {
    body = <Text className="font-uiBold text-sm text-brand-primary">Ganaste el extra de debut</Text>;
  } else {
    body = <Text className="font-ui text-sm text-neutral-on-surface-variant">Tu equipo ya debutó</Text>;
  }

  return <View className="mt-4 rounded-2xl bg-surface-container p-4">{body}</View>;
}
