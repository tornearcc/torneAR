import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchMyBlocks, unblockUser, type BlockedUser } from '@/lib/blocks-data';
import { Logger } from '@/lib/logger';

/**
 * «Usuarios bloqueados», accesible desde Perfil → Preferencias.
 *
 * Existe porque la guideline 1.2 pide que el bloqueo sea una acción del
 * usuario, y una acción que no se puede deshacer desde ningún lado es una
 * trampa: si alguien bloquea por error, el contenido de esa persona le
 * desaparece para siempre sin forma de recuperarlo.
 *
 * Es también la pantalla que conviene mostrar en el video de revisión, después
 * de bloquear a alguien, para cerrar el circuito completo.
 */
export default function BlockedUsersScreen() {
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  const load = useCallback(async () => {
    try {
      setBlocks(await fetchMyBlocks());
    } catch (error) {
      Logger.error('No se pudo cargar la lista de usuarios bloqueados', {
        scope: 'blocked-users.load',
        error,
      });
      setBlocks([]);
      showAlert(
        'Error al cargar',
        getGenericSupabaseErrorMessage(error, 'No pudimos cargar tus usuarios bloqueados.'),
      );
    }
  }, [showAlert]);

  // Se recarga al volver a entrar, no sólo al montar: a esta pantalla se llega
  // después de bloquear desde otra parte de la app.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleUnblock(user: BlockedUser) {
    if (unblocking) return;
    setUnblocking(user.profile_id);

    try {
      await unblockUser(user.profile_id);
      Logger.info('Usuario desbloqueado', {
        scope: 'blocked-users.handleUnblock',
        targetProfileId: user.profile_id,
      });
      // Se quita de la lista en el acto en vez de re-pedirla: el servidor ya
      // confirmó, y un refetch dejaría la fila visible un instante más.
      setBlocks((current) => (current ?? []).filter((row) => row.profile_id !== user.profile_id));
    } catch (error) {
      Logger.error('No se pudo desbloquear al usuario', {
        scope: 'blocked-users.handleUnblock',
        targetProfileId: user.profile_id,
        error,
      });
      showAlert(
        'No se pudo desbloquear',
        getGenericSupabaseErrorMessage(error, 'Intentá de nuevo en unos segundos.'),
      );
    } finally {
      setUnblocking(null);
    }
  }

  if (!blocks) return <GlobalLoader label="Cargando bloqueos" />;

  return (
    <View className="flex-1 bg-surface-base">
      <SecondaryHeader title="Usuarios bloqueados" />

      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 60 }}>
        <Text className="font-ui mb-5 px-1 text-xs leading-5 text-neutral-on-surface-variant">
          No ves las publicaciones ni los mensajes de estas personas, y ellas no pueden escribirte ni
          postularse a tus búsquedas. Desbloquear deshace las dos cosas.
        </Text>

        {blocks.length === 0 ? (
          <EmptyState
            family="material-community"
            icon="account-cancel-outline"
            title="No bloqueaste a nadie"
            description="Cuando bloquees a alguien desde su perfil, un chat o el Mercado, va a aparecer acá."
          />
        ) : (
          <View className="gap-2">
            {blocks.map((user) => (
              <View
                key={user.profile_id}
                className="flex-row items-center gap-3 rounded-xl bg-surface-container p-4"
              >
                {user.avatar_url ? (
                  <Image
                    source={{ uri: user.avatar_url }}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-high">
                    <AppIcon family="material-community" name="account" size={20} color="#869585" />
                  </View>
                )}

                <View className="flex-1">
                  <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={1}>
                    {user.full_name}
                  </Text>
                  <Text className="font-ui text-xs text-neutral-on-surface-variant" numberOfLines={1}>
                    @{user.username}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => void handleUnblock(user)}
                  disabled={!!unblocking}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Desbloquear a ${user.full_name}`}
                  className={`rounded-lg border border-brand-primary/40 px-3 py-2 ${
                    unblocking ? 'opacity-40' : ''
                  }`}
                >
                  {unblocking === user.profile_id ? (
                    <ActivityIndicator size="small" color="#53E076" />
                  ) : (
                    <Text className="font-uiBold text-xs text-brand-primary">Desbloquear</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {AlertComponent}
    </View>
  );
}
