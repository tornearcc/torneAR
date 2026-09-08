import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, Share, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { TeamManageSkeleton } from '@/components/team-manage/TeamManageSkeleton';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { TEAM_CATEGORY_OPTIONS, TEAM_FORMAT_OPTIONS, getTeamRoleLabel, TeamCategory, TeamFormat, TeamRole } from '@/lib/team-options';
import { allowedRolesToAssign, canManageMember } from '@/lib/team-helpers';
import { useCustomAlert } from '@/hooks/useCustomAlert';

import { TeamManageHeader } from '@/components/team-manage/TeamManageHeader';
import { TeamManagePendingRequests } from '@/components/team-manage/TeamManagePendingRequests';
import { TeamManageHistoryRequests } from '@/components/team-manage/TeamManageHistoryRequests';
import { TeamMembersList } from '@/components/team-manage/TeamMembersList';
import { TeamManageViewData, TeamMemberRow, TeamJoinRequestRow } from '@/components/team-manage/types';
import {
  fetchTeamManageViewData,
  uploadTeamShield,
  updateTeam,
  acceptJoinRequest,
  rejectJoinRequest,
  updateMemberRole,
  removeMember,
  leaveTeam,
  transferCaptain,
  grantCaptainRole,
  deleteTeam,
  setTeamActive,
  getTeamActionErrorMessage,
} from '@/lib/team-manage-data';

export default function TeamManageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ teamId?: string | string[] }>();
  const { profile } = useAuth();
  const { showAlert, AlertComponent } = useCustomAlert();
  const { fetchMyTeams } = useTeamStore();

  const teamId = useMemo(() => {
    if (Array.isArray(params.teamId)) {
      return params.teamId[0];
    }
    return params.teamId;
  }, [params.teamId]);

  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<TeamManageViewData | null>(null);

  const team = viewData?.team ?? null;
  const members = useMemo(() => viewData?.members ?? [], [viewData?.members]);
  const pendingRequests = useMemo(() => viewData?.pendingRequests ?? [], [viewData?.pendingRequests]);
  const historyRequests = useMemo(() => viewData?.historyRequests ?? [], [viewData?.historyRequests]);
  // Permite distinguir "ACEPTADA y ya entró" de "ACEPTADA esperando al jugador".
  const memberProfileIds = useMemo(
    () => new Set(members.map((member) => member.profile_id)),
    [members],
  );

  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [processingMemberId, setProcessingMemberId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);
  const [uploadingShield, setUploadingShield] = useState(false);

  const [showEditTeamModal, setShowEditTeamModal] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [zones, setZones] = useState<string[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [editName, setEditName] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editCategory, setEditCategory] = useState<TeamCategory>('HOMBRES');
  const [editFormat, setEditFormat] = useState<TeamFormat>('FUTBOL_7');

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [memberForRoleUpdate, setMemberForRoleUpdate] = useState<TeamMemberRow | null>(null);
  const [selectedRoleToAssign, setSelectedRoleToAssign] = useState<TeamRole>('JUGADOR');

  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [memberForRemove, setMemberForRemove] = useState<TeamMemberRow | null>(null);

  const [showTransferCaptainModal, setShowTransferCaptainModal] = useState(false);
  const [transferCaptainToProfileId, setTransferCaptainToProfileId] = useState<string | null>(null);

  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const [showDeleteTeamModal, setShowDeleteTeamModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const myRole = useMemo(() => {
    if (!profile) return null;
    return members.find((member) => member.profile_id === profile.id)?.role ?? null;
  }, [members, profile]);

  const canEditTeam = myRole === 'CAPITAN' || myRole === 'SUBCAPITAN';
  const canModerateRequests = myRole === 'CAPITAN' || myRole === 'SUBCAPITAN';
  const allowedRoleOptions = allowedRolesToAssign(myRole);
  const transferableCaptainCandidates = useMemo(() => {
    if (!profile) return [];
    return members.filter((member) => member.profile_id !== profile.id);
  }, [members, profile]);

  // Se extraen los valores antes de los callbacks: con `team?.zone` o
  // `profile?.id` directo en el array de deps, el React Compiler infiere el
  // objeto entero (`team`, `profile`) como dependencia —menos específica que
  // la declarada— y desactiva la memoización de la pantalla. Con las
  // variables, lo inferido y lo declarado coinciden.
  const teamZone = team?.zone ?? null;
  const profileId = profile?.id;

  const loadZoneOptions = useCallback(async () => {
    try {
      setLoadingZones(true);
      const { data, error } = await supabase
        .from('zones')
        .select('name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setZones((data ?? []).map((zoneRow) => zoneRow.name));
    } catch (error) {
      // Degradar a la zona actual deja el selector casi vacío sin avisar a
      // nadie: el usuario cree que no hay más zonas disponibles.
      Logger.warn('No se pudieron cargar las zonas; se usa la zona actual como único fallback', {
        scope: 'team-manage.loadZoneOptions',
        fallbackZone: editZone ?? teamZone,
        error,
      });
      setZones(editZone ? [editZone] : teamZone ? [teamZone] : []);
    } finally {
      setLoadingZones(false);
    }
  }, [editZone, teamZone]);

  const loadTeamData = useCallback(async () => {
    if (!teamId) return;
    try {
      const data = await fetchTeamManageViewData(teamId, profileId);
      setViewData(data);
    } catch (error) {
      Logger.error('No se pudo cargar la gestión del equipo', {
        scope: 'team-manage.loadTeamData',
        teamId,
        profileId,
        error,
      });
      showAlert('Error al cargar equipo', getGenericSupabaseErrorMessage(error, 'No se pudo cargar la gestion del equipo.'));
    }
  }, [teamId, profileId, showAlert]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      setLoading(true);
      void loadTeamData().finally(() => {
        if (isMounted) setLoading(false);
      });
      return () => { isMounted = false; };
    }, [loadTeamData])
  );

  const handlePickShield = useCallback(async () => {
    if (!team || !teamId || !canEditTeam) {
      showAlert('Sin permisos', 'Solo capitan y subcapitan pueden actualizar el escudo.');
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('Permiso denegado', 'Se necesita acceso a la galeria para seleccionar una imagen.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';

      setUploadingShield(true);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      
      await uploadTeamShield(teamId, base64, mimeType);

      await loadTeamData();
      Logger.info('Escudo del equipo actualizado', {
        scope: 'team-manage.handleUploadShield',
        teamId,
        mimeType,
      });
      showAlert('Escudo actualizado', 'El escudo del equipo se actualizo correctamente.');
    } catch (error) {
      Logger.error('Fallo la subida del escudo del equipo', {
        scope: 'team-manage.handleUploadShield',
        teamId,
        error,
      });
      showAlert('Error al subir escudo', getGenericSupabaseErrorMessage(error, 'No se pudo subir el escudo del equipo.'));
    } finally {
      setUploadingShield(false);
    }
  }, [team, teamId, canEditTeam, showAlert, loadTeamData]);

  const openEditTeamModal = useCallback(async () => {
    if (!team) return;
    if (!canEditTeam) {
      Logger.warn('Intento de editar el equipo sin permisos', {
        scope: 'team-manage.openEditTeamModal',
        teamId: team.id,
      });
      showAlert('Sin permisos', 'Solo capitan y subcapitan pueden editar los datos del equipo.');
      return;
    }

    setEditName(team.name);
    setEditZone(team.zone);
    setEditCategory(team.category);
    setEditFormat(team.preferred_format);
    setShowEditTeamModal(true);
    await loadZoneOptions();
  }, [team, canEditTeam, showAlert, loadZoneOptions]);

  const handleSaveTeam = useCallback(async () => {
    if (!teamId) return;

    const sanitizedName = editName.trim();
    const sanitizedZone = editZone.trim();

    if (sanitizedName.length < 3) {
      showAlert('Nombre invalido', 'El nombre del equipo debe tener al menos 3 caracteres.');
      return;
    }
    if (!sanitizedZone) {
      showAlert('Zona requerida', 'Selecciona una zona para el equipo.');
      return;
    }

    try {
      setSavingTeam(true);
      await updateTeam(teamId, {
        name: sanitizedName,
        zone: sanitizedZone,
        category: editCategory,
        preferred_format: editFormat,
      });

      await loadTeamData();
      setShowEditTeamModal(false);
      Logger.info('Datos del equipo actualizados', {
        scope: 'team-manage.handleSaveTeam',
        teamId,
        category: editCategory,
        format: editFormat,
      });
      showAlert('Equipo actualizado', 'Los datos principales del equipo fueron actualizados.');
    } catch (error) {
      Logger.error('No se pudieron actualizar los datos del equipo', {
        scope: 'team-manage.handleSaveTeam',
        teamId,
        error,
      });
      showAlert('Error al guardar', getGenericSupabaseErrorMessage(error, 'No se pudieron actualizar los datos del equipo.'));
    } finally {
      setSavingTeam(false);
    }
  }, [teamId, editName, editZone, editCategory, editFormat, loadTeamData, showAlert]);

  const handleApproveRequest = useCallback(async (request: TeamJoinRequestRow) => {
    if (!teamId || !team) return;
    try {
      setProcessingRequestId(request.id);
      await acceptJoinRequest(request, { id: team.id, name: team.name });
      await loadTeamData();
      if (profile?.id) {
        await fetchMyTeams(profile.id);
      }
      // El alta NO ocurre acá: aceptar sólo habilita al jugador. El alta la
      // dispara él mismo desde "Mis solicitudes" con transfer_to_team, que cierra
      // su ciclo anterior como TRANSFERENCIA en vez de ABANDONO. El mensaje tiene
      // que decir eso — antes afirmaba "El jugador fue agregado al plantel", que
      // era falso y hacía parecer que el alta se había roto.
      Logger.info('Solicitud de unión aprobada', {
        scope: 'team-manage.handleApproveRequest',
        teamId,
        requestId: request.id,
        applicantProfileId: request.profile_id,
      });
      showAlert(
        'Solicitud aprobada',
        `Le avisamos a ${request.profiles?.full_name ?? 'el jugador'} que puede sumarse. Va a aparecer en el plantel cuando confirme el traspaso desde "Mis solicitudes".`,
      );
    } catch (error) {
      Logger.error('No se pudo aprobar la solicitud de unión', {
        scope: 'team-manage.handleApproveRequest',
        teamId,
        requestId: request.id,
        error,
      });
      showAlert('Error al aprobar', getGenericSupabaseErrorMessage(error, 'No se pudo aprobar la solicitud.'));
    } finally {
      setProcessingRequestId(null);
    }
  }, [teamId, team, profile, loadTeamData, fetchMyTeams, showAlert]);

  const handleRejectRequest = useCallback(async (request: TeamJoinRequestRow) => {
    try {
      setProcessingRequestId(request.id);
      await rejectJoinRequest(request.id);
      
      await loadTeamData();
      Logger.info('Solicitud de unión rechazada', {
        scope: 'team-manage.handleRejectRequest',
        requestId: request.id,
        applicantProfileId: request.profile_id,
      });
      showAlert('Solicitud rechazada', 'La solicitud fue rechazada.');
    } catch (error) {
      Logger.error('No se pudo rechazar la solicitud de unión', {
        scope: 'team-manage.handleRejectRequest',
        requestId: request.id,
        error,
      });
      showAlert('Error al rechazar', getGenericSupabaseErrorMessage(error, 'No se pudo rechazar la solicitud.'));
    } finally {
      setProcessingRequestId(null);
    }
  }, [loadTeamData, showAlert]);

  const openRoleModal = (member: TeamMemberRow, isSelf: boolean) => {
    if (!canManageMember(myRole, member.role, isSelf)) {
      Logger.warn('Intento de cambiar el rol de un miembro sin permisos', {
        scope: 'team-manage.openRoleModal',
        teamId,
        myRole,
        memberProfileId: member.profile_id,
        memberRole: member.role,
      });
      showAlert('Sin permisos', 'No tienes permisos para cambiar el rol de este miembro.');
      return;
    }
    const options = allowedRoleOptions;
    const defaultRole = options.includes(member.role) ? member.role : options[0] ?? 'JUGADOR';
    setMemberForRoleUpdate(member);
    setSelectedRoleToAssign(defaultRole);
    setShowRoleModal(true);
  };

  const handleConfirmRoleChange = useCallback(async () => {
    if (!teamId || !memberForRoleUpdate || !team || !profile) return;
    try {
      setProcessingMemberId(memberForRoleUpdate.profile_id);

      if (selectedRoleToAssign === 'CAPITAN') {
        // Ceder capitanía: el capitán actual queda como SUBCAPITÁN.
        // R5: una sola RPC atómica; el capitán saliente lo deriva el servidor
        // de auth.uid(), por eso ya no se pasan `profile.id` ni el rol previo.
        await grantCaptainRole(teamId, memberForRoleUpdate.profile_id);
        await loadTeamData();
        if (profile?.id) await fetchMyTeams(profile.id);
        setShowRoleModal(false);
        setMemberForRoleUpdate(null);
        Logger.info('Capitanía cedida desde la gestión del equipo', {
          scope: 'team-manage.handleConfirmRoleChange',
          teamId,
          newCaptainProfileId: memberForRoleUpdate.profile_id,
        });
        showAlert('Capitanía cedida', `${memberForRoleUpdate.profiles?.full_name ?? 'El jugador'} es el nuevo Capitán. Vos quedás como Subcapitán.`);
      } else {
        await updateMemberRole(
          teamId,
          memberForRoleUpdate.profile_id,
          selectedRoleToAssign,
          { id: team.id, name: team.name },
        );
        await loadTeamData();
        setShowRoleModal(false);
        setMemberForRoleUpdate(null);
        Logger.info('Rol de miembro actualizado', {
          scope: 'team-manage.handleConfirmRoleChange',
          teamId,
          memberProfileId: memberForRoleUpdate.profile_id,
          newRole: selectedRoleToAssign,
        });
        showAlert('Rol actualizado', `Nuevo rol: ${getTeamRoleLabel(selectedRoleToAssign)}.`);
      }
    } catch (error) {
      // getTeamActionErrorMessage (y no el genérico): la cesión de capitanía
      // pasa por `grant_captain_role`, que devuelve los mismos códigos con
      // prefijo estable que el resto de las RPCs de membresía (R5).
      Logger.error('Fallo el cambio de rol de un miembro', {
        teamId,
        memberProfileId: memberForRoleUpdate.profile_id,
        targetRole: selectedRoleToAssign,
        error,
      });
      showAlert('Error al cambiar rol', getTeamActionErrorMessage(error, 'No se pudo actualizar el rol del miembro.'));
    } finally {
      setProcessingMemberId(null);
    }
  }, [teamId, memberForRoleUpdate, team, profile, selectedRoleToAssign, loadTeamData, fetchMyTeams, showAlert]);

  const askRemoveMember = (member: TeamMemberRow, isSelf: boolean) => {
    if (!canManageMember(myRole, member.role, isSelf)) {
      showAlert('Sin permisos', 'No tienes permisos para remover a este miembro.');
      return;
    }
    setMemberForRemove(member);
    setShowRemoveConfirmModal(true);
  };

  const handleConfirmRemoveMember = useCallback(async () => {
    if (!teamId || !memberForRemove || !team) return;
    try {
      setProcessingMemberId(memberForRemove.profile_id);
      await removeMember(
        teamId,
        memberForRemove.profile_id,
        { id: team.id, name: team.name },
      );

      await loadTeamData();
      setShowRemoveConfirmModal(false);
      setMemberForRemove(null);
      Logger.info('Miembro removido del plantel', {
        scope: 'team-manage.handleConfirmRemoveMember',
        teamId,
        memberProfileId: memberForRemove.profile_id,
      });
      showAlert('Miembro removido', 'El jugador fue removido del plantel.');
    } catch (error) {
      Logger.error('No se pudo remover al miembro del plantel', {
        scope: 'team-manage.handleConfirmRemoveMember',
        teamId,
        memberProfileId: memberForRemove.profile_id,
        error,
      });
      showAlert('Error al remover', getTeamActionErrorMessage(error, 'No se pudo remover al miembro.'));
    } finally {
      setProcessingMemberId(null);
    }
  }, [teamId, memberForRemove, team, loadTeamData, showAlert]);

  const handleConfirmLeaveTeam = useCallback(async () => {
    if (!teamId || !profile) return;
    if (myRole === 'CAPITAN') {
      showAlert('Accion no disponible', 'El capitan no puede abandonar el equipo sin transferir la capitania.');
      return;
    }
    try {
      setProcessingMemberId(profile.id);
      // El perfil lo deriva la RPC de auth.uid(); ya no se envía desde el cliente.
      await leaveTeam(teamId);

      setShowLeaveConfirmModal(false);
      if (profile?.id) await fetchMyTeams(profile.id);
      Logger.info('El usuario abandonó el equipo', {
        scope: 'team-manage.handleConfirmLeaveTeam',
        teamId,
        profileId: profile.id,
        role: myRole,
      });
      showAlert('Equipo abandonado', 'Saliste del equipo correctamente.', () => {
        router.replace('/(tabs)/profile');
      });
    } catch (error) {
      // CAPTAIN_MUST_TRANSFER / ACTIVE_MATCH llegan tipados desde la RPC.
      Logger.error('No se pudo abandonar el equipo', {
        scope: 'team-manage.handleConfirmLeaveTeam',
        teamId,
        profileId: profile.id,
        error,
      });
      showAlert('No pudimos sacarte del equipo', getTeamActionErrorMessage(error, 'No se pudo abandonar el equipo.'));
    } finally {
      setProcessingMemberId(null);
    }
  }, [teamId, profile, myRole, router, showAlert, fetchMyTeams]);

  const startLeaveFlow = () => {
    if (!myRole) return;
    if (myRole === 'CAPITAN') {
      if (transferableCaptainCandidates.length === 0) {
        // Capitán es el único miembro → ofrecer eliminar el equipo
        setShowDeleteTeamModal(true);
        return;
      }
      setTransferCaptainToProfileId((current) => current ?? transferableCaptainCandidates[0].profile_id);
      setShowTransferCaptainModal(true);
      return;
    }
    setShowLeaveConfirmModal(true);
  };

  const handleConfirmDeleteTeam = useCallback(async () => {
    if (!teamId || !profile) return;
    try {
      setProcessingMemberId(profile.id);
      await deleteTeam(teamId);
      setShowDeleteTeamModal(false);
      if (profile?.id) await fetchMyTeams(profile.id);
      Logger.info('Equipo eliminado', {
        scope: 'team-manage.handleConfirmDeleteTeam',
        teamId,
        profileId: profile.id,
      });
      showAlert('Equipo eliminado', 'El equipo fue eliminado correctamente.', () => {
        router.replace('/(tabs)/profile');
      });
    } catch (error) {
      Logger.error('No se pudo eliminar el equipo; se ofrece la baja lógica', {
        scope: 'team-manage.handleConfirmDeleteTeam',
        teamId,
        profileId: profile.id,
        error,
      });
      // El caso más común acá NO es un fallo técnico: es el equipo con historial
      // deportivo (23503), que por diseño no se puede borrar. Antes eso era un
      // callejón sin salida — el mensaje sugería "dejalo inactivo" y esa opción
      // no existía. Ahora se ofrece la baja lógica en el mismo lugar.
      setShowDeleteTeamModal(false);
      setShowDeactivateModal(true);
      showAlert('No se puede eliminar', getGenericSupabaseErrorMessage(error, 'No se pudo eliminar el equipo.'));
    } finally {
      setProcessingMemberId(null);
    }
  }, [teamId, profile, fetchMyTeams, router, showAlert]);

  // E3: baja lógica. No borra nada — saca al equipo del ranking, la búsqueda,
  // el Mercado y los desafíos, conservando historial y ELO. Reversible.
  const handleToggleTeamActive = useCallback(async (nextActive: boolean) => {
    if (!teamId) return;
    try {
      setTogglingActive(true);
      await setTeamActive(teamId, nextActive);
      setShowDeactivateModal(false);
      await loadTeamData();
      if (profile?.id) await fetchMyTeams(profile.id);
      Logger.info(nextActive ? 'Equipo reactivado' : 'Equipo dado de baja', {
        scope: 'team-manage.handleToggleTeamActive',
        teamId,
        nextActive,
      });
      showAlert(
        nextActive ? 'Equipo reactivado' : 'Equipo dado de baja',
        nextActive
          ? 'Tu equipo vuelve a aparecer en el ranking, el mercado y los desafíos.'
          : 'El equipo ya no aparece en el ranking, el mercado ni los desafíos. Su historial y su Rating quedan intactos, y podés reactivarlo cuando quieras.',
      );
    } catch (error) {
      Logger.error('No se pudo cambiar el estado activo del equipo', {
        scope: 'team-manage.handleToggleTeamActive',
        teamId,
        nextActive,
        error,
      });
      showAlert('No pudimos actualizar el equipo', getGenericSupabaseErrorMessage(error));
    } finally {
      setTogglingActive(false);
    }
  }, [teamId, profile, loadTeamData, fetchMyTeams, showAlert]);

  const handleConfirmTransferCaptainAndLeave = useCallback(async () => {
    if (!teamId || !profile || !transferCaptainToProfileId) return;
    const newCaptain = transferableCaptainCandidates.find((m) => m.profile_id === transferCaptainToProfileId);
    if (!newCaptain) {
      showAlert('Seleccion requerida', 'Selecciona un miembro para transferir la capitania.');
      return;
    }

    try {
      setProcessingMemberId(profile.id);
      // Promoción + salida en una sola transacción del servidor: ya no hace
      // falta pasar el rol previo para un rollback manual.
      await transferCaptain(teamId, transferCaptainToProfileId);

      setShowTransferCaptainModal(false);
      if (profile?.id) await fetchMyTeams(profile.id);
      Logger.info('Capitanía transferida y salida del equipo', {
        scope: 'team-manage.handleConfirmTransferCaptainAndLeave',
        teamId,
        profileId: profile.id,
        newCaptainProfileId: transferCaptainToProfileId,
      });
      showAlert('Capitania transferida', 'Transferiste la capitania y saliste del equipo correctamente.', () => {
        router.replace('/(tabs)/profile');
      });
    } catch (error) {
      Logger.error('No se pudo transferir la capitanía ni abandonar el equipo', {
        scope: 'team-manage.handleConfirmTransferCaptainAndLeave',
        teamId,
        profileId: profile.id,
        newCaptainProfileId: transferCaptainToProfileId,
        error,
      });
      showAlert('Error al transferir', getTeamActionErrorMessage(error, 'No se pudo transferir la capitania y abandonar el equipo.'));
    } finally {
      setProcessingMemberId(null);
    }
  }, [teamId, profile, transferCaptainToProfileId, transferableCaptainCandidates, router, showAlert, fetchMyTeams]);

  const handleShareInvite = async () => {
    if (!team) return;
    try {
      await Share.share({ message: `Unite a ${team.name} en TorneAR\nCodigo de invitacion: ${team.invite_code}` });
    } catch (error) {
      Logger.error('No se pudo compartir la invitación del equipo', {
        scope: 'team-manage.handleShareInvite',
        teamId,
        error,
      });
      showAlert('No se pudo compartir', getGenericSupabaseErrorMessage(error, 'Intenta nuevamente en unos segundos.'));
    }
  };

  const handleCopyInviteCode = async () => {
    if (!team) return;
    try {
      await Clipboard.setStringAsync(team.invite_code);
      showAlert('Codigo copiado', 'El codigo de invitacion fue copiado al portapapeles.');
    } catch (error) {
      Logger.error('No se pudo copiar el código de invitación', {
        scope: 'team-manage.handleCopyInviteCode',
        teamId,
        error,
      });
      showAlert('No se pudo copiar', getGenericSupabaseErrorMessage(error, 'Intenta nuevamente en unos segundos.'));
    }
  };

  if (loading && !team) {
    return <TeamManageSkeleton />;
  }

  if (!team) {
    return (
      <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
        <SecondaryHeader title="Gestion de equipo" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-display text-xl text-neutral-on-surface">Equipo no disponible</Text>
          <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">No encontramos informacion para este equipo.</Text>
        </View>
        {AlertComponent}
      </SafeAreaView>
    );
  }

  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Gestion de equipo"
        subtitle="Administracion y estado de tu plantel."
      />

      <ScrollView className="px-4" contentContainerStyle={{ paddingTop: 18, paddingBottom: 36 }}>
        <TeamManageHeader
          team={team}
          myRole={myRole}
          canEditTeam={canEditTeam}
          uploadingShield={uploadingShield}
          members={members}
          onEditTeam={openEditTeamModal}
          onPickShield={handlePickShield}
          onCopyInviteCode={handleCopyInviteCode}
          onShareInvite={handleShareInvite}
        />

        {!team.is_active && (
          <View className="mt-4 flex-row items-start gap-2 rounded-xl border border-warning-tertiary/30 bg-warning-tertiary/10 p-4">
            <AppIcon family="material-community" name="archive-outline" size={18} color="#FABD32" />
            <View className="flex-1">
              <Text className="font-uiBold text-sm text-warning-tertiary">Equipo dado de baja</Text>
              <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">
                No aparece en el ranking, el mercado ni los desafíos. Su historial y su Rating
                están intactos{myRole === 'CAPITAN' ? '; podés reactivarlo desde el plantel.' : '.'}
              </Text>
            </View>
          </View>
        )}

        {/* El Plantel va PRIMERO y las solicitudes debajo. Al reves, un capitan
            con solicitudes pendientes tenia que scrollear por encima de ellas
            cada vez que entraba a ver a su propio equipo — y las solicitudes
            son la excepcion, no lo que se viene a mirar todos los dias. */}
        <View className="mt-4 rounded-xl bg-surface-low p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Plantel</Text>
            <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>{members.length} miembros</Text>
          </View>

          <TeamMembersList
            members={members}
            myRole={myRole}
            profileId={profile?.id}
            processingMemberId={processingMemberId}
            openRoleModal={openRoleModal}
            askRemoveMember={askRemoveMember}
          />

          {myRole && (
            <View className="mt-4">
              <TouchableOpacity
                onPress={startLeaveFlow}
                disabled={processingMemberId === profile?.id}
                activeOpacity={0.9}
                className={`flex-row items-center justify-center rounded-lg py-3 ${myRole === 'CAPITAN' ? 'border border-info-secondary/35 bg-info-secondary/10' : 'border border-danger-error/35 bg-danger-error/10'}`}
              >
                <AppIcon family="material-community" name="exit-to-app" size={16} color={myRole === 'CAPITAN' ? '#8FD5FF' : '#FFB4AB'} />
                <Text className={`font-display ml-1.5 text-[11px] uppercase tracking-wide ${myRole === 'CAPITAN' ? 'text-info-secondary' : 'text-danger-error'}`}>
                  {myRole === 'CAPITAN' ? 'Transferir capitania y salir' : 'Abandonar equipo'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* E3: baja lógica. Decisión de capitán — la RLS también deja al
              subcapitán, pero cerrar el club no es una acción de segunda línea. */}
          {myRole === 'CAPITAN' && (
            <View className="mt-2">
              <TouchableOpacity
                onPress={() => (team.is_active ? setShowDeactivateModal(true) : void handleToggleTeamActive(true))}
                disabled={togglingActive}
                activeOpacity={0.9}
                className="flex-row items-center justify-center rounded-lg border border-neutral-outline/30 py-3"
              >
                {togglingActive ? (
                  <ActivityIndicator size="small" color="#BCCBB9" />
                ) : (
                  <>
                    <AppIcon
                      family="material-community"
                      name={team.is_active ? 'archive-arrow-down-outline' : 'archive-arrow-up-outline'}
                      size={16}
                      color="#BCCBB9"
                    />
                    <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
                      {team.is_active ? 'Dar de baja el equipo' : 'Reactivar equipo'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {canModerateRequests && (
          <TeamManagePendingRequests
            requests={pendingRequests}
            processingRequestId={processingRequestId}
            onApprove={handleApproveRequest}
            onReject={handleRejectRequest}
          />
        )}

        {canModerateRequests && (
          <TeamManageHistoryRequests requests={historyRequests} memberProfileIds={memberProfileIds} />
        )}
      </ScrollView>

      {/* MODALS */}
      <Modal transparent animationType="fade" visible={showEditTeamModal} onRequestClose={() => setShowEditTeamModal(false)}>
        {/* KeyboardAvoidingView y no View: la card está centrada y tiene el campo
            de nombre, así que en iPhone el teclado la tapaba. El KAV tiene que
            estar DENTRO del <Modal>: la ventana nativa que crea iOS ignora
            cualquiera que viva en la pantalla padre.

            `enabled` sólo en iOS. En Android la Activity ya redimensiona sola,
            así que el KAV queda como un View de paso y el modal se comporta
            exactamente igual que antes de este arreglo. Los otros modales de
            esta pantalla no necesitan nada: ninguno tiene campos de texto. */}
        <TouchableWithoutFeedback onPress={() => setShowEditTeamModal(false)}>
          <KeyboardAvoidingView
            behavior="padding"
            enabled={Platform.OS === 'ios'}
            className="flex-1 items-center justify-center bg-black/80 px-6"
          >
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-4 text-lg text-neutral-on-surface">Editar equipo</Text>
                <Text className="font-display mb-2 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Nombre</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Nombre del equipo"
                  placeholderTextColor="#5E5A58"
                  className="rounded-lg border border-neutral-outline-variant/15 bg-surface-low px-3 py-3 text-neutral-on-surface"
                  maxLength={36}
                />
                <Text className="font-display mb-2 mt-4 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Zona</Text>
                <TouchableOpacity onPress={() => setShowZonePicker(true)} activeOpacity={0.9} className="rounded-lg border border-neutral-outline-variant/15 bg-surface-low px-3 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className={editZone ? 'text-neutral-on-surface' : 'text-surface-bright'}>{editZone || 'Selecciona una zona'}</Text>
                    {loadingZones ? (
                      <ActivityIndicator size="small" color="#53E076" />
                    ) : (
                      <AppIcon family="material-icons" name="keyboard-arrow-down" size={20} color="#BCCBB9" />
                    )}
                  </View>
                </TouchableOpacity>

                <Text className="font-display mb-2 mt-4 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Categoria</Text>
                <View className="mb-4 flex-row flex-wrap gap-2">
                  {TEAM_CATEGORY_OPTIONS.map((option) => {
                    const active = editCategory === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.9}
                        onPress={() => setEditCategory(option.value)}
                        className={`rounded-md border px-3 py-2 ${active ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-display text-[10px] uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text className="font-display mb-2 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Formato</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TEAM_FORMAT_OPTIONS.map((option) => {
                    const active = editFormat === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.9}
                        onPress={() => setEditFormat(option.value)}
                        className={`rounded-md border px-3 py-2 ${active ? 'border-info-secondary bg-info-secondary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-display text-[10px] uppercase tracking-wide ${active ? 'text-info-secondary' : 'text-neutral-on-surface-variant'}`}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowEditTeamModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={savingTeam}
                    onPress={handleSaveTeam}
                    className={`flex-1 items-center rounded-lg py-3 ${savingTeam ? 'bg-brand-primary/45' : 'bg-brand-primary'}`}
                  >
                    {savingTeam ? <ActivityIndicator size="small" color="#003914" /> : <Text className="font-display text-[11px] uppercase tracking-wide text-[#003914]">Guardar</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showZonePicker} onRequestClose={() => setShowZonePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowZonePicker(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-4">
                <Text className="font-display mb-3 text-lg text-neutral-on-surface">Selecciona una zona</Text>
                {loadingZones ? (
                  <View className="py-6"><ActivityIndicator size="small" color="#53E076" /></View>
                ) : (
                  <FlatList
                    data={zones}
                    keyExtractor={(item) => item}
                    style={{ maxHeight: 320 }}
                    ItemSeparatorComponent={() => <View className="h-2" />}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => { setEditZone(item); setShowZonePicker(false); }}
                        className={`rounded-lg border px-3 py-3 ${editZone === item ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-ui ${editZone === item ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>{item}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={() => <Text className="py-2 text-sm text-neutral-on-surface-variant">No hay zonas activas.</Text>}
                  />
                )}
                <TouchableOpacity onPress={() => setShowZonePicker(false)} activeOpacity={0.9} className="mt-4 items-center rounded-lg bg-surface-low py-3">
                  <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Cerrar</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showRoleModal} onRequestClose={() => setShowRoleModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowRoleModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-4 text-lg text-neutral-on-surface">Seleccionar rol</Text>
                <Text className="font-ui mb-3 text-xs text-neutral-on-surface-variant">Miembro: {memberForRoleUpdate?.profiles?.full_name ?? memberForRoleUpdate?.profiles?.username ?? 'Jugador'}</Text>
                <View className="gap-2">
                  {allowedRoleOptions.map((role) => {
                    const active = selectedRoleToAssign === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        activeOpacity={0.9}
                        onPress={() => setSelectedRoleToAssign(role)}
                        className={`rounded-lg border px-3 py-3 ${active ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-uiBold text-sm ${active ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>{getTeamRoleLabel(role)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedRoleToAssign === 'CAPITAN' && (
                  <View className="mt-3 rounded-lg bg-warning-tertiary/10 px-3 py-2.5">
                    <Text className="font-ui text-[11px] text-warning-tertiary">
                      ⚠️ Cederás la capitanía y quedarás automáticamente como Subcapitán.
                    </Text>
                  </View>
                )}
                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowRoleModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.9} disabled={!!processingMemberId} onPress={handleConfirmRoleChange} className={`flex-1 items-center rounded-lg py-3 ${processingMemberId ? 'bg-brand-primary/45' : 'bg-brand-primary'}`}>
                    {processingMemberId ? <ActivityIndicator size="small" color="#003914" /> : <Text className="font-display text-[11px] uppercase tracking-wide text-[#003914]">Guardar rol</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showRemoveConfirmModal} onRequestClose={() => setShowRemoveConfirmModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowRemoveConfirmModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Confirmar remocion</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">Vas a remover a {memberForRemove?.profiles?.full_name ?? memberForRemove?.profiles?.username ?? 'este miembro'} del equipo.</Text>
                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowRemoveConfirmModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.9} disabled={!!processingMemberId} onPress={handleConfirmRemoveMember} className={`flex-1 items-center rounded-lg py-3 ${processingMemberId ? 'bg-danger-error/35' : 'bg-danger-error/80'}`}>
                    {processingMemberId ? <ActivityIndicator size="small" color="#1A0E0D" /> : <Text className="font-display text-[11px] uppercase tracking-wide text-[#1A0E0D]">Remover</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showTransferCaptainModal} onRequestClose={() => setShowTransferCaptainModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowTransferCaptainModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Transferir capitania</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">Selecciona quien sera el nuevo capitan antes de abandonar el equipo.</Text>
                <View className="mt-4 gap-2">
                  {transferableCaptainCandidates.map((member) => (
                    <TouchableOpacity key={member.profile_id} activeOpacity={0.9} onPress={() => setTransferCaptainToProfileId(member.profile_id)} className={`rounded-lg border px-3 py-3 ${transferCaptainToProfileId === member.profile_id ? 'border-info-secondary bg-info-secondary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}>
                      <View className="flex-row items-center justify-between">
                        <View>
                          <Text className={`font-uiBold text-sm ${transferCaptainToProfileId === member.profile_id ? 'text-info-secondary' : 'text-neutral-on-surface'}`}>{member.profiles?.full_name ?? member.profiles?.username ?? 'Jugador'}</Text>
                          <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">@{member.profiles?.username ?? 'sin_usuario'}</Text>
                        </View>
                        <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">{getTeamRoleLabel(member.role)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowTransferCaptainModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.9} disabled={!transferCaptainToProfileId || processingMemberId === profile?.id} onPress={handleConfirmTransferCaptainAndLeave} className={`flex-1 items-center rounded-lg py-3 ${processingMemberId === profile?.id ? 'bg-info-secondary/35' : 'bg-info-secondary/80'}`}>
                    {processingMemberId === profile?.id ? <ActivityIndicator size="small" color="#001F2B" /> : <Text className="font-display text-[11px] uppercase tracking-wide text-[#001F2B]">Transferir y salir</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showLeaveConfirmModal} onRequestClose={() => setShowLeaveConfirmModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowLeaveConfirmModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Abandonar equipo</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">Vas a salir de este equipo y perderas acceso a su gestion.</Text>
                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowLeaveConfirmModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.9} disabled={processingMemberId === profile?.id} onPress={handleConfirmLeaveTeam} className={`flex-1 items-center rounded-lg py-3 ${processingMemberId === profile?.id ? 'bg-danger-error/35' : 'bg-danger-error/80'}`}>
                    {processingMemberId === profile?.id ? <ActivityIndicator size="small" color="#1A0E0D" /> : <Text className="font-display text-[11px] uppercase tracking-wide text-[#1A0E0D]">Abandonar</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showDeleteTeamModal} onRequestClose={() => setShowDeleteTeamModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowDeleteTeamModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Eliminar equipo</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  Sos el único miembro. Si eliminás el equipo, se perderán todos sus datos permanentemente.
                </Text>
                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowDeleteTeamModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={processingMemberId === profile?.id}
                    onPress={handleConfirmDeleteTeam}
                    className={`flex-1 items-center rounded-lg py-3 ${processingMemberId === profile?.id ? 'bg-danger-error/35' : 'bg-danger-error/80'}`}
                  >
                    {processingMemberId === profile?.id
                      ? <ActivityIndicator size="small" color="#1A0E0D" />
                      : <Text className="font-display text-[11px] uppercase tracking-wide text-[#1A0E0D]">Eliminar</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* E3 — Baja lógica del equipo */}
      <Modal visible={showDeactivateModal} transparent animationType="fade" onRequestClose={() => setShowDeactivateModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowDeactivateModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/70 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Dar de baja el equipo</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  El equipo deja de aparecer en el ranking, en el mercado y como rival desafiable.
                  No se borra nada: su historial, sus partidos y su Rating quedan intactos, y podés
                  reactivarlo cuando quieras.
                </Text>
                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowDeactivateModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Volver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={togglingActive}
                    onPress={() => void handleToggleTeamActive(false)}
                    className={`flex-1 items-center rounded-lg py-3 ${togglingActive ? 'bg-warning-tertiary/35' : 'bg-warning-tertiary/80'}`}
                  >
                    {togglingActive
                      ? <ActivityIndicator size="small" color="#1A0E0D" />
                      : <Text className="font-display text-[11px] uppercase tracking-wide text-[#1A0E0D]">Dar de baja</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {AlertComponent}
    </SafeAreaView>
  );
}
