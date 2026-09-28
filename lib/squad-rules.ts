/**
 * Miembros del plantel que hacen falta para CONFIRMAR un partido (D-60).
 *
 * Los invitados sólo pueden sumarse con el partido ya confirmado, así que al
 * confirmar se le deja a cada plantel `guestSlots` lugares para completar con
 * ellos (`app_settings.confirm_guest_slots`). Es la misma cuenta que hace
 * `confirm_match_proposal` (20260929010000): nunca menos de 1 miembro, y un
 * cupo negativo o inválido cuenta como 0.
 */
export function membersNeededToConfirm(minPlayersToStart: number, guestSlots: number): number {
  const slots = Number.isFinite(guestSlots) ? Math.max(Math.trunc(guestSlots), 0) : 0;
  return Math.max(minPlayersToStart - slots, 1);
}
