// tornear/lib/onboarding-data.ts
import { supabase } from '@/lib/supabase';
import { UserProfileFormData } from '@/lib/schemas/userSchema';
import { registerForPushNotificationsAsync } from '@/lib/push-notifications';
import { applyPendingAttribution, resolveAndSetReferral } from '@/lib/referral-data';
import type { PendingUtm } from '@/stores/referralStore';

function toISODate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Crea (o actualiza, si el onboarding se re-envía) el perfil del usuario.
 *
 * Se escribe por RPC y NO con `.from('profiles').upsert(...)`. El upsert
 * fallaba con 42501 «permission denied for table profiles», y el motivo no es
 * el que parece:
 *
 *  · `authenticated` YA tiene INSERT (de tabla) y UPDATE (por columna) sobre
 *    `profiles`. Lo que le falta es SELECT de TABLA, revocado a propósito por
 *    `20260819100000_privacy_and_age_compliance` para esconder `date_of_birth`
 *    y `expo_push_token` del resto de los usuarios.
 *  · Un `.upsert()` de supabase-js no genera un INSERT: genera
 *    `INSERT ... ON CONFLICT ... DO UPDATE`, y Postgres exige SELECT sobre la
 *    tabla entera para esa forma. De ahí el 42501, con el hint engañoso de
 *    «GRANT SELECT» — que es justo lo que NO se puede otorgar sin reabrir el
 *    agujero de privacidad.
 *
 * `save_own_profile()` es SECURITY DEFINER: hace el upsert con privilegios de
 * owner, forzando `auth_user_id = auth.uid()` y sin tocar nunca `is_admin`,
 * `id`, `created_at` ni `referred_by`. Es la contraparte de escritura de
 * `get_own_profile()`, que la misma migración creó para la lectura.
 *
 * Bonus: el upsert usaba `ON CONFLICT (id)` (el arbitrador que elige
 * PostgREST por PK) y el cliente nunca manda `id`, así que un re-envío del
 * onboarding sobre un perfil ya existente nunca podía actualizar — chocaba
 * contra la unique de `auth_user_id` y salía por 23505. La RPC arbitra por
 * `auth_user_id`, que es la identidad real del perfil.
 */
export async function saveOnboardingProfile(
  userId: string,
  data: UserProfileFormData,
  referredByUsername?: string | null,
  utm?: PendingUtm | null,
): Promise<void> {
  const pushToken = await registerForPushNotificationsAsync();

  const { error } = await supabase.rpc('save_own_profile', {
    p_full_name: data.fullName,
    p_username: data.username,
    p_zone: data.zone,
    p_preferred_position: data.position,
    p_date_of_birth: toISODate(data.dateOfBirth),
    p_gender: data.gender,
    p_strong_foot: data.strongFoot,
    // `undefined`, no `null`: los dos parámetros son `DEFAULT NULL` en la
    // función, así que el generador de tipos los declara opcionales
    // (`p_favorite_team?: string`) pero NO nullables. Mandar `undefined` omite
    // la clave del payload y PostgREST deja que aplique el DEFAULT de SQL —
    // exactamente el mismo NULL que llegaba antes, sin pelear con el tipo.
    p_favorite_team: data.favoriteTeam?.trim() || undefined,
    p_expo_push_token: pushToken ?? undefined,
  });

  if (error) {
    throw error;
  }

  // El perfil ya existe recién acá (upsert de arriba): `set_referral` resuelve
  // por `auth.uid()` -> profiles.id, así que no puede llamarse antes.
  const hasUtm = !!(utm && (utm.source || utm.medium || utm.campaign));

  if (referredByUsername) {
    // Caso común: un link del Content Factory trae username y utm juntos —
    // una sola llamada a la RPC para los dos.
    await resolveAndSetReferral(referredByUsername, userId, utm);
  } else if (hasUtm) {
    // Sin código de referido (el campo quedó vacío) pero con utm pendiente:
    // igual se registra de dónde vino, ver el comentario de
    // `applyPendingAttribution`.
    await applyPendingAttribution(utm as PendingUtm);
  }
}
