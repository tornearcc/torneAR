import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Silueta de app/team-manage.tsx.
 *
 * La cabecera es el `SecondaryHeader` real y no un placeholder: replicarla a
 * mano fue justamente lo que produjo el salto visual del QA — el skeleton habia
 * quedado con la cabecera vieja (boton de atras suelto arriba, titulo en `3xl`)
 * y al terminar de cargar todo el bloque cambiaba de alto y de tipografia. Con
 * el componente real, el unico cambio al cargar es el contenido de abajo.
 *
 * Titulo y subtitulo tienen que coincidir con los de la pantalla, si no el
 * salto vuelve por el alto del subtitulo.
 *
 * Ademas el boton de retroceso queda funcional durante la carga: el usuario
 * puede volver en vez de quedar atrapado en un loader.
 */
export function TeamManageSkeleton() {
  return (
    // `edges={['bottom']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-base">
      <SecondaryHeader
        title="Gestión de equipo"
        subtitle="Administracion y estado de tu plantel."
      />

      {/* `paddingTop: 18` = el del ScrollView de la pantalla. */}
      <View className="px-4" style={{ paddingTop: 18 }}>
        {/* TeamManageHeader: escudo + datos + codigo de invitacion */}
        <Skeleton className="rounded-2xl" style={{ height: 180 }} />

        {/* Solicitudes pendientes */}
        <Skeleton className="mt-4 rounded-xl" style={{ height: 96 }} />

        {/* Plantel */}
        <View className="mt-4 rounded-xl bg-surface-low p-4">
          <Skeleton className="mb-3 rounded" style={{ height: 12, width: '35%' }} />
          <Skeleton className="mb-2 rounded-lg" style={{ height: 56 }} />
          <Skeleton className="mb-2 rounded-lg" style={{ height: 56 }} />
          <Skeleton className="rounded-lg" style={{ height: 56 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}
