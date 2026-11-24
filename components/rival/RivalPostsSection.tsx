import React from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { MarketCardSkeleton } from '@/components/market/MarketCardSkeleton';
import { RivalPostCard } from './RivalPostCard';
import type { RivalPost } from '@/lib/rival-posts-api';
import { formatExpiresIn } from '@/lib/rival-posts-utils';

interface Props {
  posts: RivalPost[];
  isLoading: boolean;
  isRefreshing: boolean;
  /** Capitán o subcapitán de algún equipo: puede publicar. */
  canPublish: boolean;
  onRefresh: () => void;
  onPressPost: (post: RivalPost) => void;
  onPublish: () => void;
}

function OwnPostBanner({ post, onEdit }: { post: RivalPost; onEdit: () => void }) {
  const alerted =
    post.alertedCount > 0
      ? ` · avisamos a ${post.alertedCount} ${post.alertedCount === 1 ? 'equipo' : 'equipos'} cerca`
      : '';
  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-2xl border border-dashed border-brand-primary/50 bg-brand-primary/10 p-3">
      <View className="flex-1">
        <Text className="font-uiBold text-xs text-brand-primary">TU PUBLICACIÓN ESTÁ VISIBLE</Text>
        <Text className="mt-0.5 font-ui text-xs text-neutral-on-surface-variant">
          {post.teamName} · {formatExpiresIn(post.expiresAt)}
          {alerted}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onEdit}
        activeOpacity={0.8}
        className="rounded-xl border border-brand-primary px-3 py-2"
      >
        <Text className="font-uiBold text-xs text-brand-primary">Editar</Text>
      </TouchableOpacity>
    </View>
  );
}

function PublishPrompt({ onPublish }: { onPublish: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPublish}
      activeOpacity={0.85}
      className="mb-3 flex-row items-center gap-3 rounded-2xl bg-surface-container p-4"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-primary/15">
        <AppIcon family="material-community" name="bullhorn-outline" size={22} color="#53E076" />
      </View>
      <View className="flex-1">
        <Text className="font-uiBold text-sm text-neutral-on-surface">¿Están para jugar?</Text>
        <Text className="mt-0.5 font-ui text-xs leading-4 text-neutral-on-surface-variant">
          Publicalo y les avisamos a los equipos de tu zona.
        </Text>
      </View>
      <AppIcon family="material-icons" name="chevron-right" size={22} color="#53E076" />
    </TouchableOpacity>
  );
}

/** Mercado › Buscan rival. */
export function RivalPostsSection({
  posts,
  isLoading,
  isRefreshing,
  canPublish,
  onRefresh,
  onPressPost,
  onPublish,
}: Props) {
  if (isLoading) {
    return (
      <View>
        {Array.from({ length: 3 }).map((_, i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </View>
    );
  }

  const own = posts.find((post) => post.isOwn) ?? null;
  const others = posts.filter((post) => !post.isOwn);

  const header = own ? (
    <OwnPostBanner post={own} onEdit={() => onPressPost(own)} />
  ) : canPublish ? (
    <PublishPrompt onPublish={onPublish} />
  ) : null;

  return (
    <FlatList
      data={others}
      keyExtractor={(item) => item.teamId}
      renderItem={({ item, index }) => <RivalPostCard post={item} index={index} onPress={onPressPost} />}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#00E65B" colors={['#00E65B']} />
      }
      contentContainerStyle={{ paddingTop: 0, paddingBottom: 100, flexGrow: 1 }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center px-8 py-16">
          <AppIcon family="material-community" name="sword-cross" size={56} color="#869585" />
          <Text className="font-displayBlack mt-5 text-center text-lg uppercase tracking-wide text-neutral-on-surface">
            Nadie busca rival por ahora
          </Text>
          <Text className="font-ui mt-2 text-center text-sm leading-5 text-neutral-outline">
            {canPublish
              ? 'Publicá que tu equipo está para jugar y les avisamos a los equipos cerca.'
              : 'Probá quitando filtros o volvé más tarde.'}
          </Text>
        </View>
      }
    />
  );
}
