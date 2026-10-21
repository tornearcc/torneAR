import { Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

type AmbassadorNoticeProps = {
  message: string;
};

/** Aviso de estado del programa (pausado, cupos completos, cuenta suspendida). */
export function AmbassadorNotice({ message }: AmbassadorNoticeProps) {
  return (
    <View className="mb-4 flex-row items-start gap-2 rounded-2xl border border-warning-tertiary/40 bg-warning-tertiary/10 p-4">
      <AppIcon family="material-community" name="information-outline" size={18} color="#FABD32" />
      <Text className="font-ui flex-1 text-sm leading-5 text-neutral-on-surface">{message}</Text>
    </View>
  );
}
