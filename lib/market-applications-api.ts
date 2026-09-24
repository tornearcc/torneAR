import { supabase } from './supabase';
import { Logger } from '@/lib/logger';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { isTeamPostScheduleActive } from '@/lib/market-utils';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import type { Database } from '@/types/supabase';

type NotificationType = Database['public']['Enums']['notification_type'];
export type ApplicationStatus = 'PENDIENTE' | 'VISTA' | 'ACEPTADA' | 'RECHAZADA';
export type MarketPostType = 'TEAM' | 'PLAYER';

/**
 * Estados en los que una postulación sigue estando "viva": el dueño todavía no
 * la respondió. `VISTA` cuenta — sólo significa que abrió la lista (M6).
 */
const OPEN_APPLICATION_STATUSES: ApplicationStatus[] = ['PENDIENTE', 'VISTA'];

const APPLICATIONS_TABLE: Record<MarketPostType, 'market_team_post_applications' | 'market_player_post_applications'> = {
  TEAM: 'market_team_post_applications',
  PLAYER: 'market_player_post_applications',
};

const POSTS_TABLE: Record<MarketPostType, 'market_team_posts' | 'market_player_posts'> = {
  TEAM: 'market_team_posts',
  PLAYER: 'market_player_posts',
};

export type MarketApplicationErrorCode = 'POST_INEXISTENTE' | 'POST_CERRADO' | 'POST_VENCIDO';

/**
 * Error de dominio del Mercado (M8). Existe porque
 * `getGenericSupabaseErrorMessage` descarta el `message` y devuelve su fallback:
 * sin un tipo propio, "este partido ya se jugó" llegaba a la pantalla como
 * "No se pudo completar la operación".
 */
export class MarketApplicationError extends Error {
  readonly code: MarketApplicationErrorCode;

  constructor(code: MarketApplicationErrorCode, message: string) {
    super(message);
    this.name = 'MarketApplicationError';
    this.code = code;
  }
}

/**
 * Mensaje para el usuario: respeta el texto de los errores de dominio y delega
 * el resto en el traductor genérico de Supabase. Mismo patrón que
 * `getTeamActionErrorMessage`.
 */
export function getMarketApplicationErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof MarketApplicationError) return error.message;
  return getGenericSupabaseErrorMessage(error, fallback);
}

export interface MarketApplicationEntry {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  // Perfil real a notificar/responder — SIEMPRE un profile.id (el jugador en
  // posts de equipo, o el capitán que aplicó en posts de jugador).
  notifyProfileId: string;
  // Id para navegar/mostrar — un profile.id (jugador) o un team.id (equipo)
  // según el tipo de post. No confundir con notifyProfileId.
  displayId: string;
  displayName: string;
  displayAvatarOrShieldUrl: string | null;
  displaySubtitle: string | null; // posición (jugador) o zona (equipo)
}

/**
 * Resuelve el profiles.id del usuario autenticado.
 * IMPORTANTE: profiles.id ≠ auth.users.id — siempre usar este helper.
 */
async function getProfileId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();
  if (error || !data) throw new Error('Perfil no encontrado');
  return data.id;
}

// Notifica a CAPITAN/SUBCAPITAN de un equipo. Silencioso para el usuario, pero
// observable en telemetría (R8): sin el aviso, una postulación existe en la
// base y no existe para el capitán que tiene que responderla.
async function notifyTeamLeaders(
  teamId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  try {
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('profile_id')
      .eq('team_id', teamId)
      .in('role', ['CAPITAN', 'SUBCAPITAN']);

    if (membersError) {
      Logger.error('Error enviando notificación: no se pudo leer el plantel', {
        scope: 'market-applications.notifyTeamLeaders',
        teamId,
        type,
        error: membersError,
      });
      return;
    }

    if (!members || members.length === 0) {
      Logger.warn('Notificación sin destinatarios: el equipo no tiene capitán ni subcapitán', {
        scope: 'market-applications.notifyTeamLeaders',
        teamId,
        type,
      });
      return;
    }

    const { error: insertError } = await supabase.from('notifications').insert(
      members.map((m) => ({ profile_id: m.profile_id, type, title, body, data })),
    );

    if (insertError) {
      Logger.error('Error enviando notificación', {
        scope: 'market-applications.notifyTeamLeaders',
        teamId,
        type,
        recipients: members.length,
        error: insertError,
      });
    }
  } catch (error) {
    Logger.error('Error enviando notificación', {
      scope: 'market-applications.notifyTeamLeaders',
      teamId,
      type,
      error,
    });
  }
}

// Notifica a un único perfil. Mismo criterio que notifyTeamLeaders (R8).
async function notifyProfile(
  profileId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({ profile_id: profileId, type, title, body, data });

    if (error) {
      Logger.error('Error enviando notificación', {
        scope: 'market-applications.notifyProfile',
        profileId,
        type,
        error,
      });
    }
  } catch (error) {
    Logger.error('Error enviando notificación', {
      scope: 'market-applications.notifyProfile',
      profileId,
      type,
      error,
    });
  }
}

/**
 * Resultado de postularse. Antes las dos funciones devolvían `void` y trataban
 * el 23505 con un `return` mudo, así que la pantalla no podía distinguir
 * "postulación registrada" de "ya te habías postulado" — y, como además se las
 * llamaba con `void`, tampoco de "falló y no hay ningún registro" (M3).
 */
export type ApplyResult = 'CREADA' | 'DUPLICADA';

/**
 * M8 — Vigencia de un post de EQUIPO antes de postularse.
 *
 * El cron `deactivate_expired_market_posts` corre una vez por hora: entre esa
 * corrida y el tap del usuario hay hasta 60 minutos en los que un partido ya
 * jugado sigue aceptando postulaciones. La base no lo impide (no hay CHECK que
 * mire `match_date`), así que la barrera es esta.
 *
 * El criterio de vencimiento es el mismo `isTeamPostScheduleActive` que usa el
 * listado, a propósito: lo que no se muestra no se puede postular.
 */
async function assertTeamPostIsOpen(postId: string): Promise<void> {
  const { data, error } = await supabase
    .from('market_team_posts')
    .select('is_active, match_date, match_time')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    throw new MarketApplicationError('POST_INEXISTENTE', 'Esta publicación ya no existe.');
  }
  if (!data.is_active) {
    // M5 cerró el ciclo: aceptar una postulación desactiva el aviso. Un usuario
    // con la lista vieja en pantalla puede seguir tocando "Postularme".
    throw new MarketApplicationError(
      'POST_CERRADO',
      'Esta publicación ya fue cerrada por el equipo. Actualizá el Mercado para ver las que siguen abiertas.',
    );
  }
  if (!isTeamPostScheduleActive(data)) {
    throw new MarketApplicationError(
      'POST_VENCIDO',
      'La fecha de este partido ya pasó. Buscá una publicación vigente en el Mercado.',
    );
  }
}

/**
 * M8 — Vigencia de un post de JUGADOR antes de postularse.
 *
 * `market_player_posts` no tiene `match_date` (no agenda un partido: es "busco
 * equipo"), así que acá la vigencia es sólo `is_active` — que es lo que apaga
 * tanto el barrido de 14 días como el cierre por aceptación de M5.
 */
async function assertPlayerPostIsOpen(postId: string): Promise<void> {
  const { data, error } = await supabase
    .from('market_player_posts')
    .select('is_active')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    throw new MarketApplicationError('POST_INEXISTENTE', 'Esta publicación ya no existe.');
  }
  if (!data.is_active) {
    throw new MarketApplicationError(
      'POST_CERRADO',
      'Esta publicación ya fue cerrada por el jugador. Actualizá el Mercado para ver las que siguen abiertas.',
    );
  }
}

/**
 * Un jugador se postula a un post de equipo (busca jugador).
 * Idempotente: postularse dos veces al mismo post no falla ni duplica.
 */
export async function applyToTeamPost(postId: string, teamId: string): Promise<ApplyResult> {
  await assertTeamPostIsOpen(postId);
  const profileId = await getProfileId();

  const { error } = await supabase.from('market_team_post_applications').insert({
    post_id: postId,
    profile_id: profileId,
  });

  if (error && error.code !== '23505') throw error;
  // 23505 = unique_violation (post_id, profile_id): ya estaba postulado. No es
  // un fallo, pero el usuario tiene que enterarse: si no, vuelve a tocar
  // "Postularme" creyendo que la primera vez no había andado.
  if (error?.code === '23505') return 'DUPLICADA';

  void notifyTeamLeaders(
    teamId,
    'POSTULACION_RECIBIDA',
    '📥 Nueva postulación',
    'Un jugador se postuló a tu publicación en el Mercado.',
    { postId },
  );

  return 'CREADA';
}

/**
 * Un equipo (capitán/subcapitán) se postula a un post de jugador (busca equipo/partido).
 * Idempotente: postularse dos veces al mismo post no falla ni duplica.
 */
export async function applyToPlayerPost(
  postId: string,
  teamId: string,
  postOwnerProfileId: string,
): Promise<ApplyResult> {
  await assertPlayerPostIsOpen(postId);
  const applicantProfileId = await getProfileId();

  const { error } = await supabase.from('market_player_post_applications').insert({
    post_id: postId,
    team_id: teamId,
    applicant_profile_id: applicantProfileId,
  });

  if (error && error.code !== '23505') throw error;
  if (error?.code === '23505') return 'DUPLICADA';

  void notifyProfile(
    postOwnerProfileId,
    'POSTULACION_RECIBIDA',
    '📥 Nueva postulación',
    'Un equipo se postuló a tu publicación en el Mercado.',
    { postId },
  );

  return 'CREADA';
}

/**
 * Postulaciones recibidas en un post propio, con datos básicos del postulante.
 */
export async function fetchApplicationsForPost(
  postId: string,
  postType: MarketPostType,
): Promise<MarketApplicationEntry[]> {
  if (postType === 'TEAM') {
    const { data, error } = await supabase
      .from('market_team_post_applications')
      .select('id, status, created_at, profile_id, profiles(full_name, avatar_url, preferred_position)')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      status: row.status as ApplicationStatus,
      createdAt: row.created_at,
      notifyProfileId: row.profile_id,
      displayId: row.profile_id,
      displayName: row.profiles?.full_name ?? 'Jugador',
      displayAvatarOrShieldUrl: row.profiles?.avatar_url ?? null,
      displaySubtitle: row.profiles?.preferred_position ?? null,
    }));
  }

  const { data, error } = await supabase
    .from('market_player_post_applications')
    .select('id, status, created_at, team_id, applicant_profile_id, teams(name, zone, shield_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status as ApplicationStatus,
    createdAt: row.created_at,
    notifyProfileId: row.applicant_profile_id,
    displayId: row.team_id,
    displayName: row.teams?.name ?? 'Equipo',
    displayAvatarOrShieldUrl: row.teams?.shield_url ?? null,
    displaySubtitle: row.teams?.zone ?? null,
  }));
}

/**
 * M4 — Una postulación **enviada por mí**, vista desde el lado del postulante.
 *
 * Es la contracara de `MarketApplicationEntry`: aquélla describe a quien se
 * postuló (para que el dueño del aviso lo evalúe); ésta describe **a quién me
 * postulé** y en qué quedó. Por eso los campos `target*` en vez de `display*`.
 */
export interface MyMarketApplicationEntry {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  postType: MarketPostType;
  postId: string;
  /** El aviso sigue abierto. `false` = cerrado (aceptó a alguien o venció). */
  postIsActive: boolean;
  /** El equipo (TEAM) o el jugador (PLAYER) dueño del aviso. */
  targetName: string;
  /**
   * team.id (TEAM) o profile.id (PLAYER) del dueño del aviso. Lo usa el visor
   * de fotos para el chequeo de bloqueo y para "Denunciar". `null` si el aviso
   * se borró.
   */
  targetId: string | null;
  targetImageUrl: string | null;
  targetSubtitle: string | null;
  /**
   * Sólo en `PLAYER`: el equipo con el que me postulé. En posts de equipo el
   * postulante soy yo mismo, así que no hay nada que aclarar.
   */
  appliedWithTeamName: string | null;
}

type MyTeamApplicationRow = {
  id: string;
  status: string;
  created_at: string;
  post_id: string;
  market_team_posts: {
    is_active: boolean;
    position_wanted: string | null;
    teams: { id: string; name: string; zone: string | null; shield_url: string | null } | null;
  } | null;
};

type MyPlayerApplicationRow = {
  id: string;
  status: string;
  created_at: string;
  post_id: string;
  teams: { name: string } | null;
  market_player_posts: {
    is_active: boolean;
    position: string | null;
    profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
  } | null;
};

/** `''` (lo que devuelve el helper de storage con path vacío) no es una URL. */
function resolveStorageUrl(bucket: 'avatars' | 'shields', path: string | null): string | null {
  if (!path) return null;
  return getSupabaseStorageUrl(bucket, path) || null;
}

/**
 * M4 — Las postulaciones que YO envié, de los dos tipos, en una sola lista.
 *
 * Hasta acá el estado de una postulación existía y se escribía bien —
 * `VISTA` cuando el dueño abre la lista (M6), `RECHAZADA` en lote cuando acepta
 * a otro (M5)— pero **no tenía dónde mirarse**: `fetchApplicationsForPost` sólo
 * sirve al dueño del aviso. El único rastro que le quedaba al postulante era la
 * notificación, que se pierde apenas la marca como leída.
 *
 * Las dos consultas van en paralelo y se ordenan juntas por fecha: para el
 * usuario "mis postulaciones" es una sola cosa, aunque abajo sean dos tablas.
 *
 * Autorización: no hace falta ninguna policy nueva. Las dos ramas `SELECT` de
 * `20260708184030` ya contemplan al postulante (`profile_id = yo` en posts de
 * equipo; miembro del equipo postulante en posts de jugador). El filtro
 * explícito por perfil es de intención, no de seguridad.
 */
export async function fetchMyMarketApplications(): Promise<MyMarketApplicationEntry[]> {
  const profileId = await getProfileId();

  const [teamRes, playerRes] = await Promise.all([
    supabase
      .from('market_team_post_applications')
      .select(
        'id, status, created_at, post_id, market_team_posts(is_active, position_wanted, teams(id, name, zone, shield_url))',
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false }),
    supabase
      .from('market_player_post_applications')
      .select(
        'id, status, created_at, post_id, teams(name), market_player_posts(is_active, position, profiles(id, full_name, avatar_url))',
      )
      .eq('applicant_profile_id', profileId)
      .order('created_at', { ascending: false }),
  ]);

  if (teamRes.error) throw teamRes.error;
  if (playerRes.error) throw playerRes.error;

  const fromTeamPosts: MyMarketApplicationEntry[] = (
    (teamRes.data ?? []) as unknown as MyTeamApplicationRow[]
  ).map((row) => ({
    id: row.id,
    status: row.status as ApplicationStatus,
    createdAt: row.created_at,
    postType: 'TEAM',
    postId: row.post_id,
    postIsActive: row.market_team_posts?.is_active ?? false,
    targetName: row.market_team_posts?.teams?.name ?? 'Equipo',
    targetId: row.market_team_posts?.teams?.id ?? null,
    targetImageUrl: resolveStorageUrl('shields', row.market_team_posts?.teams?.shield_url ?? null),
    targetSubtitle: row.market_team_posts?.position_wanted
      ? `Busca ${row.market_team_posts.position_wanted.toLowerCase()}`
      : (row.market_team_posts?.teams?.zone ?? null),
    appliedWithTeamName: null,
  }));

  const fromPlayerPosts: MyMarketApplicationEntry[] = (
    (playerRes.data ?? []) as unknown as MyPlayerApplicationRow[]
  ).map((row) => ({
    id: row.id,
    status: row.status as ApplicationStatus,
    createdAt: row.created_at,
    postType: 'PLAYER',
    postId: row.post_id,
    postIsActive: row.market_player_posts?.is_active ?? false,
    targetName: row.market_player_posts?.profiles?.full_name ?? 'Jugador',
    targetId: row.market_player_posts?.profiles?.id ?? null,
    targetImageUrl: resolveStorageUrl(
      'avatars',
      row.market_player_posts?.profiles?.avatar_url ?? null,
    ),
    targetSubtitle: row.market_player_posts?.position ?? null,
    appliedWithTeamName: row.teams?.name ?? null,
  }));

  return [...fromTeamPosts, ...fromPlayerPosts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Cantidad de postulaciones por post propio — para el badge "Ver postulaciones (N)".
 */
export async function fetchApplicationCounts(
  postIds: string[],
  postType: MarketPostType,
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const { data, error } = await supabase
    .from(APPLICATIONS_TABLE[postType])
    .select('post_id')
    .in('post_id', postIds);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { post_id: string }[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * M6 — Marca como `VISTA` las postulaciones `PENDIENTE` de un post propio.
 *
 * `VISTA` estaba en el CHECK de la tabla y tenía etiqueta y color en la UI,
 * pero nadie lo escribía nunca: un estado del modelo inalcanzable. Lo que le
 * faltaba era el único evento que lo produce — que el dueño abra la lista.
 *
 * Devuelve los ids efectivamente actualizados para que la pantalla repinte sin
 * un segundo fetch. Es una actualización silenciosa: el usuario no pidió nada,
 * así que un fallo acá se registra en telemetría pero no se le muestra.
 */
export async function markApplicationsAsSeen(
  postId: string,
  postType: MarketPostType,
): Promise<string[]> {
  const { data, error } = await supabase
    .from(APPLICATIONS_TABLE[postType])
    .update({ status: 'VISTA' })
    .eq('post_id', postId)
    .eq('status', 'PENDIENTE')
    .select('id');
  if (error) throw error;

  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

/**
 * Materializa una postulación de equipo ya ACEPTADA como una solicitud de unión
 * ACEPTADA, que es lo que `transfer_to_team` exige para dar el alta al plantel.
 *
 * Por qué esto y no un INSERT directo en `team_members`: el alta tiene que
 * pasar sí o sí por `transfer_to_team`, que cierra el ciclo del club anterior
 * con motivo TRANSFERENCIA en vez de ABANDONO (ver la migración
 * 20260723123000). Meter al jugador a mano rompería el ledger `team_stints` y,
 * además, el DELETE sobre `team_members` está revocado para `authenticated`.
 *
 * Idempotente: `UNIQUE (team_id, profile_id)` obliga al upsert. Si el jugador
 * ya tenía una solicitud para ese equipo (RECHAZADA de un intento anterior, o
 * PENDIENTE porque también la mandó por su cuenta), se reusa la fila y queda
 * en ACEPTADA — no se duplica ni falla.
 *
 * Autorización: policy `team_join_requests_insert_by_market_post_admin`
 * (migración 20260728161000). Exige que la postulación exista, sea del mismo
 * perfil al mismo equipo, y que YA esté en ACEPTADA — de ahí el orden en
 * `respondToApplication`: primero se marca la postulación, después esto.
 */
async function linkAcceptedApplicationToTeam(
  postId: string,
  applicantProfileId: string,
): Promise<string> {
  const { data: post, error: postError } = await supabase
    .from('market_team_posts')
    .select('team_id')
    .eq('id', postId)
    .single();
  if (postError) throw postError;
  if (!post) throw new Error('No encontramos la publicación de esta postulación.');

  const { error } = await supabase.from('team_join_requests').upsert(
    {
      team_id: post.team_id,
      profile_id: applicantProfileId,
      status: 'ACEPTADA',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'team_id,profile_id' },
  );
  if (error) throw error;

  return post.team_id;
}

/**
 * M5 — Cierra el aviso después de una aceptación.
 *
 * Dos efectos, los dos necesarios: (1) el post se desactiva, así deja de
 * aparecer en el Mercado y de recibir postulaciones nuevas; (2) las que quedaron
 * abiertas (`PENDIENTE`/`VISTA`) pasan a `RECHAZADA` en vez de envejecer sin
 * destino. Antes, aceptar a alguien no cambiaba nada para el resto: el post
 * seguía vivo y las demás postulaciones quedaban colgadas para siempre.
 *
 * Es *best-effort a propósito*: la aceptación ya ocurrió y —en posts de
 * equipo— ya dejó la solicitud de unión creada. Hacer fallar la promesa acá le
 * mostraría un error al capitán por algo que sí funcionó. Si la limpieza falla,
 * queda en telemetría y el post simplemente sigue abierto, que es exactamente
 * el estado anterior a esta corrección.
 */
async function closePostAfterAcceptance(
  postId: string,
  postType: MarketPostType,
  acceptedApplicationId: string,
): Promise<void> {
  const { error: postError } = await supabase
    .from(POSTS_TABLE[postType])
    .update({ is_active: false })
    .eq('id', postId);

  if (postError) {
    Logger.error('No se pudo desactivar la publicación tras aceptar una postulación', {
      scope: 'market-applications.closePostAfterAcceptance',
      postId,
      postType,
      error: postError,
    });
  }

  // `.in(status, [PENDIENTE, VISTA])` y no sólo PENDIENTE: con M6 andando, todo
  // lo que el dueño ya miró está en VISTA. Filtrar sólo por PENDIENTE dejaría
  // fuera justo a las que estaba comparando cuando eligió.
  const { error: siblingsError } = await supabase
    .from(APPLICATIONS_TABLE[postType])
    .update({ status: 'RECHAZADA' })
    .eq('post_id', postId)
    .in('status', OPEN_APPLICATION_STATUSES)
    .neq('id', acceptedApplicationId);

  if (siblingsError) {
    Logger.error('No se pudieron rechazar las postulaciones restantes', {
      scope: 'market-applications.closePostAfterAcceptance',
      postId,
      postType,
      acceptedApplicationId,
      error: siblingsError,
    });
  }
}

/**
 * El dueño de la publicación acepta o rechaza una postulación.
 *
 * Aceptar una postulación de EQUIPO ya no es sólo una etiqueta: enlaza con el
 * flujo de traspasos dejando una solicitud de unión ACEPTADA a nombre del
 * jugador. A partir de ahí el jugador la ve en "Mis solicitudes" (perfil →
 * `/team-requests`) y confirma su traspaso él mismo. Esa confirmación explícita
 * es a propósito: dejar su club actual es una decisión suya, no un efecto
 * colateral de que otro equipo lo acepte.
 *
 * Los posts de JUGADOR (un equipo se postula al aviso de un jugador) siguen
 * siendo sólo un cambio de estado + chat: ahí el "aceptado" es el equipo, y el
 * alta la sigue iniciando el jugador dueño del aviso cuando quiera.
 */
export async function respondToApplication(
  applicationId: string,
  postType: MarketPostType,
  status: 'ACEPTADA' | 'RECHAZADA',
  applicantProfileId: string,
  postId: string,
): Promise<void> {
  const table = APPLICATIONS_TABLE[postType];
  const { error } = await supabase.from(table).update({ status }).eq('id', applicationId);
  if (error) throw error;

  let teamId: string | null = null;

  if (postType === 'TEAM' && status === 'ACEPTADA') {
    try {
      teamId = await linkAcceptedApplicationToTeam(postId, applicantProfileId);
    } catch (linkError) {
      // Sin la solicitud de unión, "ACEPTADA" vuelve a ser una etiqueta vacía:
      // el jugador no tendría forma de sumarse. Revertimos la postulación a
      // PENDIENTE para que los botones vuelvan a aparecer y el capitán pueda
      // reintentar, en vez de dejar un estado terminal que no produce efecto.
      Logger.error('No se pudo enlazar la postulación aceptada con el equipo; se revierte a PENDIENTE', {
        scope: 'market-applications.respondToApplication',
        applicationId,
        postId,
        postType,
        applicantProfileId,
        error: linkError,
      });
      await supabase.from(table).update({ status: 'PENDIENTE' }).eq('id', applicationId);
      throw linkError;
    }
  }

  // M5: recién acá, con la aceptación firme (y la solicitud de unión creada si
  // era un post de equipo). Cerrar el aviso antes de saber si el enlace anduvo
  // habría dejado el post desactivado y la postulación revertida a PENDIENTE:
  // nadie podría volver a postularse ni el capitán reintentar sobre un aviso
  // vivo.
  if (status === 'ACEPTADA') {
    await closePostAfterAcceptance(postId, postType, applicationId);
  }

  void notifyProfile(
    applicantProfileId,
    'POSTULACION_RESPONDIDA',
    status === 'ACEPTADA' ? '✅ Postulación aceptada' : '❌ Postulación rechazada',
    status === 'ACEPTADA'
      ? teamId
        ? 'Te aceptaron en el Mercado. Entrá a "Mis solicitudes" y confirmá tu traspaso para sumarte al plantel.'
        : 'Tu postulación en el Mercado fue aceptada.'
      : 'Tu postulación en el Mercado fue rechazada.',
    teamId ? { applicationId, team_id: teamId } : { applicationId },
  );

  Logger.info('Postulación respondida', {
    scope: 'market-applications.respondToApplication',
    applicationId,
    postId,
    postType,
    status,
    applicantProfileId,
    teamId,
  });
}
