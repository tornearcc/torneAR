import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { uploadProfileAvatar } from '@/lib/profile-edit-data';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';

interface Options {
  profileId: string;
  authUserId: string;
  /** Mismo contrato que `useCustomAlert().showAlert`. */
  showAlert: (title: string, message: string) => void;
  /** Path nuevo en el bucket `avatars`, ya guardado en `profiles`. */
  onUploaded?: (filePath: string) => void;
  /** Para los logs: qué pantalla cambió la foto. */
  scope: string;
}

/**
 * Elegir una foto de la galería y subirla como foto de perfil.
 *
 * Vivía dentro de `ProfileHeader`; sale a un hook porque ahora se cambia la
 * foto desde dos lugares: el visor de la pestaña Perfil ("Cambiar foto") y la
 * pantalla de edición de perfil.
 */
export function useAvatarUpload({ profileId, authUserId, showAlert, onUploaded, scope }: Options) {
  const { refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (imageUri: string, mimeType: string) => {
      try {
        setUploading(true);
        const filePath = await uploadProfileAvatar(profileId, authUserId, imageUri, mimeType);
        await refreshProfile();
        onUploaded?.(filePath);
        showAlert('Exito', 'Foto de perfil actualizada correctamente.');
      } catch (error) {
        // El bucket `avatars` ya rompió antes por policies de Storage (ver las
        // migraciones 20260727120000 / 20260727140000): que quede registrado.
        Logger.error('Fallo la subida del avatar', {
          scope: `${scope}.uploadAvatar`,
          profileId,
          mimeType,
          error,
        });
        showAlert(
          'Error al subir',
          getGenericSupabaseErrorMessage(error, 'No se pudo subir la imagen. Revisa conexion y politicas del bucket avatars.'),
        );
      } finally {
        setUploading(false);
      }
    },
    [profileId, authUserId, refreshProfile, onUploaded, showAlert, scope],
  );

  const pickAndUpload = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('Permiso denegado', 'Se necesita acceso a la galeria para seleccionar una imagen.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // Cuadrado
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await upload(asset.uri, asset.mimeType ?? 'image/jpeg');
      }
    } catch (error) {
      Logger.error('Fallo el selector de imagen del avatar', {
        scope: `${scope}.pickImage`,
        profileId,
        error,
      });
      showAlert('Error', 'No se pudo seleccionar la imagen.');
    }
  }, [upload, showAlert, scope, profileId]);

  return { uploading, pickAndUpload };
}
