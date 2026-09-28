import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/supabase';

export type ReportEntityType = Database['public']['Enums']['report_entity_type'];

interface SubmitContentReportParams {
  entityType: ReportEntityType;
  entityId: string;
  reason: string;
}

/**
 * Denuncia de contenido: perfiles, partidos, mensajes, publicaciones del
 * Mercado y equipos.
 *
 * Pasó de ser un INSERT directo a una RPC. El motivo no es la validación
 * —la RLS ya exigía `reporter_id = mi profile.id`— sino el contexto: la fila
 * guarda además el autor del contenido y una copia del texto denunciado, y
 * esos dos campos NO los puede aportar el cliente. Si vinieran por parámetro,
 * cualquiera podría denunciar un mensaje inventándose el texto y
 * atribuírselo a otra persona. El servidor los lee de la fila real.
 *
 * De paso desapareció el parámetro `reporterId`: el servidor resuelve quién
 * denuncia desde la sesión, así que ya no hay que pasárselo ni confiar en que
 * el llamador mande el suyo.
 *
 * Errores que puede devolver, ya mapeados en `lib/auth-error-messages.ts`:
 * `ENTITY_NOT_FOUND` (el contenido no existe o no es visible),
 * `INVALID_TARGET` (es contenido propio) e `INVALID_REASON`.
 */
export async function submitContentReport({
  entityType,
  entityId,
  reason,
}: SubmitContentReportParams): Promise<void> {
  const { error } = await supabase.rpc('submit_content_report', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_reason: reason,
  });

  if (error) {
    throw error;
  }
}
