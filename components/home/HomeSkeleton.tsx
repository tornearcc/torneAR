import { View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Silueta de app/(tabs)/index.tsx (rediseño, etapa 1): la barra de 3 pasos, la
 * tarjeta «Tu próximo paso» y las filas de equipos. Reemplaza al GlobalLoader a
 * pantalla completa para que la estructura no desaparezca durante el fetch.
 */
export function HomeSkeleton() {
  return (
    <View className="flex-1 px-4" style={{ paddingTop: 18 }}>
      {/* JourneyBar: 3 pasos */}
      <View className="mb-5 flex-row gap-1.5">
        <Skeleton className="flex-1 rounded" style={{ height: 22 }} />
        <Skeleton className="flex-1 rounded" style={{ height: 22 }} />
        <Skeleton className="flex-1 rounded" style={{ height: 22 }} />
      </View>

      {/* NextStepCard */}
      <Skeleton className="mb-5 rounded-2xl" style={{ height: 210 }} />

      {/* TeamSummaryRow */}
      <Skeleton className="mb-2.5 rounded-2xl" style={{ height: 80 }} />

      {/* Sugeridos / censo */}
      <Skeleton className="mb-2.5 rounded-2xl" style={{ height: 120 }} />
    </View>
  );
}
