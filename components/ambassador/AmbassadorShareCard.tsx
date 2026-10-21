import { useCallback, useState } from 'react';
import { Share, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { buildAmbassadorInviteMessage } from '@/lib/ambassador-data';
import { shareActivityType, trackShareIntent } from '@/lib/share-analytics';
import { Logger } from '@/lib/logger';

type AmbassadorShareCardProps = {
  profileId: string;
  username: string;
  onError: (message: string) => void;
};

/** «Invitá a un equipo»: comparte el link del embajador con `?emb=1`. */
export function AmbassadorShareCard({ profileId, username, onError }: AmbassadorShareCardProps) {
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    let activityType: string | undefined;
    try {
      const result = await Share.share({ message: buildAmbassadorInviteMessage(username) });
      activityType = shareActivityType(result);
    } catch (error) {
      Logger.error('No se pudo compartir la invitación de embajador', {
        scope: 'AmbassadorShareCard.handleShare',
        error,
      });
      onError('No pudimos abrir el menú de compartir. Intentá de nuevo.');
    } finally {
      trackShareIntent({ target: 'generic', contentType: 'ambassador', profileId, activityType });
      setSharing(false);
    }
  }, [sharing, username, profileId, onError]);

  return (
    <View className="mt-4 rounded-2xl bg-surface-container p-4">
      <View className="flex-row items-center gap-2">
        <AppIcon family="material-community" name="account-group-outline" size={20} color="#53E076" />
        <Text className="font-uiBold text-sm text-neutral-on-surface">Invitá a un equipo</Text>
      </View>
      <Text className="font-ui mt-1 text-xs leading-5 text-neutral-on-surface-variant">
        Cuando el capitán crea su equipo, tiene que poner tu usuario ({username}) en «¿Quién los invitó?».
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={sharing}
        onPress={() => void handleShare()}
        accessibilityRole="button"
        className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5"
      >
        <AppIcon family="material-community" name="share-variant" size={18} color="#003914" />
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">
          Compartir invitación
        </Text>
      </TouchableOpacity>
    </View>
  );
}
