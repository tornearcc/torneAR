import { describe, it, expect } from 'vitest';
import {
  paramToNullable,
  parseCategoryParam,
  parseFormatParam,
  parseLeaderboardStatParam,
  buildRankingFullParams,
  parseRankingFullParams,
} from './ranking-params';
import type { RankingFiltersState } from '@/components/ranking/types';

const NO_FILTERS: RankingFiltersState = { zone: null, category: null, format: null, rivalesIdeales: false };

describe('paramToNullable', () => {
  it('toma el primer valor de un array y recorta espacios', () => {
    expect(paramToNullable(['  Berazategui ', 'otro'])).toBe('Berazategui');
  });

  it('vacío o ausente es "sin filtro"', () => {
    expect(paramToNullable('   ')).toBeNull();
    expect(paramToNullable(undefined)).toBeNull();
  });
});

describe('parsers de enums', () => {
  it('acepta sólo valores conocidos', () => {
    expect(parseCategoryParam('MIXTO')).toBe('MIXTO');
    expect(parseCategoryParam('mixto')).toBeNull();
    expect(parseFormatParam('FUTBOL_7')).toBe('FUTBOL_7');
    expect(parseFormatParam('FUTBOL_12')).toBeNull();
  });

  it('un stat desconocido cae en goleadores', () => {
    expect(parseLeaderboardStatParam('win_rate')).toBe('win_rate');
    expect(parseLeaderboardStatParam('asistencias')).toBe('goals');
    expect(parseLeaderboardStatParam(undefined)).toBe('goals');
  });
});

describe('buildRankingFullParams', () => {
  it('sólo manda los filtros activos', () => {
    expect(
      buildRankingFullParams({
        kind: 'teams',
        filters: { ...NO_FILTERS, zone: 'Berazategui', category: 'HOMBRES' },
        stat: 'goals',
      }),
    ).toEqual({ kind: 'teams', zone: 'Berazategui', category: 'HOMBRES' });
  });

  it('rivales ideales viaja sólo para equipos; el stat sólo para jugadores', () => {
    const filters = { ...NO_FILTERS, rivalesIdeales: true };
    expect(buildRankingFullParams({ kind: 'teams', filters, stat: 'mvps' })).toEqual({
      kind: 'teams',
      ideales: '1',
    });
    expect(buildRankingFullParams({ kind: 'players', filters, stat: 'mvps' })).toEqual({
      kind: 'players',
      stat: 'mvps',
    });
  });

  it('ida y vuelta: parsear lo construido devuelve el mismo contexto', () => {
    const context = {
      kind: 'players' as const,
      filters: { zone: 'Quilmes', category: 'MIXTO' as const, format: 'FUTBOL_5' as const, rivalesIdeales: false },
      stat: 'clean_sheets' as const,
    };
    expect(parseRankingFullParams(buildRankingFullParams(context))).toEqual(context);
  });
});

describe('parseRankingFullParams', () => {
  it('sin params abre la tabla de equipos global', () => {
    expect(parseRankingFullParams({})).toEqual({ kind: 'teams', filters: NO_FILTERS, stat: 'goals' });
  });

  it('descarta valores basura en vez de mandarlos a la RPC', () => {
    expect(
      parseRankingFullParams({ kind: 'jugadores', category: 'OTRA', format: 'F5', ideales: 'si' }),
    ).toEqual({ kind: 'teams', filters: NO_FILTERS, stat: 'goals' });
  });
});
