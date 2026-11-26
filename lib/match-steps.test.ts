import { describe, expect, it } from 'vitest';

import { MATCH_STEPS, matchStep } from './match-steps';

describe('matchStep (rediseño, etapa 4)', () => {
  it('los 4 pasos, en orden', () => {
    expect(MATCH_STEPS.map((s) => s.title)).toEqual([
      'Desafío aceptado',
      'Acordar día y cancha',
      'Llegar a la cancha',
      'Cargar el resultado',
    ]);
  });

  it('cada estado cae en su paso', () => {
    expect(matchStep('PENDIENTE')).toBe(2);
    expect(matchStep('CONFIRMADO')).toBe(3);
    expect(matchStep('EN_VIVO')).toBe(4);
    expect(matchStep('EN_DISPUTA')).toBe(4);
  });

  it('terminado o por W.O.: todos hechos', () => {
    expect(matchStep('FINALIZADO')).toBe('done');
    expect(matchStep('WO_A')).toBe('done');
    expect(matchStep('WO_B')).toBe('done');
  });

  it('cancelado: sin pasos', () => {
    expect(matchStep('CANCELADO')).toBeNull();
  });
});
