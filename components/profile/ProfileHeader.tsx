import { useState } from 'react';
import { AppIcon } from '@/components/ui/AppIcon';
import { Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { ProfileRow } from './types';
import { calculateAge, formatAge } from '@/lib/age';
import { resolveAvatarUrl } from '@/lib/supabase-storage';
import { Avatar } from '@/components/ui/Avatar';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { uploadProfileAvatar } from '@/lib/profile-edit-data';
import CustomAlert from '@/components/ui/CustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';

type ProfileHeaderProps = {
  profile: ProfileRow;
  onAvatarUpdate?: (newAvatarUrl: string) => void;
  /**
   * Recompensa de estatus del sistema de referidos: `true` cuando la insignia
   * "embajador" está ganada (`get_player_badges`, slug `embajador`). Se
   * deriva del array de insignias que la pantalla ya carga — no dispara
   * ninguna query nueva acá.
   */
  isEmbajador?: boolean;
};

function positionLabel(position: string): string {
  return position.replaceAll('_', ' ');
}

export function ProfileHeader({ profile, onAvatarUpdate, isEmbajador = false }: ProfileHeaderProps) {
  const { refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState(profile.avatar_url);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const avatarUrl = resolveAvatarUrl(avatarPath);

  const ageLabel = formatAge(calculateAge(profile.date_of_birth));

  const pickAndUploadImage = async () => {
    try {
      // Solicitar permisos
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        showAlert('Permiso denegado', 'Se necesita acceso a la galeria para seleccionar una imagen.');
        return;
      }

      // Abrir selector de imagen
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // Cuadrado
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
      }
    } catch (error) {
      Logger.error('Fallo el selector de imagen del avatar', {
        scope: 'ProfileHeader.pickImage',
        profileId: profile.id,
        error,
      });
      showAlert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const uploadAvatar = async (imageUri: string, mimeType: string) => {
    try {
      setUploading(true);

      const filePath = await uploadProfileAvatar(
        profile.id,
        profile.auth_user_id,
        imageUri,
        mimeType,
      );

      await refreshProfile();

      setAvatarPath(filePath);
      onAvatarUpdate?.(filePath);
      showAlert('Exito', 'Foto de perfil actualizada correctamente.');
    } catch (error) {
      // El bucket `avatars` ya rompió antes por policies de Storage (ver las
      // migraciones 20260727120000 / 20260727140000): que quede registrado.
      Logger.error('Fallo la subida del avatar', {
        scope: 'ProfileHeader.uploadAvatar',
        profileId: profile.id,
        mimeType,
        error,
      });
      showAlert('Error al subir', getGenericSupabaseErrorMessage(error, 'No se pudo subir la imagen. Revisa conexion y politicas del bucket avatars.'));
    } finally {
      setUploading(false);
    }
  };

  const avatarRing = (
    <View className="relative">
      <View
        className={`rounded-full border-4 bg-surface-lowest p-1 ${
          isEmbajador ? 'border-brand-gold' : 'border-brand-primary-container'
        }`}
        style={{ height: 128, width: 128 }}
      >
        {uploading ? (
          <View
            className="items-center justify-center rounded-full bg-surface-high"
            style={{ height: '100%', width: '100%' }}
          >
            <ActivityIndicator size="large" color="#53E076" />
          </View>
        ) : (
          // 112 = 128 − aro (4 × 2) − padding (4 × 2).
          <Avatar uri={avatarUrl} size={112} />
        )}
      </View>
      {/* Badge: + si no hay foto, ✓ si hay foto.
          bottom/right en 1: con el aro ahora circular, el punto de tangencia
          del círculo queda ~19px adentro de la esquina — un inset de 3 (12px)
          dejaba la insignia flotando lejos del borde visible. */}
      <View className="absolute bottom-1 right-1 rounded-lg border-2 border-surface-base bg-brand-primary p-1">
        <AppIcon
          family="material-icons"
          name={avatarUrl ? "verified" : "add"}
          size={14}
          color="#003914"
        />
      </View>
    </View>
  );

  return (
    <View className="items-center pt-3">
      {/* Con foto, tocarla la abre en el visor, que ofrece "Cambiar foto" (el
          mismo patrón que WhatsApp). Sin foto no hay nada que ver: el toque va
          directo al selector, como antes. */}
      {avatarUrl && !uploading ? (
        <ExpandablePhoto
          uri={avatarUrl}
          subject={{ kind: 'avatar', profileId: profile.id }}
          title={profile.full_name}
          onChangePhoto={() => void pickAndUploadImage()}
        >
          {avatarRing}
        </ExpandablePhoto>
      ) : (
        <TouchableOpacity
          onPress={pickAndUploadImage}
          disabled={uploading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Elegir foto de perfil"
        >
          {avatarRing}
        </TouchableOpacity>
      )}

      {/* w-full + px: acota el ancho del texto al del contenedor. Sin esto, un
          nombre largo sin espacios (o con emojis) desborda horizontalmente.
          Se permiten 2 lineas antes de truncar: cortar un nombre completo en la
          primera linea del perfil es demasiado agresivo. */}
      <View className="mt-4 w-full items-center px-6">
        <Text
          className="font-uiBold text-center text-3xl text-neutral-on-surface"
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {profile.full_name}
        </Text>
        <Text
          className="font-ui mt-1 text-center text-base text-neutral-on-surface-variant"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          @{profile.username}
        </Text>
      </View>

      {/* flex-wrap: con zona y posicion largas los chips bajan de linea en vez
          de estirar la fila fuera de pantalla. */}
      <View className="mt-3 w-full flex-row flex-wrap items-center justify-center gap-3 px-6">
        <View className="max-w-full flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
          <AppIcon family="material-community" name="map-marker-outline" size={12} color="#8CCDFF" />
          <Text
            className="font-uiBold shrink text-xs text-neutral-on-surface"
            numberOfLines={1}
          >
            {profile.zone ?? 'Sin zona'}
          </Text>
        </View>

        <View className="max-w-full flex-row items-center gap-1 rounded-full border border-brand-primary/25 bg-brand-primary-container/20 px-3 py-1">
          <AppIcon family="material-community" name="soccer" size={12} color="#53E076" />
          <Text
            className="font-display shrink text-xs uppercase text-brand-primary"
            numberOfLines={1}
          >
            {positionLabel(profile.preferred_position)}
          </Text>
        </View>

        {/* El chip se omite entero si no hay fecha cargada: un "— años" al lado
            de la zona y la posición se lee como un dato roto, no como uno que
            falta. `date_of_birth` es obligatoria en el onboarding
            (isProfileComplete), así que el caso es el de los perfiles viejos. */}
        {ageLabel && (
          <View className="max-w-full flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
            <AppIcon family="material-community" name="cake-variant-outline" size={12} color="#FABD32" />
            <Text
              className="font-uiBold shrink text-xs text-neutral-on-surface"
              numberOfLines={1}
            >
              {ageLabel}
            </Text>
          </View>
        )}
      </View>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}
