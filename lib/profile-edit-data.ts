// tornear/lib/profile-edit-data.ts
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { UserProfileFormData } from '@/lib/schemas/userSchema';

function toISODate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Guarda los datos editables del perfil. El género NO viaja: se elige en el
 * onboarding y después sólo lo cambia soporte (F3, trigger profiles_gender_lock).
 * Mandarlo igual sería inofensivo mientras no cambie, pero dejarlo afuera evita
 * que un formulario desincronizado choque contra GENDER_LOCKED.
 */
export async function updateProfile(
  profileId: string,
  data: UserProfileFormData,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: data.fullName,
      username: data.username,
      zone: data.zone,
      preferred_position: data.position,
      date_of_birth: toISODate(data.dateOfBirth),
      strong_foot: data.strongFoot,
      favorite_team: data.favoriteTeam?.trim() || null,
    })
    .eq('id', profileId);

  if (error) {
    throw error;
  }
}

/**
 * Sube una imagen de avatar al bucket `avatars` y actualiza profiles.avatar_url.
 * Valida que el perfil pertenezca al usuario autenticado (la policy de storage
 * exige que el path empiece con auth.uid()). Devuelve el path guardado.
 */
export async function uploadProfileAvatar(
  profileId: string,
  profileAuthUserId: string | null,
  imageUri: string,
  mimeType: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('No hay sesion activa para subir avatar.');
  }

  const folderOwnerId = profileAuthUserId || user.id;
  if (folderOwnerId !== user.id) {
    throw new Error('El perfil no corresponde al usuario autenticado.');
  }

  // React Native + Supabase: usar base64/ArrayBuffer (Blob falla en algunos dispositivos)
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const fileData = decode(base64);

  const fileExt = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `avatar-${Date.now()}.${fileExt}`;
  // Debe empezar con auth.uid() para cumplir la policy de storage.
  const filePath = `${folderOwnerId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, fileData, {
      cacheControl: '3600',
      upsert: true,
      contentType: mimeType,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: filePath })
    .eq('id', profileId);

  if (updateError) {
    throw updateError;
  }

  return filePath;
}
