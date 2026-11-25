/**
 * Opciones de la pantalla «¿Qué venís a hacer?» (`app/welcome.tsx`), que se
 * muestra una sola vez al terminar el onboarding.
 *
 * Rediseño, etapa 2 (spec docs/superpowers/specs/2026-11-25-rediseno-design.md §8.1):
 * al 25/11, 180 de 476 elegían «Sumarme a un equipo» y caían en un Mercado con
 * 16 publicaciones. Ahora los dos caminos para sumarse van a «Sumarme a un
 * equipo» (código arriba, equipos de tu zona y «publicar que busco equipo»).
 * «Ser embajador» pasa a Perfil.
 */
export type WelcomeIntentId = 'join_code' | 'create_team' | 'find_team';

export interface WelcomeIntent {
  id: WelcomeIntentId;
  title: string;
  description: string;
  icon: string;
  href: '/team-create' | '/team-join';
}

const INTENTS: readonly WelcomeIntent[] = [
  {
    id: 'join_code',
    title: 'Me invitó un amigo',
    description: 'Tengo un código o un link de su equipo.',
    icon: 'link-variant',
    href: '/team-join',
  },
  {
    id: 'create_team',
    title: 'Armar mi equipo',
    description: 'Lo creás en un minuto y sumás a tus amigos.',
    icon: 'shield-plus-outline',
    href: '/team-create',
  },
  {
    id: 'find_team',
    title: 'Busco equipo para jugar',
    description: 'Equipos de tu zona a los que les falta uno.',
    icon: 'account-search-outline',
    href: '/team-join',
  },
];

export function welcomeIntents(): WelcomeIntent[] {
  return [...INTENTS];
}
