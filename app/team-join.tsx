import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { TeamShield } from '@/components/ui/TeamShield';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { getTeamCategoryLabel, getTeamFormatLabel } from '@/lib/team-options';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { findTeamByCode, sendJoinRequest, TeamPreview } from '@/lib/team-join-data';
import { Logger } from '@/lib/logger';

export default function TeamJoinScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [inviteCode, setInviteCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [team, setTeam] = useState<TeamPreview | null>(null);

  const normalizedCode = inviteCode.trim().toUpperCase();

  const handleFindTeam = async () => {
    if (normalizedCode.length < 6) {
      showAlert('Codigo invalido', 'Revisa el codigo de invitacion e intenta nuevamente.');
      return;
    }

    try {
      setSearching(true);
      const foundTeam = await findTeamByCode(normalizedCode);

      if (!foundTeam) {
        Logger.warn('Código de invitación sin equipo asociado', {
          scope: 'team-join.handleFindTeam',
          codeLength: normalizedCode.length,
        });
        setTeam(null);
        showAlert('No encontrado', 'No existe un equipo con ese codigo.');
        return;
      }

      setTeam(foundTeam);
    } catch (error) {
      Logger.error('No se pudo validar el código de invitación', {
        scope: 'team-join.handleFindTeam',
        error,
      });
      showAlert('Error al buscar equipo', getGenericSupabaseErrorMessage(error, 'No se pudo validar el codigo de invitacion.'));
    } finally {
      setSearching(false);
    }
  };

  const handleJoinTeam = async () => {
    if (!profile || !team) return;

    try {
      setSubmittingRequest(true);
      
      await sendJoinRequest(team.id, {
        id: profile.id,
        full_name: profile.full_name,
        username: profile.username
      }, team.name);

      Logger.info('Solicitud de unión a equipo enviada', {
        scope: 'team-join.handleJoinTeam',
        teamId: team.id,
        profileId: profile.id,
      });

      showAlert('Solicitud enviada', `Tu solicitud para ${team.name} fue enviada.`, () => {
        router.back();
      });
    } catch (error: any) {
      if (error?.message === 'ALREADY_MEMBER') {
        Logger.warn('Solicitud de unión rechazada: el usuario ya es miembro', {
          scope: 'team-join.handleJoinTeam',
          teamId: team.id,
          profileId: profile.id,
        });
        showAlert('Ya sos miembro', 'Ya formas parte de este equipo.');
      } else if (error?.message === 'REQUEST_PENDING') {
        Logger.warn('Solicitud de unión rechazada: ya hay una pendiente', {
          scope: 'team-join.handleJoinTeam',
          teamId: team.id,
          profileId: profile.id,
        });
        showAlert('Solicitud pendiente', 'Ya enviaste una solicitud. Espera la respuesta del capitan.');
      } else {
        Logger.error('No se pudo enviar la solicitud de unión al equipo', {
          scope: 'team-join.handleJoinTeam',
          teamId: team.id,
          profileId: profile.id,
          code: error?.code,
          error,
        });
        const fallbackMessage = error?.code === '42501'
          ? 'No tienes permisos para enviar solicitudes. Revisa las politicas de RLS.'
          : 'No se pudo completar el envio de la solicitud.';
        showAlert('Error al enviar solicitud', getGenericSupabaseErrorMessage(error, fallbackMessage));
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Unirse a equipo"
        subtitle="Ingresa el codigo de invitacion para sumarte a un plantel."
      />

      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 36 }}>
        <View className="gap-4">
          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Codigo de invitacion</Text>
            <TextInput
              value={inviteCode}
              onChangeText={(value) => setInviteCode(value.toUpperCase())}
              placeholder="Ej: A1B2C3D4"
              autoCapitalize="characters"
              placeholderTextColor="#5E5A58"
              className="rounded-xl border border-neutral-outline-variant/15 bg-surface-low px-4 py-4 text-neutral-on-surface"
              maxLength={12}
            />
          </View>

          <TouchableOpacity
            onPress={handleFindTeam}
            activeOpacity={0.9}
            disabled={searching}
            className={`flex-row items-center justify-center rounded-xl py-4 ${searching ? 'bg-info-secondary/35' : 'bg-info-secondary/80'}`}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#0E2430" />
            ) : (
              <>
                <AppIcon family="material-community" name="magnify" size={18} color="#0E2430" />
                <Text className="font-display ml-2 text-base uppercase tracking-wider text-[#0E2430]">Buscar equipo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {team ? (
          <View className="mt-7 rounded-xl border border-neutral-outline-variant/40 bg-surface-low p-4">
            {/* Escudo a la izquierda: antes del "Enviar solicitud" el usuario
                solo tenia el nombre para confirmar que el codigo lo llevo al
                club correcto, y los nombres se repiten entre zonas. */}
            <View className="flex-row items-center gap-3">
              <TeamShield shieldUrl={team.shieldUrl} name={team.name} size={52} teamId={team.id} expandable />
              <View className="flex-1">
                <Text className="font-display text-2xl text-neutral-on-surface" numberOfLines={1}>
                  {team.name}
                </Text>
                <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">
                  {team.zone}
                </Text>
              </View>
            </View>

            <View className="mt-3 flex-row items-center gap-2">
              <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">{getTeamCategoryLabel(team.category)}</Text>
              <Text className="font-uiBold rounded bg-info-secondary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-info-secondary">{getTeamFormatLabel(team.preferred_format)}</Text>
              <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>Rating {team.elo_rating}</Text>
            </View>

            <TouchableOpacity
              onPress={handleJoinTeam}
              activeOpacity={0.9}
              disabled={submittingRequest}
              className={`mt-5 flex-row items-center justify-center rounded-xl py-3 ${submittingRequest ? 'bg-brand-primary/45' : 'bg-brand-primary'}`}
            >
              {submittingRequest ? (
                <ActivityIndicator size="small" color="#003914" />
              ) : (
                <>
                  <AppIcon family="material-community" name="send-outline" size={18} color="#003914" />
                  <Text className="font-display ml-2 text-sm uppercase tracking-wider text-[#003914]">Enviar solicitud</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}