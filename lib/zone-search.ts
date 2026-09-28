/**
 * Búsqueda de zonas: normalización, índice y ranking.
 *
 * Vive en `lib/` y no dentro del componente por dos razones:
 *
 * 1. Es la única parte del selector que se puede testear sin montar UI, y el
 *    ranking es justo lo que se rompe en silencio (un cambio de orden no tira
 *    ningún error, sólo empeora el primer resultado).
 * 2. El índice se construye UNA vez sobre las 245 zonas y se reusa en cada
 *    tecla. Normalizar 245 strings por pulsación era el costo real de filtrar,
 *    no la comparación en sí.
 */

export interface ZoneOption {
  /**
   * Lo que el consumidor guarda al elegir. Para el catálogo por defecto es el
   * **nombre** — así se persiste la zona en toda la app (`profiles.zone`,
   * `teams.zone`, filtros de market y ranking son `text`). `ProposalModal` pasa
   * el uuid porque lo que necesita es `venues.zone_id`.
   */
  value: string;
  name: string;
  /** Línea secundaria opcional (ej: "3 complejos"). */
  subtitle?: string;
}

/** Entrada del índice: la opción más su clave de búsqueda ya normalizada. */
export interface ZoneIndexEntry<T extends ZoneOption = ZoneOption> {
  option: T;
  /** `name` sin acentos, en minúsculas: contra esto se compara. */
  haystack: string;
}

/**
 * Case y acentos aparte: "Núñez" tiene que aparecer tecleando "nunez", y
 * "El Jagüel" tecleando "jaguel". Con 245 localidades del AMBA la mitad larga
 * lleva tilde o diéresis, así que sin esto la búsqueda es inservible en la
 * práctica: nadie escribe los acentos en el teclado del teléfono.
 *
 * Mismo criterio que `normalize()` en `lib/market-distance.ts`.
 */
export function normalizeZoneText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // Marcas diacríticas combinantes: es lo que NFD separa de cada vocal.
    // En escapes y no con los caracteres literales — son invisibles en el
    // editor y cualquier reformateo del archivo los puede comer.
    .replace(/[\u0300-\u036f]/g, '');
}

export function buildZoneIndex<T extends ZoneOption>(options: readonly T[]): ZoneIndexEntry<T>[] {
  return options.map((option) => ({ option, haystack: normalizeZoneText(option.name) }));
}

/**
 * Calidad del match de un token dentro del haystack. Más bajo = mejor.
 * `null` significa que el token no está y la zona queda descartada.
 */
function tokenScore(haystack: string, token: string): number | null {
  const index = haystack.indexOf(token);
  if (index === -1) return null;
  if (index === 0) return 0; // "bel" → Belgrano
  // Comienzo de palabra: "urq" tiene que traer Villa Urquiza antes que
  // cualquier zona donde esas letras caen en el medio.
  if (haystack[index - 1] === ' ') return 1;
  return 2; // aparición suelta
}

/**
 * Zonas que matchean `query`, ordenadas por relevancia.
 *
 * Todos los tokens tienen que aparecer (AND, no OR): "villa u" filtra a Villa
 * Urquiza / Villa Udaondo y no arrastra las 30 zonas que empiezan con "Villa".
 * El orden lo define la suma de calidades — y ante empate gana el nombre más
 * corto, porque el match cubre más porcentaje del nombre y es casi siempre el
 * que el usuario tenía en la cabeza ("San Isidro" antes que "Villa San Isidro").
 *
 * Con la query vacía devuelve el catálogo tal cual viene (alfabético desde la
 * base), sin copiar ni reordenar.
 */
export function searchZones<T extends ZoneOption>(
  index: readonly ZoneIndexEntry<T>[],
  query: string,
): T[] {
  const tokens = normalizeZoneText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return index.map((entry) => entry.option);

  const scored: { option: T; score: number; length: number }[] = [];

  for (const entry of index) {
    let score = 0;
    let matches = true;

    for (const token of tokens) {
      const partial = tokenScore(entry.haystack, token);
      if (partial === null) {
        matches = false;
        break;
      }
      score += partial;
    }

    if (matches) {
      scored.push({ option: entry.option, score, length: entry.haystack.length });
    }
  }

  // `sort` es estable (ES2019, y Hermes lo cumple): con score y largo iguales
  // se conserva el alfabético con el que vino el catálogo.
  scored.sort((a, b) => a.score - b.score || a.length - b.length);

  return scored.map((item) => item.option);
}
