import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { Logger } from '@/lib/logger';
import { welcomeIntents, type WelcomeIntent } from '@/lib/welcome-intents';

/**
 * «¿Qué venís a hacer?» (rediseño, etapa 2; spec §8.1, pantalla 1a): explica la
 * app en una línea y ofrece 3 caminos. Se muestra una vez, al terminar el
 * onboarding. `welcome.intent` queda en app_logs para medir qué eligen.
 */
export default function WelcomeScreen() {
  const router = useRouter();

  const choose = (intent: WelcomeIntent | null) => {
    Logger.info('Intención elegida al terminar el registro', {
      event: 'welcome.intent',
      intent: intent?.id ?? 'skip',
    });
    router.replace('/(tabs)');
    if (intent) router.push(intent.href);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <ScrollView className="px-5" contentContainerStyle={{ paddingTop: 32, paddingBottom: 32, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <Text className="font-displayBlack text-[22px] text-brand-primary">TORNEAR</Text>
        <Text className="font-displayBlack mt-2.5 text-[40px] uppercase leading-[40px] text-neutral-on-surface">¿Qué venís a hacer?</Text>
        <Text className="font-ui mt-2.5 text-[15px] leading-[22px] text-neutral-on-surface-variant">
          TorneAR es un ranking de fútbol amateur: armás tu equipo, desafiás a rivales de tu zona y cada partido suma.
        </Text>

        <View className="mt-6 gap-3">
          {welcomeIntents().map((intent, i) => {
            const first = i === 0;
            return (
              <TouchableOpacity
                key={intent.id}
                onPress={() => choose(intent)}
                activeOpacity={0.85}
                className={`flex-row items-center gap-3.5 rounded-2xl p-4 ${first ? 'border border-brand-primary/45 bg-brand-primary/10' : 'bg-surface-container'}`}
              >
                <View className={`h-12 w-12 items-center justify-center rounded-xl ${first ? 'bg-brand-primary' : 'bg-surface-high'}`}>
                  <AppIcon name={intent.icon} size={24} color={first ? '#0E0E0E' : '#53E076'} />
                </View>
                <View className="flex-1">
                  <Text className="font-uiBold text-base text-neutral-on-surface">{intent.title}</Text>
                  <Text className="font-ui mt-0.5 text-[13px] leading-5 text-neutral-on-surface-variant">{intent.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-1" />

        <View className="mt-8 items-center gap-3">
          <View className="flex-row gap-4" accessibilityLabel="Cómo funciona">
            <Text className="font-ui text-xs text-neutral-outline">1 · Tu equipo</Text>
            <Text className="font-ui text-xs text-neutral-outline">2 · Un rival</Text>
            <Text className="font-ui text-xs text-neutral-outline">3 · El partido suma</Text>
          </View>
          <TouchableOpacity onPress={() => choose(null)} activeOpacity={0.7} className="px-4 py-3">
            <Text className="font-uiBold text-[15px] text-brand-primary">Prefiero mirar primero</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
