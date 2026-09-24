import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useTeamStore } from '@/stores/teamStore';
import { ReportModal } from '@/components/reports/ReportModal';
import { isBlockedWith } from '@/lib/blocks-data';
import { Logger } from '@/lib/logger';
import { ImageViewerModal, type ViewerAccess, type ViewerAction } from './ImageViewerModal';

/** De quién es la foto: decide el chequeo de bloqueo y qué se denuncia. */
export type ViewerSubject =
  | { kind: 'avatar'; profileId: string }
  | { kind: 'shield'; teamId: string };

export interface OpenViewerParams {
  /** URL ya resuelta (resolveAvatarUrl / resolveShieldUrl). */
  uri: string;
  subject: ViewerSubject;
  /** Nombre del jugador o del equipo, para el título y la accesibilidad. */
  title?: string;
  /**
   * Sólo si quien mira puede cambiar esta foto (la propia, o el escudo del
   * equipo que administra): en vez de "Denunciar", el visor ofrece "Cambiar
   * foto" / "Cambiar escudo" y la llama una vez cerrado.
   */
  onChangePhoto?: () => void;
}

interface ImageViewerContextValue {
  open: (params: OpenViewerParams) => void;
}

const ImageViewerContext = createContext<ImageViewerContextValue | null>(null);

/**
 * `null` fuera del provider. `ExpandablePhoto` lo usa para degradar a una
 * imagen común en vez de romper (tests de componentes, pantallas sueltas).
 */
export function useImageViewer(): ImageViewerContextValue | null {
  return useContext(ImageViewerContext);
}

type ReportTarget = { type: 'USER' | 'TEAM'; id: string };

/**
 * Tiempo máximo que se espera el `onDismiss` de iOS antes de seguir igual. Es
 * una red: si por algún motivo el evento no llega, la denuncia o el selector
 * de fotos no pueden quedar sin abrirse.
 */
const DISMISS_FALLBACK_MS = 600;

/**
 * Visor de fotos de toda la app: una sola instancia del Modal, montada en
 * app/_layout.tsx. Las fotos lo abren con `ExpandablePhoto`.
 *
 * ── Bloqueos ──────────────────────────────────────────────────────────────
 * Con un bloqueo entre las dos personas (en cualquier dirección, D-36) la foto
 * ampliada no se muestra. Es un filtro de interfaz: la miniatura sigue
 * visible en ranking y planteles, y el bucket `avatars` es público. Si la
 * consulta falla se muestra igual (fail-open) por el mismo motivo: esconder la
 * versión grande de algo que ya está a la vista no protege nada.
 *
 * ── Dos Modals en iOS ─────────────────────────────────────────────────────
 * iOS no presenta un Modal mientras otro se está cerrando: el segundo no
 * aparece. "Denunciar" y "Cambiar foto" cierran el visor y recién ejecutan la
 * acción en `onDismiss` (sólo iOS lo dispara; en Android se sigue enseguida).
 */
export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const myProfileId = profile?.id ?? null;

  const [params, setParams] = useState<OpenViewerParams | null>(null);
  const [visible, setVisible] = useState(false);
  const [access, setAccess] = useState<ViewerAccess>('allowed');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  // Lo que hay que hacer cuando el visor termine de cerrarse.
  const afterCloseRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hay un cierre en curso. Sin esto, un onDismiss atrasado del cierre
  // anterior desmontaría una foto que se abrió en el medio.
  const closingRef = useRef(false);
  // Id de apertura: un chequeo de bloqueo que vuelve tarde no pisa otra foto.
  const openIdRef = useRef(0);

  const runAfterClose = useCallback(() => {
    if (!closingRef.current) return;
    closingRef.current = false;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const next = afterCloseRef.current;
    afterCloseRef.current = null;
    setParams(null);
    next?.();
  }, []);

  const close = useCallback(
    (then?: () => void) => {
      afterCloseRef.current = then ?? null;
      closingRef.current = true;
      setVisible(false);
      if (Platform.OS === 'ios') {
        fallbackTimerRef.current = setTimeout(runAfterClose, DISMISS_FALLBACK_MS);
      } else {
        // Android (y web) no disparan onDismiss: se sigue en el próximo tick.
        setTimeout(runAfterClose, 0);
      }
    },
    [runAfterClose],
  );

  useEffect(() => () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
  }, []);

  const open = useCallback(
    (next: OpenViewerParams) => {
      // Un cierre que todavía no terminó (iOS espera el onDismiss) no puede
      // desmontar la foto nueva cuando por fin llega.
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      afterCloseRef.current = null;
      closingRef.current = false;

      const openId = ++openIdRef.current;
      setParams(next);
      setVisible(true);

      const subject = next.subject;
      const needsBlockCheck =
        subject.kind === 'avatar' && myProfileId !== null && subject.profileId !== myProfileId;
      if (!needsBlockCheck) {
        setAccess('allowed');
        return;
      }

      setAccess('checking');
      isBlockedWith(subject.profileId)
        .then((blocked) => {
          if (openId === openIdRef.current) setAccess(blocked ? 'blocked' : 'allowed');
        })
        .catch((error: unknown) => {
          Logger.warn('No se pudo consultar el bloqueo al abrir una foto; se muestra igual', {
            scope: 'ImageViewerProvider.open',
            profileId: subject.profileId,
            error,
          });
          if (openId === openIdRef.current) setAccess('allowed');
        });
    },
    [myProfileId],
  );

  const action = useMemo<ViewerAction | undefined>(() => {
    if (!params) return undefined;
    const { subject, onChangePhoto } = params;

    // Quien abre el visor sólo pasa `onChangePhoto` si puede cambiar la foto
    // (la propia, o el escudo si es del cuerpo técnico que edita el equipo).
    if (onChangePhoto) {
      return {
        label: subject.kind === 'shield' ? 'Cambiar escudo' : 'Cambiar foto',
        icon: 'camera-outline',
        onPress: () => close(onChangePhoto),
      };
    }

    if (subject.kind === 'avatar' && subject.profileId === myProfileId) return undefined;

    // No se ofrece denunciar el escudo de un equipo propio.
    if (subject.kind === 'shield') {
      const isMyTeam = useTeamStore.getState().myTeams.some((team) => team.id === subject.teamId);
      if (isMyTeam) return undefined;
    }

    const target: ReportTarget =
      subject.kind === 'avatar'
        ? { type: 'USER', id: subject.profileId }
        : { type: 'TEAM', id: subject.teamId };
    return {
      label: 'Denunciar',
      icon: 'flag-outline',
      tone: 'danger',
      onPress: () => close(() => setReportTarget(target)),
    };
  }, [params, myProfileId, close]);

  const contextValue = useMemo(() => ({ open }), [open]);

  return (
    <ImageViewerContext.Provider value={contextValue}>
      {children}
      {params ? (
        <ImageViewerModal
          visible={visible}
          uri={params.uri}
          title={params.title}
          access={access}
          action={action}
          onClose={() => close()}
          onDismissed={runAfterClose}
        />
      ) : null}
      {reportTarget ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          entityType={reportTarget.type}
          entityId={reportTarget.id}
        />
      ) : null}
    </ImageViewerContext.Provider>
  );
}
