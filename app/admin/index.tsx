import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';

interface AdminEntry {
  route: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
}

const ENTRIES: AdminEntry[] = [
  {
    route: '/admin/dispute-review',
    icon: 'scale-balance',
    color: '#FFB4AB',
    title: 'Disputas',
    subtitle: 'Resolver partidos trabados por empate de votos y Fair Play',
  },
  {
    route: '/admin/season',
    icon: 'calendar-refresh-outline',
    color: '#8CCDFF',
    title: 'Temporadas',
    subtitle: 'Cerrar la temporada activa y abrir la siguiente',
  },
  {
    route: '/admin/logs',
    icon: 'text-box-search-outline',
    color: '#53E076',
    title: 'Logs de la app',
    subtitle: 'Telemetría de errores silenciosos reportados por los clientes',
  },
  {
    // Vive en `(modals)` y no en `admin/` porque es la misma pantalla que
    // `router.push` en `__DEV__` — un solo componente, dos puertas de entrada.
    route: '/(modals)/share-card-preview',
    icon: 'image-outline',
    color: '#8CCDFF',
    title: 'Preview de tarjeta de resultado',
    subtitle: 'Herramienta de QA visual — casos límite de MatchShareCard',
  },
];

export default function AdminIndexScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin === true;

  // ─── Gating ───────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-base px-6">
        <AppIcon family="material-community" name="lock-outline" size={44} color="#869585" />
        <Text className="font-display mt-3 text-xl text-neutral-on-surface">Acceso denegado</Text>
        <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">
          Esta sección es solo para administradores de la liga.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          className="mt-5 rounded-xl bg-surface-high px-5 py-2.5"
        >
          <Text className="font-uiBold text-sm text-neutral-on-surface">Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-base">
      {/* `pt-14` fijo (56px) era el bug: en Android sin notch sobraba y en iOS
          con Dynamic Island el titulo quedaba debajo de la barra de estado. */}
      <SecondaryHeader title="Panel de administración" />

      <View className="px-4 pt-3">
        {ENTRIES.map((entry) => (
          <TouchableOpacity
            key={entry.route}
            onPress={() => router.push(entry.route as never)}
            activeOpacity={0.8}
            className="mb-3 flex-row items-center gap-3 rounded-2xl bg-surface-container p-4"
          >
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-surface-high">
              <AppIcon family="material-community" name={entry.icon} size={22} color={entry.color} />
            </View>
            <View className="flex-1">
              <Text className="font-uiBold text-sm text-neutral-on-surface">{entry.title}</Text>
              <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant">{entry.subtitle}</Text>
            </View>
            <AppIcon family="material-community" name="chevron-right" size={22} color="#869585" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
