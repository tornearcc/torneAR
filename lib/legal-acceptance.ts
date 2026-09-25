// tornear/lib/legal-acceptance.ts
//
// Qué documentos legales le falta aceptar a una cuenta, en su versión vigente.
// Puro (sin Supabase ni React Native) para poder testearlo en node; lo usan
// `needsLegalAcceptance` (lib/auth-data.ts) y el gate de `app/_layout.tsx`.
import { LEGAL_VERSIONS, type LegalDocument } from '@/constants/legal';

type LegalMetadata = Record<string, unknown> | null | undefined;

/**
 * Documentos cuya aceptación vigente falta, en el orden en que se muestran.
 *
 * - **Términos:** `accepted_tyc === true` y `tyc_version` igual a la vigente.
 * - **Política de Privacidad:** `accepted_privacy === true` y
 *   `privacy_version` igual a la vigente. Antes sólo se comparaban los
 *   Términos, así que publicar una Política nueva no le pedía nada a nadie;
 *   la §11 de la Política promete que ante cambios sustanciales se pide
 *   aceptarla de nuevo.
 *
 * Comparación estricta (`=== true`): la metadata es JSON libre y un `"false"`
 * o un `1` no cuentan como aceptación. Sin metadata faltan los dos: el error
 * barato es pedirlo de más.
 */
export function pendingLegalDocuments(
  metadata: LegalMetadata,
  versions: { terms: string; privacy: string } = LEGAL_VERSIONS,
): LegalDocument[] {
  const pending: LegalDocument[] = [];
  if (metadata?.accepted_tyc !== true || metadata.tyc_version !== versions.terms) {
    pending.push('terms');
  }
  if (metadata?.accepted_privacy !== true || metadata.privacy_version !== versions.privacy) {
    pending.push('privacy');
  }
  return pending;
}
