import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import {
  requestMissingPlace,
  type PlaceKind,
  type PlaceRequestSurface,
} from '@/lib/place-request';

interface Props {
  kind: PlaceKind;
  surface: PlaceRequestSurface;
  /** Lo que buscó (selector de zonas) o el nombre que escribió. */
  query?: string | null;
  /** Zona elegida, para los pedidos de cancha. */
  zone?: string | null;
  /** `card`: recuadro (estados vacíos, perfil). `inline`: una línea al pie de una lista. */
  variant?: 'card' | 'inline';
  /** Reemplaza el título y la bajada (p. ej. el Perfil, que pide ciudad o cancha). */
  title?: string;
  detail?: string;
}

const COPY: Record<PlaceKind, { title: string; detail: string }> = {
  zona: { title: '¿No está tu ciudad?', detail: 'Escribinos por Instagram y la sumamos.' },
  cancha: { title: '¿Falta tu cancha?', detail: 'Avisanos por Instagram y la cargamos.' },
};

/**
 * Botón «¿No está tu ciudad / tu cancha?». Copia un mensaje armado y abre el
 * chat de @tornear.app (ver `lib/place-request.ts`). Después del toque deja el
 * aviso «pegalo en el chat» para cuando la persona vuelve a la app.
 */
export function MissingPlaceLink({ kind, surface, query, zone, variant = 'inline', title, detail }: Props) {
  const [copied, setCopied] = useState(false);
  const text = { title: title ?? COPY[kind].title, detail: detail ?? COPY[kind].detail };

  const handlePress = async () => {
    const ok = await requestMissingPlace({ kind, surface, query, zone });
    setCopied(ok);
  };

  const hint = copied ? 'Copiamos el mensaje: pegalo en el chat.' : text.detail;

  if (variant === 'card') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${text.title} ${text.detail}`}
        className="flex-row items-center gap-3 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 p-3.5"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-primary/15">
          <AppIcon
            family="material-community"
            name={kind === 'zona' ? 'map-marker-plus-outline' : 'soccer-field'}
            size={20}
            color="#53E076"
          />
        </View>
        <View className="flex-1">
          <Text className="font-uiBold text-sm text-neutral-on-surface">{text.title}</Text>
          <Text className="mt-0.5 font-ui text-xs text-neutral-on-surface-variant">{hint}</Text>
        </View>
        <AppIcon family="material-community" name="instagram" size={20} color="#53E076" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${text.title} ${text.detail}`}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      className="flex-row items-center gap-2 py-2"
    >
      <AppIcon family="material-community" name="instagram" size={16} color="#53E076" />
      <Text className="flex-1 font-ui text-xs text-neutral-on-surface-variant">
        <Text className="font-uiBold text-brand-primary">{text.title} </Text>
        {hint}
      </Text>
    </TouchableOpacity>
  );
}
