import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

/** Fila del listado de «Usuarios bloqueados» de Preferencias. */
export type BlockedUser = Database['public']['Functions']['list_my_blocks']['Returns'][number];

/**
 * Bloquea a otro usuario.
 *
 * Va por RPC y no por un INSERT directo —a diferencia de `submitContentReport`,
 * que sí es INSERT— porque bloquear no es una sola escritura: además de la fila
 * en `user_blocks`, el servidor crea la denuncia automática que avisa a
 * moderación. Eso es parte del requisito de la guideline 1.2 («blocking should
 * also notify the developer»), así que no puede quedar a criterio del cliente
 * acordarse de hacer las dos cosas.
 *
 * El efecto sobre lo que se ve es simétrico y server-side: las policies
 * RESTRICTIVE de `market_*_posts`, `messages` y las postulaciones, más el filtro
 * dentro de `get_market_inbox`, sacan el contenido de las dos partes. La
 * pantalla sólo tiene que volver a pedir los datos.
 */
export async function blockUser(blockedProfileId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', {
    p_blocked_profile_id: blockedProfileId,
    p_reason: reason,
  });

  if (error) {
    throw error;
  }
}

/**
 * Deshace un bloqueo.
 *
 * No borra la denuncia que el bloqueo generó: es un hecho que ocurrió y
 * moderación tiene que poder verlo aunque la persona se arrepienta.
 */
export async function unblockUser(blockedProfileId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', {
    p_blocked_profile_id: blockedProfileId,
  });

  if (error) {
    throw error;
  }
}

/**
 * Usuarios que bloqueé, para la pantalla de Preferencias.
 *
 * Es RPC porque necesita datos de `profiles` de gente con la que ya no queda
 * ninguna relación visible; un SELECT con join desde el cliente chocaría contra
 * la RLS de `profiles`.
 */
export async function fetchMyBlocks(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('list_my_blocks');

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * `true` si hay un bloqueo entre el usuario actual y `otherProfileId`, en
 * cualquiera de las dos direcciones.
 *
 * Sirve para decidir qué mostrar —«Bloquear» o «Desbloquear»— sin traerse la
 * lista entera. No es un control de seguridad: lo que impide ver y escribir son
 * las policies y los triggers del servidor, esto sólo evita ofrecer una acción
 * que no corresponde.
 */
export async function isBlockedWith(otherProfileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_block_with', {
    p_other: otherProfileId,
  });

  if (error) {
    throw error;
  }

  return data === true;
}
