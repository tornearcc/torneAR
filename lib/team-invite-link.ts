import { buildReferralLink } from '@/lib/referral-link';

/**
 * Link y mensaje para invitar a alguien a un equipo (Tanda 7, P1-11).
 *
 * Antes el mensaje llevaba sólo el código («Unite a X en TorneAR / Código de
 * invitacion: ABC123»): quien no tenía la app no sabía dónde bajarla ni dónde
 * usar el código. Al 29/09, 16 de los 17 equipos reales tenían un solo
 * integrante.
 *
 * ─── Por qué reutiliza /i/<username> ───────────────────────────────────────
 * `/i/` es el único path que el SO ya reconoce como Universal Link (iOS, AASA)
 * y App Link (Android, `intentFilters` de `app.json`). Un path nuevo en
 * Android necesitaría una build. Así que el link de equipo es el mismo link de
 * referido de quien invita, con dos parámetros más:
 *   · `e`: el código del equipo. Con la app instalada, `normalizeUniversalLink`
 *     (`lib/deep-linking.ts`) lo lleva a «Unirme a un equipo» con el código
 *     cargado. Sin la app, la landing `/i/[username]` (torneAR/dashboard)
 *     muestra la versión de equipo: nombre, código y tiendas.
 *   · `t`: el nombre del equipo, sólo para el texto de la landing y la vista
 *     previa de WhatsApp (la zona pública de la web no consulta la base). Si
 *     alguien lo edita, lo peor que pasa es que la página muestre otro nombre:
 *     la solicitud se manda al equipo del código.
 */

/** Mismo formato que acepta «Unirme a un equipo»: el código se guarda en mayúsculas. */
export function normalizeTeamInviteCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase() ?? '';
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : null;
}

export interface TeamInviteInput {
  /** Username de quien comparte: arma el path `/i/<username>` y el referido. */
  username: string;
  fullName?: string | null;
  inviteCode: string;
  teamName: string;
}

export function buildTeamInviteLink({ username, fullName, inviteCode, teamName }: TeamInviteInput): string {
  const base = buildReferralLink(username, fullName);
  const separator = base.includes('?') ? '&' : '?';
  const name = teamName.trim();
  const params = [`e=${encodeURIComponent(inviteCode)}`];
  if (name) params.push(`t=${encodeURIComponent(name)}`);
  return `${base}${separator}${params.join('&')}`;
}

/**
 * El código va también en texto plano, igual que en el mensaje de referido: si
 * el link no abre nada, es lo único que queda para tipear en «Unirme a un
 * equipo».
 *
 * Sin username (un perfil a medio crear) no hay link que armar: sale sólo el
 * código, como antes.
 */
export function buildTeamInviteMessage(input: Omit<TeamInviteInput, 'username'> & { username: string | null }): string {
  const name = input.teamName.trim() || 'mi equipo';
  const code = `Código del equipo: ${input.inviteCode}`;
  if (!input.username) {
    return `¡Sumate a ${name} en torneAR! Bajate la app y en «Unirme a un equipo» poné este código.\n${code}`;
  }
  const link = buildTeamInviteLink({ ...input, username: input.username });
  return `¡Sumate a ${name} en torneAR! Bajate la app y pedí entrar con este link: ${link}\n${code}`;
}
