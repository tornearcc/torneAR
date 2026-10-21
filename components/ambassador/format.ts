/** `5000` → `$5.000`. Sin `toLocaleString`: Hermes no siempre trae el locale es-AR. */
export function formatArs(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}$${digits}`;
}

/** Perfil de Instagram de TorneAR, el que hay que seguir para cobrar. */
export const TORNEAR_INSTAGRAM_URL = 'https://www.instagram.com/tornear.app';

/** Bases del programa. */
export const AMBASSADOR_TERMS_URL = 'https://tornear.vercel.app/legal/embajadores';
