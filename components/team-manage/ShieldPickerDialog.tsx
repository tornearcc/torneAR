import React from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { AppIcon } from '@/components/ui/AppIcon';
import { SHIELD_PRESETS } from '@/lib/shield-presets';
import { resolveShieldUrl } from '@/lib/supabase-storage';

interface ShieldPickerDialogProps {
  visible: boolean;
  /** `teams.shield_url` actual, para marcar el prediseñado elegido. */
  current: string | null;
  onClose: () => void;
  onSelectPreset: (presetPath: string) => void;
  onUploadPhoto: () => void;
}

/**
 * «Escudo del equipo»: los 15 prediseñados (P3-26) y, abajo, subir una foto
 * como siempre. Mismo lenguaje visual que OptionPickerDialog (overlay
 * absoluto, card centrada, elegido en verde).
 */
export function ShieldPickerDialog({
  visible, current, onClose, onSelectPreset, onUploadPhoto,
}: ShieldPickerDialogProps) {
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 99 }]} className="flex-1">
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 items-center justify-center bg-black/80 px-6">
          <TouchableWithoutFeedback>
            <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-4">
              <Text className="font-display text-lg text-neutral-on-surface">Escudo del equipo</Text>
              <Text className="font-ui mb-3 mt-1 text-xs text-neutral-on-surface-variant">
                Elegí uno de estos o subí el de tu equipo.
              </Text>

              <View className="flex-row flex-wrap">
                {SHIELD_PRESETS.map((preset, index) => {
                  const selected = preset === current;
                  return (
                    <View key={preset} style={{ width: '20%' }} className="p-1">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        accessibilityLabel={`Escudo ${index + 1}`}
                        accessibilityState={{ selected }}
                        onPress={() => onSelectPreset(preset)}
                        className={`aspect-square items-center justify-center rounded-xl border-2 ${
                          selected ? 'border-brand-primary bg-brand-primary/15' : 'border-transparent bg-surface-low'
                        }`}
                      >
                        <Image
                          source={{ uri: resolveShieldUrl(preset) ?? undefined }}
                          style={{ width: '78%', height: '78%' }}
                          contentFit="contain"
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onUploadPhoto}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3"
              >
                <AppIcon family="material-community" name="image-plus" size={18} color="#003914" />
                <Text className="font-uiBold text-sm text-[#003914]">Subir una foto</Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.9} onPress={onClose} className="mt-2 items-center py-2.5">
                <Text className="font-ui text-sm text-neutral-on-surface-variant">Cancelar</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
