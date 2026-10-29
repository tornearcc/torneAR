import { useState } from 'react';
import { ActivityIndicator, Linking, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { AMBASSADOR_TERMS_URL, TORNEAR_INSTAGRAM_URL } from '@/components/ambassador/format';
import { normalizeInstagramHandle } from '@/lib/ambassador-data';

type AmbassadorSignupFormProps = {
  /** Nombre de la cuenta. Sólo lectura. */
  fullName: string | null;
  /** Mail de la cuenta. Sólo lectura. */
  email: string | null;
  submitting: boolean;
  onSubmit: (input: {
    instagram: string;
    showInRanking: boolean;
    acceptTerms: boolean;
    confirmAdult: boolean;
  }) => void;
};

function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
          checked ? 'border-brand-primary bg-brand-primary' : 'border-neutral-outline bg-transparent'
        }`}
      >
        {checked && <AppIcon family="material-community" name="check-bold" size={16} color="#003914" />}
      </TouchableOpacity>
      <View className="flex-1">{children}</View>
    </View>
  );
}

/** Inscripción al programa: Instagram obligatorio, mayoría de edad y bases. */
export function AmbassadorSignupForm({ fullName, email, submitting, onSubmit }: AmbassadorSignupFormProps) {
  const [instagram, setInstagram] = useState('');
  const [showInRanking, setShowInRanking] = useState(false);
  const [confirmAdult, setConfirmAdult] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const handle = normalizeInstagramHandle(instagram);
  const canSubmit = handle.length > 0 && confirmAdult && acceptTerms && !submitting;

  return (
    <View>
      <View className="rounded-2xl border border-brand-primary/40 bg-surface-container p-4">
        <Text className="font-displayBlack text-2xl uppercase text-neutral-on-surface">
          ¿Querés ganar plata jugando al fútbol?
        </Text>
        <Text className="font-ui mt-2 text-sm leading-5 text-neutral-on-surface-variant">
          Ganás $5.000 por cada equipo nuevo que traés a TorneAR, apenas juega su primer partido por ranking.
        </Text>
      </View>

      <View className="mt-4 rounded-2xl bg-surface-container p-4">
        <Text className="font-ui text-[10px] uppercase tracking-widest text-neutral-outline">Tu cuenta</Text>
        <Text className="font-uiBold mt-1 text-sm text-neutral-on-surface">{fullName ?? '-'}</Text>
        <Text className="font-ui text-xs text-neutral-on-surface-variant">{email ?? '-'}</Text>

        <Text className="font-ui mt-4 text-[10px] uppercase tracking-widest text-neutral-outline">
          Tu Instagram (obligatorio)
        </Text>
        <View className="mt-1 flex-row items-center rounded-xl border border-neutral-outline-variant bg-surface-low px-3">
          <Text className="font-uiBold text-sm text-neutral-outline">@</Text>
          <TextInput
            value={instagram}
            onChangeText={setInstagram}
            placeholder="tu.usuario"
            placeholderTextColor="#869585"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={31}
            accessibilityLabel="Tu usuario de Instagram"
            className="font-ui flex-1 px-2 py-3 text-sm text-neutral-on-surface"
          />
        </View>

        <View className="mt-4 flex-row items-center justify-between gap-3">
          <Text className="font-ui flex-1 text-sm text-neutral-on-surface">
            Quiero aparecer en el ranking de la web
          </Text>
          <Switch
            value={showInRanking}
            onValueChange={setShowInRanking}
            trackColor={{ false: '#3D4A3D', true: '#1DB954' }}
            thumbColor="#E5E2E1"
          />
        </View>
      </View>

      <View className="mt-4 gap-4 rounded-2xl bg-surface-container p-4">
        <Checkbox checked={confirmAdult} onToggle={() => setConfirmAdult((v) => !v)}>
          <Text className="font-ui text-xs leading-5 text-neutral-on-surface-variant">Soy mayor de 18</Text>
        </Checkbox>
        <Checkbox checked={acceptTerms} onToggle={() => setAcceptTerms((v) => !v)}>
          <Text className="font-ui text-xs leading-5 text-neutral-on-surface-variant">
            Leí y acepto las{' '}
            <Text
              onPress={() => void Linking.openURL(AMBASSADOR_TERMS_URL)}
              suppressHighlighting
              className="font-uiBold text-brand-primary underline"
            >
              bases
            </Text>
          </Text>
        </Checkbox>
      </View>

      <View className="mt-4 rounded-2xl border border-warning-tertiary/40 bg-surface-container p-4">
        <View className="flex-row items-center gap-2">
          <AppIcon family="material-community" name="instagram" size={18} color="#FABD32" />
          <Text className="font-uiBold flex-1 text-sm text-warning-tertiary">
            Seguí a @tornear.app: es obligatorio para cobrar
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => void Linking.openURL(TORNEAR_INSTAGRAM_URL)}
          accessibilityRole="link"
          className="mt-3 items-center rounded-xl border border-warning-tertiary/50 py-2.5"
        >
          <Text className="font-uiBold text-xs text-warning-tertiary">Abrir el Instagram de TorneAR</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!canSubmit}
        onPress={() => onSubmit({ instagram: handle, showInRanking, acceptTerms, confirmAdult })}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className={`mt-5 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 ${
          canSubmit ? '' : 'opacity-40'
        }`}
      >
        {submitting && <ActivityIndicator size="small" color="#003914" />}
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">
          Quiero ser embajador
        </Text>
      </TouchableOpacity>
    </View>
  );
}
