/** «Buscan arquero» para una publicación de «Les falta uno» (`market_team_posts.position_wanted`). */
const LABELS: Record<string, string> = {
  ARQUERO: 'arquero',
  DEFENSOR: 'defensor',
  MEDIOCAMPISTA: 'mediocampista',
  DELANTERO: 'delantero',
};

export function positionWantedLabel(position: string | null | undefined): string {
  return `Buscan ${(position && LABELS[position]) || 'un jugador'}`;
}
