import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

/**
 * Padding inferior de una barra fija anclada al fondo (el input de los chats).
 *
 * Devuelve **todo** el espacio que la barra necesita abajo, tanto en reposo como
 * con el teclado abierto, en las DOS plataformas. Es el único dueño de ese
 * espacio: no debe haber un `KeyboardAvoidingView` empujando además, o se suman
 * dos empujes.
 *
 * ## Por qué el cálculo no se delega en el KeyboardAvoidingView
 *
 * El KAV no mide el teclado: mide **su propio frame** contra la coordenada
 * absoluta del teclado. De `KeyboardAvoidingView.js` (RN 0.81):
 *
 *     const keyboardY = keyboardFrame.screenY - keyboardVerticalOffset;
 *     return Math.max(frame.y + frame.height - keyboardY, 0);
 *
 * `frame` viene del `onLayout` del propio KAV —relativo a su padre— mientras
 * que `screenY` es absoluta. Las dos coordenadas sólo coinciden si el contenedor
 * llega hasta el borde inferior de la PANTALLA y arranca en su origen, y en esta
 * app eso no se cumple en ningún chat:
 *
 *   · `app/(modals)/chat.tsx` se presenta con `presentation: 'modal'`, o sea una
 *     hoja desplazada hacia abajo. `frame.y + frame.height` termina valiendo el
 *     alto de la hoja, no el de la pantalla, y el KAV empuja de menos por
 *     exactamente ese desplazamiento: el input queda tapado a medias.
 *   · En Android, con edge-to-edge el frame se extiende por debajo de la barra
 *     de navegación mientras el evento de cierre reporta la coordenada por
 *     encima de ella: al replegarse el teclado queda un **residuo** del alto de
 *     la barra que nunca vuelve a cero (auditoría E2E, módulo 3.3).
 *
 * `endCoordinates.height` no tiene ese problema: es el alto real del teclado y
 * no depende de dónde esté montada la vista. Por eso el empuje se calcula acá y
 * el KAV no participa en ninguna plataforma.
 *
 * ## El inset de reposo se congela
 *
 * Con el IME abierto el teclado es un system inset más, y el provider puede
 * reportar `insets.bottom` inflado con su altura. Por eso el valor de reposo se
 * captura sólo mientras el teclado está cerrado: la posición de descanso no
 * depende de lo que informe el provider durante la animación.
 *
 * @param gap Aire mínimo entre la barra y lo que tenga debajo (gesture bar o
 *            teclado). Sin esto el input quedaba flush contra la barra del
 *            sistema y el botón de enviar competía con el gesto de "volver".
 */
export function useKeyboardAwareBottomInset(gap = 8): number {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  // Reposo: la altura real de la gesture bar (o de los botones) más el aire.
  //
  // El valor de reposo se lee directo de `insets.bottom` en vez de copiarse a
  // un estado desde un efecto. La copia no aportaba nada: sólo se leía en esta
  // rama —con el teclado abierto el retorno de abajo ni la mira— y el efecto la
  // igualaba a `insets.bottom` apenas `keyboardHeight` volvía a 0, así que
  // nunca hubo un frame pintado en el que difirieran. Lo único que agregaba era
  // un render extra por cada cambio del inset.
  if (keyboardHeight === 0) {
    return insets.bottom + gap;
  }

  // Teclado abierto: el inset de reposo ya no corresponde — el teclado tapa la
  // barra del sistema, y su alto es todo el espacio que hay que reservar. La
  // barra queda apoyada justo sobre el teclado y la lista de mensajes se
  // comprime, que es el layout que se busca.
  return keyboardHeight + gap + insets.bottom;
}
