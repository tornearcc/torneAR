// tornear/lib/mixed-composition.ts
//
// F3 — composición de los equipos MIXTO (20260925160000_mixed_composition).
//
// La regla vive entera en el servidor: las RPC de desafío, propuesta y check-in
// la aplican detrás de `app_settings.mixed_composition_enforced`. La app no
// conoce el género de nadie más que el propio (la vista pública lo devuelve
// NULL), así que no puede calcularla: sólo lee el estado que arma
// `get_mixed_composition_status` y traduce los errores `MIXED_COMPOSITION:`.
//
// Este módulo es puro (tipos y textos) para que lo puedan importar los
// componentes sin arrastrar el cliente de Supabase; la consulta vive en
// lib/mixed-composition-data.ts.

/** Correo de soporte: es la única vía para corregir el género (ver GENDER_LOCKED). */
export const SUPPORT_EMAIL = 'tornearcc@gmail.com';

export const GENDER_LOCKED_MESSAGE = `El género se elige al registrarte. Para corregirlo, escribinos a ${SUPPORT_EMAIL}.`;

export interface MixedCompositionCounts {
  minPerGender: number;
  male: number;
  female: number;
  other: number;
  missingMale: number;
  missingFemale: number;
  missingTotal: number;
  xCountsAsAny: boolean;
}

export interface MixedCompositionStatus {
  /** El equipo es MIXTO: sin esto no hay regla que mostrar. */
  applies: boolean;
  /** La regla ya se exige (`mixed_composition_enforced` = 1). */
  enforced: boolean;
  ok: boolean;
  /** Sólo para integrantes del equipo; `null` para cualquier otro. */
  counts: MixedCompositionCounts | null;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export function parseMixedCompositionStatus(raw: unknown): MixedCompositionStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  const hasCounts = 'minPerGender' in r;
  return {
    applies: r.applies === true,
    enforced: r.enforced === true,
    ok: r.ok !== false,
    counts: hasCounts
      ? {
          minPerGender: toCount(r.minPerGender),
          male: toCount(r.male),
          female: toCount(r.female),
          other: toCount(r.other),
          missingMale: toCount(r.missingMale),
          missingFemale: toCount(r.missingFemale),
          missingTotal: toCount(r.missingTotal),
          xCountsAsAny: r.xCountsAsAny === true,
        }
      : null,
  };
}

/**
 * "1 de género femenino", "2 de género masculino y 1 de género femenino".
 * Cadena vacía si no falta nadie.
 */
export function describeMissing(missing: { male: number; female: number }): string {
  const parts: string[] = [];
  if (missing.male > 0) parts.push(`${missing.male} de género masculino`);
  if (missing.female > 0) parts.push(`${missing.female} de género femenino`);
  return parts.join(' y ');
}

/**
 * La frase completa, con el verbo: "falta 1 de género femenino", "faltan 2 de
 * género masculino y 1 de género femenino". Mismo texto que arma el servidor
 * (mixed_composition_missing_text). Con X como comodín el total es menor que la
 * suma por género, y lo que falta se puede cubrir con cualquiera: se dice el
 * total. Cadena vacía si no falta nadie.
 */
export function describeCompositionMissing(missing: {
  male: number;
  female: number;
  total: number;
}): string {
  if (missing.total <= 0) return '';
  const verb = missing.total === 1 ? 'falta' : 'faltan';
  const detail =
    missing.male + missing.female === missing.total
      ? describeMissing(missing)
      : `${missing.total} de género masculino o femenino`;
  return `${verb} ${detail}`;
}

/** "al menos 2 de género masculino y 2 de género femenino" */
export function describeRule(minPerGender: number): string {
  return `al menos ${minPerGender} de género masculino y ${minPerGender} de género femenino`;
}

/**
 * Texto para un `MIXED_COMPOSITION:` del servidor. El detalle ya está escrito
 * para el usuario (nombra al equipo y, si es el propio, cuántos faltan): se
 * conserva sin el prefijo.
 */
export function getMixedCompositionErrorMessage(message: string): string {
  const detail = message.replace(/^\s*MIXED_COMPOSITION:\s*/, '').trim();
  if (!detail) return 'El equipo no cumple la composición mínima de un equipo mixto.';
  const sentence = `${detail.charAt(0).toUpperCase()}${detail.slice(1)}`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function isMixedCompositionError(message: string): boolean {
  return /^\s*MIXED_COMPOSITION:/.test(message);
}
