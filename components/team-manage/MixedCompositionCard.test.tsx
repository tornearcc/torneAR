import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MixedCompositionCard } from './MixedCompositionCard';
import type { MixedCompositionCounts, MixedCompositionStatus } from '@/lib/mixed-composition';

const SHORT_ONE_F: MixedCompositionCounts = {
  minPerGender: 2,
  male: 3,
  female: 1,
  other: 1,
  missingMale: 0,
  missingFemale: 1,
  missingTotal: 1,
  xCountsAsAny: false,
};

function status(overrides: Partial<MixedCompositionStatus>): MixedCompositionStatus {
  return { applies: true, enforced: false, ok: false, counts: SHORT_ONE_F, ...overrides };
}

describe('MixedCompositionCard', () => {
  it('muestra las cantidades del plantel, sin nombres', () => {
    render(<MixedCompositionCard status={status({})} />);
    expect(screen.getByText('Masculino 3 · Femenino 1 · Otro 1')).toBeTruthy();
  });

  it('con la regla todavía apagada, avisa lo que se va a exigir y lo que falta hoy', () => {
    render(<MixedCompositionCard status={status({ enforced: false })} />);
    expect(
      screen.getByText(
        'Pronto se va a exigir al menos 2 de género masculino y 2 de género femenino para jugar. Hoy falta 1 de género femenino.',
      ),
    ).toBeTruthy();
  });

  it('con la regla activa, dice qué no puede hacer el equipo', () => {
    render(<MixedCompositionCard status={status({ enforced: true })} />);
    expect(
      screen.getByText(/^Falta 1 de género femenino para poder desafiar, aceptar desafíos y confirmar partidos\./),
    ).toBeTruthy();
  });

  it('aclara que «Otro» no cuenta para los mínimos', () => {
    render(<MixedCompositionCard status={status({})} />);
    expect(screen.getByText(/«Otro» cuentan para completar el equipo, no para estos mínimos/)).toBeTruthy();
  });

  it('si cumple, lo confirma', () => {
    render(
      <MixedCompositionCard
        status={status({
          ok: true,
          counts: { ...SHORT_ONE_F, female: 2, missingFemale: 0, missingTotal: 0, other: 0 },
        })}
      />,
    );
    expect(screen.getByText(/^El plantel cumple el mínimo de un equipo mixto/)).toBeTruthy();
    expect(screen.queryByText(/«Otro»/)).toBeNull();
  });

  it('no se muestra a quien no integra el equipo ni en equipos que no son MIXTO', () => {
    const { container: rival } = render(<MixedCompositionCard status={status({ counts: null })} />);
    expect(rival.innerHTML).toBe('');
    const { container: notMixed } = render(
      <MixedCompositionCard status={status({ applies: false })} />,
    );
    expect(notMixed.innerHTML).toBe('');
  });
});
