import { describe, expect, it } from 'vitest';
import { membersNeededToConfirm } from './squad-rules';

describe('membersNeededToConfirm (D-60)', () => {
  it('descuenta los lugares de invitado del mínimo del formato', () => {
    expect(membersNeededToConfirm(4, 1)).toBe(3);
    expect(membersNeededToConfirm(7, 1)).toBe(6);
  });

  it('sin lugares de invitado exige el mínimo completo', () => {
    expect(membersNeededToConfirm(4, 0)).toBe(4);
  });

  it('nunca exige menos de 1 miembro', () => {
    expect(membersNeededToConfirm(4, 10)).toBe(1);
  });

  it('un cupo negativo o inválido cuenta como 0, igual que el servidor', () => {
    expect(membersNeededToConfirm(4, -2)).toBe(4);
    expect(membersNeededToConfirm(4, Number.NaN)).toBe(4);
  });
});
