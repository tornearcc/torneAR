import { useState } from 'react';
import { ActivityIndicator, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { normalizeInstagramHandle } from '@/lib/ambassador-data';

type AmbassadorSettingsCardProps = {
  instagram: string;
  showInRanking: boolean;
  payoutAlias: string | null;
  /** false mientras la tarjeta de «¿Adónde te pagamos?» ya pide el alias. */
  showAliasField: boolean;
  saving: boolean;
  onSaveProfile: (input: { instagram: string; showInRanking: boolean }) => void;
  onSaveAlias: (alias: string) => void;
};

const MIN_ALIAS = 6;

/** Datos del embajador ya inscripto: ranking público, Instagram y alias de cobro. */
export function AmbassadorSettingsCard({
  instagram,
  showInRanking,
  payoutAlias,
  showAliasField,
  saving,
  onSaveProfile,
  onSaveAlias,
}: AmbassadorSettingsCardProps) {
  const [instagramDraft, setInstagramDraft] = useState(instagram);
  const [rankingDraft, setRankingDraft] = useState(showInRanking);
  const [aliasDraft, setAliasDraft] = useState(payoutAlias ?? '');

  const handle = normalizeInstagramHandle(instagramDraft);
  const instagramChanged = handle !== instagram;
  const profileChanged = instagramChanged || rankingDraft !== showInRanking;
  const canSaveProfile = handle.length > 0 && profileChanged && !saving;

  const alias = aliasDraft.trim();
  const canSaveAlias = alias.length >= MIN_ALIAS && alias !== (payoutAlias ?? '') && !saving;

  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <Text className="font-uiBold text-sm text-neutral-on-surface">Tus datos</Text>

      <View className="mt-3 flex-row items-center justify-between gap-3">
        <Text className="font-ui flex-1 text-sm text-neutral-on-surface">Quiero aparecer en el ranking de la web</Text>
        <Switch
          value={rankingDraft}
          onValueChange={setRankingDraft}
          trackColor={{ false: '#3D4A3D', true: '#1DB954' }}
          thumbColor="#E5E2E1"
          accessibilityLabel="Quiero aparecer en el ranking de la web"
        />
      </View>

      <Text className="font-ui mt-4 text-[10px] uppercase tracking-widest text-neutral-outline">Tu Instagram</Text>
      <View className="mt-1 flex-row items-center rounded-xl border border-neutral-outline-variant bg-surface-low px-3">
        <Text className="font-uiBold text-sm text-neutral-outline">@</Text>
        <TextInput
          value={instagramDraft}
          onChangeText={setInstagramDraft}
          placeholder="tu.usuario"
          placeholderTextColor="#869585"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={31}
          accessibilityLabel="Tu usuario de Instagram"
          className="font-ui flex-1 px-2 py-3 text-sm text-neutral-on-surface"
        />
      </View>
      {instagramChanged && (
        <Text className="font-ui mt-2 text-xs leading-5 text-warning-tertiary">
          Si cambiás tu Instagram, tenemos que volver a verificar que nos seguís.
        </Text>
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!canSaveProfile}
        onPress={() => onSaveProfile({ instagram: handle, showInRanking: rankingDraft })}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSaveProfile }}
        className={`mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-brand-primary/50 py-2.5 ${
          canSaveProfile ? '' : 'opacity-40'
        }`}
      >
        {saving && <ActivityIndicator size="small" color="#53E076" />}
        <Text className="font-uiBold text-xs text-brand-primary">Guardar cambios</Text>
      </TouchableOpacity>

      {showAliasField && (
        <>
          <Text className="font-ui mt-5 text-[10px] uppercase tracking-widest text-neutral-outline">
            Alias o CBU para cobrar
          </Text>
          <TextInput
            value={aliasDraft}
            onChangeText={setAliasDraft}
            placeholder="alias.o.cbu"
            placeholderTextColor="#869585"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
            accessibilityLabel="Alias o CBU para cobrar"
            className="font-ui mt-1 rounded-xl border border-neutral-outline-variant bg-surface-low px-3 py-3 text-sm text-neutral-on-surface"
          />
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!canSaveAlias}
            onPress={() => onSaveAlias(alias)}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSaveAlias }}
            className={`mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-brand-primary/50 py-2.5 ${
              canSaveAlias ? '' : 'opacity-40'
            }`}
          >
            {saving && <ActivityIndicator size="small" color="#53E076" />}
            <Text className="font-uiBold text-xs text-brand-primary">Guardar alias</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
