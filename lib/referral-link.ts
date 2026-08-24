/**
 * Enlace de invitación y su mensaje.
 *
 * El "código de referido" ES el username. No hay un código opaco aparte:
 * `profiles.username` ya es `unique` desde el esquema inicial, y la migración
 * del sistema de referidos lo eligió explícitamente por eso
 * (`20260817180000_referral_system.sql`). `set_referral` resuelve el username
 * contra `profiles` sin distinguir mayúsculas.
 *
 * Fase 6.1 (Universal Links / App Links): el link es un Universal Link
 * `https://tornear.vercel.app/i/<username>`, ya NO el scheme custom directo
 * (`tornear://login?ref=<username>`) que se usaba antes. Un scheme propio
 * sólo lo abre un tap hecho DESDE la propia app o algo que ya sepa resolverlo
 * — la mayoría de las apps de mensajería (WhatsApp, SMS) no lo hacen
 * clickeable para un destinatario que no tiene torneAR instalada, así que el
 * link viejo llegaba muerto a cualquiera sin la app. Un link `https` sí es
 * clickeable en cualquier lado.
 *
 * Con `associatedDomains` (iOS) / `intentFilters` (Android) declarados en
 * `app.json` y `tornear.vercel.app/.well-known/{apple-app-site-association,
 * assetlinks.json}` publicados (torneAR/dashboard), el SO abre la app
 * directo si está instalada. Si no, cae en la landing web `/i/[username]`
 * (torneAR/dashboard), que a su vez intenta el fallback
 * `tornear://login?ref=<username>` antes de mostrar el CTA de descarga.
 *
 * `lib/deep-linking.ts` (`normalizeUniversalLink`) sabe traducir
 * `https://tornear.vercel.app/i/<username>` de vuelta a este mismo destino si el SO
 * entrega la URL https cruda (Universal Link bien interceptado) — los tres
 * casos (scheme propio, fallback web, Universal Link directo) resuelven al
 * mismo `/login?ref=<username>`.
 */
const REFERRAL_LINK_BASE_URL = 'https://tornear.vercel.app/i';

/** `https://tornear.vercel.app/i/<username>` — Universal Link / App Link. */
export function buildReferralLink(username: string): string {
  return `${REFERRAL_LINK_BASE_URL}/${encodeURIComponent(username)}`;
}

/**
 * Mensaje que se abre en el share nativo. El código va TAMBIÉN en texto plano
 * a propósito: si el link no llega a abrir nada (SO viejo, o se pega en un
 * lugar que no lo renderiza como link), el código suelto es lo único que le
 * queda utilizable para tipear a mano al registrarse.
 */
export function buildReferralMessage(username: string): string {
  return `¡Sumate a torneAR! Registrate con mi código: ${username} y empezá a rankear: ${buildReferralLink(username)}`;
}
