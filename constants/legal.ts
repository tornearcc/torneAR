import { Linking } from 'react-native';
import { Logger } from '@/lib/logger';
import { TERMS_LAST_UPDATED } from '@/components/legal/termsContent';
import { PRIVACY_LAST_UPDATED } from '@/components/legal/privacyContent';

/**
 * Destinos de los documentos legales.
 *
 * Modo activo: `'external'`. `tornear.vercel.app/legal/tyc` y `/legal/privacidad`
 * ya están publicados (torneAR/dashboard, Hito 1) con el mismo texto
 * versionado que `components/legal/` — dejaron de ser un placeholder.
 *
 * Antes era `'in-app'` porque el dominio todavía no existía: un
 * consentimiento contra un documento inaccesible no prueba nada. El
 * checkbox de registro y la pantalla de onboarding no se tocaron — leen
 * `LEGAL_LINK_MODE` desde acá, no hace falta cambiar nada del lado de la UI.
 */
export const LEGAL_LINK_MODE: 'external' | 'in-app' = 'external';

export const LEGAL_URLS = {
  terms: 'https://tornear.vercel.app/legal/tyc',
  privacy: 'https://tornear.vercel.app/legal/privacidad',
} as const;

/** Rutas equivalentes dentro de la app, ya implementadas y con contenido real. */
export const LEGAL_ROUTES = {
  terms: '/(modals)/terms',
  privacy: '/(modals)/privacy',
} as const;

export type LegalDocument = keyof typeof LEGAL_URLS;

/**
 * Versión de cada documento aceptada por el usuario. Se guarda junto al
 * consentimiento: sin esto, "aceptó los TyC" no dice QUÉ texto aceptó, y ante
 * un reclamo la prueba no sirve porque el documento pudo haber cambiado.
 */
export const LEGAL_VERSIONS = {
  terms: TERMS_LAST_UPDATED,
  privacy: PRIVACY_LAST_UPDATED,
} as const;

/**
 * Abre un documento legal. Se resuelve por `LEGAL_LINK_MODE`, no por el
 * llamador, para que exista un solo lugar donde cambiar la estrategia.
 *
 * `openURL` puede rechazar (sin navegador, URL inválida, intent bloqueado):
 * se loguea y se sigue en vez de tirar la excepción a un `onPress` sin catch,
 * que en RN termina como unhandled rejection.
 */
export async function openLegalDocument(doc: LegalDocument): Promise<void> {
  const url = LEGAL_URLS[doc];
  try {
    await Linking.openURL(url);
  } catch (error) {
    Logger.warn('No se pudo abrir el documento legal', {
      scope: 'legal.openLegalDocument',
      doc,
      url,
      error,
    });
  }
}
