import { describe, expect, it } from 'vitest';

import { positionWantedLabel } from './position-wanted';

describe('positionWantedLabel', () => {
  it('nombra el puesto que buscan', () => {
    expect(positionWantedLabel('ARQUERO')).toBe('Buscan arquero');
    expect(positionWantedLabel('MEDIOCAMPISTA')).toBe('Buscan mediocampista');
  });
  it('cualquier puesto o uno desconocido: «un jugador»', () => {
    expect(positionWantedLabel('CUALQUIERA')).toBe('Buscan un jugador');
    expect(positionWantedLabel('OTRA_COSA')).toBe('Buscan un jugador');
    expect(positionWantedLabel(null)).toBe('Buscan un jugador');
  });
});
