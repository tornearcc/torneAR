import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { UserActionsSheet } from '@/components/moderation/UserActionsSheet';
import { ReportModal } from '@/components/reports/ReportModal';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/lib/market-utils';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import {
  fetchMessages,
  sendMessage,
  fetchInbox,
  fetchConfirmedMatchForTeam,
  markConversationAsRead,
  MarketMessage,
  MarketConversation,
} from '@/lib/chat-api';
import { fetchTeamInviteCode } from '@/lib/market-api';
import { useKeyboardAwareBottomInset } from '@/hooks/useKeyboardAwareBottomInset';

function formatRole(role: 'CAPITAN' | 'SUBCAPITAN' | 'JUGADOR' | null): string {
  if (!role) return '';
  const map: Record<string, string> = {
    CAPITAN: 'Capitán',
    SUBCAPITAN: 'Subcapitán',
    JUGADOR: 'Jugador',
  };
  return map[role] ?? '';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function MarketChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const inputBottomInset = useKeyboardAwareBottomInset();

  const [messages, setMessages] = useState<MarketMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const [chatData, setChatData] = useState<MarketConversation | null>(null);
  const [isCaptainMode, setIsCaptainMode] = useState(false);

  const [teamInviteCode, setTeamInviteCode] = useState<string | null>(null);
  const [matchCode, setMatchCode] = useState<string | null>(null);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [showInviteConfirmModal, setShowInviteConfirmModal] = useState(false);
  // A13: mensajes optimistas que no se pudieron entregar. Estado efímero y local
  // a la pantalla a propósito — no es dominio y no sobrevive a salir del chat.
  const [failedMessageIds, setFailedMessageIds] = useState<string[]>([]);
  // Moderación del chat. `sheet` cubre el menú del interlocutor y la denuncia
  // del perfil; `reportMessageId` la denuncia de un mensaje puntual, que se
  // abre con long-press y no desde el menú.
  const [sheet, setSheet] = useState<'none' | 'actions' | 'report-user'>('none');
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || !id) return;

    const loadConversation = async () => {
      try {
        // Fetch inbox first to get team_id for sender role enrichment
        const inbox = await fetchInbox();
        const currentChat = inbox.find((c: MarketConversation) => c.id === id);

        // Fetch messages with team_id (enables sender role lookup)
        const msgs = await fetchMessages(id, currentChat?.team_id);
        setMessages(msgs);

        // Mark as read — non-fatal
        try {
          await markConversationAsRead(id);
        } catch (e) {
          Logger.warn('No se pudo marcar la conversación de mercado como leída', {
            scope: 'market-chat',
            conversationId: id,
            error: e,
          });
        }

        if (currentChat) {
          setChatData(currentChat);
          const actingAsCaptain = currentChat.player_id !== profile.id;
          setIsCaptainMode(actingAsCaptain);

          if (actingAsCaptain) {
            setIsLoadingCodes(true);
            try {
              const [inviteCode, confirmedMatchCode] = await Promise.all([
                fetchTeamInviteCode(currentChat.team_id),
                fetchConfirmedMatchForTeam(currentChat.team_id),
              ]);
              setTeamInviteCode(inviteCode);
              setMatchCode(confirmedMatchCode);
            } finally {
              setIsLoadingCodes(false);
            }
          }
        }
      } catch (error) {
        // Sin re-throw ni estado de error: la pantalla queda con el chat vacío
        // y es indistinguible de una conversación sin mensajes.
        Logger.error('No se pudo cargar la conversación del mercado', {
          scope: 'market-chat',
          conversationId: id,
          error,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadConversation();

    // --- CONFIGURACIÓN DE REALTIME ---
    const channel = supabase
      .channel(`chat_${id}`) // Canal único para esta conversación
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`, // Solo mensajes de este chat
        },
        (payload) => {
          const newMessage = payload.new as MarketMessage;
          // Ignoramos el mensaje si fuimos nosotros quienes lo enviamos (para evitar duplicados por el manejo optimista)
          if (newMessage.sender_profile_id !== profile.id) {
            setMessages((prev) => [...prev, newMessage]);
            // Marcamos como leído si tenemos el chat abierto
            markConversationAsRead(id).catch((readError: unknown) => {
              Logger.warn('No se pudo marcar como leído el mensaje entrante', {
                scope: 'market-chat.realtime',
                conversationId: id,
                error: readError,
              });
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        }
      )
      .subscribe();

    // Limpieza al desmontar el componente
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, id]);

  /**
   * Entrega (o reintenta) un mensaje ya pintado de forma optimista.
   *
   * Antes, al fallar, la burbuja se borraba de la lista: lo que el usuario había
   * escrito simplemente se esfumaba, sin aviso ni forma de recuperarlo
   * (auditoría E2E, módulo 3.3). Ahora queda visible y marcada, y el tap la
   * reintenta con el mismo contenido.
   */
  const deliverMessage = useCallback(
    async (
      message: MarketMessage,
      messageType: 'TEXT' | 'TEAM_INVITE' | 'MATCH_INVITE' = 'TEXT',
      senderTeamId?: string,
    ) => {
      if (!id) return;

      setFailedMessageIds((prev) => prev.filter((failedId) => failedId !== message.id));
      setIsSending(true);
      try {
        const realMsg = await sendMessage(id, message.content, senderTeamId, messageType);
        Logger.info('Mensaje enviado en el chat del mercado', {
          scope: 'market-chat.deliverMessage',
          conversationId: id,
          messageId: realMsg.id,
          messageType,
          senderTeamId: senderTeamId ?? null,
        });
        setMessages((prev) => prev.map((m) => (m.id === message.id ? realMsg : m)));
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (error) {
        Logger.error('No se pudo enviar el mensaje del chat de mercado', {
          scope: 'market-chat.deliverMessage',
          conversationId: id,
          messageType,
          error,
        });
        setFailedMessageIds((prev) => [...prev, message.id]);
      } finally {
        setIsSending(false);
      }
    },
    [id],
  );

  const handleSend = async (
    content?: string,
    messageType: 'TEXT' | 'TEAM_INVITE' | 'MATCH_INVITE' = 'TEXT',
  ) => {
    const textToSend = content ?? inputText.trim();
    if (!textToSend || !profile || !id) return;

    const senderTeamId = isCaptainMode && chatData ? chatData.team_id : undefined;

    const tempMsg: MarketMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: id,
      sender_profile_id: profile.id,
      sender_team_id: senderTeamId ?? null,
      content: textToSend,
      created_at: new Date().toISOString(),
      message_type: messageType,
      sender_full_name: profile.full_name ?? '',
      sender_role: null,
    };

    setMessages((prev) => [...prev, tempMsg]);
    if (!content) setInputText('');
    await deliverMessage(tempMsg, messageType, senderTeamId);
  };

  const handleInviteToTeam = () => {
    if (!teamInviteCode) return;
    setShowInviteConfirmModal(true);
  };

  const confirmInviteToTeam = () => {
    setShowInviteConfirmModal(false);
    if (teamInviteCode) handleSend(teamInviteCode, 'TEAM_INVITE');
  };

  const handleInviteToMatch = () => {
    if (!matchCode) return;
    handleSend(matchCode, 'MATCH_INVITE');
  };

  const renderMessage = useCallback(({ item }: { item: MarketMessage }) => {
    const isMine = item.sender_profile_id === profile?.id;
    const hasFailed = failedMessageIds.includes(item.id);
    // Atenuado sólo mientras viaja: si ya falló, la burbuja vuelve a opacidad
    // plena y lo que comunica el estado es el aviso de abajo.
    const isInFlight = item.id.startsWith('temp-') && !hasFailed;
    const isSpecial = item.message_type === 'TEAM_INVITE' || item.message_type === 'MATCH_INVITE';

    const roleLabel = formatRole(item.sender_role);
    const senderLabel =
      item.sender_full_name && roleLabel
        ? `${item.sender_full_name} · ${roleLabel}`
        : item.sender_full_name;
    const time = formatTime(item.created_at);

    // Colors for code block adapt to bubble side
    const codeColor = isMine ? '#003914' : '#53E076';
    const copyBg = isMine ? 'rgba(0,57,20,0.2)' : 'rgba(83,224,118,0.12)';

    const inviteHeaderText =
      item.message_type === 'TEAM_INVITE'
        ? '¡Queremos que te unas a nuestro equipo!'
        : 'Te invitamos a jugar un partido con nosotros.';
    const codeLabel =
      item.message_type === 'TEAM_INVITE' ? '🛡️ Código de equipo' : '⚽ Código de partido';

    return (
      <View className={`mb-4 px-4 flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
        {/* Long-press para denunciar, sólo sobre mensajes ajenos y ya
            confirmados por el servidor: uno optimista todavía tiene id `temp-`
            y no existe como fila, así que la denuncia fallaría con
            ENTITY_NOT_FOUND. Es un Pressable y no un Touchable para no agregar
            feedback de opacidad a cada burbuja del chat. */}
        <Pressable
          className="max-w-[80%]"
          onLongPress={
            !isMine && !item.id.startsWith('temp-') ? () => setReportMessageId(item.id) : undefined
          }
          delayLongPress={400}
          accessibilityHint={!isMine ? 'Mantené presionado para denunciar este mensaje' : undefined}
        >
          {!isMine && senderLabel ? (
            <Text className="text-neutral-on-surface-variant font-ui text-[10px] mb-1 ml-1">
              {senderLabel}
            </Text>
          ) : null}
          <View
            className={`p-3 rounded-2xl border ${isMine
              ? 'bg-brand-primary border-brand-primary rounded-tr-sm'
              : 'bg-surface-high border-surface-variant rounded-tl-sm'
              } ${isInFlight ? 'opacity-60' : ''} ${hasFailed ? 'border-danger-error/60' : ''}`}
          >
            {isSpecial ? (
              <>
                <Text
                  className={`${isMine ? 'text-[#003914]' : 'text-neutral-on-surface'} font-ui text-sm mb-2`}
                >
                  {inviteHeaderText}
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: codeColor,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: isMine
                      ? 'rgba(0,57,20,0.15)'
                      : 'rgba(83,224,118,0.07)',
                  }}
                >
                  <Text
                    style={{
                      color: codeColor,
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 6,
                      opacity: 0.7,
                    }}
                  >
                    {codeLabel}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      style={{
                        color: codeColor,
                        fontSize: 20,
                        fontWeight: '900',
                        letterSpacing: 4,
                        flex: 1,
                      }}
                    >
                      {item.content}
                    </Text>
                    <TouchableOpacity
                      onPress={() => void Clipboard.setStringAsync(item.content)}
                      style={{
                        backgroundColor: copyBg,
                        borderWidth: 1,
                        borderColor: codeColor,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: codeColor, fontSize: 10, fontWeight: 'bold' }}>
                        COPIAR
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <Text className={`${isMine ? 'text-[#003914]' : 'text-neutral-on-surface'} font-ui text-sm`}>
                {item.content}
              </Text>
            )}
            <Text
              className={`${isMine ? 'text-[#003914]' : 'text-neutral-on-surface-variant'} font-ui text-[10px] text-right mt-1 opacity-60`}
            >
              {time}
            </Text>
          </View>

          {hasFailed && (
            <TouchableOpacity
              onPress={() =>
                void deliverMessage(item, item.message_type, item.sender_team_id ?? undefined)
              }
              disabled={isSending}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              className="mt-1 flex-row items-center justify-end gap-1"
            >
              <AppIcon family="material-community" name="alert-circle-outline" size={12} color="#FFB4AB" />
              <Text className="font-ui text-[10px] text-danger-error">
                No enviado · Tocá para reintentar
              </Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </View>
    );
  }, [profile, failedMessageIds, isSending, deliverMessage]);

  const chatTitle = chatData
    ? isCaptainMode
      ? chatData.player?.full_name ?? 'Jugador'
      : chatData.team?.name ?? 'Equipo'
    : 'Cargando...';

  const resolveAvatarUrl = (path: string | null | undefined, bucket: 'avatars' | 'shields'): string | null => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return getSupabaseStorageUrl(bucket, path);
  };

  const chatAvatarUrl = chatData
    ? isCaptainMode
      ? resolveAvatarUrl(chatData.player?.avatar_url, 'avatars')
      : resolveAvatarUrl(chatData.team?.shield_url, 'shields')
    : null;

  const chatSubtitle = isCaptainMode ? 'Jugador' : 'Equipo';

  // Quién es «el otro» para moderar.
  //
  // Del lado del capitán es directo: la conversación tiene `player_id`. Del
  // lado del jugador NO hay una columna equivalente —el otro lado es un equipo,
  // y por él pueden escribir el capitán y el subcapitán— así que se toma a
  // quien efectivamente escribió. Es también lo correcto en la práctica:
  // bloquear a quien te está hablando, no a un rol abstracto.
  //
  // Sin mensajes entrantes queda en `null` y el menú no se ofrece: todavía no
  // hay nadie con quien haya pasado algo.
  const counterpartMessage = messages.find((m) => m.sender_profile_id !== profile?.id);
  const counterpartProfileId = isCaptainMode
    ? chatData?.player_id ?? null
    : counterpartMessage?.sender_profile_id ?? null;
  const counterpartName = isCaptainMode
    ? chatData?.player?.full_name ?? chatTitle
    : counterpartMessage?.sender_full_name ?? chatTitle;

  // Una sola instancia de ReportModal para los dos casos: dos `<Modal>` nativos
  // montados a la vez se tapan entre sí, y acá nunca hace falta más de uno.
  const reportEntity =
    sheet === 'report-user' && counterpartProfileId
      ? { type: 'USER' as const, id: counterpartProfileId }
      : reportMessageId
        ? { type: 'MESSAGE' as const, id: reportMessageId }
        : null;

  const closeReport = () => {
    setSheet('none');
    setReportMessageId(null);
  };

  return (
    <View className="flex-1 bg-surface-base">
      {/* El nombre del interlocutor pasa por el `uppercase` del SecondaryHeader
          y hereda el inset real en lugar del `pt-10` fijo. El avatar va en el
          slot de acciones: es identidad del chat, no una accion, pero es el
          unico lugar donde no compite por ancho con un nombre largo. */}
      {/* La altura se mide, no se asume: alimenta el offset del KAV. */}
      <View>
      <SecondaryHeader
        title={chatTitle}
        subtitle={chatData ? chatSubtitle : undefined}
        rightSlot={
          chatData ? (
            <View className="flex-row items-center gap-2">
              {counterpartProfileId && (
                <TouchableOpacity
                  onPress={() => setSheet('actions')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Opciones del chat"
                >
                  <AppIcon family="material-community" name="dots-vertical" size={22} color="#869585" />
                </TouchableOpacity>
              )}
              {chatAvatarUrl ? (
              <Image
                source={{ uri: chatAvatarUrl }}
                style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076' }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-brand-primary font-uiBold text-sm">
                  {getInitials(chatTitle)}
                </Text>
              </View>
              )}
            </View>
          ) : null
        }
      />
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#00E65B" />
        </View>
      ) : (
        // Sin KeyboardAvoidingView: el empuje lo hace el padding de la barra de
        // input (`useKeyboardAwareBottomInset`), calculado desde el alto real del
        // teclado. El KAV medía su propio frame contra la coordenada absoluta del
        // teclado, y esas dos coordenadas sólo coinciden si el contenedor llega
        // justo al borde inferior de la pantalla.
        <View className="flex-1">
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 16 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-16">
                <Text className="text-neutral-on-surface-variant font-ui text-sm text-center">
                  Aún no hay mensajes.{'\n'}¡Rompé el hielo!
                </Text>
              </View>
            }
          />

          {/* Barra de acciones + input. Mismo patrón que el chat de partido: el
              hook es el único dueño del espacio inferior — aire sobre la gesture
              bar en reposo, y el alto del teclado cuando está abierto. */}
          <View
            className="px-4 pt-4 bg-surface-low border-t border-surface-high"
            style={{ paddingBottom: inputBottomInset }}
          >
            {isCaptainMode && (
              <View className="flex-row gap-2 mb-3">
                {isLoadingCodes ? (
                  <View className="flex-1 items-center py-2">
                    <ActivityIndicator size="small" color="#00E65B" />
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      className={`flex-1 py-2 rounded-lg items-center border ${teamInviteCode
                        ? 'bg-brand-primary/10 border-brand-primary/20'
                        : 'bg-surface-high border-transparent opacity-40'
                        }`}
                      onPress={handleInviteToTeam}
                      disabled={!teamInviteCode || isSending}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`text-xs font-uiBold ${teamInviteCode ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}
                      >
                        Invitar a Equipo
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className={`flex-1 py-2 rounded-lg items-center border ${matchCode
                        ? 'bg-surface-high border-surface-variant'
                        : 'bg-surface-high border-transparent opacity-40'
                        }`}
                      onPress={handleInviteToMatch}
                      disabled={!matchCode || isSending}
                      activeOpacity={0.7}
                    >
                      <Text
                        className={`text-xs font-ui ${matchCode ? 'text-neutral-on-surface' : 'text-neutral-on-surface-variant'}`}
                      >
                        {matchCode ? 'Invitar a Partido' : 'Sin partido confirmado'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Input de mensaje */}
            <View className="flex-row items-center gap-2">
              <TextInput
                className="flex-1 bg-surface-high text-neutral-on-surface p-4 rounded-full font-ui"
                placeholder="Escribe un mensaje..."
                placeholderTextColor="#88998D"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                className={`w-12 h-12 rounded-full items-center justify-center ${inputText.trim() && !isSending ? 'bg-brand-primary' : 'bg-surface-high'
                  }`}
                onPress={() => handleSend()}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.8}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#00E65B" />
                ) : (
                  <AppIcon
                    family="material-icons"
                    name="send"
                    size={24}
                    color={inputText.trim() ? '#003914' : '#88998D'}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <Modal
        visible={showInviteConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInviteConfirmModal(false)}
      >
        <View className="flex-1 bg-black/65 items-center justify-center px-6">
          <View className="w-full rounded-2xl border border-surface-high bg-surface-container p-5">
            <Text className="text-neutral-on-surface font-displayBlack text-lg mb-2">
              Invitar a tu equipo
            </Text>
            <Text className="text-neutral-on-surface-variant font-ui text-sm mb-5">
              ¿Confirmás que querés invitar a este jugador? Se le va a enviar el código de invitación.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowInviteConfirmModal(false)}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl bg-surface-high items-center"
              >
                <Text className="text-neutral-on-surface font-uiBold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmInviteToTeam}
                activeOpacity={0.8}
                className="flex-1 py-3 rounded-xl bg-brand-primary items-center"
              >
                <Text className="font-uiBold" style={{ color: '#003914' }}>Sí, invitar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {counterpartProfileId && (
        <UserActionsSheet
          visible={sheet === 'actions'}
          onClose={() => setSheet('none')}
          targetProfileId={counterpartProfileId}
          targetName={counterpartName}
          // Si hubiera un bloqueo, el trigger del servidor no dejaría escribir y
          // la conversación ni siquiera estaría en la bandeja. Todo chat que se
          // puede abrir es con alguien no bloqueado.
          isBlocked={false}
          onReport={() => setSheet('report-user')}
          // Al bloquear, la conversación desaparece del inbox por el filtro de
          // `get_market_inbox`. Se vuelve atrás en vez de quedarse en un chat
          // que ya no existe para el usuario.
          onBlockChanged={() => router.back()}
        />
      )}

      {reportEntity && (
        <ReportModal
          visible
          onClose={closeReport}
          entityType={reportEntity.type}
          entityId={reportEntity.id}
        />
      )}
    </View>
  );
}
