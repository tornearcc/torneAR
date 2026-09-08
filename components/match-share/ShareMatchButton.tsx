import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { shareGeneric } from '@/lib/share-image';
import { shareToInstagramStories } from '@/lib/instagram-stories';
import { downloadShareCard, ShareCardError } from '@/lib/share-card-remote';
import { trackShareIntent } from '@/lib/share-analytics';
import { useAuth } from '@/context/AuthContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { Logger } from '@/lib/logger';

interface Props {
  matchId: string;
  myTeamId: string;
}

/**
 * Proporción de la tarjeta del servidor: 1080×1920 (9:16, formato Story).
 *
 * OJO: no es la de `MatchShareCard`, que es 1080×1350 (4:5, formato feed).
 * Son dos artes distintas y el preview ahora muestra la primera, así que la
 * caja del modal cambió de forma — no alcanzaba con cambiar el contenido.
 */
const CARD_RATIO = 1080 / 1920;

/** Tope de ancho del preview. La altura sale del ratio, nunca al revés. */
const PREVIEW_MAX_WIDTH = 300;
/** Fracción de la pantalla que el preview puede ocupar de alto. */
const PREVIEW_MAX_HEIGHT_FRACTION = 0.55;

type ShareTarget = 'instagram' | 'generic';

type CardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; uri: string }
  | { status: 'error'; message: string; retryable: boolean };

/** Los dos estados terminales: lo único que la descarga llega a producir. */
type CardOutcome = Extract<CardState, { status: 'ready' } | { status: 'error' }>;

/**
 * Botón + modal de preview de la tarjeta compartible.
 *
 * El preview muestra el PNG REAL que se va a compartir: se descarga de
 * `/api/og/share-match` al abrir el modal y se dibuja con `<Image>`. Antes
 * dibujaba `MatchShareCard` (componente nativo) y compartía otra imagen
 * distinta; ahora lo que se ve es exactamente lo que se entrega.
 *
 * Consecuencia buscada: cuando el usuario toca "Instagram" o "Más opciones",
 * el archivo YA está en la caché del dispositivo y el share abre al instante.
 * La espera se movió a la apertura del modal, donde hay un spinner que la
 * explica, en vez de estar después del toque, donde se siente como un cuelgue.
 *
 * ─── Lo que este componente dejó de usar ──────────────────────────────────
 * `fetchMatchShareViewData`, `MatchShareCard` y `deriveMatchOutcome` ya no se
 * importan: sin tarjeta nativa que dibujar, no hay datos que traer. La
 * consulta a Supabase que hacía al abrir el modal desapareció con ellos.
 * `MatchShareCard` sigue viva en el banco de QA de
 * `app/(modals)/share-card-preview.tsx`, así que no es código muerto.
 */
export function ShareMatchButton({ matchId, myTeamId }: Props) {
  const [visible, setVisible] = useState(false);
  // Sólo el desenlace de la descarga. `idle` y `loading` no son estado: se
  // derivan de si el modal está abierto y de si ya hay desenlace. Guardarlos
  // obligaba a encenderlos a mano desde el efecto, que es un setState síncrono
  // dentro de él.
  const [outcome, setOutcome] = useState<CardOutcome | null>(null);
  const card = useMemo<CardState>(
    () => (!visible ? { status: 'idle' } : (outcome ?? { status: 'loading' })),
    [visible, outcome],
  );
  // Cuál de los dos botones está en vuelo — null = ninguno. Se usa para
  // deshabilitar ambos y mostrar el spinner en el que corresponde, en vez de
  // un solo booleano que no distinguiría cuál se tocó.
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const { showAlert, AlertComponent } = useCustomAlert();
  // Sólo para la instrumentación (Fase 6.2): `app_logs.user_id` lo llena el
  // Logger con el id de AUTH, así que el id de PERFIL hay que pasarlo a mano
  // — es el que cruza contra el resto del dominio. Ver `lib/share-analytics.ts`.
  const { profile } = useAuth();

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  /**
   * El preview se dimensiona contra la pantalla, no con una constante.
   *
   * 300px de ancho en 9:16 son 533 de alto, y sumándole botones y el "Cerrar"
   * eso no entra en un teléfono chico. Se toma el menor entre el tope de
   * ancho y lo que permita el alto disponible, y el otro lado sale del ratio
   * — así nunca se recorta ni se deforma, en ninguna pantalla.
   */
  const previewWidth = Math.min(
    PREVIEW_MAX_WIDTH,
    windowWidth - 48,
    windowHeight * PREVIEW_MAX_HEIGHT_FRACTION * CARD_RATIO,
  );
  const previewHeight = previewWidth / CARD_RATIO;

  const toOutcome = useCallback(
    (error: unknown): CardOutcome => {
      if (error instanceof ShareCardError) {
        Logger.warn('No se pudo preparar la tarjeta compartible', {
          scope: 'ShareMatchButton.loadCard',
          matchId,
          reason: error.reason,
        });
        // `not-shareable` y `not-found` no se arreglan reintentando: el
        // partido no tiene un resultado publicable. Los otros dos (sesión,
        // red) sí, y por eso el botón de reintentar aparece sólo ahí.
        return {
          status: 'error',
          message: error.message,
          retryable: error.reason === 'network' || error.reason === 'unauthenticated',
        };
      }

      Logger.error('Fallo inesperado al preparar la tarjeta compartible', {
        scope: 'ShareMatchButton.loadCard',
        matchId,
        error,
      });
      return {
        status: 'error',
        message: 'No se pudo generar la imagen. Intentá de nuevo.',
        retryable: true,
      };
    },
    [matchId],
  );

  /**
   * Dispara la descarga al abrir, y limpia al cerrar.
   *
   * Se vuelve a descargar en CADA apertura en vez de cachear el uri en el
   * componente: si una resolución de disputa corrigió el marcador, la segunda
   * apertura tiene que mostrar el resultado nuevo. El costo es un request por
   * apertura, con el spinner a la vista.
   */
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    // Limpiar en el flanco de cierre, durante el render: si se hiciera desde el
    // efecto quedaría un frame con la tarjeta anterior a la vista mientras el
    // modal se cierra.
    setWasVisible(visible);
    if (!visible) setOutcome(null);
  }

  // `outcome === null` es la señal de "hay que descargar": la pone la apertura
  // y la vuelve a poner el botón de reintentar. Así el efecto no necesita
  // encender un 'loading' desde su cuerpo.
  useEffect(() => {
    if (!visible || outcome !== null) return;

    let cancelled = false;
    downloadShareCard(matchId)
      .then((uri) => {
        if (!cancelled) setOutcome({ status: 'ready', uri });
      })
      .catch((error: unknown) => {
        if (!cancelled) setOutcome(toOutcome(error));
      });

    return () => {
      cancelled = true;
    };
  }, [visible, outcome, matchId, toOutcome]);

  const closePreview = useCallback(() => {
    if (sharing) return; // no cerrar a mitad de un share en vuelo
    setVisible(false);
  }, [sharing]);

  const handleShare = useCallback(
    async (target: ShareTarget) => {
      // Sin imagen lista no hay nada que compartir. Los botones ya están
      // deshabilitados en ese estado; esto es la red de seguridad.
      if (sharing || card.status !== 'ready') return;
      setSharing(target);

      // Se registra ACÁ y no después del share: lo único medible de nuestro
      // lado es la intención (Meta no devuelve nada sobre la Story).
      // `trackShareIntent` devuelve `void` y nunca tira, así que no puede
      // demorar ni romper el flujo del usuario.
      trackShareIntent({
        target,
        profileId: profile?.id ?? null,
        matchId,
        teamId: myTeamId,
      });

      try {
        // Sin descarga acá: el archivo ya está en disco desde que se abrió el
        // modal. Este `await` es sólo el diálogo del sistema.
        if (target === 'instagram') {
          await shareToInstagramStories(card.uri);
        } else {
          await shareGeneric(card.uri);
        }
      } catch (error) {
        // `shareToInstagramStories` no tira nunca (degrada al share genérico),
        // así que llegar acá significa que falló el share nativo en sí.
        Logger.error('Fallo inesperado al compartir la tarjeta', {
          scope: 'ShareMatchButton.handleShare',
          target,
          matchId,
          error,
        });
        showAlert('Error al compartir', 'No se pudo abrir el menú de compartir. Intentá de nuevo.');
      } finally {
        setSharing(null);
      }
    },
    [sharing, card, matchId, myTeamId, profile?.id, showAlert],
  );

  const canShare = card.status === 'ready' && !sharing;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setVisible(true)}
        className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5"
      >
        <AppIcon family="material-community" name="share-variant" size={18} color="#003914" />
        <Text className="font-displayBlack text-sm uppercase tracking-wide text-[#003914]">
          Compartir resultado
        </Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closePreview}>
        <View className="flex-1 items-center justify-center bg-black/85 px-6">
          {/* La caja mide lo mismo en los tres estados: así el modal no salta
              de tamaño cuando la imagen termina de bajar. */}
          <View
            style={{ width: previewWidth, height: previewHeight }}
            className="items-center justify-center overflow-hidden rounded-[20px] border border-white/10 bg-[#0E0E0E]"
          >
            {card.status === 'ready' ? (
              <Image
                source={{ uri: card.uri }}
                style={{ width: previewWidth, height: previewHeight, resizeMode: 'contain' }}
                // El nombre del archivo es único por descarga
                // (lib/share-card-remote.ts), así que no hace falta romper la
                // caché de <Image> a mano: nunca hay dos PNGs distintos bajo
                // el mismo uri.
              />
            ) : card.status === 'error' ? (
              <View className="items-center px-6">
                <AppIcon family="material-community" name="image-off-outline" size={36} color="#BCCBB9" />
                <Text className="mt-3 text-center font-uiRegular text-sm text-neutral-on-surface-variant">
                  {card.message}
                </Text>
                {card.retryable ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setOutcome(null)}
                    className="mt-4 rounded-lg border border-brand-primary px-5 py-2"
                  >
                    <Text className="font-displayBlack text-xs uppercase tracking-wide text-brand-primary">
                      Reintentar
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <>
                <ActivityIndicator size="large" color="#53E076" />
                <Text className="mt-3 font-uiRegular text-xs text-neutral-on-surface-variant">
                  Generando tu tarjeta…
                </Text>
              </>
            )}
          </View>

          <View className="mt-6 w-full max-w-sm flex-row gap-3">
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!canShare}
              onPress={() => void handleShare('instagram')}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#E1306C] py-3.5 ${
                canShare ? '' : 'opacity-40'
              }`}
            >
              {sharing === 'instagram' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <AppIcon family="material-community" name="instagram" size={18} color="#FFFFFF" />
                  <Text className="font-displayBlack text-xs uppercase tracking-wide text-white">
                    Instagram
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!canShare}
              onPress={() => void handleShare('generic')}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-surface-container py-3.5 ${
                canShare ? '' : 'opacity-40'
              }`}
            >
              {sharing === 'generic' ? (
                <ActivityIndicator size="small" color="#E5E2E1" />
              ) : (
                <>
                  <AppIcon family="material-community" name="share-variant" size={18} color="#E5E2E1" />
                  <Text className="font-displayBlack text-xs uppercase tracking-wide text-neutral-on-surface">
                    Más opciones
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={closePreview} disabled={!!sharing} className="mt-6 px-6 py-3">
            <Text className="font-uiBold text-sm text-neutral-on-surface-variant">Cerrar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {AlertComponent}
    </>
  );
}
