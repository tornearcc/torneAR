import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { useRouter } from 'expo-router';
type ProfileSettingsSectionProps = {
  isSigningOut: boolean;
  onSignOut: () => void;
};

function Row({
  icon,
  title,
  family = 'material-community',
  className,
  onPress,
}: {
  icon: string;
  title: string;
  family?: 'ionicons' | 'material-community' | 'material-icons';
  className?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} className={`w-full flex-row items-center justify-between px-5 py-4 ${className ?? ''}`}>
      <View className="flex-row items-center gap-4">
        <AppIcon family={family} name={icon} size={18} color="#BCCBB9" />
        <Text className="font-ui text-sm text-neutral-on-surface">{title}</Text>
      </View>
      <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
    </TouchableOpacity>
  );
}

export function ProfileSettingsSection({ isSigningOut, onSignOut }: ProfileSettingsSectionProps) {
  const router = useRouter();

  return (
    <View className="mt-8">
      <Text className="font-display mb-4 px-1 text-sm uppercase tracking-wider text-neutral-on-surface-variant">Ajustes de Perfil</Text>
      <View className="overflow-hidden rounded-xl bg-surface-low">
        <TouchableOpacity
          key="edit-profile"
          activeOpacity={0.85}
          onPress={() => router.push('/profile-edit')}
          className="w-full flex-row items-center justify-between px-5 py-4 rounded-t-xl border-b border-neutral-outline-variant/35"
        >
          <View className="flex-row items-center gap-4">
            <AppIcon family="material-community" name="account-edit-outline" size={18} color="#BCCBB9" />
            <Text className="font-ui text-sm text-neutral-on-surface">Editar Perfil</Text>
          </View>
          <AppIcon family="material-icons" name="chevron-right" size={18} color="#BCCBB9" />
        </TouchableOpacity>
        <Row
          family="material-community"
          icon="cog-outline"
          title="Preferencias"
          className="border-b border-neutral-outline-variant/35"
          onPress={() => router.push('/profile/settings' as any)}
        />
        <Row
          family="material-community"
          icon="book-open-variant"
          title="Reglas del Juego"
          className="border-b border-neutral-outline-variant/35"
          onPress={() => router.push('/faq')}
        />

        <TouchableOpacity
          disabled={isSigningOut}
          onPress={onSignOut}
          activeOpacity={0.9}
          className="w-full flex-row items-center justify-between rounded-b-xl px-5 py-4"
        >
          <View className="flex-row items-center gap-4">
            <AppIcon family="material-community" name="logout" size={18} color="#FFB4AB" />
            <Text className="font-uiBold text-sm text-danger-error">Cerrar Sesión</Text>
          </View>
          {isSigningOut && <ActivityIndicator color="#FFB4AB" size="small" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}
