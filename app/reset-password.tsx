import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { zodResolver } from '@hookform/resolvers/zod';

import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { updatePassword } from '@/lib/auth-data';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';
import { PASSWORD_MIN_LENGTH, updatePasswordSchema } from '@/lib/schemas/authSchema';
import type { UpdatePasswordFormData } from '@/lib/schemas/authSchema';

/**
 * Pantalla de contraseña nueva del flujo de recuperación.
 *
 * NO se llega acá navegando: el único camino es el link del mail, que
 * `app/_layout.tsx` intercepta como `recover`, canjea la sesión y recién ahí
 * hace el `replace` para acá con `status` en los params.
 *
 * Ese `status` es la razón por la que la pantalla no consulta la sesión por su
 * cuenta: cuando el link vence —el caso de error más común, porque es de un
 * solo uso y dura una hora— no hay sesión NI error que mostrar, sólo una
 * pantalla vacía. El canje es quien sabe qué pasó, así que lo cuenta acá.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { status, message } = useLocalSearchParams<{ status?: string; message?: string }>();
  const { showAlert, AlertComponent } = useCustomAlert();
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordFormData>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onChange',
  });

  const linkIsValid = status === 'ready';

  const onSubmit = async (data: UpdatePasswordFormData) => {
    setSubmitting(true);
    try {
      const { error } = await updatePassword(data.password);
      if (error) throw error;

      Logger.info('Contraseña actualizada desde el flujo de recuperación', {
        scope: 'reset-password.onSubmit',
      });

      /*
       * Queda con sesión iniciada a propósito: el canje del link ya probó que
       * es dueño de la casilla, y volver a pedirle que se loguee con la clave
       * que acaba de crear es fricción sin ninguna ganancia de seguridad.
       *
       * El `replace` a `/(tabs)` es explícito y no delegado al guard: el guard
       * exime a esta ruta de sus tres ramas (ver `app/_layout.tsx`), así que si
       * no navegamos nosotros nadie lo hace y el usuario queda varado en el
       * formulario que ya completó.
       */
      showAlert('Contraseña actualizada', 'Ya podés seguir usando tu cuenta con la clave nueva.', () =>
        router.replace('/(tabs)'),
      );
    } catch (error) {
      Logger.error('No se pudo actualizar la contraseña', {
        scope: 'reset-password.onSubmit',
        error,
      });
      showAlert(
        'No se pudo actualizar',
        getGenericSupabaseErrorMessage(error, 'No pudimos guardar la contraseña. Intentá nuevamente.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!linkIsValid) {
    return (
      <SafeAreaView className="flex-1 bg-surface-base">
        <View className="flex-1 items-center justify-center px-8">
          <AppIcon family="material-community" name="link-variant-off" size={44} color="#FFB4AB" />
          <Text className="font-displayBlack mt-5 text-center text-2xl uppercase tracking-tight text-neutral-on-surface">
            Link vencido
          </Text>
          <Text className="font-ui mt-3 text-center text-neutral-on-surface-variant">
            {message ??
              'Este enlace ya se usó o expiró. Pedí uno nuevo desde «Olvidé mi contraseña».'}
          </Text>

          <View className="mt-10 w-full">
            <HeroButton label="Pedir otro enlace" onPress={() => router.replace('/forgot-password')} />
          </View>
          <TouchableOpacity className="mt-4 py-2" activeOpacity={0.7} onPress={() => router.replace('/login')}>
            <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
              Volver al inicio de sesión
            </Text>
          </TouchableOpacity>
        </View>
        {AlertComponent}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="flex-1 px-6 pt-10">
        <Text className="font-displayBlack mb-2 text-3xl uppercase tracking-tight text-neutral-on-surface">
          Nueva contraseña
        </Text>
        <Text className="font-ui mb-12 text-neutral-on-surface-variant">
          Elegí una clave nueva para tu cuenta. Necesita al menos {PASSWORD_MIN_LENGTH} caracteres.
        </Text>

        <View className="mb-5 gap-2">
          <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
            Contraseña
          </Text>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className={`rounded-xl border px-4 py-4 font-ui text-base text-neutral-on-surface ${
                  errors.password ? 'border-danger-error' : 'border-neutral-outline-variant/15'
                } bg-surface-low`}
                placeholder="••••••••"
                placeholderTextColor="#6F6D6C"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
              />
            )}
          />
          {errors.password && (
            <Text className="font-ui text-xs text-danger-error">{errors.password.message}</Text>
          )}
        </View>

        <View className="mb-10 gap-2">
          <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
            Repetir contraseña
          </Text>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                className={`rounded-xl border px-4 py-4 font-ui text-base text-neutral-on-surface ${
                  errors.confirmPassword ? 'border-danger-error' : 'border-neutral-outline-variant/15'
                } bg-surface-low`}
                placeholder="••••••••"
                placeholderTextColor="#6F6D6C"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect={false}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                onSubmitEditing={handleSubmit(onSubmit)}
                returnKeyType="done"
              />
            )}
          />
          {errors.confirmPassword && (
            <Text className="font-ui text-xs text-danger-error">{errors.confirmPassword.message}</Text>
          )}
        </View>

        <HeroButton
          label="Guardar contraseña"
          onPress={handleSubmit(onSubmit)}
          isLoading={submitting}
        />
      </View>

      {AlertComponent}
    </SafeAreaView>
  );
}
