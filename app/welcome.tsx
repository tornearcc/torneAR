import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/AppIcon';
import { fetchAmbassadorProgramEnabled } from '@/lib/ambassador-data';
import { Logger } from '@/lib/logger';
import { welcomeIntents, type WelcomeIntent } from '@/lib/welcome-intents';

/**
 * «¿Qué venís a hacer?» — una sola vez, al terminar el onboarding (el guard de
 * `_layout` manda acá en vez de al inicio cuando no hay un deep link
 * pendiente). Ver `lib/welcome-intents.ts`.
 *
 * Cada opción reemplaza esta pantalla por el inicio y abre la elegida encima:
 * al volver, la persona queda en el inicio y no en esta pantalla.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const [ambassadorEnabled, setAmbassadorEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAmbassadorProgramEnabled().then((enabled) => {
      if (!cancelled) setAmbassadorEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (intent: WelcomeIntent | null) => {
    Logger.info('Intención elegida al terminar el registro', {
      event: 'welcome.intent',
      intent: intent?.id ?? 'skip',
    });

    if (!intent) {
      router.replace('/(tabs)');
    } else if (intent.href.startsWith('/(tabs)')) {
      router.replace(intent.href);
    } else {
      router.replace('/(tabs)');
      router.push(intent.href);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingTop: 32, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="font-display text-3xl text-neutral-on-surface">¿Qué venís a hacer?</Text>
        <Text className="font-ui mt-2 text-base leading-6 text-neutral-on-surface-variant">
          Elegí por dónde arrancar. Después podés hacer todo lo demás desde la app.
        </Text>

        <View className="mt-8 gap-3">
          {welcomeIntents(ambassadorEnabled).map((intent) => (
            <TouchableOpacity
              key={intent.id}
              onPress={() => choose(intent)}
              activeOpacity={0.85}
              className="flex-row items-center gap-4 rounded-2xl border border-neutral-outline-variant/15 bg-surface-low p-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-surface-high">
                <AppIcon name={intent.icon} size={26} color="#53E076" />
              </View>
              <View className="flex-1">
                <Text className="font-display text-lg text-neutral-on-surface">{intent.title}</Text>
                <Text className="font-ui mt-1 text-sm leading-5 text-neutral-on-surface-variant">
                  {intent.description}
                </Text>
              </View>
              <AppIcon name="chevron-right" size={22} color="#8A8F98" />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={() => choose(null)} activeOpacity={0.7} className="mt-8 items-center py-3">
          <Text className="font-ui text-base text-neutral-on-surface-variant">Prefiero mirar primero</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
