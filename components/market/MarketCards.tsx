import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/ui/AppIcon';
import {
  imageIndexFromId,
  isUrgentPost,
  extractPitchTypeMeta,
  sanitizeMarketDescription,
} from '@/lib/market-utils';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';

const CARD_IMAGES = [
  require('@/assets/images/market-card/pexels-pixabay-274422.jpg'),
  require('@/assets/images/market-card/pexels-pixabay-274506.jpg'),
  require('@/assets/images/market-card/pexels-zac-frith-325758-918798.jpg'),
];

function formatDisplayDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

function getPitchLabel(value: string): string {
  const normalized = value.toUpperCase();
  const map: Record<string, string> = {
    FUTBOL_5: 'Futbol 5',
    FUTBOL_6: 'Futbol 6',
    FUTBOL_7: 'Futbol 7',
    FUTBOL_8: 'Futbol 8',
    FUTBOL_9: 'Futbol 9',
    FUTBOL_11: 'Futbol 11',
  };
  return map[normalized] ?? value;
}

function formatScheduleLabel(matchDate?: string | null, matchTime?: string | null): string | null {
  if (!matchDate && !matchTime) return null;

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  let dateLabel = '';

  if (matchDate && /^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
    const parsed = new Date(`${matchDate}T00:00:00`);
    const dayName = dayNames[parsed.getDay()];
    dateLabel = `${dayName} ${parsed.getDate()}/${parsed.getMonth() + 1}/${parsed.getFullYear()}`;
  } else if (matchDate) {
    dateLabel = formatDisplayDate(matchDate);
  }

  const normalizedTime = matchTime
    ? matchTime.split(':').slice(0, 2).map((part) => part.padStart(2, '0')).join(':')
    : '';

  if (dateLabel && normalizedTime) return `${dateLabel} a las ${normalizedTime}hs`;
  if (dateLabel) return dateLabel;
  if (normalizedTime) return `Hoy a las ${normalizedTime}hs`;
  return null;
}

function resolveShieldUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return getSupabaseStorageUrl('shields', path);
}

function resolveAvatarUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return getSupabaseStorageUrl('avatars', path);
}

// ─── Team Card ────────────────────────────────────────────────────────────────

interface MarketTeamCardProps {
  postId: string;
  teamName: string;
  teamZone?: string | null;
  matchZone?: string | null;
  logoUrl?: string | null;
  positionWanted: string;
  pitchType?: string | null;
  description?: string | null;
  matchDate?: string | null;
  matchTime?: string | null;
  complex?: string | null;
  isOwner: boolean;
  memberStatus?: 'own_team' | 'own_player';
  index?: number;
   /** Called when the non-owner taps "Postularme". Not called for owners. */
  onPressAction?: () => void;
  /** Called when the user taps "Stats". */
  onPressStats?: () => void;
  onDelete: () => void;
  /** Cantidad de postulaciones recibidas — sólo relevante para isOwner. */
  applicationCount?: number;
  /** Called when the owner taps "Postulaciones". Not called for non-owners. */
  onViewApplications?: () => void;
  /**
   * Abre el menú de moderación: denunciar la publicación o bloquear a quien la
   * publicó. Sólo se pasa para publicaciones ajenas — sobre la propia no hay
   * nada que moderar, así que la ausencia de la prop es lo que oculta el botón.
   */
  onPressModerate?: () => void;
  /**
   * Etiqueta de distancia ya resuelta (`📍 a 2.5 km`), o `null` si no hay dato.
   *
   * Llega calculada desde la pantalla y no se resuelve acá: la tarjeta es un
   * componente de presentación y el índice de complejos es una consulta única
   * para toda la lista — resolverlo por tarjeta sería un N+1.
   */
  distanceLabel?: string | null;
}

export function MarketTeamCard({
  postId, teamName, teamZone, matchZone, logoUrl, positionWanted, pitchType, description,
  matchDate, matchTime, complex, isOwner, memberStatus, index = 0, onPressAction, onPressStats, onDelete,
  applicationCount, onViewApplications, distanceLabel, onPressModerate,
}: MarketTeamCardProps) {
  const isUrgent = isUrgentPost(matchDate);
  const cleanDescription = sanitizeMarketDescription(description);
  const resolvedPitchType = pitchType ?? extractPitchTypeMeta(description);
  const scheduleLabel = formatScheduleLabel(matchDate, matchTime);
  const shieldImage = resolveShieldUrl(logoUrl);
  const normalizedComplex = complex?.trim();
  const shouldShowComplex = !!normalizedComplex && !/^no$/i.test(normalizedComplex);

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={{ marginBottom: 16 }}>
    <View className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1C1C1C', opacity: memberStatus ? 0.5 : 1 }}>
      {/* Image Header */}
      <ImageBackground
        source={CARD_IMAGES[imageIndexFromId(postId)]}
        style={{ height: 120 }}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(8,10,8,0.05)', 'rgba(8,10,8,0.35)', 'rgba(8,10,8,0.92)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <LinearGradient
          colors={['rgba(8,10,8,0)', 'rgba(28,28,28,0.75)', '#1C1C1C']}
          locations={[0, 0.72, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 68 }}
        />
        {/* Badges */}
        {isUrgent && (
          <View className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded" style={{ backgroundColor: '#C62828' }}>
            <Text className="text-white font-displayBlack text-[9px] tracking-widest uppercase">Urgente</Text>
          </View>
        )}
        <View className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-brand-primary">
          <Text className="font-displayBlack text-[9px] tracking-wider uppercase" style={{ color: '#003914' }}>
            {positionWanted}
          </Text>
        </View>
        {/* Moderación. Va debajo del badge de posición y no en su lugar porque
            ese badge es lo que identifica la búsqueda de un vistazo. Fondo
            propio semitransparente: sobre la foto, un icono suelto se pierde. */}
        {onPressModerate && (
          <TouchableOpacity
            onPress={onPressModerate}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Opciones de la publicación"
            className="absolute right-2.5 top-9 h-7 w-7 items-center justify-center rounded-full bg-black/50"
          >
            <AppIcon family="material-community" name="dots-vertical" size={16} color="#E5E2E1" />
          </TouchableOpacity>
        )}
        {/* Team row at bottom of image */}
        <View className="absolute bottom-2 left-3 right-3 flex-row items-center gap-2">
          {shieldImage ? (
            <Image
              source={{ uri: shieldImage }}
              style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076' }}
              contentFit="cover"
            />
          ) : (
            <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon family="material-community" name="shield-account" size={20} color="#53E076" />
            </View>
          )}
          <View className="flex-1">
            <Text className="text-neutral-on-surface font-uiBold text-sm" numberOfLines={1}>{teamName}</Text>
            {teamZone ? (
              <Text className="text-neutral-on-surface-variant text-[11px] font-ui" numberOfLines={1}>{teamZone}</Text>
            ) : null}
          </View>
        </View>
      </ImageBackground>

      {/* Card Body */}
      <View className="p-3">
        {cleanDescription ? (
          <Text className="text-neutral-on-surface-variant text-xs font-ui italic mb-2" numberOfLines={3}>
            {'"'}{cleanDescription}{'"'}
          </Text>
        ) : null}

        {scheduleLabel ? (
          <View className="flex-row items-center gap-2 bg-surface-high/40 rounded-lg px-2.5 py-2 mb-2">
            <AppIcon family="material-icons" name="calendar-month" size={14} color="#A9B7A8" />
            <Text className="text-neutral-on-surface-variant text-[11px] font-ui flex-1" numberOfLines={1}>
              {scheduleLabel}
            </Text>
          </View>
        ) : null}

        {matchZone ? (
          <View className="flex-row items-center gap-2 bg-surface-high/40 rounded-lg px-2.5 py-2 mb-2">
            <AppIcon family="material-community" name="map-marker-outline" size={14} color="#A9B7A8" />
            <Text className="text-neutral-on-surface-variant text-[11px] font-ui flex-1" numberOfLines={1}>
              Zona del partido: {matchZone}
            </Text>
            {/* Ausente cuando el usuario no cargó zona o cuando ni su zona ni la
                del aviso tienen complejos con coordenadas: sin dato preferimos
                no dibujar nada antes que un número inventado. */}
            {distanceLabel ? (
              <Text className="font-uiBold shrink-0 rounded bg-brand-primary/15 px-1.5 py-0.5 text-[10px] text-brand-primary">
                {distanceLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {resolvedPitchType ? (
          <View className="flex-row items-center gap-2 bg-surface-high/40 rounded-lg px-2.5 py-2 mb-2">
            <AppIcon family="material-community" name="account-multiple" size={14} color="#A9B7A8" />
            <Text className="text-neutral-on-surface-variant text-[11px] font-ui flex-1" numberOfLines={1}>
              {getPitchLabel(resolvedPitchType)}
            </Text>
          </View>
        ) : null}

        {shouldShowComplex ? (
          <View className="flex-row items-center gap-2 bg-surface-high/40 rounded-lg px-2.5 py-2 mb-1">
            <Text style={{ fontSize: 13 }}>🏟️</Text>
            <Text className="text-neutral-on-surface-variant text-[11px] font-ui flex-1" numberOfLines={1}>
              {normalizedComplex}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Action buttons */}
      {isOwner ? (
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={onViewApplications}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center"
            style={{ backgroundColor: 'rgba(140,205,255,0.12)', borderTopWidth: 1, borderTopColor: 'rgba(140,205,255,0.3)' }}
          >
            <Text className="text-info-secondary font-uiBold text-[11px] tracking-widest uppercase">
              Postulaciones{applicationCount ? ` (${applicationCount})` : ''}
            </Text>
          </TouchableOpacity>
          <View style={{ width: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.1)' }} />
          <TouchableOpacity
            onPress={onDelete}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center"
            style={{ backgroundColor: 'rgba(255,84,73,0.18)', borderTopWidth: 1, borderTopColor: 'rgba(255,84,73,0.35)' }}
          >
            <Text className="text-[#FF8A80] font-uiBold text-[11px] tracking-widest uppercase">Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : memberStatus ? (
        <View
          className="py-3 items-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}
        >
          <Text className="text-neutral-on-surface-variant font-uiBold text-[11px] tracking-widest uppercase">
            {memberStatus === 'own_team' ? 'Ya sos parte de este equipo' : 'Ya está en tu equipo'}
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={onPressAction}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center bg-brand-primary"
          >
            <Text className="font-displayBlack text-[11px] tracking-widest uppercase" style={{ color: '#003914' }}>
              Postularme
            </Text>
          </TouchableOpacity>
          <View style={{ width: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.1)' }} />
          <TouchableOpacity
            onPress={onPressStats}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center bg-surface-high"
          >
            <Text className="font-displayBlack text-[11px] tracking-widest uppercase text-neutral-on-surface">
              Stats
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
    </Animated.View>
  );
}

// ─── Player Card ──────────────────────────────────────────────────────────────

interface MarketPlayerCardProps {
  postId: string;
  playerName: string;
  avatarUrl?: string | null;
  username: string;
  position: string;
  postType: string;
  description?: string | null;
  isOwner: boolean;
  memberStatus?: 'own_team' | 'own_player';
  index?: number;
   /** Called when the non-owner taps the contact button. Not called for owners. */
  onPressAction?: () => void;
  /** Called when the user taps "Stats". */
  onPressStats?: () => void;
  onDelete: () => void;
  /** Cantidad de postulaciones recibidas — sólo relevante para isOwner. */
  applicationCount?: number;
  /** Called when the owner taps "Postulaciones". Not called for non-owners. */
  onViewApplications?: () => void;
  /** Ver `MarketTeamCardProps.onPressModerate`. */
  onPressModerate?: () => void;
}

export function MarketPlayerCard({
  postId, playerName, avatarUrl, username, position, postType,
  description, isOwner, memberStatus, index = 0, onPressAction, onPressStats, onDelete,
  applicationCount, onViewApplications, onPressModerate,
}: MarketPlayerCardProps) {
  const subtitle = postType === 'BUSCA_EQUIPO' ? 'Busca Equipo' : 'Busca Partido';
  const cleanDescription = sanitizeMarketDescription(description);
  const avatarImage = resolveAvatarUrl(avatarUrl);

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={{ marginBottom: 16 }}>
    <View className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1C1C1C', opacity: memberStatus ? 0.5 : 1 }}>
      {/* Image Header */}
      <ImageBackground
        source={CARD_IMAGES[imageIndexFromId(postId)]}
        style={{ height: 120 }}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(8,10,8,0.05)', 'rgba(8,10,8,0.35)', 'rgba(8,10,8,0.92)']}
          locations={[0, 0.45, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <LinearGradient
          colors={['rgba(8,10,8,0)', 'rgba(28,28,28,0.75)', '#1C1C1C']}
          locations={[0, 0.72, 1]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 68 }}
        />
        <View className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-brand-primary">
          <Text className="font-displayBlack text-[9px] tracking-wider uppercase" style={{ color: '#003914' }}>
            {position}
          </Text>
        </View>
        {/* Ver el comentario equivalente en MarketTeamCard. */}
        {onPressModerate && (
          <TouchableOpacity
            onPress={onPressModerate}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Opciones de la publicación"
            className="absolute right-2.5 top-9 h-7 w-7 items-center justify-center rounded-full bg-black/50"
          >
            <AppIcon family="material-community" name="dots-vertical" size={16} color="#E5E2E1" />
          </TouchableOpacity>
        )}
        <View className="absolute bottom-2 left-3 right-3 flex-row items-center gap-2">
          {avatarImage ? (
            <Image
              source={{ uri: avatarImage }}
              style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076' }}
              contentFit="cover"
            />
          ) : (
            <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#53E076', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon family="material-community" name="account" size={20} color="#53E076" />
            </View>
          )}
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text className="text-neutral-on-surface font-uiBold text-sm" numberOfLines={1}>{playerName}</Text>
            {/* El nombre de arriba ya truncaba, esta línea no: un @username
                largo junto a la posición desbordaba la cabecera de la tarjeta. */}
            <Text
              className="text-neutral-on-surface-variant font-ui text-[10px]"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              @{username} · {subtitle}
            </Text>
          </View>
        </View>
      </ImageBackground>

      {/* Card Body */}
      <View className="p-3 pb-0">
        {cleanDescription ? (
          <Text className="text-neutral-on-surface-variant text-xs font-ui italic" numberOfLines={3}>
            {'"'}{cleanDescription}{'"'}
          </Text>
        ) : null}
      </View>

      {/* Action buttons — onPressAction only called for non-owners */}
      {isOwner ? (
        <View className="flex-row items-center mt-3">
          <TouchableOpacity
            onPress={onViewApplications}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center"
            style={{ backgroundColor: 'rgba(140,205,255,0.12)', borderTopWidth: 1, borderTopColor: 'rgba(140,205,255,0.3)' }}
          >
            <Text className="text-info-secondary font-uiBold text-[11px] tracking-widest uppercase">
              Postulaciones{applicationCount ? ` (${applicationCount})` : ''}
            </Text>
          </TouchableOpacity>
          <View style={{ width: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.1)' }} />
          <TouchableOpacity
            onPress={onDelete}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center"
            style={{ backgroundColor: 'rgba(255,84,73,0.18)', borderTopWidth: 1, borderTopColor: 'rgba(255,84,73,0.35)' }}
          >
            <Text className="text-[#FF8A80] font-uiBold text-[11px] tracking-widest uppercase">Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : memberStatus ? (
        <View
          className="py-3 items-center mt-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}
        >
          <Text className="text-neutral-on-surface-variant font-uiBold text-[11px] tracking-widest uppercase">
            {memberStatus === 'own_team' ? 'Ya sos parte de este equipo' : 'Ya está en tu equipo'}
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center mt-3">
          <TouchableOpacity
            onPress={onPressAction}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center bg-brand-primary"
          >
            <Text className="font-displayBlack text-[11px] tracking-widest uppercase" style={{ color: '#003914' }}>
              Contactarme
            </Text>
          </TouchableOpacity>
          <View style={{ width: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.1)' }} />
          <TouchableOpacity
            onPress={onPressStats}
            activeOpacity={0.8}
            className="flex-1 py-3 items-center bg-surface-high"
          >
            <Text className="font-displayBlack text-[11px] tracking-widest uppercase text-neutral-on-surface">
              Stats
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
    </Animated.View>
  );
}
