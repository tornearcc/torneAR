import { useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { openLegalDocument, type LegalDocument } from '@/constants/legal';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { recordLegalAcceptance } from '@/lib/auth-data';
import { Logger } from '@/lib/logger';

interface Props {
  /**
   * Documentos a re-aceptar (sesión completa + versión aceptada vieja). Vacío
   * = no se muestra.
   */
  documents: LegalDocument[];
}

const COPY: Record<'terms' | 'privacy' | 'both', { title: string; body: string }> = {
  terms: {
    title: 'Actualizamos los Términos',
    body: 'Actualizamos nuestros Términos y Condiciones. Para seguir usando torneAR necesitás aceptar la nueva versión.',
  },
  privacy: {
    title: 'Actualizamos la Política de Privacidad',
    body: 'Actualizamos nuestra Política de Privacidad. Para seguir usando torneAR necesitás aceptar la nueva versión.',
  },
  both: {
    title: 'Actualizamos los Términos y la Política',
    body: 'Actualizamos los Términos y Condiciones y la Política de Privacidad. Para seguir usando torneAR necesitás aceptar las nuevas versiones.',
  },
};

const LINK_LABEL: Record<LegalDocument, string> = {
  terms: 'Leer los Términos actualizados',
  privacy: 'Leer la Política actualizada',
};

/**
 * Modal de re-aceptación de los Términos y Condiciones y/o la Política de
 * Privacidad.
 *
 * Mismo criterio de no-descartable que `AppUpdateModal`: sin
 * `onRequestClose` que cierre, sin botón de cerrar ni tap-fuera. La decisión
 * de CUÁNDO mostrarse y QUÉ documentos pedir la calcula
 * `legalDocumentsToAccept` (lib/auth-data.ts) en `app/_layout.tsx`,
 * comparando `tyc_version` y `privacy_version` contra `LEGAL_VERSIONS` —
 * este componente sólo resuelve la acción de aceptar, no decide si
 * corresponde mostrarse.
 *
 * "Aceptar" reusa `recordLegalAcceptance()` (ya existía para el alta por
 * Google): dispara `supabase.auth.updateUser()` con la constancia
 * versionada actual. Sin nada más que hacer acá para destrabar la
 * navegación — `updateUser` dispara `USER_UPDATED`, `AuthContext` recoge la
 * metadata nueva sola, y `visible` pasa a `false` porque el `user` con el
 * que se recalcula en `_layout.tsx` ya cambió.
 */
export function LegalVersionGate({ documents }: Props) {
  const visible = documents.length > 0;
  const copy =
    COPY[documents.length > 1 ? 'both' : documents[0] === 'privacy' ? 'privacy' : 'terms'];
  const [accepting, setAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setErrorMessage(null);

    const { error } = await recordLegalAcceptance();

    setAccepting(false);

    if (error) {
      Logger.error('No se pudo registrar la re-aceptación de los documentos legales', {
        scope: 'LegalVersionGate.handleAccept',
        documents,
        error,
      });
      setErrorMessage(getGenericSupabaseErrorMessage(error));
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => {}}>
      <View className="flex-1 items-center justify-center bg-black/85 px-6">
        <View className="w-full max-w-sm rounded-3xl bg-surface-container p-6">
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-primary/15">
              <AppIcon family="material-community" name="file-document-outline" size={32} color="#53E076" />
            </View>

            <Text className="font-displayBlack mt-4 text-center text-2xl text-neutral-on-surface">
              {copy.title}
            </Text>

            <Text className="font-ui mt-3 text-center text-sm leading-5 text-neutral-on-surface-variant">
              {copy.body}
            </Text>
          </View>

          {documents.map((doc, index) => (
            <TouchableOpacity
              key={doc}
              onPress={() => void openLegalDocument(doc)}
              activeOpacity={0.7}
              className={`${index === 0 ? 'mt-5' : 'mt-3'} items-center`}
            >
              <Text className="font-uiBold text-xs uppercase tracking-wide text-brand-primary underline">
                {LINK_LABEL[doc]}
              </Text>
            </TouchableOpacity>
          ))}

          {errorMessage && (
            <Text className="font-ui mt-3 text-center text-xs text-danger-error">{errorMessage}</Text>
          )}

          <TouchableOpacity
            onPress={() => void handleAccept()}
            disabled={accepting}
            activeOpacity={0.85}
            className={`mt-5 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 ${
              accepting ? 'opacity-60' : ''
            }`}
          >
            {accepting ? (
              <ActivityIndicator color="#003914" />
            ) : (
              <>
                <AppIcon family="material-community" name="check-circle-outline" size={18} color="#003914" />
                <Text className="font-uiBold text-sm text-[#003914]">Aceptar nueva versión</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
