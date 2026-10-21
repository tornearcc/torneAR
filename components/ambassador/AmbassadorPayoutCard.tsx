import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

type AmbassadorPayoutCardProps = {
  saving: boolean;
  onSave: (alias: string) => void;
};

const MIN_ALIAS = 6;

/** Pide el alias o CBU recién cuando el embajador ya tiene un premio. */
export function AmbassadorPayoutCard({ saving, onSave }: AmbassadorPayoutCardProps) {
  const [alias, setAlias] = useState('');
  const canSave = alias.trim().length >= MIN_ALIAS && !saving;

  return (
    <View className="mt-4 rounded-2xl border border-brand-primary/40 bg-surface-container p-4">
      <Text className="font-uiBold text-sm text-neutral-on-surface">¿Adónde te pagamos?</Text>
      <Text className="font-ui mt-1 text-xs leading-5 text-neutral-on-surface-variant">
        Ya tenés premios. Cargá tu alias o CBU de Mercado Pago o tu banco para cobrarlos.
      </Text>
      <TextInput
        value={alias}
        onChangeText={setAlias}
        placeholder="alias.o.cbu"
        placeholderTextColor="#869585"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
        accessibilityLabel="Alias o CBU para cobrar"
        className="font-ui mt-3 rounded-xl border border-neutral-outline-variant bg-surface-low px-3 py-3 text-sm text-neutral-on-surface"
      />
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!canSave}
        onPress={() => onSave(alias)}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
        className={`mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 ${
          canSave ? '' : 'opacity-40'
        }`}
      >
        {saving && <ActivityIndicator size="small" color="#003914" />}
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">Guardar</Text>
      </TouchableOpacity>
    </View>
  );
}
