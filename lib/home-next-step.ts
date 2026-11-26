import type {
  HomeIncompleteTeam,
  HomeMatchEntry,
  HomeViewData,
  PendingAction,
  PendingActionType,
} from '@/components/home/types';
import type { Database } from '@/types/supabase';

/**
 * Rediseño, etapa 1 (spec docs/superpowers/specs/2026-11-25-rediseno-design.md §8):
 * Inicio muestra UN solo próximo paso según dónde está la persona. Esta función
 * lo decide con los datos que `fetchHomeViewData` ya trae; la pantalla solo lo dibuja.
 *
 * Prioridad: lo que pasa con un partido (en vivo, disputa, propuesta, cancelación,
 * desafío recibido) → el próximo partido → alguien que pide entrar al equipo →
 * postulaciones del Mercado → completar el equipo → buscar rival.
 */

type TeamFormat = Database['public']['Enums']['team_format'];

const PLAYERS: Record<TeamFormat, number> = {
  FUTBOL_5: 5, FUTBOL_6: 6, FUTBOL_7: 7, FUTBOL_8: 8, FUTBOL_9: 9, FUTBOL_11: 11,
};

/** Jugadores que pide un formato para jugar. Sin formato, los de un F5. */
export function playersNeeded(format: TeamFormat | null): number {
  return format ? PLAYERS[format] : 5;
}

export type HomeNextStep =
  | { kind: 'JOIN_TEAM' }
  | { kind: 'MATCH_ACTION'; action: PendingAction }
  | { kind: 'NEXT_MATCH'; match: HomeMatchEntry }
  | { kind: 'TEAM_REQUEST'; action: PendingAction }
  | { kind: 'COMPLETE_TEAM'; team: HomeIncompleteTeam }
  | { kind: 'MARKET_APPLICATION'; action: PendingAction }
  | { kind: 'FIND_RIVAL' }
  /** Solo el capitán o el subcapitán desafían: el resto le pide al capitán (spec §8.3). */
  | { kind: 'ASK_CAPTAIN'; teamName: string };

type NextStepInput = Pick<HomeViewData, 'myTeams' | 'upcomingMatches' | 'pendingActions' | 'incompleteTeam'>;

const MATCH_ACTIONS: PendingActionType[] = ['LIVE_RESULT', 'DISPUTE', 'MATCH_PROPOSAL', 'CANCELLATION_REQUEST', 'CHALLENGE_RECEIVED'];
const OPEN_STATUSES: HomeMatchEntry['status'][] = ['PENDIENTE', 'CONFIRMADO', 'EN_VIVO'];

const nextOpenMatch = (data: NextStepInput) => data.upcomingMatches.find((m) => OPEN_STATUSES.includes(m.status));

export function resolveHomeNextStep(data: NextStepInput): HomeNextStep {
  if (data.myTeams.length === 0) return { kind: 'JOIN_TEAM' };

  const matchAction = data.pendingActions.find((a) => MATCH_ACTIONS.includes(a.type));
  if (matchAction) return { kind: 'MATCH_ACTION', action: matchAction };

  const match = nextOpenMatch(data);
  if (match) return { kind: 'NEXT_MATCH', match };

  const request = data.pendingActions.find((a) => a.type === 'TEAM_REQUEST');
  if (request) return { kind: 'TEAM_REQUEST', action: request };

  // Antes iba después de «Completá tu equipo», y como casi todos los equipos nuevos
  // están incompletos, nadie lo veía (26/11: 41 postulaciones sin responder). Es
  // justamente la forma de completarlo, así que va antes.
  const application = data.pendingActions.find((a) => a.type === 'MARKET_APPLICATION');
  if (application) return { kind: 'MARKET_APPLICATION', action: application };

  if (data.incompleteTeam) return { kind: 'COMPLETE_TEAM', team: data.incompleteTeam };

  const canChallenge = data.myTeams.some((t) => t.role === 'CAPITAN' || t.role === 'SUBCAPITAN');
  if (!canChallenge) return { kind: 'ASK_CAPTAIN', teamName: data.myTeams[0].name };

  return { kind: 'FIND_RIVAL' };
}

/** Dónde está la persona en «1 · Tu equipo → 2 · Un rival → 3 · El partido suma». */
export function resolveJourney(data: NextStepInput): { step: 1 | 2 | 3; teamProgress: number } {
  if (data.myTeams.length === 0) return { step: 1, teamProgress: 0 };
  if (nextOpenMatch(data)) return { step: 3, teamProgress: 1 };
  const t = data.incompleteTeam;
  if (t) return { step: 1, teamProgress: Math.min(1, t.members / t.needed) };
  return { step: 2, teamProgress: 1 };
}

/** Lo pendiente que no es el paso principal: queda en «También tenés pendiente». */
export function otherPendingActions(data: NextStepInput, next: HomeNextStep): PendingAction[] {
  const main = 'action' in next ? next.action : null;
  return data.pendingActions.filter((a) => a !== main);
}
