import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { Logger } from '@/lib/logger';

/**
 * «¿No está tu ciudad / tu cancha?» — pedido de zona o cancha por Instagram.
 *
 * Por qué Instagram y no un formulario: el equipo ya contesta los mensajes de
 * @tornear.app, la conversación sirve para que esa persona arme su equipo y no
 * suma otra bandeja para mirar. Las zonas y canchas se cargan a mano con lo
 * que manden (D-75).
 *
 * `ig.me` abre el chat directo con la cuenta, pero no deja precargar el texto:
 * el mensaje se copia al portapapeles y la pantalla avisa que hay que pegarlo.
 * Cada toque queda en `app_logs` (`event: place_request`) con lo que la persona
 * buscó, así se sabe qué falta aunque después no escriba.
 */

export type PlaceKind = 'zona' | 'cancha';

/** De dónde vino el pedido, para leer los registros. */
export type PlaceRequestSurface =
  | 'zone_select'
  | 'market_create'
  | 'rival_post_create'
  | 'proposal'
  | 'profile';

export const TORNEAR_INSTAGRAM_DM_URL = 'https://ig.me/m/tornear.app';
const TORNEAR_INSTAGRAM_PROFILE_URL = 'https://www.instagram.com/tornear.app';

export interface PlaceRequestInput {
  kind: PlaceKind;
  /** Lo que la persona buscó o la zona donde no encontró la cancha. */
  query?: string | null;
  /** Zona elegida, cuando el pedido es de una cancha. */
  zone?: string | null;
  surface: PlaceRequestSurface;
}

/** El mensaje que se copia para pegar en el chat. */
export function buildPlaceRequestMessage({ kind, query, zone }: Omit<PlaceRequestInput, 'surface'>): string {
  const searched = query?.trim();
  const inZone = zone?.trim();

  if (kind === 'zona') {
    return searched
      ? `¡Hola! Mi ciudad, ${searched}, no está en TorneAR. ¿La pueden sumar? Somos de la provincia de: `
      : '¡Hola! Mi ciudad no está en TorneAR. ¿La pueden sumar? La ciudad es: ';
  }

  const where = inZone ? ` de ${inZone}` : '';
  return searched
    ? `¡Hola! Falta una cancha${where} en TorneAR: ${searched}. La dirección es: `
    : `¡Hola! Falta una cancha${where} en TorneAR. Se llama: `;
}

/**
 * Copia el mensaje y abre el chat de Instagram. Devuelve `true` si el mensaje
 * quedó copiado (para avisar «pegalo en el chat»). Nunca lanza: si algo falla,
 * cae al perfil de Instagram.
 */
export async function requestMissingPlace(input: PlaceRequestInput): Promise<boolean> {
  const message = buildPlaceRequestMessage(input);

  Logger.info('Pedido de zona o cancha', {
    event: 'place_request',
    kind: input.kind,
    query: input.query?.trim() || null,
    zone: input.zone?.trim() || null,
    surface: input.surface,
  });

  let copied = false;
  try {
    await Clipboard.setStringAsync(message);
    copied = true;
  } catch (error) {
    Logger.warn('No se pudo copiar el mensaje del pedido de zona o cancha', {
      scope: 'place-request.copy',
      error,
    });
  }

  try {
    await Linking.openURL(TORNEAR_INSTAGRAM_DM_URL);
  } catch {
    try {
      await Linking.openURL(TORNEAR_INSTAGRAM_PROFILE_URL);
    } catch (error) {
      Logger.warn('No se pudo abrir Instagram para el pedido de zona o cancha', {
        scope: 'place-request.open',
        error,
      });
    }
  }

  return copied;
}
