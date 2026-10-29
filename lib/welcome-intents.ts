/**
 * Opciones de la pantalla «¿Qué venís a hacer?» (`app/welcome.tsx`), que se
 * muestra una sola vez al terminar el onboarding.
 *
 * De las 23 cuentas que trajo la pauta (25-27/10), 19 quedaron sin equipo y sin
 * hacer nada después de registrarse: el inicio no les decía cuál era el paso
 * siguiente. La opción de embajador solo aparece con el programa prendido.
 */
export type WelcomeIntentId = 'create_team' | 'join_team' | 'ambassador';

export interface WelcomeIntent {
  id: WelcomeIntentId;
  title: string;
  description: string;
  icon: string;
  href: '/team-create' | '/(tabs)/market' | '/ambassador';
}

const INTENTS: readonly WelcomeIntent[] = [
  {
    id: 'create_team',
    title: 'Armar mi equipo',
    description: 'Creá tu equipo, invitá a tus amigos y empezá a desafiar.',
    icon: 'shield-plus-outline',
    href: '/team-create',
  },
  {
    id: 'join_team',
    title: 'Sumarme a un equipo',
    description: 'Mirá los equipos que buscan jugadores en el Mercado.',
    icon: 'account-search-outline',
    href: '/(tabs)/market',
  },
  {
    id: 'ambassador',
    title: 'Ser embajador',
    description: 'Cobrá $5.000 por cada equipo nuevo que traigas y juegue su primer partido por ranking.',
    icon: 'cash-multiple',
    href: '/ambassador',
  },
];

export function welcomeIntents(ambassadorProgramEnabled: boolean): WelcomeIntent[] {
  return INTENTS.filter((intent) => intent.id !== 'ambassador' || ambassadorProgramEnabled);
}
