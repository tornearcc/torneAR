import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { TEAM_CATEGORY_OPTIONS, TEAM_FORMAT_OPTIONS, TeamCategory, TeamFormat } from '@/lib/team-options';
import { createTeam } from '@/lib/team-create-data';
import { ZoneSelectField } from '@/components/ui/ZoneSelect';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { Logger } from '@/lib/logger';

export default function TeamCreateScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { fetchMyTeams } = useTeamStore();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [name, setName] = useState('');
  const [zone, setZone] = useState(profile?.zone ?? '');
  const [category, setCategory] = useState<TeamCategory>('MIXTO');
  const [format, setFormat] = useState<TeamFormat>('FUTBOL_7');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /*
   * `useState(profile?.zone ?? '')` solo se evalua en el primer render. Si esta
   * pantalla monta antes de que AuthContext termine de hidratar el perfil —
   * escenario real en cold start o al entrar rapido desde HomeOnboardingState —
   * `zone` quedaba en '' para siempre y el usuario veia "Selecciona una zona"
   * aunque su perfil ya tuviera una.
   *
   * Hidratamos una sola vez y nunca pisamos una eleccion del usuario: si ya
   * eligio zona antes de que llegara el perfil, el updater funcional la respeta.
   * Sin ese guard, un refreshProfile() posterior le revertiria la seleccion.
   */
  // El flag va en estado y no en una ref porque se lee durante el render: la
  // hidratacion se resuelve en el mismo commit en que llega el perfil, sin un
  // frame con el campo de zona todavia vacio.
  const [zoneHydrated, setZoneHydrated] = useState(false);

  const profileZone = profile?.zone;
  if (!zoneHydrated && profileZone) {
    setZoneHydrated(true);
    setZone((current) => (current.trim() ? current : profileZone));
  }

  const handleCreateTeam = async () => {
    if (!profile) {
      showAlert('Perfil no disponible', 'Necesitas completar tu perfil para crear un equipo.');
      return;
    }

    const sanitizedName = name.trim();
    const sanitizedZone = zone.trim();

    if (sanitizedName.length < 3) {
      showAlert('Nombre invalido', 'El nombre del equipo debe tener al menos 3 caracteres.');
      return;
    }
    if (!sanitizedZone) {
      showAlert('Zona requerida', 'Ingresa una zona para el equipo.');
      return;
    }

    try {
      setIsSubmitting(true);
      const teamData = await createTeam(profile.id, sanitizedName, sanitizedZone, category, format);

      Logger.info('Equipo creado', {
        scope: 'team-create.handleCreateTeam',
        teamId: teamData.id,
        captainProfileId: profile.id,
        zone: sanitizedZone,
        category,
        format,
      });

      showAlert('Equipo creado', `Tu equipo ${teamData.name} ya esta listo.`, async () => {
        if (profile?.id) {
          await fetchMyTeams(profile.id);
        }
        router.replace({ pathname: '/team-manage', params: { teamId: teamData.id } });
      });
    } catch (error: unknown) {
      Logger.error('No se pudo crear el equipo', {
        scope: 'team-create.handleCreateTeam',
        captainProfileId: profile.id,
        zone: sanitizedZone,
        category,
        format,
        code: (error as { code?: string }).code,
        error,
      });
      const fallbackMessage = (error as { code?: string }).code === '42501'
        ? 'No tienes permisos para crear equipos. Revisa las politicas de RLS para teams y team_members.'
        : 'No se pudo crear el equipo. Intentalo nuevamente.';
      showAlert('Error al crear equipo', getGenericSupabaseErrorMessage(error, fallbackMessage));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Crear equipo"
        subtitle="Defini la identidad de tu equipo y empeza a competir."
      />

      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 36 }}>
        <View className="gap-5">
          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Nombre del equipo</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ej: Barrio FC"
              placeholderTextColor="#5E5A58"
              className="rounded-xl border border-neutral-outline-variant/15 bg-surface-low px-4 py-4 text-neutral-on-surface"
              maxLength={36}
            />
          </View>

          <ZoneSelectField
            label="Zona"
            value={zone || null}
            onChange={(selected) => setZone(selected ?? '')}
            title="Zona del equipo"
            suggestedValue={profile?.zone ?? null}
          />

          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Categoria</Text>
            <View className="flex-row flex-wrap gap-2">
              {TEAM_CATEGORY_OPTIONS.map((option) => {
                const active = category === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setCategory(option.value)}
                    activeOpacity={0.9}
                    className={`rounded-lg border px-4 py-2 ${active ? 'border-brand-primary bg-brand-primary/20' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                  >
                    <Text className={`font-display text-xs uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View>
            <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Formato principal</Text>
            <View className="flex-row flex-wrap gap-2">
              {TEAM_FORMAT_OPTIONS.map((option) => {
                const active = format === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setFormat(option.value)}
                    activeOpacity={0.9}
                    className={`rounded-lg border px-4 py-2 ${active ? 'border-info-secondary bg-info-secondary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                  >
                    <Text className={`font-display text-xs uppercase tracking-wide ${active ? 'text-info-secondary' : 'text-neutral-on-surface-variant'}`}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <TouchableOpacity
          disabled={isSubmitting}
          onPress={handleCreateTeam}
          activeOpacity={0.9}
          className={`mt-8 flex-row items-center justify-center rounded-xl py-4 ${isSubmitting ? 'bg-brand-primary/45' : 'bg-brand-primary'}`}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#003914" />
          ) : (
            <>
              <AppIcon family="material-community" name="shield-plus" size={18} color="#003914" />
              <Text className="font-display ml-2 text-base uppercase tracking-wider text-[#003914]">Crear equipo</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}