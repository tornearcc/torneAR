import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { AuthError } from '@supabase/supabase-js';
import { buildLegalAcceptance, signIn, signInWithGoogle, signUp } from '@/lib/auth-data';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { GlobalLoader } from '@/components/GlobalLoader';
import { getAuthErrorMessage } from '@/lib/auth-error-messages';
import { HeroButton } from '@/components/ui/HeroButton';
import { GoogleAuthButton } from '@/components/ui/GoogleAuthButton';
import { router, useLocalSearchParams } from 'expo-router';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { Logger } from '@/lib/logger';
import { useSignupGateStore } from '@/stores/signupGateStore';
import { useReferralStore } from '@/stores/referralStore';
import { useMinimumVisible } from '@/hooks/useMinimumVisible';
import {
  signInSchema,
  signUpSchema,
  PASSWORD_MIN_LENGTH,
  type AuthFormData,
} from '@/lib/schemas/authSchema';
import { LegalConsentCheckbox } from '@/components/ui/LegalConsentCheckbox';
import { LegalLinksNotice } from '@/components/ui/LegalLinksNotice';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  // Consentimiento legal. Sólo aplica al registro: una cuenta que ya existe
  // aceptó al crearse y volver a pedírselo en cada login no aporta nada.
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const { showAlert, AlertComponent } = useCustomAlert();

  // Captura del código de referido (`tornear://login?ref=<username>`) y de
  // los UTM de campaña que puedan venir en el mismo link (Fase 3 de
  // Marketing & Growth — `deepLinkToHref`/`normalizeUniversalLink` en
  // lib/deep-linking.ts ya los preservan). Acá sólo se leen y se guardan
  // para el onboarding: `profiles` no tiene grant para `anon`, recién se
  // puede escribir con sesión activa (ver stores/referralStore.ts).
  const { ref: referralUsername, utm_source, utm_medium, utm_campaign } = useLocalSearchParams<{
    ref?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>();

  useEffect(() => {
    if (referralUsername) {
      useReferralStore.getState().setPendingReferralUsername(referralUsername);
    }
  }, [referralUsername]);

  useEffect(() => {
    if (utm_source || utm_medium || utm_campaign) {
      useReferralStore.getState().setPendingUtm({
        source: utm_source ?? null,
        medium: utm_medium ?? null,
        campaign: utm_campaign ?? null,
      });
    }
  }, [utm_source, utm_medium, utm_campaign]);

  // Flags de PRESENTACIÓN. Los guards de reentrada de abajo siguen mirando
  // `loading` / `googleLoading` reales: si usaran estos, el formulario quedaría
  // bloqueado más tiempo del que dura la operación.
  const showAuthLoader = useMinimumVisible(loading);
  const showGoogleLoader = useMinimumVisible(googleLoading);

  // El schema depende del modo: login no revalida el largo (cuentas viejas con
  // 6 caracteres deben poder entrar), registro exige PASSWORD_MIN_LENGTH.
  // RHF reasigna control._options en cada render, asi que cambiar el resolver
  // al alternar de modo toma efecto en la validacion siguiente.
  const { control, handleSubmit, clearErrors, formState: { errors } } = useForm<AuthFormData>({
    resolver: zodResolver(isLogin ? signInSchema : signUpSchema),
    // `onTouched`: el error de contraseña corta desaparece apenas se corrige, en
    // vez de quedar colgado hasta el próximo envío.
    mode: 'onTouched',
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Validez calculada contra el schema ACTIVO y no con `formState.isValid`.
  // El resolver cambia al alternar login/registro y `isValid` queda con el
  // veredicto del schema anterior hasta la siguiente validación; parsear los
  // valores en vivo no tiene ese desfasaje. Habilita el botón —antes se podía
  // tocar «Crear cuenta» indefinidamente con la contraseña corta y no pasaba
  // nada (auditoría E2E, módulo 1.1).
  const values = useWatch({ control });
  const schemaValid = (isLogin ? signInSchema : signUpSchema).safeParse(values).success;
  // En registro el consentimiento es parte de la validez del formulario: sin él
  // no hay alta posible, así que gatea el botón igual que un campo incompleto.
  const canSubmit = schemaValid && (isLogin || acceptedLegal);

  // Red de seguridad: la retención del guard se suelta al cerrar el modal, pero
  // si la pantalla se desmonta antes por cualquier vía, dejarla puesta bloquearía
  // la redirección a /onboarding de ahí en adelante.
  useEffect(() => () => useSignupGateStore.getState().releaseOnboardingRedirect(), []);

  // Al alternar limpiamos los errores del schema anterior: si no, el mensaje
  // "debe tener al menos 8 caracteres" queda colgado despues de volver a login.
  const toggleMode = () => {
    clearErrors();
    setIsLogin((prev) => !prev);
  };

  // 3. La función onSubmit recibe directamente los datos validados
  const onSubmit = async (data: AuthFormData) => {
    if (loading) return;
    // Segunda barrera, además del botón deshabilitado: `handleSubmit` puede
    // dispararse por otras vías (submit del teclado, un test) y crear una cuenta
    // sin consentimiento sería un incumplimiento legal, no un bug de UI.
    if (!isLogin && !acceptedLegal) return;

    setLoading(true);
    let error: AuthError | null = null;

    try {
      if (isLogin) {
        const { error: signInError } = await signIn(data.email, data.password);
        if (!signInError) {
          Logger.info('Login con email exitoso', { scope: 'login.onSubmit' });
        }
        error = signInError;
      } else {
        const { error: signUpError } = await signUp(
          data.email,
          data.password,
          buildLegalAcceptance(),
        );

        if (!signUpError) {
          Logger.info('Cuenta creada con email', { scope: 'login.onSubmit' });
          // El copy anterior mandaba a revisar el correo, pero la confirmación
          // por email está desactivada en Supabase: la sesión queda activa en el
          // acto y el usuario sigue derecho al onboarding. Se retiene el guard
          // para que ese salto sea consecuencia de tocar «Aceptar» y no algo que
          // pasa por detrás del modal. Ver stores/signupGateStore.ts.
          useSignupGateStore.getState().holdOnboardingRedirect();
          showAlert(
            '¡Ya sos parte!',
            'Tu cuenta está creada. Ahora completá tu perfil de jugador para salir a la cancha.',
            () => useSignupGateStore.getState().releaseOnboardingRedirect(),
            'success',
          );
        }

        error = signUpError;
      }
    } catch (unexpectedError) {
      Logger.error('Excepción inesperada en el formulario de autenticación', {
        scope: 'login.onSubmit',
        mode: isLogin ? 'login' : 'signup',
        error: unexpectedError,
      });
      error = {
        name: 'AuthError',
        message: String(unexpectedError),
        status: 0,
      } as AuthError;
    } finally {
      setLoading(false);
    }

    if (error) {
      // Supabase devuelve el fallo de credenciales como valor, no como throw: sin
      // esto, un login rechazado no dejaría ninguna huella en telemetría.
      Logger.warn('Autenticación rechazada', {
        scope: 'login.onSubmit',
        mode: isLogin ? 'login' : 'signup',
        status: error.status,
        reason: error.message,
      });
      showAlert('Error de autenticacion', getAuthErrorMessage(error, isLogin ? 'login' : 'signup'));
    }
    // NOTA: No hacemos router.replace aca. El guard de app/_layout.tsx atrapa el
    // cambio de sesion y decide el destino de forma centralizada: si hay un
    // pendingDeepLink guardado (deep link que llego mientras estabamos deslogueados)
    // lo consume y navega ahi; si no, cae en /(tabs) — respetando siempre el gate
    // de onboarding. Redirigir aca competiria con ese guard y podria saltear onboarding.
  };

  // Google no distingue entre "entrar" y "registrarse": el proveedor crea la
  // cuenta en el primer consentimiento. Por eso el boton es el mismo en los dos
  // modos, y el gate de onboarding (app/_layout.tsx) es el que pide los datos
  // del perfil que Google no aporta (zona, posicion, pie habil, nacimiento).
  const onGooglePress = async () => {
    if (loading || googleLoading) return;

    setGoogleLoading(true);
    try {
      const { error, cancelled } = await signInWithGoogle();

      // Cerrar la ventana de Google es una decision del usuario, no un fallo:
      // volvemos al formulario sin alerta.
      if (!cancelled && error) {
        Logger.warn('Autenticación con Google rechazada', {
          scope: 'login.onGooglePress',
          reason: error instanceof Error ? error.message : String(error),
        });
        showAlert('Error de autenticacion', getAuthErrorMessage(error, 'login'));
      } else if (cancelled) {
        Logger.info('El usuario canceló el consentimiento de Google', {
          scope: 'login.onGooglePress',
        });
      } else {
        Logger.info('Login con Google exitoso', { scope: 'login.onGooglePress' });
      }
    } catch (unexpectedError) {
      Logger.error('Excepción inesperada en el login con Google', {
        scope: 'login.onGooglePress',
        error: unexpectedError,
      });
      showAlert('Error de autenticacion', getAuthErrorMessage(unexpectedError, 'login'));
    } finally {
      setGoogleLoading(false);
    }
    // Igual que arriba: no navegamos, el guard de _layout atrapa la sesion nueva.
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-surface-base"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="mb-12 items-center">
          <Text className="font-displayBlack mb-2 text-4xl italic tracking-tighter text-brand-primary">TorneAR</Text>
          <Text className="font-ui text-base text-center text-neutral-on-surface-variant">
            {isLogin ? 'Bienvenido de vuelta a la cancha' : 'Comienza tu viaje hoy'}
          </Text>
        </View>

        <View className="space-y-4 mb-8 gap-4">
          <View>
            <Text className="font-uiBold mb-2 text-neutral-on-surface">Correo Electronico</Text>
            {/* 4. Usamos Controller para el input */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.email ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                  placeholder="jugador@tornear.com"
                  placeholderTextColor="#BCCBB9"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              )}
            />
            {errors.email && <Text className="text-red-500 text-xs mt-1">{errors.email.message}</Text>}
          </View>

          <View>
            <Text className="font-uiBold mb-2 text-neutral-on-surface">Contraseña</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full rounded-xl border px-4 py-4 text-neutral-on-surface ${errors.password ? 'border-red-500' : 'border-neutral-outline-variant/15'} bg-surface-low`}
                  placeholder="••••••••"
                  placeholderTextColor="#BCCBB9"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  secureTextEntry
                />
              )}
            />
            {errors.password && <Text className="text-red-500 text-xs mt-1">{errors.password.message}</Text>}

            {/* Hint proactivo solo en registro: el usuario conoce la regla ANTES
                de que el server rechace la contrasena. */}
            {!isLogin && !errors.password && (
              <Text className="font-ui mt-1 text-xs text-neutral-outline">
                Mínimo {PASSWORD_MIN_LENGTH} caracteres.
              </Text>
            )}

            {isLogin && (
              <TouchableOpacity onPress={() => router.push('/forgot-password')} className="mt-2 items-end">
                <Text className="font-uiBold text-xs text-brand-primary">¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!isLogin && (
          <LegalConsentCheckbox
            checked={acceptedLegal}
            onToggle={setAcceptedLegal}
            disabled={showAuthLoader || showGoogleLoader}
          />
        )}

        <HeroButton
          onPress={handleSubmit(onSubmit)}
          isLoading={showAuthLoader}
          disabled={showGoogleLoader || !canSubmit}
          label={isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
          style={{ marginBottom: 24, width: '100%', shadowColor: '#53E076', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
        />

        <View className="mb-6 flex-row items-center gap-4">
          <View className="h-px flex-1 bg-neutral-outline/30" />
          <Text className="font-ui text-xs uppercase tracking-widest text-neutral-outline">o</Text>
          <View className="h-px flex-1 bg-neutral-outline/30" />
        </View>

        {/* Google da de alta la cuenta en el primer consentimiento, así que en
            modo registro queda sujeto al mismo checkbox: si sólo gateáramos el
            botón de email, registrarse con Google saltearía la aceptación. */}
        <GoogleAuthButton
          onPress={onGooglePress}
          isLoading={showGoogleLoader}
          disabled={showAuthLoader || (!isLogin && !acceptedLegal)}
          label={isLogin ? 'Continuar con Google' : 'Registrarme con Google'}
        />

        {/* En registro los documentos ya están enlazados desde el checkbox de
            arriba; repetirlos acá sería el mismo párrafo dos veces en la misma
            pantalla. En login no hay checkbox —la cuenta que ya existe aceptó
            al crearse— pero los botones de OAuth sí pueden dar de alta una
            cuenta nueva desde esta pestaña, así que los documentos tienen que
            estar a la vista igual. */}
        {isLogin && <LegalLinksNotice />}

        <TouchableOpacity onPress={toggleMode} className="items-center py-4">
          <Text className="font-ui text-sm text-neutral-on-surface-variant">
            {isLogin ? "¿No tienes una cuenta? " : "¿Ya tienes una cuenta? "}
            <Text className="font-uiBold text-brand-primary">{isLogin ? 'Regístrate' : 'Inicia Sesión'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {AlertComponent}

      {showAuthLoader && <GlobalLoader label={isLogin ? 'Iniciando sesión' : 'Creando cuenta'} />}
    </KeyboardAvoidingView>
  );
}