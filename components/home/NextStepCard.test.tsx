import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { NextStepCard } from './NextStepCard';

// TeamShield arrastra expo-image (y expo), que el runtime jsdom no carga; acá no se prueba el escudo.
vi.mock('@/components/ui/TeamShield', () => ({ TeamShield: () => null }));

describe('NextStepCard (rediseño etapa 1)', () => {
  it('sin equipo: «Sumate a un equipo» y «Tengo un código» lleva a unirse', () => {
    const onAction = vi.fn();
    render(<NextStepCard next={{ kind: 'JOIN_TEAM' }} onAction={onAction} />);
    expect(screen.getByText('Sumate a un equipo')).toBeTruthy();
    fireEvent.click(screen.getByText('Tengo un código'));
    expect(onAction).toHaveBeenCalledWith('join_code');
    fireEvent.click(screen.getByText('Armar el mío'));
    expect(onAction).toHaveBeenCalledWith('team_create');
  });

  it('equipo incompleto: cuántos son y cuántos faltan', () => {
    const onAction = vi.fn();
    render(
      <NextStepCard
        next={{ kind: 'COMPLETE_TEAM', team: { id: 't1', name: 'Los Pibes', inviteCode: 'K7P2QX', shieldUrl: null, members: 2, needed: 7, format: 'FUTBOL_7' } }}
        onAction={onAction}
      />,
    );
    expect(screen.getByText('Completá Los Pibes')).toBeTruthy();
    expect(screen.getByText('Son 2 de 7. Un F7 necesita 7 para jugar.')).toBeTruthy();
    expect(screen.getAllByText('+')).toHaveLength(5);
    fireEvent.click(screen.getByText('Invitar a mis amigos'));
    expect(onAction).toHaveBeenCalledWith('invite');
    fireEvent.click(screen.getByText('Copiar'));
    expect(onAction).toHaveBeenCalledWith('copy_code');
  });

  it('equipo listo: «Buscar rival»', () => {
    const onAction = vi.fn();
    render(<NextStepCard next={{ kind: 'FIND_RIVAL' }} onAction={onAction} />);
    fireEvent.click(screen.getByText('Buscar rival'));
    expect(onAction).toHaveBeenCalledWith('find_rival');
  });

  it('una acción pendiente muestra su texto y «Ver»', () => {
    const onAction = vi.fn();
    render(
      <NextStepCard
        next={{ kind: 'MATCH_ACTION', action: { type: 'CHALLENGE_RECEIVED', count: 1, label: '1 desafío recibido', matchId: null } }}
        onAction={onAction}
      />,
    );
    expect(screen.getByText('1 desafío recibido')).toBeTruthy();
    fireEvent.click(screen.getByText('Ver'));
    expect(onAction).toHaveBeenCalledWith('pending');
  });
});
