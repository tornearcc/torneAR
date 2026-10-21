import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { ambassadorOverviewSchema, type AmbassadorOverview } from '@/lib/schemas/ambassador';

export type { AmbassadorOverview } from '@/lib/schemas/ambassador';

/** Resultado de `upsert_ambassador`, más `rpc_error` si falló la llamada. */
export type UpsertAmbassadorOutcome =
  | 'created'
  | 'updated'
  | 'noop_disabled'
  | 'noop_terms'
  | 'noop_instagram'
  | 'noop_suspended'
  | 'rpc_error';

/** Resultado de `set_ambassador_own_team`, más `rpc_error` si falló la llamada. */
export type OwnTeamOutcome =
  | 'applied'
  | 'noop_disabled'
  | 'noop_not_ambassador'
  | 'noop_not_member'
  | 'noop_team_brought'
  | 'noop_team_taken'
  | 'noop_excluded'
  | 'noop_locked'
  | 'rpc_error';

export type PayoutAliasOutcome = 'applied' | 'noop_not_ambassador' | 'noop_invalid' | 'rpc_error';

const UPSERT_OUTCOMES: readonly UpsertAmbassadorOutcome[] = [
  'created',
  'updated',
  'noop_disabled',
  'noop_terms',
  'noop_instagram',
  'noop_suspended',
];

const OWN_TEAM_OUTCOMES: readonly OwnTeamOutcome[] = [
  'applied',
  'noop_disabled',
  'noop_not_ambassador',
  'noop_not_member',
  'noop_team_brought',
  'noop_team_taken',
  'noop_excluded',
  'noop_locked',
];

const PAYOUT_ALIAS_OUTCOMES: readonly PayoutAliasOutcome[] = ['applied', 'noop_not_ambassador', 'noop_invalid'];

/** Base del link de invitación. Misma que `lib/referral-link.ts`. */
const INVITE_BASE_URL = 'https://tornear.vercel.app/i';

/** Quita el `@` inicial y los espacios, y pasa a minúsculas (lo mismo que hace la RPC). */
export function normalizeInstagramHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').trim().toLowerCase();
}

/** Devuelve `value` si es uno de los estados conocidos de la RPC, o `null`. */
function asOutcome<T extends string>(value: unknown, known: readonly T[]): T | null {
  return typeof value === 'string' && (known as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Lee el resumen del embajador logueado. Devuelve `null` ante un error de red
 * o una forma inesperada del JSON (se avisa con `Logger.warn`): la pantalla
 * decide cómo mostrarlo, esto nunca tira.
 */
export async function fetchAmbassadorOverview(): Promise<AmbassadorOverview | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_ambassador_overview');
    if (error) {
      Logger.warn('No se pudo leer el resumen del embajador', {
        scope: 'ambassador-data.fetchAmbassadorOverview',
        event: 'ambassador.overview',
        status: 'rpc_error',
        error,
      });
      return null;
    }

    const parsed = ambassadorOverviewSchema.safeParse(data);
    if (!parsed.success) {
      Logger.warn('El resumen del embajador llegó con una forma inesperada', {
        scope: 'ambassador-data.fetchAmbassadorOverview',
        event: 'ambassador.overview',
        status: 'invalid_shape',
        issues: parsed.error.issues.slice(0, 5),
      });
      return null;
    }
    return parsed.data;
  } catch (error) {
    Logger.warn('Falló la lectura del resumen del embajador', {
      scope: 'ambassador-data.fetchAmbassadorOverview',
      event: 'ambassador.overview',
      status: 'rpc_error',
      error,
    });
    return null;
  }
}

/**
 * `app_settings.ambassador_program_enabled === 1`. Cualquier error o fila
 * ausente cuenta como apagado: ante la duda, no se muestra el programa.
 */
export async function fetchAmbassadorProgramEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'ambassador_program_enabled')
      .maybeSingle();
    if (error) {
      Logger.warn('No se pudo leer si el programa de embajadores está activo', {
        scope: 'ambassador-data.fetchAmbassadorProgramEnabled',
        event: 'ambassador.enabled',
        status: 'rpc_error',
        error,
      });
      return false;
    }
    return Number(data?.value) === 1;
  } catch (error) {
    Logger.warn('Falló la lectura del interruptor del programa de embajadores', {
      scope: 'ambassador-data.fetchAmbassadorProgramEnabled',
      event: 'ambassador.enabled',
      status: 'rpc_error',
      error,
    });
    return false;
  }
}

/** Inscribe o edita al embajador. Nunca tira. */
export async function upsertAmbassador(input: {
  instagram: string;
  showInRanking: boolean;
  acceptTerms: boolean;
  confirmAdult: boolean;
}): Promise<UpsertAmbassadorOutcome> {
  try {
    const { data, error } = await supabase.rpc('upsert_ambassador', {
      p_instagram: normalizeInstagramHandle(input.instagram),
      p_show_in_ranking: input.showInRanking,
      p_accept_terms: input.acceptTerms,
      p_confirm_adult: input.confirmAdult,
    });
    const status = error ? null : asOutcome(data, UPSERT_OUTCOMES);
    if (!status) {
      Logger.warn('No se pudo inscribir al embajador', {
        scope: 'ambassador-data.upsertAmbassador',
        event: 'ambassador.upsert',
        status: 'rpc_error',
        error,
        response: error ? undefined : data,
      });
      return 'rpc_error';
    }
    Logger.info('Inscripción de embajador procesada', {
      scope: 'ambassador-data.upsertAmbassador',
      event: 'ambassador.upsert',
      status,
    });
    return status;
  } catch (error) {
    Logger.warn('Falló la inscripción del embajador', {
      scope: 'ambassador-data.upsertAmbassador',
      event: 'ambassador.upsert',
      status: 'rpc_error',
      error,
    });
    return 'rpc_error';
  }
}

/** Elige (o con `null`, saca) el equipo propio del embajador. Nunca tira. */
export async function setAmbassadorOwnTeam(teamId: string | null): Promise<OwnTeamOutcome> {
  try {
    // `null` saca el equipo propio. El tipo generado de `p_team_id` es `string`
    // (no modela los NULL de los argumentos), pero la RPC lo acepta en runtime.
    const { data, error } = await supabase.rpc('set_ambassador_own_team', { p_team_id: teamId as string });
    const status = error ? null : asOutcome(data, OWN_TEAM_OUTCOMES);
    if (!status) {
      Logger.warn('No se pudo guardar el equipo propio del embajador', {
        scope: 'ambassador-data.setAmbassadorOwnTeam',
        event: 'ambassador.own_team',
        status: 'rpc_error',
        teamId,
        error,
        response: error ? undefined : data,
      });
      return 'rpc_error';
    }
    Logger.info('Equipo propio del embajador procesado', {
      scope: 'ambassador-data.setAmbassadorOwnTeam',
      event: 'ambassador.own_team',
      status,
      teamId,
    });
    return status;
  } catch (error) {
    Logger.warn('Falló el guardado del equipo propio del embajador', {
      scope: 'ambassador-data.setAmbassadorOwnTeam',
      event: 'ambassador.own_team',
      status: 'rpc_error',
      teamId,
      error,
    });
    return 'rpc_error';
  }
}

/** Guarda el alias o CBU de cobro. Nunca tira ni registra el alias. */
export async function setAmbassadorPayoutAlias(alias: string): Promise<PayoutAliasOutcome> {
  try {
    const { data, error } = await supabase.rpc('set_ambassador_payout_alias', { p_alias: alias.trim() });
    const status = error ? null : asOutcome(data, PAYOUT_ALIAS_OUTCOMES);
    if (!status) {
      Logger.warn('No se pudo guardar el alias de cobro', {
        scope: 'ambassador-data.setAmbassadorPayoutAlias',
        event: 'ambassador.payout_alias',
        status: 'rpc_error',
        error,
        response: error ? undefined : data,
      });
      return 'rpc_error';
    }
    Logger.info('Alias de cobro procesado', {
      scope: 'ambassador-data.setAmbassadorPayoutAlias',
      event: 'ambassador.payout_alias',
      status,
    });
    return status;
  } catch (error) {
    Logger.warn('Falló el guardado del alias de cobro', {
      scope: 'ambassador-data.setAmbassadorPayoutAlias',
      event: 'ambassador.payout_alias',
      status: 'rpc_error',
      error,
    });
    return 'rpc_error';
  }
}

/** Mensaje para compartir: link con `?emb=1` e instrucción para el capitán del equipo nuevo. */
export function buildAmbassadorInviteMessage(username: string): string {
  return [
    '¿Querés ganar plata jugando al fútbol? Sumate a TorneAR.',
    `Creá tu equipo y en "¿Quién los invitó?" poné mi usuario ${username}`,
    `${INVITE_BASE_URL}/${username}?emb=1`,
  ].join('\n');
}
