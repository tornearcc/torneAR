import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { resolveShieldUrl } from '@/lib/supabase-storage';
import { getTeamCategoryLabel, getTeamFormatLabel } from '@/lib/team-options';
import type { TeamStatsHeader } from './types';

type TeamHeaderProps = {
  header: TeamStatsHeader;
};

export function TeamHeader({ header }: TeamHeaderProps) {
  const shieldUrl = resolveShieldUrl(header.shieldUrl);

  return (
    <View className="items-center pb-2 pt-4">
      {/* Cuadrado redondeado y no el círculo de TeamShield: el escudo se ve
          entero en la cabecera. Por eso se envuelve en vez de reemplazarse. */}
      <ExpandablePhoto uri={shieldUrl} subject={{ kind: 'shield', teamId: header.id }} title={header.name}>
        <View
          className="border-4 border-brand-primary-container bg-surface-lowest p-1"
          style={{ height: 100, width: 100, borderRadius: 16 }}
        >
          {shieldUrl ? (
            <Image
              source={{ uri: shieldUrl }}
              style={{ width: '100%', height: '100%', borderRadius: 12 }}
              contentFit="cover"
            />
          ) : (
            <View className="h-full w-full items-center justify-center rounded-xl bg-surface-high">
              <AppIcon family="material-community" name="shield-outline" size={32} color="#BCCBB9" />
            </View>
          )}
        </View>
      </ExpandablePhoto>

      <Text className="font-displayBlack mt-4 text-2xl tracking-tight text-neutral-on-surface">
        {header.name}
      </Text>
      <View className="mt-1 flex-row items-center gap-1">
        <AppIcon family="material-community" name="map-marker-outline" size={12} color="#8CCDFF" />
        <Text className="font-ui text-sm text-neutral-on-surface-variant">{header.zone}</Text>
      </View>

      <View className="mt-3 flex-row flex-wrap items-center justify-center gap-2">
        <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
          {getTeamCategoryLabel(header.category)}
        </Text>
        <Text className="font-uiBold rounded bg-info-secondary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-info-secondary">
          {getTeamFormatLabel(header.format)}
        </Text>
        {/* Promedio de edad del plantel. Se omite entero si nadie cargo su
            fecha de nacimiento: un "0 años" leeria como dato real. */}
        {header.squadAge && (
          <View className="flex-row items-center gap-1 rounded bg-warning-tertiary/15 px-2 py-1">
            <AppIcon family="material-community" name="cake-variant-outline" size={11} color="#FABD32" />
            <Text className="font-uiBold text-[10px] uppercase tracking-wide text-warning-tertiary">
              {header.squadAge.average} años prom.
            </Text>
          </View>
        )}
      </View>

      <View className="mt-4 flex-row gap-4">
        <View className="items-center rounded-xl bg-surface-low px-5 py-3">
          <Text
            className="font-displayBlack text-2xl text-brand-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {header.prRating}
          </Text>
          <Text className="font-uiBold mt-0.5 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">
            Ranking
          </Text>
        </View>
        <View className="items-center rounded-xl bg-surface-low px-5 py-3">
          <Text
            className="font-displayBlack text-2xl text-info-secondary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {header.fairPlayScore.toFixed(1)}
          </Text>
          <Text className="font-uiBold mt-0.5 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">
            Fair Play
          </Text>
        </View>
      </View>
    </View>
  );
}
