import { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { getInitials } from '@/lib/market-utils';
import { CLUB_CRESTS } from './club-crests';

interface Props {
  logoUrl: string | null;
  teamName: string;
  size?: number;
}

/**
 * Escudo de un club con degradación a iniciales.
 *
 * Primero usa el escudo guardado en la app (`assets/escudos`, ver
 * `club-crests.ts`): se dibuja al instante y sin red. Desde el 25/11/2026 es el
 * camino normal, porque los que se cargaban de football-logos.cc quedaban en
 * algunos celulares en un círculo gris (cargando para siempre, sin `onError`).
 *
 * `logoUrl` queda de respaldo para un club que esté en el catálogo y todavía no
 * tenga su archivo local. El fallback a iniciales NO es decorativo: cubre
 * 'Otro / No tengo' y cualquier URL remota que falle (los hashes del sitio
 * cambian si reconstruye sus assets).
 */
export function ClubCrest({ logoUrl, teamName, size = 40 }: Props) {
  const [failed, setFailed] = useState(false);
  const local = CLUB_CRESTS[teamName.trim()];
  const source = local ?? (logoUrl ? { uri: logoUrl } : null);
  const showFallback = source === null || failed;

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full border border-neutral-outline/20 bg-surface-high"
      style={{ width: size, height: size }}
    >
      {showFallback ? (
        <Text
          className="font-displayBlack text-neutral-on-surface-variant"
          style={{ fontSize: size * 0.36 }}
        >
          {getInitials(teamName)}
        </Text>
      ) : (
        <Image
          source={source}
          style={{ width: size * 0.82, height: size * 0.82 }}
          contentFit="contain"
          // Los locales no necesitan transición: aparecen en el primer frame.
          transition={local ? 0 : 150}
          onError={() => setFailed(true)}
          accessibilityLabel={`Escudo de ${teamName}`}
        />
      )}
    </View>
  );
}
