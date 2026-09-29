import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { useKeyboardAwareBottomInset } from '@/hooks/useKeyboardAwareBottomInset';
import { fetchMessages, sendMessage, markConversationAsRead } from '@/lib/chat-api';
import { isTeamMatchStaff } from '@/lib/match-permissions';
import type { MarketMessage } from '@/lib/chat-api';

interface MatchChatHeader {
  teamAName: string;
  teamBName: string;
  uniqueCode: string;
  myTeamId: string;
  matchId: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function MatchChatScreen() {
  const { conversationId, myTeamId: paramTeamId } = useLocalSearchParams<{
    conversationId: string;
    myTeamId?: string;
  }>();
  const { profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const inputBottomInset = useKeyboardAwareBottomInset();

  const [header, setHeader] = useState<MatchChatHeader | null>(null);
  const [messages, setMessages] = useState<MarketMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [isSending, setIsSending] = useState(false);
  // Si `init` falla, la pantalla quedaba con el header vacio y una lista sin
  // mensajes: indistinguible de un chat legitimamente vacio. Ahora el fallo es
  // explicito y reintentable.
  const [loadError, setLoadError] = useState(false);
  // A13: mensajes optimistas que no se pudieron entregar. Estado efímero y local
  // a la pantalla a propósito — no es dominio y no sobrevive a salir del chat.
  const [failedMessageIds, setFailedMessageIds] = useState<string[]>([]);
  const [retryToken, setRetryToken] = useState(0);

  // Derive effective myTeamId (from param or from match membership)
  const [myTeamId, setMyTeamId] = useState<string>(paramTeamId ?? '');
  // En el chat del partido escriben capitán, subcapitán y DT (policy de INSERT
  // de `messages`, migración 20260929130000). Antes todos veían el campo y al
  // jugador el envío le fallaba para siempre. Si el rol no se pudo leer se
  // muestra el campo igual: la base es la que decide.
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => {
    if (!conversationId || !profile) return;

    const init = async () => {
      setLoadingInit(true);
      setLoadError(false);
      try {
        // 1. Fetch conversation to get match_id
        const { data: conv, error: convErr } = await supabase
          .from('conversations')
          .select('match_id')
          .eq('id', conversationId)
          .single();
        if (convErr || !conv?.match_id) throw convErr ?? new Error('Conversación no encontrada');

        const matchId = conv.match_id as string;

        // 2. Fetch match with team names
        const { data: match, error: matchErr } = await supabase
          .from('matches')
          .select('team_a_id, team_b_id, unique_code, team_a:teams!team_a_id(name), team_b:teams!team_b_id(name)')
          .eq('id', matchId)
          .single();
        if (matchErr || !match) throw matchErr ?? new Error('Partido no encontrado');

        const raw = match as unknown as {
          team_a_id: string;
          team_b_id: string;
          unique_code: string;
          team_a: { name: string };
          team_b: { name: string };
        };

        // 3. Determine myTeamId if not passed as param, and my role in it
        const { data: memberships, error: membershipErr } = await supabase
          .from('team_members')
          .select('team_id, role')
          .in('team_id', [raw.team_a_id, raw.team_b_id])
          .eq('profile_id', profile.id);
        const myMembership =
          memberships?.find((m) => m.team_id === paramTeamId) ?? memberships?.[0];
        const resolvedTeamId = paramTeamId || myMembership?.team_id || raw.team_a_id;
        setMyTeamId(resolvedTeamId);
        setCanWrite(membershipErr !== null || !myMembership || isTeamMatchStaff(myMembership.role));

        setHeader({
          teamAName: raw.team_a.name,
          teamBName: raw.team_b.name,
          uniqueCode: raw.unique_code,
          myTeamId: resolvedTeamId,
          matchId,
        });

        // 4. Load messages
        const msgs = await fetchMessages(conversationId, resolvedTeamId);
        setMessages(msgs);

        // 5. Mark as read
        try {
          await markConversationAsRead(conversationId);
        } catch (readError) {
          // No fatal para esta pantalla, pero deja el badge de no leídos
          // inflado para siempre en la lista de conversaciones.
          Logger.warn('No se pudo marcar la conversación como leída', {
            scope: 'chat',
            conversationId,
            error: readError,
          });
        }
      } catch (err) {
        Logger.error('No se pudo cargar el chat del partido', {
          scope: 'chat',
          conversationId,
          error: err,
        });
        setLoadError(true);
      } finally {
        setLoadingInit(false);
      }
    };

    void init();

    // Real-time subscription
    const channel = supabase
      .channel(`match_chat_${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as MarketMessage;
          if (msg.sender_profile_id !== profile.id) {
            setMessages((prev) => [...prev, msg]);
            markConversationAsRead(conversationId).catch((readError: unknown) => {
              Logger.warn('No se pudo marcar como leído el mensaje entrante', {
                scope: 'chat.realtime',
                conversationId,
                error: readError,
              });
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, profile, paramTeamId, retryToken]);

  /**
   * Entrega (o reintenta) un mensaje ya pintado de forma optimista.
   *
   * Antes, al fallar, la burbuja se borraba de la lista: lo que el usuario había
   * escrito simplemente se esfumaba, sin aviso ni forma de recuperarlo
   * (auditoría E2E, módulo 3.3). Ahora queda visible y marcada, y el tap la
   * reintenta con el mismo contenido.
   */
  const deliverMessage = useCallback(
    async (message: MarketMessage) => {
      if (!conversationId) return;

      setFailedMessageIds((prev) => prev.filter((id) => id !== message.id));
      setIsSending(true);
      try {
        const realMsg = await sendMessage(conversationId, message.content, myTeamId || undefined);
        Logger.info('Mensaje enviado en el chat del partido', {
          scope: 'chat.deliverMessage',
          conversationId,
          messageId: realMsg.id,
          senderTeamId: myTeamId || null,
        });
        setMessages((prev) => prev.map((m) => (m.id === message.id ? realMsg : m)));
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (err) {
        Logger.error('No se pudo enviar el mensaje del chat de partido', {
          scope: 'chat.deliverMessage',
          conversationId,
          error: err,
        });
        setFailedMessageIds((prev) => [...prev, message.id]);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, myTeamId],
  );

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || !profile || !conversationId) return;

    const tempMsg: MarketMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_profile_id: profile.id,
      sender_team_id: myTeamId || null,
      content: text,
      created_at: new Date().toISOString(),
      message_type: 'TEXT',
      sender_full_name: profile.full_name ?? '',
      sender_role: null,
    };

    setMessages((prev) => [...prev, tempMsg]);
    setInputText('');
    void deliverMessage(tempMsg);
  };

  const renderMessage = useCallback(({ item }: { item: MarketMessage }) => {
    const isMine = item.sender_profile_id === profile?.id;
    const hasFailed = failedMessageIds.includes(item.id);
    // Atenuado sólo mientras viaja: si ya falló, la burbuja vuelve a opacidad
    // plena y lo que comunica el estado es el aviso de abajo.
    const isInFlight = item.id.startsWith('temp-') && !hasFailed;

    // Show which team sent the message
    const senderLabel = isMine
      ? null
      : item.sender_full_name
        ? item.sender_full_name
        : 'Rival';

    return (
      <View className={`mb-3 px-4 flex-row ${isMine ? 'justify-end' : 'justify-start'}`}>
        <View className="max-w-[80%]">
          {!isMine && senderLabel && (
            <Text className="font-ui text-[10px] text-neutral-on-surface-variant mb-1 ml-1">
              {senderLabel}
            </Text>
          )}
          <View
            className={`rounded-2xl px-3 py-2.5 ${
              isMine
                ? 'bg-brand-primary rounded-tr-sm'
                : 'bg-surface-high rounded-tl-sm'
            } ${isInFlight ? 'opacity-60' : ''} ${
              hasFailed ? 'border border-danger-error/60' : ''
            }`}
          >
            <Text
              className={`font-ui text-sm ${isMine ? 'text-[#003914]' : 'text-neutral-on-surface'}`}
            >
              {item.content}
            </Text>
            <Text
              className={`font-ui text-[10px] text-right mt-1 opacity-60 ${
                isMine ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
              }`}
            >
              {formatTime(item.created_at)}
            </Text>
          </View>

          {hasFailed && (
            <TouchableOpacity
              onPress={() => void deliverMessage(item)}
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
        </View>
      </View>
    );
  }, [profile, failedMessageIds, isSending, deliverMessage]);

  const headerTitle = header
    ? `${header.teamAName} vs ${header.teamBName}`
    : 'Chat del partido';

  return (
    <View className="flex-1 bg-surface-base">
      <View>
        <SecondaryHeader
          title={headerTitle}
          subtitle={header ? `Código: ${header.uniqueCode}` : undefined}
          rightSlot={<AppIcon family="material-community" name="soccer" size={20} color="#53E076" />}
        />
      </View>

      {loadingInit ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#53E076" />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState
            icon="wifi-off"
            title="No se pudo cargar el chat"
            description="Revisá tu conexión e intentá de nuevo. Si el problema sigue, salí y volvé a entrar al partido."
            actionLabel="Reintentar"
            onAction={() => setRetryToken((token) => token + 1)}
          />
        </View>
      ) : (
        // Sin KeyboardAvoidingView: el empuje lo hace el padding de la barra de
        // input (`useKeyboardAwareBottomInset`), calculado desde el alto real del
        // teclado. Esta pantalla se presenta como modal —una hoja desplazada
        // hacia abajo— y el KAV empujaba de menos por exactamente ese
        // desplazamiento, porque mide su propio frame contra la coordenada
        // absoluta del teclado: de ahí el input tapado a medias.
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
              <View className="items-center justify-center py-16 px-6">
                <AppIcon family="material-community" name="chat-outline" size={40} color="#869585" />
                <Text className="font-ui mt-3 text-center text-sm text-neutral-on-surface-variant">
                  Aún no hay mensajes.{'\n'}¡Coordiná los detalles del partido acá!
                </Text>
              </View>
            }
          />

          {/* Input bar. El padding inferior sale del hook, que es el único dueño
              de ese espacio: aire sobre la gesture bar en reposo, y el alto del
              teclado cuando está abierto. */}
          {!canWrite ? (
            <View
              className="flex-row items-center gap-2 border-t border-surface-high bg-surface-low px-4 pt-4"
              style={{ paddingBottom: inputBottomInset }}
            >
              <AppIcon family="material-community" name="eye-outline" size={18} color="#869585" />
              <Text className="flex-1 font-ui text-xs text-neutral-on-surface-variant">
                En el chat del partido escriben el capitán, el subcapitán y el DT de cada equipo. Vos podés leer todo.
              </Text>
            </View>
          ) : (
            <View
              className="flex-row items-center gap-2 border-t border-surface-high bg-surface-low px-4 pt-4"
              style={{ paddingBottom: inputBottomInset }}
            >
              <TextInput
                className="flex-1 rounded-full bg-surface-high px-4 py-3 font-ui text-sm text-neutral-on-surface"
                placeholder="Escribí un mensaje..."
                placeholderTextColor="#869585"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={() => void handleSend()}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.8}
                className={`h-11 w-11 items-center justify-center rounded-full ${
                  inputText.trim() && !isSending ? 'bg-brand-primary' : 'bg-surface-high'
                }`}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#53E076" />
                ) : (
                  <AppIcon
                    family="material-community"
                    name="send"
                    size={20}
                    color={inputText.trim() ? '#003914' : '#869585'}
                  />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
