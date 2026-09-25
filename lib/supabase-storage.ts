import { supabase } from './supabase';

/**
 * Get a public URL for a file in a Supabase storage bucket
 * Handles both direct URLs and paths that need to be signed
 */
export function getSupabaseStorageUrl(bucketName: string, filePath: string): string {
  if (!filePath) return '';

  // Si la URL ya es completa (empieza con http), devolver como está
  if (filePath.startsWith('http')) {
    return filePath;
  }

  // Construir URL pública del bucket
  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);

  return data?.publicUrl || '';
}

/**
 * Get avatar URL from storage
 */
export function getAvatarUrl(userId: string): string {
  if (!userId) return '';
  const avatarPath = `${userId}/avatar.jpg`;
  return getSupabaseStorageUrl('avatars', avatarPath);
}

/**
 * Get team shield URL from storage
 */
export function getShieldUrl(teamId: string): string {
  if (!teamId) return '';
  const shieldPath = `${teamId}/shield.png`;
  return getSupabaseStorageUrl('shields', shieldPath);
}

/**
 * Escudo de un equipo tal como viene de `teams.shield_url`.
 *
 * La columna guarda el path del bucket, salvo los registros que quedaron con
 * URL absoluta de una migracion vieja — `getSupabaseStorageUrl` ya distingue
 * los dos casos. Resolverlo en el DAL y no en cada pantalla evita repetir el
 * mismo ternario en todos los componentes que pintan un escudo, y devolver
 * `null` (y no `''`) deja que la UI elija su fallback con un chequeo directo.
 */
export function resolveShieldUrl(shieldUrl: string | null | undefined): string | null {
  if (!shieldUrl) return null;
  return getSupabaseStorageUrl('shields', shieldUrl) || null;
}

/**
 * Foto de perfil tal como viene de `profiles.avatar_url`: path del bucket
 * `avatars` o URL absoluta (registros viejos, seeds). Mismo criterio que
 * `resolveShieldUrl`: `null` —y no `''`— cuando no hay foto, para que la UI
 * elija el fallback con un chequeo directo.
 */
export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  return getSupabaseStorageUrl('avatars', avatarUrl) || null;
}

/**
 * Get badge icon URL from storage
 */
export function getBadgeIconUrl(badgeSlug: string): string {
  if (!badgeSlug) return '';
  const iconPath = `${badgeSlug}.png`;
  return getSupabaseStorageUrl('badges', iconPath);
}
