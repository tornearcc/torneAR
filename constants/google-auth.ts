/**
 * Client IDs de OAuth del proyecto de Google Cloud `awesome-gist-503719-f0`
 * (número 146915112095), el mismo que usa el proveedor Google de Supabase.
 *
 * Van en el código y no en variables de entorno a propósito:
 *  - No son secretos. Un Client ID viaja dentro de cada binario y en la URL de
 *    consentimiento que ve cualquiera al tocar "Continuar con Google". Lo que no
 *    se publica es el client secret, y ese vive sólo en Supabase.
 *  - Una `EXPO_PUBLIC_*` que falte en el entorno de EAS no rompe el build:
 *    rompe el login en el teléfono, sin ningún aviso antes de publicar.
 *
 * Los clients tienen que vivir en el MISMO proyecto de Google Cloud: el SDK
 * nativo pide un ID token cuya audiencia es el client Web, y Google sólo emite
 * ese token cruzado entre clients de un mismo proyecto.
 */

/**
 * Client Web. Es la audiencia (`aud`) de los ID tokens nativos, y el que usa
 * el flujo web de Supabase: tiene que ser el PRIMERO de la lista "Client IDs"
 * del proveedor Google en Supabase.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '146915112095-037nf2ao477ehn229nnss4d1m8hug4hb.apps.googleusercontent.com';

/**
 * Client iOS (bundle `com.agussala2003.tornear`). Su forma invertida es el
 * `iosUrlScheme` del plugin en `app.json`: si cambia uno, hay que cambiar el
 * otro, o la hoja de Google no puede volver a la app.
 *
 * Android no tiene constante: su client se identifica por el package y por el
 * SHA-1 del certificado que firma el binario, no por un ID que viaje en el
 * código.
 */
export const GOOGLE_IOS_CLIENT_ID =
  '146915112095-3faoduk94as605it024ih7m2nbuhqr7t.apps.googleusercontent.com';
