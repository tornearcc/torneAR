import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { GlobalLoader } from '@/components/GlobalLoader';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useAuth } from '@/context/AuthContext';
import { ActiveTeamSelector } from '@/components/ui/ActiveTeamSelector';
import { useTeamStore } from '@/stores/teamStore';
import {
  fetchInbox,
  MarketConversation,
} from '@/lib/chat-api';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { Logger } from '@/lib/logger';

type ChatFilter = 'ALL' | 'TEAMS' | 'PLAYERS';

export default function MarketInboxScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  // `myTeams` se carga en app/(tabs)/_layout.tsx; aca alcanza con el equipo activo.
  const activeTeamId = useTeamStore((state) => state.activeTeamId);

  const [chats, setChats] = useState<MarketConversation[]>([]);
  const [chatFilter, setChatFilter] = useState<ChatFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { showAlert, AlertComponent } = useCustomAlert();

  const loadData = useCallback(async () => {
    try {
      const inbox = await fetchInbox();
      setChats(inbox);
    } catch (error) {
      Logger.error('No se pudo cargar la bandeja de chats del mercado', {
        scope: 'market-chats.index.loadData',
        error,
      });
      showAlert('Error', 'No se pudieron cargar los chats.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showAlert]);

  useFocusEffect(
    useCallback(() => {
      if (user) void loadData();
    }, [user, loadData])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const isActingAsCaptain = (chat: MarketConversation) =>
    profile ? chat.player_id !== profile.id : false;

  const displayedChats = chats.filter((chat) => {
    const actingAsCaptain = isActingAsCaptain(chat);

    // Captain-side chats follow the currently selected team.
    if (actingAsCaptain && activeTeamId && chat.team_id !== activeTeamId) {
      return false;
    }

    if (chatFilter === 'ALL') return true;
    if (chatFilter === 'TEAMS') return !actingAsCaptain;
    if (chatFilter === 'PLAYERS') return actingAsCaptain;
    return true;
  });

  const resolveAvatar = (avatar: string | null | undefined, asCaptain: boolean) => {
    if (!avatar) return null;
    if (avatar.startsWith('http')) return avatar;
    return asCaptain
      ? getSupabaseStorageUrl('avatars', avatar)
      : getSupabaseStorageUrl('shields', avatar);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (diffDays === 1) return 'AYER';
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).toUpperCase();
  };

  const renderItem = ({ item }: { item: MarketConversation }) => {
    const asCaptain = isActingAsCaptain(item);

    const title = asCaptain
      ? (item.player?.full_name ?? 'Jugador')
      : (item.team?.name ?? 'Equipo');

    const previewText = item.last_msg_content?.trim() || 'Iniciá la conversación';

    const avatar = resolveAvatar(asCaptain ? item.player?.avatar_url : item.team?.shield_url, asCaptain);
    const dateLabel = formatDate(item.last_msg_at ?? item.created_at);

    return (
      <TouchableOpacity
        className="flex-row items-center px-4 py-3 mb-2 rounded-2xl"
        style={{ backgroundColor: '#1A1F1A' }}
        onPress={() => router.push(`/market-chats/${item.id}` as any)}
        activeOpacity={0.7}
      >
        {/* Usamos style explícito para garantizar las dimensiones y borderRadius.
            La foto (jugador o escudo, según el lado) abre el visor; el resto de
            la fila, el chat. */}
        {avatar ? (
          <ExpandablePhoto
            uri={avatar}
            subject={asCaptain
              ? { kind: 'avatar', profileId: item.player_id }
              : { kind: 'shield', teamId: item.team_id }}
            title={title}
          >
            <Image
              source={{ uri: avatar }}
              className="shrink-0 bg-surface-high"
              style={{ width: 48, height: 48, borderRadius: 24 }}
              contentFit="cover"
            />
          </ExpandablePhoto>
        ) : (
          <View 
            className="shrink-0 bg-surface-high items-center justify-center"
            style={{ width: 48, height: 48, borderRadius: 24 }}
          >
            <AppIcon
              family="material-community"
              name={asCaptain ? 'account' : 'shield-account'}
              size={24}
              color="#88998D"
            />
          </View>
        )}

        <View className="ml-4 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-neutral-on-surface font-uiBold text-base" numberOfLines={1}>
              {title}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-brand-primary text-[12px] font-uiBold">{dateLabel}</Text>
              {item.unread && (
                <View className="w-2 h-2 rounded-full bg-brand-primary ml-1 mt-0.5 shrink-0" />
              )}
            </View>
          </View>

          <Text className="text-neutral-on-surface-variant text-sm font-ui" numberOfLines={1}>
            {previewText}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-surface-base">
      {/* `pt-10` fijo reemplazado por el inset real que aplica SecondaryHeader. */}
      <SecondaryHeader title="Mis Chats de Mercado" rightSlot={<ActiveTeamSelector />} />

      <View className="px-4 pt-3 pb-3">
        <View className="flex-row gap-2 p-1 bg-surface-low rounded-xl">
          {([
            { key: 'ALL', label: 'Todos' },
            { key: 'TEAMS', label: 'Equipos' },
            { key: 'PLAYERS', label: 'Jugadores' },
          ] as const).map((item) => {
            const active = chatFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setChatFilter(item.key)}
                className="flex-1 py-2.5 rounded-lg items-center"
                style={active ? { backgroundColor: '#53E076' } : undefined}
                activeOpacity={0.8}
              >
                <Text className="font-uiBold text-sm" style={{ color: active ? '#003914' : '#BCCBB9' }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 mt-10">
          <GlobalLoader label="Cargando chats" />
        </View>
      ) : displayedChats.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <AppIcon family="material-community" name="chat-outline" size={48} color="#3F4943" />
          <Text className="text-neutral-on-surface-variant font-ui text-base text-center mt-4">
            No tenés chats activos.
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedChats}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 22 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#00E65B"
              colors={['#00E65B']}
            />
          }
        />
      )}

      {AlertComponent}
    </View>
  );
}
