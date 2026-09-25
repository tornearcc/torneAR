import { describe, it, expect } from 'vitest';
import {
  describeCompositionMissing,
  describeMissing,
  describeRule,
  getMixedCompositionErrorMessage,
  isMixedCompositionError,
  parseMixedCompositionStatus,
} from './mixed-composition';

// Lo que devuelve get_mixed_composition_status a un integrante (C-27 de 500-mixed-composition).
const MEMBER_PAYLOAD = {
  applies: true,
  enforced: false,
  ok: false,
  minPerGender: 2,
  male: 3,
  female: 1,
  other: 1,
  unset: 0,
  missingMale: 0,
  missingFemale: 1,
  missingTotal: 1,
  xCountsAsAny: false,
};

describe('parseMixedCompositionStatus', () => {
  it('a un integrante le deja las cantidades', () => {
    expect(parseMixedCompositionStatus(MEMBER_PAYLOAD)).toEqual({
      applies: true,
      enforced: false,
      ok: false,
      counts: {
        minPerGender: 2,
        male: 3,
        female: 1,
        other: 1,
        missingMale: 0,
        missingFemale: 1,
        missingTotal: 1,
        xCountsAsAny: false,
      },
    });
  });

  it('a quien no integra el equipo le llegan sólo applies/enforced/ok', () => {
    expect(parseMixedCompositionStatus({ applies: true, enforced: true, ok: false })).toEqual({
      applies: true,
      enforced: true,
      ok: false,
      counts: null,
    });
  });

  it('un payload vacío no aplica regla ni bloquea', () => {
    expect(parseMixedCompositionStatus(null)).toEqual({
      applies: false,
      enforced: false,
      ok: true,
      counts: null,
    });
  });
});

describe('textos', () => {
  it('describeMissing nombra sólo lo que falta', () => {
    expect(describeMissing({ male: 0, female: 1 })).toBe('1 de género femenino');
    expect(describeMissing({ male: 2, female: 1 })).toBe(
      '2 de género masculino y 1 de género femenino',
    );
    expect(describeMissing({ male: 0, female: 0 })).toBe('');
  });

  it('describeCompositionMissing arma la frase con el verbo que corresponde', () => {
    expect(describeCompositionMissing({ male: 0, female: 1, total: 1 })).toBe('falta 1 de género femenino');
    expect(describeCompositionMissing({ male: 2, female: 1, total: 3 })).toBe(
      'faltan 2 de género masculino y 1 de género femenino',
    );
    // Comodín: una X ya cubrió uno de los dos que faltaban.
    expect(describeCompositionMissing({ male: 1, female: 1, total: 1 })).toBe(
      'falta 1 de género masculino o femenino',
    );
    expect(describeCompositionMissing({ male: 0, female: 0, total: 0 })).toBe('');
  });

  it('describeRule enuncia los dos mínimos', () => {
    expect(describeRule(2)).toBe('al menos 2 de género masculino y 2 de género femenino');
  });
});

describe('getMixedCompositionErrorMessage', () => {
  it('conserva el detalle del servidor sin el prefijo', () => {
    const own =
      'MIXED_COMPOSITION: el plantel de Leones no cumple la composición mínima de un equipo mixto: falta 1 de género femenino';
    expect(isMixedCompositionError(own)).toBe(true);
    expect(getMixedCompositionErrorMessage(own)).toBe(
      'El plantel de Leones no cumple la composición mínima de un equipo mixto: falta 1 de género femenino.',
    );
  });

  it('del rival sólo dice que no cumple', () => {
    expect(
      getMixedCompositionErrorMessage(
        'MIXED_COMPOSITION: Tigres no cumple la composición mínima de un equipo mixto',
      ),
    ).toBe('Tigres no cumple la composición mínima de un equipo mixto.');
  });

  it('sin detalle usa un texto propio', () => {
    expect(getMixedCompositionErrorMessage('MIXED_COMPOSITION:')).toBe(
      'El equipo no cumple la composición mínima de un equipo mixto.',
    );
  });

  it('no confunde otros errores', () => {
    expect(isMixedCompositionError('SQUAD_TOO_SMALL: MIXED_COMPOSITION')).toBe(false);
  });
});
