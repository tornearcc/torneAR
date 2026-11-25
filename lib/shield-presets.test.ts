import { describe, expect, it } from 'vitest';

import { isPresetShield, SHIELD_PRESETS, SHIELD_PRESET_COUNT } from './shield-presets';

describe('shield-presets', () => {
  it('lista los 15 escudos con el mismo nombre que arma la base (default_shield_preset)', () => {
    expect(SHIELD_PRESETS).toHaveLength(SHIELD_PRESET_COUNT);
    expect(SHIELD_PRESETS[0]).toBe('presets/escudo-01.png');
    expect(SHIELD_PRESETS[14]).toBe('presets/escudo-15.png');
  });

  it('distingue un prediseñado de un escudo subido', () => {
    expect(isPresetShield('presets/escudo-07.png')).toBe(true);
    expect(isPresetShield('2f1c…/shield-1732550000000.jpg')).toBe(false);
    expect(isPresetShield(null)).toBe(false);
    expect(isPresetShield(undefined)).toBe(false);
  });
});
