import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TORNEAR_INSTAGRAM_URL } from '@/components/ambassador/format';

/** Aviso mientras TorneAR no verificó que el embajador siga a @tornear.app. */
export function AmbassadorFollowCard() {
  return (
    <View className="mt-4 rounded-2xl border border-warning-tertiary/40 bg-surface-container p-4">
      <View className="flex-row items-center gap-2">
        <AppIcon family="material-community" name="instagram" size={18} color="#FABD32" />
        <Text className="font-uiBold flex-1 text-sm text-warning-tertiary">Falta verificar que sigas a @tornear.app</Text>
      </View>
      <Text className="font-ui mt-2 text-xs leading-5 text-neutral-on-surface-variant">
        Es obligatorio para cobrar. Seguinos y lo verificamos nosotros: tus premios quedan guardados mientras tanto.
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => void Linking.openURL(TORNEAR_INSTAGRAM_URL)}
        accessibilityRole="link"
        className="mt-3 items-center rounded-xl border border-warning-tertiary/50 py-2.5"
      >
        <Text className="font-uiBold text-xs text-warning-tertiary">Abrir el Instagram de TorneAR</Text>
      </TouchableOpacity>
    </View>
  );
}
