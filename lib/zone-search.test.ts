import { describe, expect, it } from 'vitest';

import { buildZoneIndex, normalizeZoneText, searchZones } from './zone-search';
import type { ZoneOption } from './zone-search';

/**
 * Muestra real del catálogo: nombres con tilde, con diéresis y multi-palabra.
 * Alfabético, como llega de `zones.order('name')` — el ranking se apoya en ese
 * orden para desempatar.
 */
const ZONES: ZoneOption[] = [
  'Adrogué',
  'Almagro',
  'Bella Vista',
  'Belgrano',
  'Cañuelas',
  'El Jagüel',
  'Isidro Casanova',
  'Núñez',
  'San Isidro',
  'Villa Crespo',
  'Villa Udaondo',
  'Villa Urquiza',
].map((name) => ({ value: name, name }));

const index = buildZoneIndex(ZONES);
const namesFor = (query: string) => searchZones(index, query).map((zone) => zone.name);

describe('normalizeZoneText', () => {
  it('saca acentos, diéresis y case', () => {
    expect(normalizeZoneText('Núñez')).toBe('nunez');
    expect(normalizeZoneText('El Jagüel')).toBe('el jaguel');
    expect(normalizeZoneText('  Adrogué ')).toBe('adrogue');
  });
});

describe('searchZones', () => {
  it('con query vacía devuelve el catálogo completo en su orden original', () => {
    expect(namesFor('')).toEqual(ZONES.map((zone) => zone.name));
    expect(namesFor('   ')).toHaveLength(ZONES.length);
  });

  it('encuentra zonas acentuadas escribiendo sin acentos', () => {
    expect(namesFor('nunez')).toEqual(['Núñez']);
    expect(namesFor('adrogue')).toEqual(['Adrogué']);
    expect(namesFor('jaguel')).toEqual(['El Jagüel']);
  });

  it('prioriza el prefijo del nombre sobre el comienzo de palabra interno', () => {
    // "San Isidro" empieza con el token; en "Isidro Casanova" arranca el nombre
    // pero es más largo, y en ningún caso puede ganar un match del medio.
    expect(namesFor('isidro')).toEqual(['Isidro Casanova', 'San Isidro']);
  });

  it('prioriza el comienzo de palabra sobre la aparición suelta', () => {
    // "urquiza" arranca palabra en Villa Urquiza; en ninguna otra aparece.
    expect(namesFor('vi')[0]).toBe('Villa Crespo');
  });

  it('exige todos los tokens (AND) y no sólo alguno', () => {
    // Mismo score y mismo largo: el `sort` estable conserva el alfabético.
    expect(namesFor('villa u')).toEqual(['Villa Udaondo', 'Villa Urquiza']);
    expect(namesFor('villa vista')).toEqual([]);
  });

  it('ignora el orden de los tokens', () => {
    expect(namesFor('vista bella')).toEqual(['Bella Vista']);
  });

  it('devuelve vacío cuando no hay match', () => {
    expect(namesFor('rosario')).toEqual([]);
  });

  it('desempata por nombre más corto', () => {
    // Ambas matchean "villa " en posición 0: gana la más corta.
    const result = namesFor('villa');
    expect(result[0]).toBe('Villa Crespo');
  });
});
