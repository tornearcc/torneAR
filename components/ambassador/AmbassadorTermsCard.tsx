import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { AMBASSADOR_TERMS_URL } from '@/components/ambassador/format';

type AmbassadorTermsCardProps = {
  saving: boolean;
  onAccept: () => void;
};

/** Pide aceptar las bases vigentes a quien se inscribió con una versión anterior. */
export function AmbassadorTermsCard({ saving, onAccept }: AmbassadorTermsCardProps) {
  return (
    <View className="mb-4 rounded-2xl border border-warning-tertiary/40 bg-surface-container p-4">
      <View className="flex-row items-center gap-2">
        <AppIcon family="material-community" name="file-document-edit-outline" size={18} color="#FABD32" />
        <Text className="font-uiBold flex-1 text-sm text-warning-tertiary">Actualizamos las bases del programa</Text>
      </View>
      <Text className="font-ui mt-2 text-xs leading-5 text-neutral-on-surface-variant">
        Ahora cuenta el primer partido por ranking (los amistosos no) y todos los jugadores del equipo que traés tienen
        que ser nuevos: que no hayan jugado antes con otro equipo. Para seguir sumando, aceptá la nueva versión.
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => void Linking.openURL(AMBASSADOR_TERMS_URL)}
        accessibilityRole="link"
        className="mt-3 items-center rounded-xl border border-warning-tertiary/50 py-2.5"
      >
        <Text className="font-uiBold text-xs text-warning-tertiary">Leer las bases</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onAccept}
        disabled={saving}
        accessibilityRole="button"
        accessibilityState={{ disabled: saving }}
        className={`mt-2 items-center rounded-xl bg-brand-primary py-3 ${saving ? 'opacity-60' : ''}`}
      >
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">Acepto las bases</Text>
      </TouchableOpacity>
    </View>
  );
}
