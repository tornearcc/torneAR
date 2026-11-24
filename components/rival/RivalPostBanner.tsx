import React from 'react';
import { View, Text } from 'react-native';
import type { RivalPost } from '@/lib/rival-posts-api';
import { longFormat } from '@/lib/rival-posts-utils';

interface Props {
  post: RivalPost;
}

/**
 * «Busca rival» en la ficha del equipo (team-stats). Le dice al que llega desde
 * la vidriera, el ranking o el aviso que este equipo está para jugar y cuándo;
 * el desafío sale con los botones de siempre, más abajo.
 */
export function RivalPostBanner({ post }: Props) {
  const where = post.venueName ? `tienen cancha en ${post.venueName}` : `en ${post.postZone}, sin cancha`;
  return (
    <View className="mb-4 flex-row gap-3 rounded-2xl border border-brand-primary/45 bg-brand-primary/10 px-4 py-3">
      <View className="mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-primary" />
      <View className="flex-1">
        <Text className="font-uiBold text-[13px] text-brand-primary">BUSCA RIVAL</Text>
        <Text className="mt-0.5 font-ui text-[13px] leading-5 text-neutral-on-surface">
          {capitalize(post.whenLabel)} · {longFormat(post.format)} · {where}
        </Text>
        {post.note ? (
          <Text className="mt-1 font-ui text-xs text-neutral-on-surface-variant">«{post.note}»</Text>
        ) : null}
      </View>
    </View>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
