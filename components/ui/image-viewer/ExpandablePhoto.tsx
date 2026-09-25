import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useImageViewer, type OpenViewerParams } from './ImageViewerProvider';

interface Props extends Omit<OpenViewerParams, 'uri'> {
  /** URL resuelta; sin foto no hay nada que ampliar y el toque sigue de largo. */
  uri: string | null;
  children: ReactNode;
  /** Para miniaturas chicas dentro de una fila: agranda la zona tocable. */
  hitSlop?: number;
}

/**
 * Hace ampliable una foto sin cambiar cómo se ve: envuelve lo que ya se
 * dibujaba (un `Avatar`, un `TeamShield` o un escudo armado a mano) en un
 * `Pressable` que abre el visor.
 *
 * Dentro de una fila que navega, el toque sobre la foto lo toma este Pressable
 * (el responder más interno gana) y el resto de la fila sigue navegando: esa
 * es la regla foto → visor, fila → navegación.
 *
 * Sin `uri` no envuelve nada: tocar un placeholder hace lo mismo que tocar la
 * fila. Fuera del `ImageViewerProvider` tampoco (tests, pantallas sueltas).
 */
export function ExpandablePhoto({ uri, children, hitSlop = 0, ...viewerParams }: Props) {
  const viewer = useImageViewer();
  if (!uri || !viewer) return <>{children}</>;

  return (
    <Pressable
      onPress={() => viewer.open({ uri, ...viewerParams })}
      hitSlop={hitSlop}
      accessibilityRole="imagebutton"
      accessibilityLabel={viewerParams.title ? `Ver foto de ${viewerParams.title}` : 'Ver foto'}
    >
      {children}
    </Pressable>
  );
}
