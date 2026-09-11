import { supabase } from '@/lib/supabase';
import { revokeAppleCredential } from '@/lib/auth-data';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Autoservicio de baja de cuenta (Apple 5.1.1).
 *
 * Llama a `delete_own_account()` — anonimiza `profiles` y banea la fila de
 * `auth.users` del lado del servidor (ver la migración
 * `20260818140000_store_debt_account_reports_feedback.sql` para el porqué no
 * es un DELETE físico). Esta función NO cierra la sesión: eso lo hace el
 * caller llamando a `signOut()` inmediatamente después de un éxito — separar
 * las dos cosas deja al caller decidir el orden exacto de feedback al
 * usuario (mostrar el mensaje de éxito antes o después de desloguear).
 */
export async function deleteOwnAccount(): Promise<{ error: PostgrestError | null }> {
  // Revocación del token de Apple ANTES de la RPC, por dos motivos: hace falta
  // la sesión activa (que el caller cierra al terminar), y `delete_own_account`
  // borra la fila de `apple_credentials`, así que después ya no quedaría token
  // que revocar.
  //
  // No se chequea el resultado ni se aborta si falla. Apple pide que la app
  // revoque al dar de baja, pero dejar a alguien sin poder eliminar su cuenta
  // porque el endpoint de Apple no respondió sería un incumplimiento peor —el
  // de 5.1.1(v), que es el que ya teníamos resuelto— además de un problema de
  // privacidad real. El fallo queda registrado en `app_logs` para reintentarlo
  // a mano. Para cuentas de Google y de email no hay nada guardado y la llamada
  // es un no-op.
  await revokeAppleCredential();

  const { error } = await supabase.rpc('delete_own_account');
  return { error };
}
