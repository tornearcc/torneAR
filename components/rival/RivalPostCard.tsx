import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { TeamShield } from '@/components/ui/TeamShield';
import { AppIcon } from '@/components/ui/AppIcon';
import type { RivalPost } from '@/lib/rival-posts-api';
import {
  formatDistanceKm,
  formatPublishedAgo,
  longFormat,
  matchTypePrefLabel,
} from '@/lib/rival-posts-utils';

interface Props {
  post: RivalPost;
  index?: number;
  /** Ajena: abre la ficha del equipo. Propia: abre la edición. */
  onPress: (post: RivalPost) => void;
}

function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'info' | 'warning' }) {
  const toneClass =
    tone === 'info'
      ? 'bg-info-secondary/10'
      : tone === 'warning'
        ? 'bg-warning-tertiary/10'
        : 'bg-surface-high';
  const textClass =
    tone === 'info'
      ? 'text-info-secondary'
      : tone === 'warning'
        ? 'text-warning-tertiary'
        : 'text-neutral-on-surface';
  return (
    <View className={`rounded-lg px-2 py-1 ${toneClass}`}>
      <Text className={`font-uiBold text-[11px] ${textClass}`}>{label}</Text>
    </View>
  );
}

/** Tarjeta de Mercado › Buscan rival. Es una vidriera: no hay «aceptar». */
export function RivalPostCard({ post, index = 0, onPress }: Props) {
  const distance = formatDistanceKm(post.distanceKm);
  const subtitle = [post.postZone, distance, formatPublishedAgo(post.publishedAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={{ marginBottom: 14 }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onPress(post)}
        accessibilityRole="button"
        accessibilityLabel={post.isOwn ? 'Editar tu publicación' : `Ver equipo ${post.teamName}`}
        className={`rounded-2xl p-4 ${post.isOwn ? 'border border-brand-primary/40' : ''}`}
        style={{ backgroundColor: '#1C1C1C' }}
      >
        <View className="flex-row items-center gap-3">
          <TeamShield shieldUrl={post.shieldUrl} size={48} name={post.teamName} />
          <View className="flex-1">
            <Text className="font-displayBlack text-lg uppercase leading-5 text-neutral-on-surface" numberOfLines={1}>
              {post.teamName}
            </Text>
            <Text className="mt-0.5 font-ui text-xs text-neutral-on-surface-variant" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row flex-wrap gap-1.5">
          <Chip label={longFormat(post.format)} />
          <Chip label={capitalizeFirst(post.whenLabel)} />
          {post.venueName ? (
            <Chip label={`Cancha: ${post.venueName}`} tone="info" />
          ) : (
            <Chip label="Sin cancha" tone="warning" />
          )}
          <Chip label={matchTypePrefLabel(post.matchTypePref)} />
        </View>

        {post.note ? (
          <Text className="mt-3 font-ui text-[13px] leading-5 text-neutral-on-surface-variant">
            «{post.note}»
          </Text>
        ) : null}

        <View className="mt-3 flex-row items-center justify-between border-t border-surface-high pt-3">
          <View className="flex-row gap-3.5">
            <Text className="font-ui text-xs text-neutral-on-surface-variant">
              <Text className="font-uiBold text-neutral-on-surface">{post.eloRating}</Text> ELO
            </Text>
            <Text className="font-ui text-xs text-neutral-on-surface-variant">
              <Text className="font-uiBold text-neutral-on-surface">{post.matchesPlayed}</Text> PJ
            </Text>
            <Text className="font-ui text-xs text-neutral-on-surface-variant">
              <Text className="font-uiBold text-neutral-on-surface">{post.memberCount}</Text>{' '}
              {post.memberCount === 1 ? 'jugador' : 'jugadores'}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Text className="font-uiBold text-xs text-brand-primary">
              {post.isOwn ? 'Editar' : 'Ver equipo'}
            </Text>
            <AppIcon family="material-icons" name="chevron-right" size={16} color="#53E076" />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
