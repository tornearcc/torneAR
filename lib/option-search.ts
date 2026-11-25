/**
 * Búsqueda sobre un catálogo de textos (lo usa `OptionPickerDialog`).
 *
 * Ignora tildes, mayúsculas y espacios de más: «velez» encuentra «Vélez
 * Sarsfield» y «gimnasia mendoza» encuentra «Gimnasia y Esgrima de Mendoza»
 * (cada palabra de la búsqueda tiene que aparecer, en cualquier orden).
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterOptions(options: readonly string[], query: string): readonly string[] {
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const haystack = normalizeForSearch(option);
    return words.every((word) => haystack.includes(word));
  });
}
