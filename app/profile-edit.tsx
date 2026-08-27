import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller, useWatch, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { HeroButton } from '@/components/ui/HeroButton';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';
import { updateProfile } from '@/lib/profile-edit-data';
import { useUsernameAvailability } from '@/hooks/useUsernameAvailability';
import { ZoneSelectField } from '@/components/ui/ZoneSelect';
import { OptionPickerDialog } from '@/components/ui/OptionPickerDialog';
import { ProfileFormFields } from '@/components/profile/ProfileFormFields';
import { FAVORITE_TEAM_OPTIONS } from '@/lib/favorite-teams';
import { toDisplayDate } from '@/lib/date-mask';
import { userProfileSchema, UserProfileFormData } from '@/lib/schemas/userSchema';
import { Logger } from '@/lib/logger';
import type { Database } from '@/types/supabase';

type ProfilePos = UserProfileFormData['position'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/**
 * Hidrata el formulario desde el perfil de la sesion.
 *
 * ⚠️ Debe cubrir TODOS los campos de userProfileSchema. Cuando faltaban
 * dateOfBirth / gender / strongFoot / favoriteTeam, el resolver los evaluaba
 * como undefined, handleSubmit abortaba antes de llamar a onSubmit y — como
 * esos campos ni siquiera se renderizaban — no habia ningun mensaje de error
 * visible: el boton "Guardar cambios" simplemente no hacia nada. Ese era el
 * bug 2 real, mas grave que "faltan campos".
 */
/*
 * DefaultValues<T> y no T: gender/strongFoot pueden faltar en un perfil viejo y
 * el form debe poder arrancar sin ellos para que el usuario los complete. El
 * schema sigue exigiéndolos al guardar.
 */
function buildDefaultValues(profile: ProfileRow | null): DefaultValues<UserProfileFormData> {
  return {
    fullName: profile?.full_name ?? '',
    username: profile?.username ?? '',
    zone: profile?.zone ?? '',
    position: (profile?.preferred_position as ProfilePos | null) ?? 'CUALQUIERA',
    dateOfBirth: toDisplayDate(profile?.date_of_birth),
    gender: (profile?.gender as UserProfileFormData['gender'] | null) ?? undefined,
    strongFoot: (profile?.strong_foot as UserProfileFormData['strongFoot'] | null) ?? undefined,
    // Los perfiles viejos traen texto libre ('Boca'). Se hidrata igual: el
    // schema lo rechaza recien al guardar y el usuario elige del select.
    favoriteTeam: profile?.favorite_team ?? '',
  };
}

export default function ProfileEditScreen() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [showFavoriteTeamPicker, setShowFavoriteTeamPicker] = useState(false);

  const { showAlert, AlertComponent } = useCustomAlert();

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
    // Ver onboarding: revalida en cada tecla una vez tocado el campo, así el
    // error inline se va apenas se corrige.
    mode: 'onTouched',
    defaultValues: buildDefaultValues(profile),
  });

  // defaultValues se congela en el primer render. Si la pantalla monta antes de
  // que AuthContext termine de cargar el perfil, el form quedaria vacio y el
  // usuario pisaria sus propios datos con strings vacios al guardar.
  useEffect(() => {
    if (profile) reset(buildDefaultValues(profile));
  }, [profile, reset]);

  // useWatch y no `watch`: el reset() de arriba vacia `control._names.watch` y
  // deja al `watch` de useForm sin poder re-renderizar. Detalle en
  // components/profile/ProfileFormFields.tsx.
  const selectedZone = useWatch({ control, name: 'zone' });
  const selectedPosition = useWatch({ control, name: 'position' });
  const selectedFavoriteTeam = useWatch({ control, name: 'favoriteTeam' });

  // Validez sobre los valores en vivo. `formState.isValid` acá sí serviría (es
  // un formulario de un solo paso), pero arrancaría en `false` hasta la primera
  // validación y el botón se vería deshabilitado con el perfil ya cargado.
  const values = useWatch({ control });
  const usernameAvailability = useUsernameAvailability(values.username ?? '', {
    // El usuario ya "ocupa" su propio username: sin esta exclusión, abrir la
    // pantalla y no tocar nada lo marcaría como tomado.
    currentUsername: profile?.username ?? undefined,
    excludeProfileId: profile?.id,
  });
  const canSubmit =
    userProfileSchema.safeParse(values).success &&
    usernameAvailability !== 'taken' &&
    usernameAvailability !== 'checking';

  const onSubmit = useCallback(
    async (data: UserProfileFormData) => {
      if (!profile) return;
      setLoading(true);

      try {
        await updateProfile(profile.id, data);
        await refreshProfile();
        Logger.info('Perfil actualizado', {
          scope: 'profile-edit.onSubmit',
          profileId: profile.id,
        });
        showAlert('Éxito', 'Tu perfil se ha actualizado correctamente.');

        // Navigate back after a short delay so user sees the success message
        setTimeout(() => {
          router.back();
        }, 1500);
      } catch (error: unknown) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;

        if (code === '23505') {
          Logger.warn('Actualización de perfil rechazada por nombre de usuario duplicado', {
            scope: 'profile-edit.onSubmit',
            profileId: profile.id,
          });
          showAlert('Error al actualizar', 'Ese nombre de usuario ya está en uso. Por favor, elige otro.');
        } else {
          Logger.error('No se pudo actualizar el perfil', {
            scope: 'profile-edit.onSubmit',
            profileId: profile.id,
            error,
          });
          showAlert('Error al actualizar', getGenericSupabaseErrorMessage(error, 'No pudimos guardar los cambios.'));
        }
      } finally {
        setLoading(false);
      }
    },
    [profile, refreshProfile, router, showAlert],
  );

  if (loading) {
    return <GlobalLoader label="Guardando cambios..." />;
  }

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      {/* El header queda FUERA del KeyboardAvoidingView: adentro, al abrirse el
          teclado la cabecera se comprimia junto con el formulario y el boton de
          retroceso se iba debajo de la barra de estado. */}
      <SecondaryHeader
        title="Editar Perfil"
        subtitle="Modifica tus datos personales y tu posicion preferida en la cancha."
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="px-4"
          contentContainerStyle={{ paddingTop: 18, paddingBottom: 36 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4">
            {/* FULL NAME */}
            <View>
              <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">Nombre y Apellido</Text>
              <Controller
                control={control}
                name="fullName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.fullName ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                    placeholder="Ej. Lionel Messi"
                    placeholderTextColor="#3A3939"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    autoCapitalize="words"
                  />
                )}
              />
              {errors.fullName && <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>}
            </View>

            {/* USERNAME */}
            <View>
              <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">Nombre de usuario</Text>
              <Controller
                control={control}
                name="username"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.username || usernameAvailability === 'taken' ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                    placeholder="usuario_123"
                    placeholderTextColor="#3A3939"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onBlur={onBlur}
                    onChangeText={(text) => onChange(text.toLowerCase())}
                    value={value}
                  />
                )}
              />
              {errors.username ? (
                <Text className="text-red-500 text-xs mt-1">{errors.username.message}</Text>
              ) : usernameAvailability === 'checking' ? (
                <Text className="font-ui text-xs mt-1 text-neutral-on-surface-variant">
                  Verificando disponibilidad...
                </Text>
              ) : usernameAvailability === 'taken' ? (
                <Text className="text-red-500 text-xs mt-1">
                  Ese usuario ya está en uso, probá con otro.
                </Text>
              ) : usernameAvailability === 'available' ? (
                <Text className="font-ui text-xs mt-1 text-brand-primary">¡Disponible!</Text>
              ) : null}
            </View>

            {/* ZONE */}
            <ZoneSelectField
              label="Zona de Juego Principal"
              value={selectedZone || null}
              onChange={(zone) => setValue('zone', zone ?? '', { shouldValidate: true })}
              error={errors.zone?.message}
              /* La zona actual del perfil arriba de todo: en "editar" el caso más
                 común es abrir, mirar lo que hay y cerrar sin cambiar nada. */
              suggestedValue={profile?.zone ?? null}
            />

            {/* DATOS PERSONALES — mismo bloque que exige el onboarding (bug 2) */}
            <ProfileFormFields
              control={control}
              errors={errors}
              setValue={setValue}
              onOpenFavoriteTeamPicker={() => setShowFavoriteTeamPicker(true)}
            />

            {/* POSITION */}
            <View>
              <Text className="font-display text-xs uppercase tracking-widest text-[#BCCBB9] text-center mb-6 mt-4">Tu Posición Preferida</Text>
              <Controller
                control={control}
                name="position"
                render={({ field: { onChange, value } }) => (
                  <PitchSelector value={value} onChange={onChange} />
                )}
              />

              {/* Opción Flexible como lo pide el diseño */}
              <View className="flex-row items-center justify-center mt-6 mb-2">
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setValue('position', 'CUALQUIERA', { shouldValidate: true })}
                  className={`px-8 py-3.5 rounded-full border ${selectedPosition === 'CUALQUIERA' ? 'bg-brand-primary border-[#003914]' : 'bg-surface-low border-neutral-outline-variant/15'}`}
                >
                  <Text className={`font-display uppercase tracking-widest text-sm ${selectedPosition === 'CUALQUIERA' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'}`}>
                    {selectedPosition === 'CUALQUIERA' && <AppIcon family="material-community" name="check-circle" size={14} color="#003914" />} Soy Flexible
                  </Text>
                </TouchableOpacity>
              </View>

              {errors.position && <Text className="font-ui mt-1 text-xs text-red-500 text-center">{errors.position.message}</Text>}
            </View>
          </View>

          <View className="mt-8">
            {/* SAVE BUTTON */}
            <HeroButton
              onPress={handleSubmit(onSubmit)}
              label={loading ? 'Guardando...' : 'Guardar Cambios'}
              isLoading={loading}
              disabled={!canSubmit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionPickerDialog
        visible={showFavoriteTeamPicker}
        title="Cuadro favorito"
        options={FAVORITE_TEAM_OPTIONS}
        selected={selectedFavoriteTeam}
        onClose={() => setShowFavoriteTeamPicker(false)}
        onSelect={(val) => setValue('favoriteTeam', val, { shouldValidate: true })}
      />

      {AlertComponent}
    </SafeAreaView>
  );
}
