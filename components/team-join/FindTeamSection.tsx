import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

import { TeamShield } from '@/components/ui/TeamShield';
import { positionWantedLabel } from '@/lib/position-wanted';
import type { MarketTeamPost } from '@/lib/market-api';
import { resolveShieldUrl } from '@/lib/supabase-storage';

interface Props {
  zone: string | null;
  posts: MarketTeamPost[];
  onOpenPost: () => void;
  onPublish: () => void;
}

/**
 * «Sumarme a un equipo», debajo del código (rediseño, etapa 2; spec §8.1, 1c):
 * los equipos de tu zona a los que les falta uno y, SIEMPRE al final, publicar
 * que buscás equipo, para que la pantalla nunca quede sin salida.
 */
export function FindTeamSection({ zone, posts, onOpenPost, onPublish }: Props) {
  return (
    <View className="mt-7">
      <View className="mb-5 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-surface-high" />
        <Text className="font-ui text-[13px] text-neutral-outline">o buscá uno</Text>
        <View className="h-px flex-1 bg-surface-high" />
      </View>

      {posts.length > 0 && (
        <View className="mb-5">
          <Text className="font-uiBold mb-2.5 text-xs uppercase tracking-wider text-neutral-on-surface-variant">
            {zone ? `Les falta uno en ${zone}` : 'Les falta uno'}
          </Text>
          {posts.map((post) => (
            <TouchableOpacity
              key={post.id}
              onPress={onOpenPost}
              activeOpacity={0.85}
              className="mb-2.5 flex-row items-center gap-3 rounded-2xl bg-surface-container p-3.5"
            >
              <TeamShield shieldUrl={resolveShieldUrl(post.teams?.shield_url)} size={44} name={post.teams?.name} />
              <View className="flex-1">
                <Text className="font-uiBold text-[15px] text-neutral-on-surface" numberOfLines={1}>{post.teams?.name ?? 'Equipo'}</Text>
                <Text className="font-ui mt-0.5 text-[13px] text-neutral-on-surface-variant">{positionWantedLabel(post.position_wanted)}</Text>
              </View>
              <Text className="font-uiBold text-sm text-brand-primary">Ver</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View className="rounded-2xl border border-dashed border-brand-primary/50 bg-brand-primary/10 p-4">
        <Text className="font-uiBold text-[15px] text-neutral-on-surface">¿No ves uno que te sirva?</Text>
        <Text className="font-ui mt-1.5 text-[13px] leading-5 text-neutral-on-surface-variant">
          Publicá que buscás equipo. Los capitanes de tu zona te ven y te escriben.
        </Text>
        <TouchableOpacity onPress={onPublish} activeOpacity={0.85} className="mt-3.5 h-12 items-center justify-center rounded-xl bg-brand-primary">
          <Text className="font-uiBold text-[15px] text-surface-lowest">Publicar que busco equipo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
