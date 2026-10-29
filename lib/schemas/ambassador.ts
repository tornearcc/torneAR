import * as z from 'zod';

/**
 * Forma del JSON de `get_my_ambassador_overview()` (migración
 * `20261021120000_ambassador_program_v2.sql`). La RPC devuelve `jsonb`, así
 * que supabase-js lo tipa como `Json`: este schema es lo que vuelve a esa
 * salida un tipo real y rechaza una forma rota en vez de dejarla llegar a la UI.
 */

export const DEBUT_STATES = ['SIN_EQUIPO', 'DISPONIBLE', 'GANADO', 'PERDIDO'] as const;
export const BROUGHT_TEAM_STATES = ['ESPERANDO', 'PENDIENTE', 'PAGADO', 'RECHAZADO'] as const;

export const ambassadorOwnTeamSchema = z.object({
  team_id: z.string(),
  name: z.string(),
  format: z.string().nullable(),
  members_now: z.number(),
  members_needed: z.number().nullable(),
});

export const ambassadorEligibleTeamSchema = z.object({
  team_id: z.string(),
  name: z.string(),
});

export const ambassadorBroughtTeamSchema = z.object({
  team_id: z.string(),
  name: z.string(),
  format: z.string().nullable(),
  members_now: z.number(),
  members_needed: z.number().nullable(),
  state: z.enum(BROUGHT_TEAM_STATES),
  amount: z.number().nullable(),
});

const notRegisteredSchema = z.object({
  enabled: z.boolean(),
  registered: z.literal(false),
  slots_left: z.number(),
});

const registeredSchema = z.object({
  enabled: z.boolean(),
  registered: z.literal(true),
  status: z.string(),
  username: z.string(),
  instagram: z.string(),
  show_in_ranking: z.boolean(),
  follow_verified: z.boolean(),
  has_payout_alias: z.boolean(),
  /** El alias o CBU propio, para poder corregirlo desde la pantalla. */
  payout_alias: z.string().nullable(),
  own_team: ambassadorOwnTeamSchema.nullable(),
  eligible_own_teams: z.array(ambassadorEligibleTeamSchema),
  debut_state: z.enum(DEBUT_STATES),
  teams_counted: z.number(),
  next_bonus_at: z.number().nullable(),
  bonus_5_earned: z.boolean(),
  bonus_10_earned: z.boolean(),
  earned_total: z.number(),
  paid_total: z.number(),
  slots_left: z.number(),
  brought_teams: z.array(ambassadorBroughtTeamSchema),
  /** Se inscribió con bases anteriores: tiene que aceptar las vigentes para seguir sumando. */
  terms_outdated: z.boolean().default(false),
});

export const ambassadorOverviewSchema = z.discriminatedUnion('registered', [
  notRegisteredSchema,
  registeredSchema,
]);

export type AmbassadorOverview = z.infer<typeof ambassadorOverviewSchema>;
export type AmbassadorRegisteredOverview = z.infer<typeof registeredSchema>;
export type AmbassadorBroughtTeam = z.infer<typeof ambassadorBroughtTeamSchema>;
export type AmbassadorEligibleTeam = z.infer<typeof ambassadorEligibleTeamSchema>;
export type AmbassadorDebutState = (typeof DEBUT_STATES)[number];
