import type { Database } from '@/types/supabase';

type MatchStatus = Database['public']['Enums']['match_status'];

/**
 * Los 4 pasos de un partido (rediseño, etapa 4; spec §8.4). El detalle del
 * partido abre solo el paso actual; los anteriores quedan con ✓ y los siguientes
 * explican qué va a pasar.
 */
export const MATCH_STEPS = [
  { title: 'Desafío aceptado', upcoming: '' },
  { title: 'Acordar día y cancha', upcoming: 'Los capitanes proponen día, hora y cancha.' },
  { title: 'Llegar a la cancha', upcoming: 'Ese día cada jugador marca que llegó.' },
  { title: 'Cargar el resultado', upcoming: 'Si los dos capitanes coinciden, suma al ranking.' },
] as const;

export type MatchStepNumber = 1 | 2 | 3 | 4;

/** En qué paso está un partido. `'done'`: terminó (también por W.O.). `null`: cancelado. */
export function matchStep(status: MatchStatus): MatchStepNumber | 'done' | null {
  switch (status) {
    case 'PENDIENTE':
      return 2;
    case 'CONFIRMADO':
      return 3;
    case 'EN_VIVO':
    case 'EN_DISPUTA':
      return 4;
    case 'FINALIZADO':
    case 'WO_A':
    case 'WO_B':
      return 'done';
    case 'CANCELADO':
      return null;
  }
}
