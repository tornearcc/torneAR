// tornear/app/onboarding.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { ZoneSelectField } from '@/components/ui/ZoneSelect';
import { OptionPickerDialog } from '@/components/ui/OptionPickerDialog';
import { ProfileFormFields } from '@/components/profile/ProfileFormFields';
import { FAVORITE_TEAM_OPTIONS } from '@/lib/favorite-teams';
import { userProfileSchema, UserProfileFormData } from '@/lib/schemas/userSchema';
import { saveOnboardingProfile } from '@/lib/onboarding-data';
import { needsLegalAcceptance, recordLegalAcceptance } from '@/lib/auth-data';
import { LegalConsentCheckbox } from '@/components/ui/LegalConsentCheckbox';
import { useUsernameAvailability } from '@/hooks/useUsernameAvailability';
import { useReferralStore } from '@/stores/referralStore';
import { Logger } from '@/lib/logger';

const STEP_WIDTH = ['w-1/3', 'w-2/3', 'w-full'] as const;

/**
 * Campos que habilitan cada paso.
 *
 * El botón se apoya en estos sub-schemas y no en `formState.isValid`, que mira
 * el formulario COMPLETO: en el paso 1 los campos de los pasos 2 y 3 todavía
 * están vacíos, así que `isValid` sería `false` siempre y «Siguiente» nunca se
 * habilitaría. Recortar el mismo schema mantiene una sola fuente de reglas.
 */
const STEP_SCHEMAS = [
  userProfileSchema.pick({ fullName: true, username: true, zone: true }),
  userProfileSchema.pick({ dateOfBirth: true, gender: true, strongFoot: true, favoriteTeam: true }),
  // El paso 3 valida el formulario COMPLETO: es el que envía, así que su botón
  // sólo debe habilitarse si todo lo anterior sigue en pie.
  userProfileSchema,
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showFavoriteTeamPicker, setShowFavoriteTeamPicker] = useState(false);

  /**
   * ¿Hay que pedir el consentimiento acá?
   *
   * El alta por email ya lo trae: `signUp()` lo adjunta en `options.data` en el
   * mismo acto que crea la cuenta. Google no puede — el proveedor da de alta al
   * usuario en su propio consentimiento — así que esas cuentas llegan al
   * onboarding sin ninguna constancia, y este es el último punto donde se puede
   * pedir antes de que existan datos de perfil.
   *
   * Se resuelve UNA vez, al montar (initializer perezoso), y no en cada render:
   * `recordLegalAcceptance()` dispara `USER_UPDATED`, el AuthContext reemplaza
   * `user` con la metadata nueva y un valor derivado se daría vuelta a mitad del
   * envío, desmontando el checkbox mientras el botón todavía está en vuelo.
   */
  const [mustAcceptLegal] = useState(() => needsLegalAcceptance(user));
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  /**
   * Código de invitación, editable. Respaldo manual del deep link
   * (`tornear://login?ref=<username>`): si el usuario no tenía la app
   * instalada al tocar el link, el `?ref=` se pierde en el salto a la store
   * y nunca llega a `referralStore` — este campo es la única forma de
   * recuperarlo, tipeándolo a mano.
   *
   * El initializer perezoso LEE el store sin consumirlo: si el deep link sí
   * se capturó, el campo arranca completo para que el usuario no tenga que
   * volver a escribirlo; `consumePendingReferralUsername()` recién se llama
   * al enviar el formulario (ver `onSubmit`), y para entonces el campo ya es
   * la única fuente de verdad — si el usuario lo edita o lo borra, eso es lo
   * que se manda, no lo que haya quedado en el store.
   */
  const [referralCode, setReferralCode] = useState(
    () => useReferralStore.getState().pendingReferralUsername ?? '',
  );

  const { showAlert, AlertComponent } = useCustomAlert();

  // Google devuelve el nombre en `user_metadata` (name / full_name). Lo usamos
  // de valor inicial para no pedirle al usuario algo que el proveedor ya dio;
  // sigue siendo editable. En el alta por email no hay metadata y queda vacio.
  const googleFullName =
    typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : '';

  const {
    control,
    handleSubmit,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
    // `onTouched`: no reta mientras se escribe por primera vez, pero una vez que
    // el campo se tocó revalida en cada tecla, así el error inline desaparece
    // apenas se corrige (antes quedaba colgado; módulo 1.2).
    mode: 'onTouched',
    defaultValues: {
      fullName: googleFullName,
      username: '',
      zone: '',
      position: 'CUALQUIERA',
      dateOfBirth: '',
      gender: undefined,
      strongFoot: undefined,
      favoriteTeam: '',
    },
  });

  // useWatch por consistencia con /profile-edit: suscripcion por componente, sin
  // depender del Set global `_names.watch`. Detalle del bug en
  // components/profile/ProfileFormFields.tsx.
  const selectedZone = useWatch({ control, name: 'zone' });
  const selectedPosition = useWatch({ control, name: 'position' });
  const selectedFavoriteTeam = useWatch({ control, name: 'favoriteTeam' });

  // Validez del paso actual, calculada sobre los valores en vivo. Ver STEP_SCHEMAS.
  const values = useWatch({ control });
  const usernameAvailability = useUsernameAvailability(values.username ?? '');
  const isStepValid =
    STEP_SCHEMAS[step - 1].safeParse(values).success &&
    // El paso 1 espera además al chequeo de unicidad. `error` (sin red) no
    // bloquea: decide el índice único al guardar.
    (step !== 1 || (usernameAvailability !== 'taken' && usernameAvailability !== 'checking'));

  // El consentimiento gatea el envío igual que un campo incompleto: sin él no
  // hay alta posible. Sólo aplica al paso 3 — los pasos 1 y 2 no crean nada.
  const canSubmit = isStepValid && (!mustAcceptLegal || acceptedLegal);

  const handleNextStep = async () => {
    if (step === 1) {
      const valid = await trigger(['fullName', 'username', 'zone']);
      if (valid) setStep(2);
    } else if (step === 2) {
      // favoriteTeam entra acá: dejó de ser opcional y se elige en este paso,
      // junto al resto de los datos personales (ProfileFormFields).
      const valid = await trigger(['dateOfBirth', 'gender', 'strongFoot', 'favoriteTeam']);
      if (valid) setStep(3);
    }
  };

  const onSubmit = async (data: UserProfileFormData) => {
    if (!user) return;
    // Segunda barrera, además del botón deshabilitado: `handleSubmit` también se
    // dispara desde el teclado o desde un test, y completar el perfil sin
    // constancia de aceptación es un incumplimiento legal, no un bug de UI.
    // Mismo criterio que `app/login.tsx`.
    if (mustAcceptLegal && !acceptedLegal) return;

    setLoading(true);
    try {
      // La constancia va PRIMERO, antes de que exista fila en `profiles`.
      // Al revés quedaría un perfil completo —y por lo tanto una cuenta con
      // acceso a la app, según el guard de `_layout`— sin prueba de qué texto
      // aceptó su dueño. Si falla, se corta acá y no se crea nada.
      if (mustAcceptLegal) {
        const { error: legalError } = await recordLegalAcceptance();
        if (legalError) throw legalError;

        Logger.info('Consentimiento legal registrado en el onboarding', {
          scope: 'onboarding.onSubmit',
          userId: user.id,
        });
      }

      // El campo manda, no el store: es lo que el usuario ve y pudo editar o
      // vaciar. El store igual se consume acá —no antes: el perfil todavía
      // no existe en los pasos 1 y 2, y `set_referral` necesita que ya
      // exista— pero sólo para vaciarlo; su valor de retorno se descarta a
      // propósito. Sin este consumo, un `pendingReferralUsername` viejo
      // sobreviviría en AsyncStorage y precompletaría un onboarding futuro
      // (otro logout/login en el mismo dispositivo) con un código que ya no
      // corresponde.
      useReferralStore.getState().consumePendingReferralUsername();
      // Los UTM se consumen aparte del campo de código de invitación —
      // adrede independientes, ver el comentario de `PendingUtm` en
      // stores/referralStore.ts: que el usuario edite o borre "quién me
      // invitó" no tiene por qué borrar también "qué campaña me trajo".
      const pendingUtm = useReferralStore.getState().consumePendingUtm();
      const referredByUsername = referralCode.trim() || null;
      await saveOnboardingProfile(user.id, data, referredByUsername, pendingUtm);
      await refreshProfile();
      Logger.info('Onboarding completado', {
        scope: 'onboarding.onSubmit',
        userId: user.id,
      });
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string } | null;
      if (err?.code === '23505' && err?.message?.includes('username')) {
        Logger.warn('Onboarding rechazado por nombre de usuario duplicado', {
          scope: 'onboarding.onSubmit',
          userId: user.id,
        });
        setStep(1);
        showAlert('Error', 'Ese nombre de usuario ya está en uso. Por favor, elige otro.');
      } else {
        Logger.error('No se pudo guardar el perfil del onboarding', {
          scope: 'onboarding.onSubmit',
          userId: user.id,
          error,
        });
        showAlert(
          'Error al guardar',
          getGenericSupabaseErrorMessage(
            error,
            'No se pudo guardar tu perfil. Intentalo nuevamente.',
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {step > 1 && (
        <View className="px-6 pt-4 pb-2">
          <TouchableOpacity
            className="flex-row items-center gap-1 active:opacity-70"
            onPress={() => setStep((s) => s - 1)}
          >
            <AppIcon family="material-icons" name="arrow-back-ios-new" size={20} color="#BCCBB9" />
            <Text className="font-uiBold text-sm text-neutral-on-surface-variant">Atras</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 60,
          paddingTop: step === 1 ? 24 : 8,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress bar */}
        <View className="mb-8">
          <View className="flex-row justify-between items-end mb-3">
            <Text className="font-display text-xl uppercase tracking-widest text-brand-primary">
              Paso {step} de 3
            </Text>
            <Text className="font-ui text-sm text-neutral-on-surface-variant">
              {step === 1 ? 'Datos Base' : step === 2 ? 'Datos Personales' : 'Tu Cancha'}
            </Text>
          </View>
          <View className="h-1.5 w-full rounded-full overflow-hidden flex-row bg-surface-high">
            <View
              className={`h-full bg-brand-primary ${STEP_WIDTH[step - 1]}`}
              style={{ shadowColor: '#53E076', shadowOpacity: 0.4, shadowRadius: 12 }}
            />
          </View>
        </View>

        {/* ── PASO 1: Datos Base ─────────────────────────────────── */}
        {step === 1 && (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">
                Datos Personales
              </Text>
              <Text className="font-ui text-neutral-on-surface-variant">
                Cuentanos como te llamas y por donde prefieres jugar.
              </Text>
            </View>

            <View className="gap-4 mb-8">
              {/* FULL NAME */}
              <View>
                <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">
                  Nombre Completo
                </Text>
                <Controller
                  control={control}
                  name="fullName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.fullName ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                      placeholder="Ej: Lionel Messi"
                      placeholderTextColor="#3A3939"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {errors.fullName && (
                  <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>
                )}
              </View>

              {/* USERNAME */}
              <View>
                <Text className="font-display text-xs uppercase tracking-wider mb-2 text-neutral-on-surface-variant">
                  Nombre de Usuario
                </Text>
                <Controller
                  control={control}
                  name="username"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.username || usernameAvailability === 'taken' ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                      placeholder="Ej: leomessi"
                      placeholderTextColor="#3A3939"
                      autoCapitalize="none"
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
                  <Text className="font-ui text-xs mt-1 text-brand-primary">
                    ¡Disponible!
                  </Text>
                ) : null}
              </View>

              {/* ZONE */}
              <ZoneSelectField
                label="Zona de Juego Principal"
                value={selectedZone || null}
                onChange={(zone) => setValue('zone', zone ?? '', { shouldValidate: true })}
                error={errors.zone?.message}
              />
            </View>

            <HeroButton onPress={handleNextStep} disabled={!isStepValid} label="Siguiente" style={{ width: '100%' }} />
          </View>
        )}

        {/* ── PASO 2: Datos Personales ───────────────────────────── */}
        {step === 2 && (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">
                Datos Personales
              </Text>
              <Text className="font-ui text-neutral-on-surface-variant">
                Estos datos mejoran tu experiencia en el Mercado de Pases.
              </Text>
            </View>

            <View className="mb-8">
              {/* Mismo componente que usa /profile-edit: lo que se pide acá es
                  exactamente lo que después se puede editar (bug 2). */}
              <ProfileFormFields
                control={control}
                errors={errors}
                setValue={setValue}
                onOpenFavoriteTeamPicker={() => setShowFavoriteTeamPicker(true)}
              />
            </View>

            <HeroButton onPress={handleNextStep} disabled={!isStepValid} label="Siguiente" style={{ width: '100%' }} />
          </View>
        )}

        {/* ── PASO 3: Cancha ─────────────────────────────────────── */}
        {step === 3 && (
          <View>
            <View className="mb-6">
              <Text className="font-displayBlack text-3xl text-neutral-on-surface mb-2">
                Tu Cancha
              </Text>
              <Text className="font-ui text-neutral-on-surface-variant">
                Toca el sector de la cancha donde te destacas.
              </Text>
            </View>

            <PitchSelector
              value={selectedPosition}
              onChange={(val) => setValue('position', val, { shouldValidate: true })}
            />

            <View className="flex-row items-center justify-center mb-8">
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setValue('position', 'CUALQUIERA', { shouldValidate: true })}
                className={`px-8 py-3.5 rounded-full border ${
                  selectedPosition === 'CUALQUIERA'
                    ? 'bg-brand-primary border-[#003914]'
                    : 'bg-surface-low border-neutral-outline-variant/15'
                }`}
              >
                <Text
                  className={`font-display uppercase tracking-widest text-sm ${
                    selectedPosition === 'CUALQUIERA' ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                  }`}
                >
                  {selectedPosition === 'CUALQUIERA' && (
                    <AppIcon family="material-community" name="check-circle" size={14} color="#003914" />
                  )}{' '}
                  Soy Flexible
                </Text>
              </TouchableOpacity>
            </View>

            {/* Código de invitación — respaldo manual del deep link, ver el
                comentario de `referralCode` más arriba. Sin label propio: el
                placeholder ya pregunta y aclara "(Opcional)", y este es el
                único campo de la pantalla sin validación — sumarle además un
                label como los de arriba pesaría más de lo que un campo
                opcional debería. */}
            <View className="mb-8">
              <TextInput
                className="w-full rounded-xl border border-neutral-outline-variant/15 bg-surface-low px-4 py-4 text-neutral-on-surface"
                placeholder="¿Tenés un código de invitación? (Opcional)"
                placeholderTextColor="#3A3939"
                autoCapitalize="none"
                autoCorrect={false}
                value={referralCode}
                onChangeText={setReferralCode}
              />
            </View>

            {/* Quien ya aceptó en el alta ve el recordatorio de siempre; quien
                entró por Google ve el consentimiento real, porque su cuenta se
                creó sin él. Es el mismo componente que usa el registro por
                email, así que el texto y los enlaces no pueden divergir. */}
            {mustAcceptLegal ? (
              <View className="mt-8">
                <LegalConsentCheckbox
                  checked={acceptedLegal}
                  onToggle={setAcceptedLegal}
                  disabled={loading}
                />
              </View>
            ) : (
              <View className="mb-6 flex-row flex-wrap items-center justify-center px-4 mt-8">
                <Text className="font-ui text-xs text-neutral-on-surface-variant text-center">
                  Al comenzar aceptas los{' '}
                </Text>
                <TouchableOpacity onPress={() => router.push('/(modals)/terms' as any)}>
                  <Text className="font-uiBold text-xs text-brand-primary">Términos</Text>
                </TouchableOpacity>
                <Text className="font-ui text-xs text-neutral-on-surface-variant"> y la </Text>
                <TouchableOpacity onPress={() => router.push('/(modals)/privacy' as any)}>
                  <Text className="font-uiBold text-xs text-brand-primary">Privacidad</Text>
                </TouchableOpacity>
                <Text className="font-ui text-xs text-neutral-on-surface-variant">.</Text>
              </View>
            )}

            <HeroButton
              onPress={handleSubmit(onSubmit)}
              isLoading={loading}
              disabled={!canSubmit}
              label="Comenzar"
              style={{ width: '100%' }}
            />
          </View>
        )}
      </ScrollView>

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
