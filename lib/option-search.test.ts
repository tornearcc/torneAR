import { describe, expect, it } from 'vitest';

import { FAVORITE_TEAM_OPTIONS, FAVORITE_TEAMS, getClubLogoUrl, isValidFavoriteTeam } from '@/lib/favorite-teams';
import { filterOptions, normalizeForSearch } from '@/lib/option-search';

describe('normalizeForSearch', () => {
  it('saca tildes, mayúsculas y espacios de más', () => {
    expect(normalizeForSearch('  Vélez   Sarsfield ')).toBe('velez sarsfield');
    expect(normalizeForSearch('Güemes (Santiago del Estero)')).toBe('guemes (santiago del estero)');
  });
});

describe('filterOptions', () => {
  const opciones = ['Vélez Sarsfield', 'Gimnasia y Esgrima de Mendoza', 'Gimnasia y Esgrima La Plata', 'Chacarita Juniors'];

  it('sin búsqueda devuelve todo', () => {
    expect(filterOptions(opciones, '   ')).toEqual(opciones);
  });

  it('ignora tildes y mayúsculas', () => {
    expect(filterOptions(opciones, 'VELEZ')).toEqual(['Vélez Sarsfield']);
  });

  it('cada palabra tiene que estar, en cualquier orden', () => {
    expect(filterOptions(opciones, 'mendoza gimnasia')).toEqual(['Gimnasia y Esgrima de Mendoza']);
    expect(filterOptions(opciones, 'gimnasia')).toHaveLength(2);
  });

  it('sin coincidencias devuelve vacío', () => {
    expect(filterOptions(opciones, 'xyz')).toEqual([]);
  });
});

describe('catálogo de clubes', () => {
  it('mantiene los 28 nombres de Primera que ya guardan los perfiles', () => {
    for (const nombre of ['Boca Juniors', 'River Plate', 'Racing Club', 'San Lorenzo', 'Huracán', 'Instituto',
      'Unión', 'Gimnasia y Esgrima La Plata', 'Argentinos Juniors', 'Vélez Sarsfield']) {
      expect(isValidFavoriteTeam(nombre)).toBe(true);
    }
  });

  it('suma el ascenso con escudo', () => {
    expect(isValidFavoriteTeam('Chacarita Juniors')).toBe(true);
    expect(isValidFavoriteTeam('Racing de Córdoba')).toBe(true);
    expect(getClubLogoUrl('Chacarita Juniors')).toMatch(/^https:\/\/assets\.football-logos\.cc\/logos\/argentina\/256x256\/chacarita-juniors\.[0-9a-f]{8}\.png$/);
  });

  it('no tiene nombres repetidos y termina con «Otro / No tengo»', () => {
    expect(new Set(FAVORITE_TEAM_OPTIONS).size).toBe(FAVORITE_TEAM_OPTIONS.length);
    expect(FAVORITE_TEAM_OPTIONS.at(-1)).toBe('Otro / No tengo');
    expect(FAVORITE_TEAMS.length).toBe(150);
  });
});
