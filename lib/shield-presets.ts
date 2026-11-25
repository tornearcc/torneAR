/**
 * Escudos prediseñados (P3-26). Son 15 PNG compartidos en el bucket `shields`,
 * carpeta `presets/` (los genera `scripts/generar-escudos-presets.mjs`). Un
 * equipo que los usa guarda el path en `teams.shield_url` como cualquier
 * escudo subido, así que todas las pantallas que muestran escudos los
 * resuelven igual (`resolveShieldUrl`).
 *
 * La base le asigna uno a cada equipo sin escudo (trigger `teams_default_shield`,
 * migración 20261125140000) y el barrido de huérfanos no toca esa carpeta.
 */
export const SHIELD_PRESET_COUNT = 15;

export const SHIELD_PRESETS: readonly string[] = Array.from(
  { length: SHIELD_PRESET_COUNT },
  (_, i) => `presets/escudo-${String(i + 1).padStart(2, '0')}.png`,
);

export function isPresetShield(shieldUrl: string | null | undefined): boolean {
  return !!shieldUrl && shieldUrl.startsWith('presets/');
}
