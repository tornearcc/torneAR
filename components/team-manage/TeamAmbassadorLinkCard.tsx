import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

type TeamAmbassadorLinkCardProps = {
  /** Usuario sugerido (el embajador que invitó al capitán), si hay. */
  initialUsername: string | null;
  saving: boolean;
  onSave: (username: string) => void;
};

/**
 * «¿Quién los invitó?» en la gestión del equipo: el capitán lo puede cargar
 * hasta 24 h después de crear el equipo y mientras no hayan jugado. La pantalla
 * decide cuándo mostrarlo (`canSetTeamAmbassador`).
 */
export function TeamAmbassadorLinkCard({ initialUsername, saving, onSave }: TeamAmbassadorLinkCardProps) {
  const [username, setUsername] = useState(initialUsername ?? '');
  const canSave = username.trim().length > 0 && !saving;

  return (
    <View className="mt-4 rounded-xl bg-surface-low p-4">
      <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
        ¿Quién los invitó? (opcional)
      </Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="Usuario del embajador"
        placeholderTextColor="#5E5A58"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
        accessibilityLabel="Usuario del embajador que los invitó"
        className="mt-2 rounded-xl border border-neutral-outline-variant/15 bg-surface-base px-4 py-3 text-neutral-on-surface"
      />
      <Text className="font-ui mt-2 text-xs text-neutral-on-surface-variant">
        Si un embajador te pasó TorneAR, poné su usuario. Se puede cargar hasta 24 horas después de crear el
        equipo, si todavía no jugaron.
      </Text>
      <TouchableOpacity
        activeOpacity={0.9}
        disabled={!canSave}
        onPress={() => onSave(username)}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
        className={`mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-brand-primary py-3 ${
          canSave ? '' : 'opacity-40'
        }`}
      >
        {saving && <ActivityIndicator size="small" color="#003914" />}
        <Text className="font-display text-[11px] uppercase tracking-wide text-[#003914]">Guardar</Text>
      </TouchableOpacity>
    </View>
  );
}
