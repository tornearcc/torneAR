import { describe, expect, it } from 'vitest';

import type { HomeIncompleteTeam, HomeMatchEntry, HomeTeamSnapshot, PendingAction } from '@/components/home/types';
import { otherPendingActions, playersNeeded, resolveHomeNextStep, resolveJourney } from './home-next-step';

const team: HomeTeamSnapshot = {
  id: 't1', name: 'Los Pibes', shieldUrl: null, eloRating: 1000, rankingFormat: 'FUTBOL_5',
  fairPlayScore: 100, seasonWins: 0, seasonDraws: 0, seasonLosses: 0, role: 'CAPITAN',
};
const match = (status: HomeMatchEntry['status']): HomeMatchEntry => ({
  id: 'm1', status, matchType: 'RANKING', scheduledAt: null, format: 'FUTBOL_5',
  teamA: { id: 't1', name: 'Los Pibes', shieldUrl: null, eloRating: 1000 },
  teamB: { id: 't2', name: 'Rival', shieldUrl: null, eloRating: 1000 },
  myTeamId: 't1',
});
const action = (type: PendingAction['type']): PendingAction => ({ type, count: 1, label: type, matchId: null });
const incomplete = (members: number, needed = 5): HomeIncompleteTeam => ({
  id: 't1', name: 'Los Pibes', inviteCode: 'K7P2QX', shieldUrl: null, members, needed, format: 'FUTBOL_5',
});
const data = (over: Partial<Parameters<typeof resolveHomeNextStep>[0]> = {}) => ({
  myTeams: [team], upcomingMatches: [], pendingActions: [], incompleteTeam: null, ...over,
});

describe('playersNeeded', () => {
  it('es el número del formato', () => {
    expect(playersNeeded('FUTBOL_5')).toBe(5);
    expect(playersNeeded('FUTBOL_7')).toBe(7);
    expect(playersNeeded('FUTBOL_11')).toBe(11);
  });
  it('sin formato, 5', () => {
    expect(playersNeeded(null)).toBe(5);
  });
});

describe('resolveHomeNextStep', () => {
  it('sin equipos → sumarse a uno', () => {
    expect(resolveHomeNextStep(data({ myTeams: [] }))).toEqual({ kind: 'JOIN_TEAM' });
  });

  it.each(['LIVE_RESULT', 'DISPUTE', 'MATCH_PROPOSAL', 'CANCELLATION_REQUEST', 'CHALLENGE_RECEIVED'] as const)(
    'una acción de partido (%s) va primero',
    (type) => {
      const a = action(type);
      expect(resolveHomeNextStep(data({ pendingActions: [a], upcomingMatches: [match('CONFIRMADO')], incompleteTeam: incomplete(1) })))
        .toEqual({ kind: 'MATCH_ACTION', action: a });
    },
  );

  it.each(['PENDIENTE', 'CONFIRMADO', 'EN_VIVO'] as const)('sin acciones, el próximo partido (%s)', (status) => {
    const m = match(status);
    expect(resolveHomeNextStep(data({ upcomingMatches: [m], incompleteTeam: incomplete(2) }))).toEqual({ kind: 'NEXT_MATCH', match: m });
  });

  it('un partido terminado no es el próximo', () => {
    expect(resolveHomeNextStep(data({ upcomingMatches: [match('FINALIZADO')] }))).toEqual({ kind: 'FIND_RIVAL' });
  });

  it('una solicitud de ingreso gana a completar el equipo', () => {
    const a = action('TEAM_REQUEST');
    expect(resolveHomeNextStep(data({ pendingActions: [a], incompleteTeam: incomplete(1) }))).toEqual({ kind: 'TEAM_REQUEST', action: a });
  });

  it('equipo incompleto → completarlo', () => {
    const t = incomplete(1);
    expect(resolveHomeNextStep(data({ incompleteTeam: t }))).toEqual({ kind: 'COMPLETE_TEAM', team: t });
  });

  it('las postulaciones del Mercado ganan a completar el equipo (26/11: son la forma de completarlo)', () => {
    const a = action('MARKET_APPLICATION');
    expect(resolveHomeNextStep(data({ pendingActions: [a], incompleteTeam: incomplete(1) })))
      .toEqual({ kind: 'MARKET_APPLICATION', action: a });
  });

  it('una solicitud de ingreso gana a las postulaciones', () => {
    const r = action('TEAM_REQUEST');
    expect(resolveHomeNextStep(data({ pendingActions: [r, action('MARKET_APPLICATION')] })))
      .toEqual({ kind: 'TEAM_REQUEST', action: r });
  });

  it('solo postulaciones del Mercado → responderlas', () => {
    const a = action('MARKET_APPLICATION');
    expect(resolveHomeNextStep(data({ pendingActions: [a] }))).toEqual({ kind: 'MARKET_APPLICATION', action: a });
  });

  it('equipo completo y nada pendiente → buscar rival', () => {
    expect(resolveHomeNextStep(data())).toEqual({ kind: 'FIND_RIVAL' });
  });

  it('un jugador que no es capitán no puede desafiar: le pide al capitán (spec §8.3)', () => {
    expect(resolveHomeNextStep(data({ myTeams: [{ ...team, role: 'JUGADOR' }] }))).toEqual({ kind: 'ASK_CAPTAIN', teamName: 'Los Pibes' });
  });

  it('el subcapitán sí desafía', () => {
    expect(resolveHomeNextStep(data({ myTeams: [{ ...team, role: 'SUBCAPITAN' }] }))).toEqual({ kind: 'FIND_RIVAL' });
  });
});

describe('resolveJourney', () => {
  it('sin equipo: paso 1 vacío', () => {
    expect(resolveJourney(data({ myTeams: [] }))).toEqual({ step: 1, teamProgress: 0 });
  });
  it('equipo incompleto: paso 1 con el avance del plantel', () => {
    expect(resolveJourney(data({ incompleteTeam: incomplete(1) }))).toEqual({ step: 1, teamProgress: 0.2 });
  });
  it('equipo completo sin partido: paso 2', () => {
    expect(resolveJourney(data())).toEqual({ step: 2, teamProgress: 1 });
  });
  it('con partido próximo: paso 3', () => {
    expect(resolveJourney(data({ upcomingMatches: [match('CONFIRMADO')] }))).toEqual({ step: 3, teamProgress: 1 });
  });
});

describe('otherPendingActions', () => {
  it('saca la acción que ya es el paso principal', () => {
    const principal = action('MATCH_PROPOSAL');
    const otra = action('MARKET_APPLICATION');
    const d = data({ pendingActions: [principal, otra], incompleteTeam: incomplete(1) });
    expect(otherPendingActions(d, resolveHomeNextStep(d))).toEqual([otra]);
  });
  it('si el paso no es una acción, quedan todas', () => {
    const otra = action('MARKET_APPLICATION');
    const d = data({ pendingActions: [otra], upcomingMatches: [match('CONFIRMADO')] });
    expect(otherPendingActions(d, { kind: 'NEXT_MATCH', match: match('CONFIRMADO') })).toEqual([otra]);
  });
});
