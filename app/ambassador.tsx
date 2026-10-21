import { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { GlobalLoader } from '@/components/GlobalLoader';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { AmbassadorSignupForm } from '@/components/ambassador/AmbassadorSignupForm';
import { AmbassadorEarningsHeader } from '@/components/ambassador/AmbassadorEarningsHeader';
import { AmbassadorFollowCard } from '@/components/ambassador/AmbassadorFollowCard';
import { AmbassadorPayoutCard } from '@/components/ambassador/AmbassadorPayoutCard';
import { AmbassadorShareCard } from '@/components/ambassador/AmbassadorShareCard';
import { AmbassadorDebutCard } from '@/components/ambassador/AmbassadorDebutCard';
import { AmbassadorTeamsList } from '@/components/ambassador/AmbassadorTeamsList';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import {
  fetchAmbassadorOverview,
  setAmbassadorOwnTeam,
  setAmbassadorPayoutAlias,
  upsertAmbassador,
  type OwnTeamOutcome,
  type PayoutAliasOutcome,
  type UpsertAmbassadorOutcome,
} from '@/lib/ambassador-data';
import type { AmbassadorOverview } from '@/lib/schemas/ambassador';

const UPSERT_MESSAGES: Partial<Record<UpsertAmbassadorOutcome, string>> = {
  noop_disabled: 'El programa todavía no arrancó.',
  noop_terms: 'Para inscribirte tenés que confirmar que sos mayor de 18 y aceptar las bases.',
  noop_instagram: 'Revisá tu usuario de Instagram: solo letras, números, puntos y guiones bajos.',
  noop_suspended: 'Tu inscripción está suspendida. Escribinos si creés que es un error.',
};

const OWN_TEAM_MESSAGES: Partial<Record<OwnTeamOutcome, string>> = {
  noop_disabled: 'El programa todavía no arrancó.',
  noop_not_ambassador: 'Primero tenés que inscribirte como embajador.',
  noop_not_member: 'Ya no sos integrante de ese equipo.',
  noop_team_brought: 'No podés elegir un equipo que trajiste vos.',
  noop_team_taken: 'Ese equipo ya es el equipo propio de otro embajador.',
  noop_excluded: 'Ese equipo no puede participar del programa.',
  noop_locked: 'Tu equipo ya tuvo su primer partido, no se puede cambiar.',
};

const ALIAS_MESSAGES: Partial<Record<PayoutAliasOutcome, string>> = {
  noop_not_ambassador: 'Primero tenés que inscribirte como embajador.',
  noop_invalid: 'El alias o CBU tiene que tener entre 6 y 40 caracteres.',
};

const GENERIC_ERROR = getGenericSupabaseErrorMessage(null, 'No se pudo completar la operación. Intentá de nuevo.');

export default function AmbassadorScreen() {
  const { profile, user } = useAuth();
  const { myTeams } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AmbassadorOverview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setOverview(await fetchAmbassadorOverview());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleSignup = useCallback(
    async (input: { instagram: string; showInRanking: boolean; acceptTerms: boolean; confirmAdult: boolean }) => {
      if (busy) return;
      setBusy(true);
      const outcome = await upsertAmbassador(input);
      if (outcome === 'created' || outcome === 'updated') {
        await load();
        showAlert('¡Listo!', 'Ya sos embajador. Invitá equipos y empezá a ganar.');
      } else {
        showAlert('No pudimos inscribirte', UPSERT_MESSAGES[outcome] ?? GENERIC_ERROR);
      }
      setBusy(false);
    },
    [busy, load, showAlert],
  );

  const handleOwnTeam = useCallback(
    async (teamId: string) => {
      if (busy) return;
      setBusy(true);
      const outcome = await setAmbassadorOwnTeam(teamId);
      if (outcome === 'applied') {
        await load();
      } else {
        showAlert('No pudimos guardar tu equipo', OWN_TEAM_MESSAGES[outcome] ?? GENERIC_ERROR);
      }
      setBusy(false);
    },
    [busy, load, showAlert],
  );

  const handleAlias = useCallback(
    async (alias: string) => {
      if (busy) return;
      setBusy(true);
      const outcome = await setAmbassadorPayoutAlias(alias);
      if (outcome === 'applied') {
        await load();
        showAlert('Alias guardado', 'Te pagamos a ese alias dentro de los 7 días de verificado tu seguimiento.');
      } else {
        showAlert('No pudimos guardar el alias', ALIAS_MESSAGES[outcome] ?? GENERIC_ERROR);
      }
      setBusy(false);
    },
    [busy, load, showAlert],
  );

  const renderBody = () => {
    if (!overview) {
      return (
        <View className="items-center px-4 py-10">
          <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
            No pudimos cargar el programa. Revisá tu conexión e intentá de nuevo.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => void load()}
            accessibilityRole="button"
            className="mt-4 rounded-xl border border-brand-primary/50 px-5 py-2.5"
          >
            <Text className="font-uiBold text-xs text-brand-primary">Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!overview.enabled) {
      return (
        <View className="items-center px-4 py-10">
          <Text className="font-uiBold text-center text-base text-neutral-on-surface">
            El programa todavía no arrancó
          </Text>
        </View>
      );
    }

    if (!overview.registered) {
      return (
        <AmbassadorSignupForm
          fullName={profile?.full_name ?? null}
          email={user?.email ?? null}
          submitting={busy}
          onSubmit={(input) => void handleSignup(input)}
        />
      );
    }

    const captainTeamId = myTeams.find((t) => t.role === 'CAPITAN')?.id ?? null;

    return (
      <>
        <AmbassadorEarningsHeader
          earnedTotal={overview.earned_total}
          paidTotal={overview.paid_total}
          slotsLeft={overview.slots_left}
          teamsCounted={overview.teams_counted}
          nextBonusAt={overview.next_bonus_at}
        />
        {!overview.follow_verified && <AmbassadorFollowCard />}
        {!overview.has_payout_alias && overview.earned_total > 0 && (
          <AmbassadorPayoutCard saving={busy} onSave={(alias) => void handleAlias(alias)} />
        )}
        {profile && (
          <AmbassadorShareCard
            profileId={profile.id}
            username={overview.username}
            onError={(message) => showAlert('No se pudo compartir', message)}
          />
        )}
        <AmbassadorDebutCard
          debutState={overview.debut_state}
          ownTeam={overview.own_team}
          eligibleTeams={overview.eligible_own_teams}
          defaultTeamId={captainTeamId}
          saving={busy}
          onConfirmTeam={(teamId) => void handleOwnTeam(teamId)}
        />
        <AmbassadorTeamsList teams={overview.brought_teams} />
      </>
    );
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader title="Embajadores" subtitle="Ganá $5.000 por cada equipo que traés." />
      {loading && !overview ? (
        <GlobalLoader />
      ) : (
        <ScrollView
          className="px-4"
          contentContainerStyle={{ paddingTop: 18, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {renderBody()}
        </ScrollView>
      )}
      {AlertComponent}
    </SafeAreaView>
  );
}
