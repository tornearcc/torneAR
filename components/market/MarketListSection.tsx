import React from 'react';
import { View, FlatList, Text, RefreshControl } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketTeamCard, MarketPlayerCard } from '@/components/market/MarketCards';
import { MarketCardSkeleton } from '@/components/market/MarketCardSkeleton';
import { MarketTeamPost, MarketPlayerPost } from '@/lib/market-api';
import type { PostLocation } from '@/lib/market-distance';
import { TabType, type MarketModerationTarget } from './types';

interface MarketListSectionProps {
  isLoading: boolean;
  isRefreshing: boolean;
  posts: (MarketTeamPost | MarketPlayerPost)[];
  activeTab: TabType;
  currentProfileId: string;
  onRefresh: () => void;
   onContactTeam: (teamId: string, postId: string) => void;
  onContactPlayer: (playerProfileId: string, postId: string) => void;
  onViewTeamStats: (teamId: string) => void;
  onViewPlayerStats: (profileId: string) => void;
  onDeletePost: (postId: string, isTeamPost: boolean) => void;
  onViewApplications: (postId: string, postType: 'TEAM' | 'PLAYER') => void;
  /**
   * Abre el menú de moderación sobre una publicación ajena. El target se arma
   * acá porque el autor sale de una columna distinta en cada feed —`created_by`
   * en las ofertas de equipo, `profile_id` en las de jugador— y ese detalle no
   * tiene por qué subir hasta la pantalla.
   */
  onModeratePost: (target: MarketModerationTarget) => void;
  memberStatusMap?: Record<string, 'own_team' | 'own_player'>;
  applicationCounts?: Record<string, number>;
  /**
   * Etiqueta de distancia de una publicación. Viene resuelta de
   * `useDistanceResolver` para que el origen sea el mismo que en los selectores
   * de complejo. Ver `lib/market-distance`.
   */
  resolveDistanceLabel?: (post: PostLocation) => string | null;
}

export function MarketListSection({
  isLoading,
  isRefreshing,
  posts,
  activeTab,
  currentProfileId,
  onRefresh,
   onContactTeam,
  onContactPlayer,
  onViewTeamStats,
  onViewPlayerStats,
  onDeletePost,
  onViewApplications,
  onModeratePost,
  memberStatusMap,
  applicationCounts,
  resolveDistanceLabel,
}: MarketListSectionProps) {
  if (isLoading) {
    return (
      <View style={{ paddingBottom: 100 }}>
        <MarketCardSkeleton />
        <MarketCardSkeleton />
        <MarketCardSkeleton />
        <MarketCardSkeleton />
      </View>
    );
  }

  const renderItem = ({ item, index }: { item: MarketTeamPost | MarketPlayerPost; index: number }) => {
    if (activeTab === 'TEAMS_LOOKING') {
      const post = item as MarketTeamPost;
      const isOwner = post.created_by === currentProfileId;
      const memberStatus = memberStatusMap?.[post.id];
      return (
        <MarketTeamCard
          postId={post.id}
          teamName={post.teams?.name ?? 'Equipo'}
          teamZone={post.teams?.zone}
          matchZone={post.zone}
          logoUrl={post.teams?.shield_url}
          positionWanted={post.position_wanted}
          pitchType={post.pitch_type}
          description={post.description}
          matchDate={post.match_date}
          matchTime={post.match_time}
          complex={post.complex}
           isOwner={isOwner}
          memberStatus={memberStatus}
          index={index}
          onPressAction={() => onContactTeam(post.team_id, post.id)}
          onPressStats={() => onViewTeamStats(post.team_id)}
          onDelete={() => onDeletePost(post.id, true)}
          applicationCount={applicationCounts?.[post.id]}
          onViewApplications={() => onViewApplications(post.id, 'TEAM')}
          onPressModerate={
            isOwner
              ? undefined
              : () =>
                  onModeratePost({
                    postId: post.id,
                    entityType: 'MARKET_TEAM_POST',
                    authorProfileId: post.created_by,
                    authorName: post.teams?.name ?? 'Equipo',
                  })
          }
          distanceLabel={
            resolveDistanceLabel?.({
              // Coordenadas exactas cuando el aviso está enlazado al catálogo
              // por `venue_id`; si no, el helper cae al match por nombre y
              // después al centroide de la zona.
              coords:
                post.venues?.lat != null && post.venues?.lng != null
                  ? { lat: post.venues.lat, lng: post.venues.lng }
                  : null,
              zone: post.zone,
              complex: post.complex,
            }) ?? null
          }
        />
      );
    } else {
      const post = item as MarketPlayerPost;
      const isOwner = post.profile_id === currentProfileId;
      const memberStatus = memberStatusMap?.[post.id];
      return (
        <MarketPlayerCard
          postId={post.id}
          playerName={post.profiles?.full_name ?? 'Jugador'}
          username={post.profiles?.username ?? 'user'}
          avatarUrl={post.profiles?.avatar_url}
          position={post.position}
          postType={post.post_type}
          description={post.description}
           isOwner={isOwner}
          memberStatus={memberStatus}
          index={index}
          onPressAction={() => onContactPlayer(post.profile_id, post.id)}
          onPressStats={() => onViewPlayerStats(post.profile_id)}
          onDelete={() => onDeletePost(post.id, false)}
          applicationCount={applicationCounts?.[post.id]}
          onViewApplications={() => onViewApplications(post.id, 'PLAYER')}
          onPressModerate={
            isOwner
              ? undefined
              : () =>
                  onModeratePost({
                    postId: post.id,
                    entityType: 'MARKET_PLAYER_POST',
                    authorProfileId: post.profile_id,
                    authorName: post.profiles?.full_name ?? 'Jugador',
                  })
          }
        />
      );
    }
  };

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor="#00E65B"
          colors={['#00E65B']}
        />
      }
      /* `flex-1` en el contenedor sólo centra si el contenedor tiene alto que
         repartir: sin esto el vacío quedaba pegado arriba con todo el espacio
         libre debajo. */
      contentContainerStyle={{ paddingTop: 0, paddingBottom: 100, flexGrow: 1 }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center px-8 py-20">
          <AppIcon family="material-community" name="soccer-field" size={64} color="#869585" />
          <Text className="font-displayBlack mt-5 text-center text-lg uppercase tracking-wide text-neutral-on-surface">
            {activeTab === 'TEAMS_LOOKING' ? 'Ningún equipo busca jugadores' : 'Ningún jugador busca equipo'}
          </Text>
          <Text className="font-ui mt-2 text-center text-sm leading-5 text-neutral-outline">
            {activeTab === 'TEAMS_LOOKING'
              ? 'Probá quitando filtros o volvé más tarde: las publicaciones aparecen apenas un capitán arma partido.'
              : 'Probá quitando filtros o volvé más tarde. También podés publicar que buscás equipo con el botón +.'}
          </Text>
        </View>
      }
    />
  );
}
