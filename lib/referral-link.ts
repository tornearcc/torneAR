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
 * (torneAR/dashboard), que muestra la invitación, el código y el CTA de
 * descarga, con un link manual a `tornear://login?ref=<username>`.
 *
 * `lib/deep-linking.ts` (`normalizeUniversalLink`) sabe traducir
 * `https://tornear.vercel.app/i/<username>` de vuelta a este mismo destino si el SO
 * entrega la URL https cruda (Universal Link bien interceptado) — los tres
 * casos (scheme propio, fallback web, Universal Link directo) resuelven al
 * mismo `/login?ref=<username>`.
 */
const REFERRAL_LINK_BASE_URL = 'https://tornear.vercel.app/i';

/**
 * `https://tornear.vercel.app/i/<username>[?n=<nombre>]` — Universal Link / App Link.
 *
 * `?n=` es el nombre visible de quien invita. La landing lo usa para el copy
 * ("<nombre> te invitó a jugar") y para el título de la preview de WhatsApp.
 * Viaja en la URL porque la zona pública de la web no consulta perfiles: una
 * RPC pública que resolviera el username permitiría recorrer el padrón.
 *
 * · Es sólo presentación: la vinculación la sigue haciendo el username del
 *   path, y `normalizeUniversalLink` no reenvía `n` a la app.
 * · Se omite si el nombre viene vacío: la web degrada sola al username.
 * · No se recorta acá: la web ya corta a 40 code points y limpia caracteres de
 *   control, y duplicar esa regla sólo abriría la puerta a que diverjan.
 * · `encodeURIComponent` y no `URLSearchParams`: este último codifica los
 *   espacios como `+`, que en un path de Next también se decodifica bien, pero
 *   `%20` es inequívoco en cualquier parser que reciba el link (WhatsApp,
 *   Instagram, el propio SO).
 */
export function buildReferralLink(username: string, displayName?: string | null): string {
  const link = `${REFERRAL_LINK_BASE_URL}/${encodeURIComponent(username)}`;
  const name = displayName?.trim();
  return name ? `${link}?n=${encodeURIComponent(name)}` : link;
}

/**
 * Mensaje que se abre en el share nativo. El código va TAMBIÉN en texto plano
 * a propósito: si el link no llega a abrir nada (SO viejo, o se pega en un
 * lugar que no lo renderiza como link), el código suelto es lo único que le
 * queda utilizable para tipear a mano al registrarse.
 */
export function buildReferralMessage(username: string, displayName?: string | null): string {
  return `¡Sumate a torneAR! Registrate con mi código: ${username} y empezá a rankear: ${buildReferralLink(username, displayName)}`;
}
