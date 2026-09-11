import React, { useState } from 'react';
import { ActivityIndicator, Alert, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { deleteOwnAccount } from '@/lib/account-data';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();

  /**
   * `Alert.alert` nativo y no `ConfirmDialog` (el diálogo propio que usa el
   * resto de la app — ver su comentario "100% custom, nada de Alert nativo").
   * Es la única excepción deliberada: para la acción más irreversible de
   * toda la app, que el diálogo se vea y se sienta distinto a cualquier otro
   * de la UI es parte del mensaje — corta el flujo con algo que no se puede
   * confundir con una confirmación más.
   *
   * Doble paso: el primer Alert es la pregunta normal; el segundo repite la
   * advertencia de que no hay vuelta atrás. Cancelar en cualquiera de los
   * dos no dispara nada.
   */
  function confirmDeleteAccount() {
    Alert.alert(
      '¿Eliminar tu cuenta?',
      'Vas a dejar de poder iniciar sesión y anonimizamos tus datos personales (nombre, usuario, foto, fecha de nacimiento). Los partidos que ya jugaste y tus estadísticas se conservan de forma disociada, porque son parte del historial de tus rivales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Esto no se puede deshacer',
              'Confirmá una última vez: tu cuenta se elimina ahora mismo.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Sí, eliminar mi cuenta',
                  style: 'destructive',
                  onPress: () => void handleDeleteAccount(),
                },
              ],
            );
          },
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await deleteOwnAccount();
      if (error) throw error;

      Logger.info('Cuenta eliminada por el usuario', { scope: 'settings.handleDeleteAccount' });

      // El guard de app/_layout.tsx redirige a /login apenas detecta
      // `!session` — no hace falta un router.replace acá, mismo criterio que
      // el resto de los flujos de auth de la app.
      await signOut();
    } catch (error) {
      Logger.error('No se pudo eliminar la cuenta', {
        scope: 'settings.handleDeleteAccount',
        error,
      });
      showAlert(
        'No se pudo eliminar tu cuenta',
        getGenericSupabaseErrorMessage(error, 'Intentá de nuevo en unos minutos.'),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader title="Preferencias" />

      {/* El `padding: 24` uniforme apretaba las filas contra el centro y
          desalineaba esta pantalla del resto, que usa px-4. */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 60 }}>

        {/* Settings Block: Privacidad y seguridad.
            Va PRIMERO y no enterrado al final: es la pantalla que Apple pide
            poder ver en el video de revisión (guideline 1.2, el bloqueo tiene
            que ser reversible desde algún lado). */}
        <View className="mb-6">
          <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
            Privacidad y seguridad
          </Text>
          <View className="overflow-hidden rounded-xl bg-surface-low">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/blocked-users' as any)}
              className="w-full flex-row items-center justify-between px-5 py-4"
            >
              <View className="flex-row items-center gap-4">
                <AppIcon family="material-community" name="account-cancel-outline" size={18} color="#BCCBB9" />
                <Text className="font-ui text-sm text-neutral-on-surface">Usuarios bloqueados</Text>
              </View>
              <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Block: Legal */}
        <View className="mb-6">
          <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
            Legal
          </Text>
          <View className="overflow-hidden rounded-xl bg-surface-low">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(modals)/terms' as any)}
              className="w-full flex-row items-center justify-between border-b border-neutral-outline-variant/35 px-5 py-4"
            >
              <View className="flex-row items-center gap-4">
                <AppIcon family="material-community" name="file-document-outline" size={18} color="#BCCBB9" />
                <Text className="font-ui text-sm text-neutral-on-surface">Términos y Condiciones</Text>
              </View>
              <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(modals)/privacy' as any)}
              className="w-full flex-row items-center justify-between px-5 py-4"
            >
              <View className="flex-row items-center gap-4">
                <AppIcon family="material-community" name="shield-check-outline" size={18} color="#BCCBB9" />
                <Text className="font-ui text-sm text-neutral-on-surface">Política de Privacidad</Text>
              </View>
              <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Block: Zona de riesgo */}
        <View className="mb-6">
          <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">
            Zona de riesgo
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={confirmDeleteAccount}
            disabled={deleting}
            className={`w-full flex-row items-center justify-between rounded-xl border border-danger-error/30 bg-danger-error/10 px-5 py-4 ${
              deleting ? 'opacity-60' : ''
            }`}
          >
            <View className="flex-row items-center gap-4">
              <AppIcon family="material-community" name="account-remove-outline" size={18} color="#FFB4AB" />
              <Text className="font-uiBold text-sm text-danger-error">Eliminar mi cuenta</Text>
            </View>
            {deleting && <ActivityIndicator color="#FFB4AB" size="small" />}
          </TouchableOpacity>
        </View>

      </ScrollView>

      {AlertComponent}
    </SafeAreaView>
  );
}
