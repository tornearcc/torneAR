import { Image, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import {
  APPLICATION_STATUS_CLASS,
  APPLICATION_STATUS_LABEL,
  getApplicationStatusHint,
} from '@/components/market/applicationStatus';
import type { MyMarketApplicationEntry } from '@/lib/market-applications-api';

interface Props {
  entry: MyMarketApplicationEntry;
  /** Sólo se ofrece cuando hay algo concreto que hacer (ver `actionLabel`). */
  onAction?: (entry: MyMarketApplicationEntry) => void;
  actionLabel?: string;
}

/**
 * Una postulación propia (M4), del lado del postulante.
 *
 * Muestra tres cosas que antes no existían en ninguna pantalla: a quién me
 * postulé, en qué estado está, y —lo importante— qué significa ese estado y si
 * me toca hacer algo.
 */
export function MyApplicationCard({ entry, onAction, actionLabel }: Props) {
  const tone = APPLICATION_STATUS_CLASS[entry.status];
  const isTeamPost = entry.postType === 'TEAM';

  return (
    <View className="rounded-xl bg-surface-container p-4">
      <View className="flex-row items-center gap-3">
        {entry.targetImageUrl && entry.targetId ? (
          <ExpandablePhoto
            uri={entry.targetImageUrl}
            subject={isTeamPost
              ? { kind: 'shield', teamId: entry.targetId }
              : { kind: 'avatar', profileId: entry.targetId }}
            title={entry.targetName}
          >
            <Image
              source={{ uri: entry.targetImageUrl }}
              style={{ width: 44, height: 44, borderRadius: 22 }}
            />
          </ExpandablePhoto>
        ) : entry.targetImageUrl ? (
          <Image
            source={{ uri: entry.targetImageUrl }}
            style={{ width: 44, height: 44, borderRadius: 22 }}
          />
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-high">
            <AppIcon
              family="material-community"
              name={isTeamPost ? 'shield-account' : 'account'}
              size={20}
              color="#53E076"
            />
          </View>
        )}

        <View className="flex-1">
          <Text className="font-uiBold text-sm text-neutral-on-surface" numberOfLines={1}>
            {entry.targetName}
          </Text>
          {entry.targetSubtitle ? (
            <Text
              className="font-ui text-xs text-neutral-on-surface-variant"
              numberOfLines={1}
            >
              {entry.targetSubtitle}
            </Text>
          ) : null}
        </View>

        <View className={`rounded-full px-2.5 py-1 ${tone.bg}`}>
          <Text className={`font-uiBold text-[10px] uppercase ${tone.text}`}>
            {APPLICATION_STATUS_LABEL[entry.status]}
          </Text>
        </View>
      </View>

      {/* En posts de jugador el postulante es un EQUIPO: sin esta línea no se
          sabe con cuál de mis equipos me postulé. */}
      {entry.appliedWithTeamName ? (
        <Text className="font-ui mt-2 text-xs text-neutral-outline">
          Te postulaste con {entry.appliedWithTeamName}
        </Text>
      ) : null}

      <Text className="font-ui mt-2 text-xs leading-5 text-neutral-on-surface-variant">
        {getApplicationStatusHint(entry.status, entry.postType)}
      </Text>

      {/* El aviso cerrado explica por qué una postulación viva dejó de moverse. */}
      {!entry.postIsActive && entry.status !== 'ACEPTADA' ? (
        <View className="mt-2 flex-row items-center gap-1.5">
          <AppIcon family="material-community" name="lock-outline" size={12} color="#869585" />
          <Text className="font-ui text-[11px] text-neutral-outline">
            La publicación ya no está activa.
          </Text>
        </View>
      ) : null}

      {onAction && actionLabel ? (
        <TouchableOpacity
          onPress={() => onAction(entry)}
          activeOpacity={0.85}
          className="mt-3 items-center rounded-lg bg-brand-primary py-2.5"
        >
          <Text className="font-uiBold text-xs" style={{ color: '#003914' }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
