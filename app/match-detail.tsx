import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useTeamStore } from '@/stores/teamStore';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { fetchMatchDetailViewData, fetchDisputeState, resolveMyTeamIdForMatch } from '@/lib/match-detail-data';
import type { DisputeState } from '@/lib/match-detail-data';
// El check-in simple comparte los códigos de error de la RPC de convocatoria
// (GEOFENCE_FAILED, LOCATION_REQUIRED): con el mapper el usuario lee el motivo
// real en vez del mensaje genérico de Supabase.
import { getCheckinErrorMessage, fetchFormatRules } from '@/lib/checkin-data';
import { getCheckinLocation } from '@/lib/checkin-location';
import * as Clipboard from 'expo-clipboard';
import {
  submitProposal,
  acceptProposal,
  rejectProposal,
  cancelProposal,
  submitMatchResult,
  doCheckin,
  requestCancellation,
  respondToCancellationRequest,
  claimWo,
  submitDisputeVote,
  ResultAlreadySubmittedError,
  getProposalErrorMessage,
} from '@/lib/match-actions';
import { canLoadResultFromDetail, isTeamMatchStaff } from '@/lib/match-permissions';
import {
  formatGuestCodeExpiry,
  getGuestCodeExpiry,
  isGuestCodeExpired,
} from '@/lib/guest-code';
import { Logger } from '@/lib/logger';
import { useMatchRealtime } from '@/hooks/useMatchRealtime';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { MatchDetailSkeleton } from '@/components/matches/MatchDetailSkeleton';
import { MatchDetailHero } from '@/components/matches/MatchDetailHero';
import { ProposalSection } from '@/components/matches/ProposalSection';
import { MatchDetailsSection } from '@/components/matches/MatchDetailsSection';
import { CheckinSection } from '@/components/matches/CheckinSection';
import { ResultSection } from '@/components/matches/ResultSection';
import { ProposalModal } from '@/components/matches/ProposalModal';
import { ResultModal } from '@/components/matches/ResultModal';
import { CancellationModal } from '@/components/matches/CancellationModal';
import { CancellationRequestSection } from '@/components/matches/CancellationRequestSection';
import { WoModal } from '@/components/matches/WoModal';
import { DisputeSection } from '@/components/matches/DisputeSection';
import { ShareMatchButton } from '@/components/match-share/ShareMatchButton';
import { ReportModal } from '@/components/reports/ReportModal';
import type { MatchDetailViewData, MatchProposalFormData } from '@/components/matches/types';

export default function MatchDetailScreen() {
  const { matchId, myTeamId: paramTeamId, openProposalModal, openResultModal } = useLocalSearchParams<{
    matchId: string;
    myTeamId?: string;
    openProposalModal?: string;
    openResultModal?: string;
  }>();
  const { activeTeamId } = useTeamStore();
  const { profile } = useAuth();

  const { showAlert, AlertComponent } = useCustomAlert();

  // R9: el equipo ya no se infiere del store. `activeTeamId` es "el último que
  // elegiste en la app", no "el tuyo en este partido" — y las notificaciones de
  // D11 entran acá sin `myTeamId` en los params. Se resuelve contra el partido
  // (ver resolveMyTeamIdForMatch); hasta entonces la pantalla no consulta nada.
  const [myTeamId, setMyTeamId] = useState<string>('');
  const [teamResolved, setTeamResolved] = useState(false);

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchDetailViewData | null>(null);
  const [disputeState, setDisputeState] = useState<DisputeState | null>(null);

  // Modal visibility state
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [showWoModal, setShowWoModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Se extrae el id antes de los callbacks: con `profile?.id` directo en el
  // array de deps, el React Compiler infiere `profile` entero como dependencia
  // —menos específica que la declarada— y desactiva la memoización de la
  // pantalla. Con la variable, lo inferido y lo declarado coinciden.
  const profileId = profile?.id ?? null;

  useEffect(() => {
    if (!matchId || !profileId) return;
    let cancelled = false;

    void (async () => {
      try {
        const resolved = await resolveMyTeamIdForMatch(matchId, profileId, paramTeamId, activeTeamId);
        if (!cancelled) setMyTeamId(resolved ?? '');
      } catch (err) {
        // Sin equipo resuelto la pantalla muestra "Partido no encontrado". Es
        // preferible a contestar por un equipo que no juega este partido, que
        // es exactamente lo que hacía el fallback al equipo activo.
        Logger.error('No se pudo resolver el equipo del usuario en el partido', {
          scope: 'match-detail.resolveTeam',
          matchId,
          profileId,
          error: err,
        });
        if (!cancelled) setMyTeamId('');
      } finally {
        if (!cancelled) setTeamResolved(true);
      }
    })();

    return () => { cancelled = true; };
  }, [matchId, profileId, paramTeamId, activeTeamId]);

  // Instante contra el que se mide la ventana de 24 h para cancelar. Se sella
  // con cada carga —la pantalla recarga al tomar foco— en lugar de leer el
  // reloj durante el render, que es impuro y devolvería un valor distinto en
  // cada render sin que nada haya cambiado.
  const [loadedAtTs, setLoadedAtTs] = useState(() => Date.now());

  const loadData = useCallback(async () => {
    // Mientras no sepamos con qué equipo mira el usuario, no se consulta: pedir
    // el detalle con un teamId equivocado devuelve un partido equivocado.
    if (!matchId || !teamResolved) return;
    if (!myTeamId) {
      setMatch(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await fetchMatchDetailViewData(matchId, myTeamId);
      setMatch(data);
      setLoadedAtTs(Date.now());
      if (data.status === 'EN_DISPUTA' && profileId) {
        const dispute = await fetchDisputeState(matchId, profileId, data.teamA.id, data.teamB.id);
        setDisputeState(dispute);
      } else {
        setDisputeState(null);
      }
    } catch (err) {
      Logger.error('No se pudo cargar el detalle del partido', {
        scope: 'match-detail.loadData',
        matchId,
        myTeamId,
        error: err,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [matchId, myTeamId, teamResolved, profileId, showAlert]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  // D9: el mínimo para dar por presentado al equipo sale de `format_rules`, la
  // misma tabla que usan submit_team_checkin y confirm_match_proposal. No se
  // hardcodea un mapa por formato acá: sería una cuarta fuente de verdad del
  // mismo número, y el catálogo es configurable sin desplegar.
  // Se guarda el formato junto al número: así `minPlayersToStart` se deriva en
  // el render (null mientras no haya formato o mientras la regla del formato
  // actual todavía no llegó) en vez de limpiarse a mano desde el efecto.
  const [formatRules, setFormatRules] = useState<{ format: string; minPlayersToStart: number } | null>(
    null,
  );
  const format = match?.format ?? null;
  const minPlayersToStart = formatRules?.format === format ? formatRules.minPlayersToStart : null;

  useEffect(() => {
    if (!format) return;
    let cancelled = false;
    void fetchFormatRules(format)
      .then((rules) => {
        if (!cancelled) setFormatRules({ format, minPlayersToStart: rules.minPlayersToStart });
      })
      .catch((err: unknown) => {
        // No crítico: sin el número la sección muestra "N llegaron" en vez de
        // "N/M". El check-in sigue funcionando — el quórum lo aplica el servidor.
        Logger.warn('No se pudieron cargar las reglas del formato', {
          scope: 'match-detail.formatRules',
          matchId,
          format,
          error: err,
        });
      });
    return () => { cancelled = true; };
  }, [format, matchId]);

  // Realtime: cuando el rival carga su resultado, el partido pasa a FINALIZADO
  // o EN_DISPUTA y esta pantalla se entera sin salir y volver a entrar.
  useMatchRealtime(matchId, useCallback(() => { void loadData(); }, [loadData]));

  // Auto-open modal from navigation params once data loads.
  //
  // Se consume UNA sola vez. El parámetro sobrevive en la ruta, y `loading` y
  // `match` cambian en cada `loadData()`, así que sin este guard el efecto
  // volvía a correr al refrescar después de enviar: el sheet se cerraba y se
  // reabría solo, tapando el alert de «Propuesta enviada» —que vive en esta
  // pantalla y queda DETRÁS del <Modal> nativo—, y había que cerrarlo a mano
  // para verlo (auditoría E2E, módulo 5).
  // Se resuelve durante el render y no en un efecto: el sheet se abre en el
  // mismo commit en que aparecen los datos, sin un frame intermedio con la
  // pantalla ya cargada y el modal todavía cerrado. El flag va en estado —y no
  // en una ref— porque se lee durante el render.
  const [autoOpenConsumed, setAutoOpenConsumed] = useState(false);
  if (!loading && match && !autoOpenConsumed) {
    setAutoOpenConsumed(true);
    if (openProposalModal === 'true') setShowProposalModal(true);
    if (openResultModal === 'true') setShowResultModal(true);
  }

  // ─── Patrón de resincronización ────────────────────────────────────────────
  // `await loadData()` va SIEMPRE antes del alert, nunca en su callback de
  // cierre. Con el refetch diferido, entre la mutación y el tap en "OK" la
  // pantalla mostraba estado viejo con los botones habilitados; y si el usuario
  // descartaba el alert sin tocarlo (o la pantalla perdía foco), el refetch no
  // corría nunca y había que salir y volver a entrar. Ver el mismo criterio ya
  // aplicado en el onSubmit de ResultModal.

  async function handleAcceptProposal() {
    if (!match?.activeProposal) return;
    try {
      await acceptProposal(match.activeProposal.id, match.id);
      Logger.info('Partido confirmado', {
        scope: 'match-detail',
        matchId: match.id,
        proposalId: match.activeProposal.id,
      });
      await loadData();
      showAlert('¡Propuesta aceptada!', 'El partido ha sido confirmado.');
    } catch (err) {
      await loadData();
      // E1: el motivo puede ser "no llegás al cupo del formato". Con el mensaje
      // genérico el capitán no tenía forma de saber qué corregir.
      Logger.error('Fallo la confirmación del partido', {
        scope: 'match-detail',
        matchId: match.id,
        error: err,
      });
      showAlert('No se pudo confirmar', getProposalErrorMessage(err));
    }
  }

  async function handleRejectProposal() {
    if (!match?.activeProposal) return;
    try {
      await rejectProposal(match.activeProposal.id);
      await loadData();
      Logger.info('Propuesta rechazada', {
        scope: 'match-detail.handleRejectProposal',
        matchId: match.id,
        proposalId: match.activeProposal.id,
      });
      showAlert('Propuesta rechazada', 'Se notificará al equipo rival.');
    } catch (err) {
      Logger.error('Fallo el rechazo de la propuesta', {
        scope: 'match-detail.handleRejectProposal',
        matchId: match.id,
        proposalId: match.activeProposal.id,
        error: err,
      });
      await loadData();
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleCancelProposal() {
    if (!match?.activeProposal) return;
    try {
      await cancelProposal(match.activeProposal.id);
      await loadData();
      Logger.info('Propuesta cancelada', {
        scope: 'match-detail.handleCancelProposal',
        matchId: match.id,
        proposalId: match.activeProposal.id,
      });
      showAlert('Propuesta cancelada', 'Tu propuesta fue cancelada.');
    } catch (err) {
      Logger.error('Fallo la cancelación de la propuesta', {
        scope: 'match-detail.handleCancelProposal',
        matchId: match.id,
        proposalId: match.activeProposal.id,
        error: err,
      });
      await loadData();
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  async function handleProposalSubmit(data: MatchProposalFormData) {
    if (!match) return;
    // Sin catch a proposito: el error se propaga hasta ProposalModal, que lo
    // muestra en su alert interno (por encima del sheet) y mantiene el formulario
    // abierto. Atraparlo aca mostraba el mensaje en el alert de esta pantalla,
    // que queda DETRAS del <Modal> nativo y por lo tanto no se ve.
    await submitProposal(match.id, myTeamId, data);

    // Cierre explícito y sólo tras el éxito: si `submitProposal` lanza, nunca se
    // llega acá y el sheet queda abierto con el formulario cargado. El
    // `await loadData()` que sigue le da al <Modal> nativo tiempo de sobra para
    // desmontarse antes de que el alert monte el suyo.
    setShowProposalModal(false);
    await loadData();
    showAlert('Propuesta enviada', 'El rival recibirá tu propuesta.');
  }

  async function handleCheckin() {
    if (!match) return;
    try {
      // Ubicación para el geofence. Con venue, `checkin_team` ahora rechaza el
      // check-in sin coordenadas (LOCATION_REQUIRED).
      let coords: { lat: number; lng: number } | undefined;
      if (match.venueId) {
        const location = await getCheckinLocation();
        if (!location.ok) {
          showAlert('No pudimos validar tu ubicación', location.message);
          return;
        }
        coords = location.coords;
      }

      const result = await doCheckin(match.id, myTeamId, coords);
      // D9: el check-in registra MI llegada; la presencia del EQUIPO se sella
      // sólo con quórum. Si después hay una disputa de WO por no presentación,
      // este log y su timestamp son la evidencia de qué pasó y cuándo.
      Logger.info('Check-in registrado', {
        scope: 'match-detail',
        matchId: match.id,
        teamId: myTeamId,
        withGeofence: coords !== undefined,
        checkedInPlayers: result.checkedInPlayers,
        minPlayers: result.minPlayers,
        teamSealed: result.teamSealed,
      });
      await loadData();

      // El mensaje tiene que decir en cuál de los dos estados quedó el equipo.
      // Antes decía siempre "marcaste tu llegada" y el casillero del equipo
      // seguía en "Pendiente" sin ninguna explicación posible.
      if (result.justSealed) {
        showAlert(
          '¡Equipo presentado!',
          `Con tu llegada son ${result.checkedInPlayers}: tu equipo queda presentado para este partido.`,
        );
      } else if (result.teamSealed) {
        showAlert('¡Check-in realizado!', 'Marcaste tu llegada. Tu equipo ya estaba presentado.');
      } else {
        const missing = Math.max(result.minPlayers - result.checkedInPlayers, 0);
        showAlert(
          '¡Check-in realizado!',
          `Marcaste tu llegada (${result.checkedInPlayers}/${result.minPlayers}). ` +
            `Faltan ${missing} compañero(s) para dar por presentado al equipo.`,
        );
      }
    } catch (err) {
      await loadData();
      Logger.error('Fallo el check-in', {
        scope: 'match-detail',
        matchId: match.id,
        teamId: myTeamId,
        hasVenue: match.venueId !== null,
        error: err,
      });
      showAlert('Error', getCheckinErrorMessage(err));
    }
  }

  async function handleVoteSubmit(teamId: string) {
    if (!match) return;
    try {
      await submitDisputeVote(match.id, teamId);
      Logger.info('Voto de disputa registrado', {
        scope: 'match-detail',
        matchId: match.id,
        votedTeamId: teamId,
      });
      await loadData();
      showAlert('¡Voto registrado!', 'Tu voto fue enviado correctamente.');
    } catch (err) {
      await loadData();
      Logger.error('Fallo el voto de disputa', {
        scope: 'match-detail',
        matchId: match.id,
        votedTeamId: teamId,
        error: err,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  // `handleDisputeResolve` vivía acá. La disputa ya no la cierra nadie desde la
  // app: la resuelve el cron `sweep_disputed_matches` a las 24 h y la RPC
  // `resolve_match_dispute` fue eliminada (migración 20260803150000).

  function isLateForCancellation(): boolean {
    if (!match?.scheduledAt) return false;
    const diff = new Date(match.scheduledAt).getTime() - loadedAtTs;
    return diff < 24 * 60 * 60 * 1000;
  }

  async function handleRespondToCancellation(accept: boolean) {
    if (!match?.cancellationRequest) return;
    try {
      await respondToCancellationRequest(
        match.cancellationRequest.id,
        accept,
        match.cancellationRequest.requestedByTeamId,
      );
      Logger.info('Solicitud de cancelación respondida', {
        scope: 'match-detail',
        matchId: match.id,
        accepted: accept,
        isLate: match.cancellationRequest.isLate,
      });
      await loadData();
      showAlert(
        accept ? 'Cancelación aceptada' : 'Solicitud rechazada',
        accept ? 'El partido fue cancelado.' : 'El partido sigue en pie.',
      );
    } catch (err) {
      await loadData();
      Logger.error('Fallo la respuesta a la solicitud de cancelación', {
        scope: 'match-detail',
        matchId: match.id,
        accepted: accept,
        error: err,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    }
  }

  // El realtime (useMatchRealtime) recarga esta pantalla sola cuando el rival
  // actua. Con el loader a pantalla completa cada evento borraba el detalle; con
  // el esqueleto acotado a la carga inicial, el refresco es invisible.
  if (loading && !match) return <MatchDetailSkeleton />;

  if (!match) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Partido no encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="font-ui text-sm text-brand-primary">Volver</Text>
        </TouchableOpacity>
        {AlertComponent}
      </View>
    );
  }

  const { status } = match;
  const isMyTeamA = match.teamA.id === myTeamId;
  const myCheckinAt = isMyTeamA ? match.checkinTeamAAt : match.checkinTeamBAt;
  const opponentTeam = isMyTeamA ? match.teamB : match.teamA;
  const hasPendingCancellation = match.cancellationRequest?.status === 'PENDIENTE';

  // D5: mientras el reclamo está en revisión la pantalla se veía idéntica a
  // antes de reclamar — el partido seguía "Confirmado" y el botón WO volvía a
  // estar disponible, así que el segundo tap chocaba con el unique(match_id) y
  // salía un error crudo de Supabase.
  const hasPendingWoClaim = match.woClaim?.status === 'PENDIENTE_REVISION';

  // R1/R2: definición ÚNICA de "puedo gestionar este partido".
  //
  // El servidor ya lo exigía —RLS de match_proposals, confirm_match_proposal,
  // request_match_cancellation—, pero la pantalla ofrecía igual los botones y
  // el JUGADOR se enteraba de que no podía DESPUÉS de completar el formulario.
  // El rol ya viajaba en el payload de get_match_detail; sólo faltaba mirarlo.
  //
  // Deliberadamente NO cubre la carga de resultado: ahí la regla del servidor
  // es "CAPITAN/SUBCAPITAN **o** is_result_loader", así que un JUGADOR que hizo
  // el check-in sí puede cargarlo (ver canSubmitResult más abajo). Tampoco
  // cubre el reclamo de WO, que claim_wo habilita a cualquier jugador con
  // check-in.
  const canManageMatch = match.myRole === 'CAPITAN' || match.myRole === 'SUBCAPITAN';

  // R6: el cuerpo técnico —capitán, subcapitán y DIRECTOR_TECNICO— presenta la
  // lista y carga el resultado. `canManageMatch` sigue reservado para lo que
  // compromete al club frente al rival: proponer, confirmar y cancelar.
  const isMatchStaff = isTeamMatchStaff(match.myRole);

  // Bug 4: el selector de goleadores/MVP se alimenta del PLANTEL (team_roster),
  // no de la convocatoria (match_participants). Un gol puede ser de alguien que
  // entró sin figurar en la lista de buena fe, y un partido iniciado con la RPC
  // legacy checkin_team deja un solo participante por equipo.
  const myTeamParticipants = match.teamRoster;

  // D10: la regla vive en lib/match-permissions.ts y es la misma que aplican
  // ResultSection (dentro de esta pantalla), LiveMatchBanner y MatchCardFooter.
  // Antes estaba escrita acá y otras dos veces distinta: un capitán sin
  // check-in veía "Finalizar Partido" pero no "Cargar resultado", en la misma
  // pantalla y para la misma acción.
  const canSubmitResult = canLoadResultFromDetail(match);

  // E7: el vencimiento se calcula desde `scheduledAt` — el mismo ancla que usa
  // `match_guest_code_expires_at` en el servidor. Sin fecha pactada no hay nada
  // que mostrar: el partido tampoco está CONFIRMADO, así que el código no se
  // puede usar igual.
  const guestCodeExpiry = getGuestCodeExpiry(match.scheduledAt);
  const guestCodeExpired = isGuestCodeExpired(match.scheduledAt);

  function renderStatusBadge() {
    const colors: Record<string, string> = {
      PENDIENTE: 'bg-neutral-outline/20 text-neutral-on-surface-variant',
      CONFIRMADO: 'bg-info-secondary/20 text-info-secondary',
      EN_VIVO: 'bg-danger-error/20 text-danger-error',
      FINALIZADO: 'bg-brand-primary/20 text-brand-primary',
      EN_DISPUTA: 'bg-warning-tertiary/20 text-warning-tertiary',
      WO_A: 'bg-warning-tertiary/20 text-warning-tertiary',
      WO_B: 'bg-warning-tertiary/20 text-warning-tertiary',
      CANCELADO: 'bg-neutral-outline/20 text-neutral-outline',
    };
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      CONFIRMADO: 'Confirmado',
      EN_VIVO: 'En vivo',
      FINALIZADO: 'Finalizado',
      EN_DISPUTA: 'En disputa',
      WO_A: 'WO (Equipo A)',
      WO_B: 'WO (Equipo B)',
      CANCELADO: 'Cancelado',
    };
    const cls = colors[status] ?? 'bg-neutral-outline/20 text-neutral-on-surface-variant';
    return (
      <View className={`rounded-full px-3 py-1 ${cls.split(' ')[0]}`}>
        <Text className={`font-uiBold text-xs uppercase tracking-widest ${cls.split(' ')[1]}`}>
          {labels[status] ?? status}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      <SecondaryHeader title="Detalle del partido" rightSlot={renderStatusBadge()} />

      <ScrollView
        className="px-4"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <MatchDetailHero match={match} myTeamId={myTeamId} />

        {/* Código de invitado — sólo en CONFIRMADO.
            `join_match_as_guest` únicamente admite canjes con el partido
            CONFIRMADO, pero el código se generaba y se mostraba desde que se
            aceptaba el desafío: se compartía en PENDIENTE (todavía sin fecha
            pactada) y seguía a la vista en EN_VIVO o FINALIZADO, cuando ya no
            sirve para nada. Mostrarlo sólo cuando se puede canjear alinea la UI
            con la regla del servidor (auditoría E2E, módulos 4.3 y 6.3). */}
        {status === 'CONFIRMADO' && (
        <TouchableOpacity
          onPress={() => void Clipboard.setStringAsync(match.uniqueCode).then(() =>
            showAlert('¡Copiado!', 'El código del partido fue copiado al portapapeles.')
          )}
          activeOpacity={0.8}
          className="mt-3 rounded-xl border border-brand-primary/25 bg-brand-primary/8 px-4 py-3"
        >
          <Text className="font-ui mb-1 text-[10px] uppercase tracking-widest text-brand-primary opacity-70">
            ⚽ Código del partido
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="font-displayBlack text-xl tracking-[6px] text-brand-primary">
              {match.uniqueCode}
            </Text>
            <View className="rounded-lg border border-brand-primary/40 bg-brand-primary/15 px-2 py-1">
              <Text className="font-uiBold text-[10px] uppercase tracking-wider text-brand-primary">
                Copiar
              </Text>
            </View>
          </View>

          {/* E7 — el código caduca. Quien lo comparte tiene que saber hasta
              cuándo sirve; antes habilitaba invitados para siempre. */}
          {guestCodeExpiry ? (
            <Text className="font-ui mt-2 text-[10px] text-neutral-on-surface-variant">
              {guestCodeExpired
                ? 'Este código ya venció: no admite invitados nuevos.'
                : `Admite invitados hasta el ${formatGuestCodeExpiry(guestCodeExpiry)}.`}
            </Text>
          ) : null}
        </TouchableOpacity>
        )}

        {/* ─── PENDIENTE ─── */}
        {status === 'PENDIENTE' && (
          <>
            {match.activeProposal ? (
              <ProposalSection
                proposal={match.activeProposal}
                myTeamId={myTeamId}
                canManage={canManageMatch}
                onAccept={() => void handleAcceptProposal()}
                onReject={() => void handleRejectProposal()}
                onCounterPropose={() => setShowProposalModal(true)}
                onCancelProposal={() => void handleCancelProposal()}
              />
            ) : (
              <View className="mt-4 rounded-2xl bg-surface-container p-4">
                <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
                  {canManageMatch
                    ? 'Sin propuesta activa. Enviá una propuesta para coordinar el partido.'
                    : 'Sin propuesta activa. Tu capitán o subcapitán tiene que coordinar la fecha, el formato y la cancha con el rival.'}
                </Text>
                {canManageMatch && (
                  <TouchableOpacity
                    onPress={() => setShowProposalModal(true)}
                    activeOpacity={0.8}
                    className="mt-3 rounded-xl bg-brand-primary py-3"
                  >
                    <Text className="font-uiBold text-center text-sm text-[#003914]">
                      Proponer detalles
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {hasPendingCancellation && match.cancellationRequest && (
              <CancellationRequestSection
                request={match.cancellationRequest}
                myTeamId={myTeamId}
                myRole={match.myRole}
                opponentName={opponentTeam.name}
                onAccept={() => void handleRespondToCancellation(true)}
                onReject={() => void handleRespondToCancellation(false)}
              />
            )}
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onCancel={hasPendingCancellation || !canManageMatch ? undefined : () => setShowCancellationModal(true)}
              onReport={() => setShowReportModal(true)}
            />
          </>
        )}

        {/* ─── CONFIRMADO ─── */}
        {status === 'CONFIRMADO' && (
          <>
            <MatchDetailsSection match={match} />
            <CheckinSection
              match={match}
              onCheckin={() => void handleCheckin()}
              myProfileId={profile?.id ?? null}
              minPlayers={minPlayersToStart}
              onOpenSquadList={
                isMatchStaff
                  ? () =>
                      router.push({
                        pathname: '/match-checkin' as never,
                        params: { matchId: match.id, myTeamId },
                      })
                  : undefined
              }
            />
            {hasPendingCancellation && match.cancellationRequest && (
              <CancellationRequestSection
                request={match.cancellationRequest}
                myTeamId={myTeamId}
                myRole={match.myRole}
                opponentName={opponentTeam.name}
                onAccept={() => void handleRespondToCancellation(true)}
                onReject={() => void handleRespondToCancellation(false)}
              />
            )}
            {hasPendingWoClaim && <WoClaimPendingBanner match={match} myTeamId={myTeamId} />}
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onWo={myCheckinAt !== null && !match.woClaim ? () => setShowWoModal(true) : undefined}
              onCancel={hasPendingCancellation || !canManageMatch ? undefined : () => setShowCancellationModal(true)}
              onReport={() => setShowReportModal(true)}
            />
          </>
        )}

        {/* ─── EN_VIVO ─── */}
        {status === 'EN_VIVO' && (
          <>
            <MatchDetailsSection match={match} />
            <ResultSection
              match={match}
              onLoadResult={canSubmitResult ? () => setShowResultModal(true) : undefined}
            />
            {/* Finalizar Partido (early termination while EN_VIVO).
                Se oculta apenas mi equipo cargó: en su lugar queda el estado de
                espera, para que la pantalla refleje que ya no hay nada que hacer. */}
            {canSubmitResult ? (
              <TouchableOpacity
                onPress={() => setShowResultModal(true)}
                activeOpacity={0.8}
                className="mt-4 rounded-2xl border border-danger-error/40 bg-danger-error/8 px-5 py-4"
              >
                <Text className="font-uiBold text-center text-sm text-danger-error">
                  Finalizar Partido
                </Text>
                <Text className="font-ui mt-1 text-center text-[11px] text-danger-error/60">
                  ¿Problemas en el partido? Cargá el resultado ahora.
                </Text>
              </TouchableOpacity>
            ) : match.myResult ? (
              <View className="mt-4 flex-row items-center gap-3 rounded-2xl border border-brand-primary/30 bg-brand-primary/8 px-5 py-4">
                <AppIcon family="material-community" name="check-circle" size={18} color="#53E076" />
                <Text className="font-ui flex-1 text-xs text-neutral-on-surface-variant">
                  Ya enviaste tu resultado. Esperando la carga del rival para confirmar el partido.
                </Text>
              </View>
            ) : null}
            {hasPendingWoClaim && <WoClaimPendingBanner match={match} myTeamId={myTeamId} />}
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onWo={match.woClaim ? undefined : () => setShowWoModal(true)}
              onReport={() => setShowReportModal(true)}
            />
          </>
        )}

        {/* ─── FINALIZADO ─── */}
        {status === 'FINALIZADO' && (
          <>
            <ResultSection match={match} />
            <View className="mt-4 flex-row items-center gap-2 rounded-xl bg-surface-container px-4 py-3">
              <AppIcon family="material-community" name="heart" size={16} color="#53E076" />
              <Text className="font-ui flex-1 text-xs text-neutral-on-surface-variant">
                ¡Buen partido! El Fair Play de ambos equipos ha sido actualizado.
              </Text>
            </View>
            <ShareMatchButton matchId={match.id} myTeamId={myTeamId} />
            {/* Sin onChat/onWo/onCancel: acá sólo queda Denunciar, que es
                justamente lo único de esta fila que sigue teniendo sentido
                una vez que el partido ya cerró — de hecho es el momento más
                probable para reportar algo que pasó durante el juego. */}
            <ActionButtons onReport={() => setShowReportModal(true)} />
          </>
        )}

        {/* ─── EN_DISPUTA ─── */}
        {status === 'EN_DISPUTA' && (
          <>
            <ResultSection match={match} />
            {profile ? (
              <DisputeSection
                match={match}
                profileId={profile.id}
                disputeState={disputeState}
                onVote={(teamId) => void handleVoteSubmit(teamId)}
              />
            ) : null}
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onReport={() => setShowReportModal(true)}
            />
          </>
        )}

        {/* ─── WO_A / WO_B ─── */}
        {(status === 'WO_A' || status === 'WO_B') && (
          <>
            <View className="mt-4 rounded-2xl bg-warning-tertiary/10 p-4">
              <View className="mb-2 flex-row items-center gap-2">
                <AppIcon family="material-community" name="trophy" size={18} color="#FABD32" />
                <Text className="font-uiBold text-sm text-warning-tertiary">Partido ganado por WO</Text>
              </View>
              {match.woClaim && (
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  Motivo: {match.woClaim.reason ?? 'No especificado'}
                </Text>
              )}
            </View>
            <ShareMatchButton matchId={match.id} myTeamId={myTeamId} />
            <ActionButtons
              onChat={match.conversationId ? () => router.push({ pathname: '/(modals)/chat' as never, params: { conversationId: match.conversationId!, myTeamId } }) : undefined}
              onReport={() => setShowReportModal(true)}
            />
          </>
        )}

        {/* ─── CANCELADO ─── */}
        {status === 'CANCELADO' && (
          <View className="mt-4 rounded-2xl bg-neutral-outline/10 p-4">
            <Text className="font-uiBold mb-1 text-sm text-neutral-on-surface">
              Partido cancelado
            </Text>
            {match.cancellationRequest && (
              <Text className="font-ui text-sm text-neutral-on-surface-variant">
                Motivo: {match.cancellationRequest.reason}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <ProposalModal
        visible={showProposalModal}
        matchType={match.matchType}
        onClose={() => setShowProposalModal(false)}
        onSubmit={handleProposalSubmit}
      />
      <ResultModal
        visible={showResultModal}
        onClose={() => setShowResultModal(false)}
        onSubmit={async (data) => {
          try {
            await submitMatchResult(match.id, myTeamId, data);
            // El resultado dispara el trigger resolve_match (FINALIZADO /
            // EN_DISPUTA / ELO). Es la mutación más consecuente de la app.
            Logger.info('Resultado cargado', {
              scope: 'match-detail',
              matchId: match.id,
              teamId: myTeamId,
              goalsScored: data.goalsScored,
              goalsAgainst: data.goalsAgainst,
              scorers: data.scorers.length,
              hasMvp: data.mvpProfileId !== null,
            });
            // Recarga SINCRÓNICA antes del alert. Antes el loadData vivía en el
            // callback del alert, así que la pantalla mostraba el estado viejo
            // hasta que el usuario cerraba el mensaje: ésa era la ventana en la
            // que el botón seguía habilitado y se podía reenviar.
            await loadData();
            showAlert('Resultado cargado', 'Tu resultado fue enviado.');
          } catch (err) {
            // Pase lo que pase, resincronizamos: si falló por duplicado, el
            // estado real ya cambió y la UI tiene que reflejarlo.
            await loadData();

            if (err instanceof ResultAlreadySubmittedError) {
              // Caso terminal: no hay nada que corregir, el modal se cierra y por
              // eso este alert (fuera del <Modal>) si es visible.
              //
              // warn y no error: es un doble envío, no una falla. Interesa
              // medirlo — si aparece seguido, el botón se está ofreciendo
              // cuando no debería (justamente lo que D10 vino a arreglar).
              Logger.warn('Intento de recargar un resultado ya enviado', {
                scope: 'match-detail',
                matchId: match.id,
                teamId: myTeamId,
              });
              showAlert('Resultado ya cargado', err.message);
              return;
            }

            Logger.error('Fallo la carga del resultado', {
              scope: 'match-detail',
              matchId: match.id,
              teamId: myTeamId,
              error: err,
            });

            // Se relanza para que el modal NO se cierre y el usuario pueda
            // corregir los datos sin volver a cargarlos desde cero. El mensaje lo
            // muestra ResultModal en su alert interno: uno lanzado desde aca
            // quedaria detras del sheet abierto.
            throw err;
          }
        }}
        myParticipants={myTeamParticipants}
      />
      <CancellationModal
        visible={showCancellationModal}
        onClose={() => setShowCancellationModal(false)}
        isLateWarning={isLateForCancellation()}
        onSubmit={async (data) => {
          await requestCancellation(match.id, myTeamId, data, opponentTeam.id);
          Logger.info('Solicitud de cancelación enviada', {
            scope: 'match-detail',
            matchId: match.id,
            teamId: myTeamId,
            reason: data.reason,
            isLate: isLateForCancellation(),
          });
          await loadData();
          showAlert(
            'Solicitud enviada',
            `Le pedimos a ${opponentTeam.name} que confirme la cancelación. El partido sigue en pie hasta que responda.`,
          );
        }}
      />
      <WoModal
        visible={showWoModal}
        onClose={() => setShowWoModal(false)}
        myParticipants={myTeamParticipants}
        onSubmit={async (data) => {
          await claimWo(match.id, myTeamId, data);
          // El WO deriva en una resolución de admin que puede reescribir el
          // marcador (D5/D6): conviene tener la traza del lado del cliente.
          Logger.info('Reclamo de WO enviado', {
            scope: 'match-detail',
            matchId: match.id,
            teamId: myTeamId,
            reason: data.reason,
            matchStatus: match.status,
          });
          await loadData();
          showAlert('Reclamo enviado', 'Tu reclamo WO fue enviado a revisión.');
        }}
      />
      {profile?.id && (
        <ReportModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          entityType="MATCH"
          entityId={match.id}
        />
      )}

      {AlertComponent}
    </View>
  );
}

// ─── Reclamo de WO en revisión (D5) ──────────────────────────────────────────
// El reclamo existía en la base y viajaba en el payload de get_match_detail,
// pero la pantalla sólo lo pintaba en las ramas WO_A/WO_B — es decir, recién
// DESPUÉS de que el admin lo aprobara. Mientras estaba en revisión no había
// ninguna señal: ni para quien reclamó, ni para el equipo señalado.

function WoClaimPendingBanner({
  match,
  myTeamId,
}: {
  match: MatchDetailViewData;
  myTeamId: string;
}) {
  const isClaimer = match.woClaim?.claimingTeamId === myTeamId;

  return (
    <View className="mt-4 flex-row items-start gap-3 rounded-2xl border border-warning-tertiary/30 bg-warning-tertiary/10 p-4">
      <AppIcon family="material-community" name="gavel" size={18} color="#FABD32" />
      <View className="flex-1">
        <Text className="font-uiBold text-sm text-warning-tertiary">
          {isClaimer ? 'Tu reclamo de WO está en revisión' : 'El rival reclamó un WO'}
        </Text>
        <Text className="font-ui mt-1 text-xs leading-5 text-neutral-on-surface-variant">
          {isClaimer
            ? 'Un administrador va a revisar la evidencia. Te avisamos cuando haya veredicto.'
            : 'El rival pidió que se le dé el partido por no presentación. Un administrador va a revisar la evidencia y les avisamos el veredicto a los dos equipos.'}
        </Text>
      </View>
    </View>
  );
}

// ─── Reusable action buttons row ─────────────────────────────────────────────

interface ActionButtonsProps {
  onChat?: () => void;
  onWo?: () => void;
  onCancel?: () => void;
  onReport?: () => void;
}

function ActionButtons({ onChat, onWo, onCancel, onReport }: ActionButtonsProps) {
  return (
    <View className="mt-4 flex-row flex-wrap gap-2">
      {onChat && (
        <TouchableOpacity
          onPress={onChat}
          activeOpacity={0.8}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-info-secondary/30 bg-info-secondary/10 py-3"
        >
          <AppIcon family="material-community" name="chat" size={16} color="#8CCDFF" />
          <Text className="font-uiBold text-sm text-info-secondary">Chat</Text>
        </TouchableOpacity>
      )}
      {onWo && (
        <TouchableOpacity
          onPress={onWo}
          activeOpacity={0.8}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-warning-tertiary/30 bg-warning-tertiary/10 py-3"
        >
          <AppIcon family="material-community" name="flag" size={16} color="#FABD32" />
          <Text className="font-uiBold text-sm text-warning-tertiary">WO</Text>
        </TouchableOpacity>
      )}
      {onCancel && (
        <TouchableOpacity
          onPress={onCancel}
          activeOpacity={0.8}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-danger-error/30 bg-danger-error/10 py-3"
        >
          <AppIcon family="material-community" name="cancel" size={16} color="#FFB4AB" />
          <Text className="font-uiBold text-sm text-danger-error">Cancelar</Text>
        </TouchableOpacity>
      )}
      {onReport && (
        // Tono neutro, no rojo: a diferencia de Cancelar, denunciar no es una
        // acción destructiva sobre ESTE partido — pintarla como las demás
        // acciones "graves" confundiría "avisar de algo" con "romper algo".
        <TouchableOpacity
          onPress={onReport}
          activeOpacity={0.8}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-neutral-outline/25 bg-surface-container py-3"
        >
          <AppIcon family="material-community" name="flag-outline" size={16} color="#869585" />
          <Text className="font-uiBold text-sm text-neutral-on-surface-variant">Denunciar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
