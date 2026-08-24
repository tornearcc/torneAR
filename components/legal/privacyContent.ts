/**
 * Política de Privacidad de torneAR — texto definitivo, vigente desde el
 * 24 de agosto de 2026.
 *
 * Redactada sobre la auditoría técnica de la app (Expo), el dashboard (Next) y
 * las funciones de Supabase. El texto legal NO se reescribe ni se resume acá:
 * si hay que cambiar una cláusula, se cambia el documento y después este
 * archivo.
 *
 * Espejo 1:1 de dashboard/lib/legal/privacyContent.ts. Sincronización manual:
 * si tocás este archivo, replicá el cambio allá (y viceversa).
 *
 * ── Tres afirmaciones que este texto le hace al usuario ──────────────────────
 * Son verificables contra el código, y si el código cambia hay que volver acá:
 *
 * 1. §6 "no utiliza SDKs de rastreo comercial ni analíticas de terceros". Hoy
 *    es cierto: no hay Sentry/PostHog/GA/Firebase Analytics en ningún
 *    package.json. `lib/share-analytics.ts` escribe a `app_logs` (base propia)
 *    y Firebase está sólo por FCM (ver app.config.js). Sumar un SDK de
 *    telemetría de terceros obliga a actualizar esta cláusula ANTES de
 *    publicarlo.
 *
 * 2. §5 "no rastrea tu ubicación en segundo plano". Depende de que no se pida
 *    permiso de background location: app.json declara sólo ACCESS_*_LOCATION
 *    y el uso es puntual en el check-in.
 *
 * 3. §8 enumera qué se sobrescribe y qué se conserva al dar de baja. Espeja
 *    exactamente lo que hace `delete_own_account()`
 *    (20260818140000_store_debt_account_reports_feedback.sql): anonimiza
 *    `profiles` y banea `auth.users`, NO borra físicamente. `preferred_position`
 *    aparece declarado como dato conservado porque la función efectivamente no
 *    lo limpia. Si algún día se agrega al UPDATE, hay que sacarlo de §8.
 *
 * ── Versionado ───────────────────────────────────────────────────────────────
 * `PRIVACY_LAST_UPDATED` alimenta `LEGAL_VERSIONS.privacy` y se guarda como
 * constancia al aceptar. A diferencia de los TyC NO dispara re-aceptación:
 * `needsLegalAcceptance()` (lib/auth-data.ts) sólo compara
 * `LEGAL_VERSIONS.terms`.
 */

import type { LegalSection } from './termsContent';

/**
 * Se muestra bajo el título Y actúa como identificador de versión del
 * documento. Cambiarlo al publicar una versión nueva.
 */
export const PRIVACY_LAST_UPDATED = '24 de Agosto, 2026';

export const PRIVACY_INTRO =
  'En torneAR valoramos y respetamos la privacidad de nuestros usuarios. Esta política describe qué datos recopilamos, para qué los usamos, con quién se comparten y durante cuánto tiempo los conservamos.';

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: '1. Identidad de los Responsables y Contacto',
    paragraphs: [
      'TorneAR es una plataforma tecnológica operada conjuntamente por Juan Ignacio Sacco Moriconi (CUIT/CUIL 20-44787831-4) y Agustín Saladino (CUIT/CUIL 20-45415371-6), quienes actúan como responsables del tratamiento de los datos personales. Para cualquier consulta, reclamo o ejercicio de derechos vinculados a tu privacidad, podés contactarnos de forma directa al correo electrónico oficial: tornearcc@gmail.com.',
    ],
  },
  {
    title: '2. Alcance de la Política',
    paragraphs: [
      'Esta Política de Privacidad aplica a todos los usuarios que descarguen, accedan o utilicen la aplicación móvil de TorneAR (disponible para iOS y Android) y su plataforma web. Al registrarte, confirmás que leíste y comprendés cómo tratamos tu información.',
    ],
  },
  {
    title: '3. Datos Personales que Recopilamos',
    paragraphs: [
      'Para que la plataforma funcione, recopilamos la siguiente información:',
      'Datos obligatorios de registro: Nombre completo, nombre de usuario (username), fecha de nacimiento (exclusivamente para validar la mayoría de edad), género, pie hábil, posición preferida en la cancha y zona geográfica. Si no proporcionás estos datos, no podrás crear una cuenta.',
      'Datos opcionales y de uso: Fotografía de perfil (avatar), escudos de equipos, y el contenido que generes (mensajes en chats, reportes).',
      'Datos deportivos e historial: Resultados de partidos, cantidad de goles, reconocimientos (MVP), presencias, historial de equipos y estadísticas de juego.',
      'Datos técnicos: Identificadores internos (UUID) y tokens de notificaciones push (Expo Push Tokens) para enviarte alertas de partidos.',
      'Aclaración importante: TorneAR no solicita ni recopila datos relativos a tu salud, aptitud física o historial médico. Las contraseñas son gestionadas de forma cifrada por nuestro proveedor de autenticación y nunca tenemos acceso a ellas en texto plano.',
    ],
  },
  {
    title: '4. Finalidades del Tratamiento',
    paragraphs: [
      'Utilizamos tus datos exclusivamente para:',
      'Crear y gestionar tu cuenta de usuario.',
      'Permitirte crear equipos, unirte a ellos y buscar rivales o jugadores en tu zona.',
      'Generar y mantener estadísticas deportivas históricas (rankings, historiales de partidos, goleadores).',
      'Enviarte notificaciones operativas (ej. confirmaciones de partidos o mensajes de tu equipo).',
      'Mantener la seguridad de la plataforma, auditar el comportamiento de los usuarios y prevenir fraudes o abusos.',
    ],
  },
  {
    title: '5. Geolocalización y Permisos del Dispositivo',
    paragraphs: [
      'TorneAR solicita acceso a la ubicación precisa (GPS) de tu dispositivo con un único fin: validar el Check-in presencial de los equipos en la cancha al momento de jugar un partido de ranking.',
      'La ubicación solo se obtiene en primer plano, en el momento exacto en que tocás el botón de Check-in.',
      'TorneAR no rastrea tu ubicación en segundo plano ni guarda un historial de tus movimientos.',
      'Si denegás el permiso de ubicación, no podrás realizar el Check-in para validar partidos competitivos, pero podrás seguir usando el resto de la aplicación.',
    ],
  },
  {
    title: '6. Proveedores, Infraestructura y Analíticas',
    paragraphs: [
      'La infraestructura de TorneAR está diseñada para proteger tu información limitando el acceso de terceros.',
      'Servicios de terceros: Utilizamos Supabase (alojado en AWS) para la base de datos y autenticación, y Vercel para el alojamiento de nuestra web y generación de imágenes. También utilizamos Firebase (FCM) de forma exclusiva para el ruteo técnico de las notificaciones push.',
      'Analíticas: TorneAR no utiliza SDKs de rastreo comercial ni analíticas de terceros (como Google Analytics, Meta Pixel o Mixpanel). Toda la telemetría, el análisis de uso y los reportes de errores se procesan de forma interna y anónima en nuestros propios servidores para mejorar la aplicación.',
      'TorneAR no vende, alquila ni comercializa tus datos personales con terceros bajo ninguna circunstancia.',
    ],
  },
  {
    title: '7. Seguridad de los Datos',
    paragraphs: [
      'Implementamos medidas de seguridad técnicas y organizativas robustas, como el uso de Seguridad a Nivel de Fila (RLS) en nuestras bases de datos, tokens JWT de corta duración y vistas públicas limitadas para garantizar que datos sensibles (como tu correo electrónico) nunca queden expuestos al resto de los usuarios.',
    ],
  },
  {
    title: '8. Conservación y Eliminación de Cuentas',
    paragraphs: [
      'Podés solicitar la eliminación de tu cuenta en cualquier momento. Al hacerlo, aplicamos un procedimiento de anonimización irreversible (borrado lógico):',
      'Tus datos personales directos (nombre, username, fecha de nacimiento, género, pie hábil, token de dispositivo) son sobrescritos y eliminados. Tu avatar es borrado de nuestros servidores y el acceso a la cuenta queda bloqueado permanentemente.',
      'Datos que se conservan: Para mantener la integridad de los torneos, el sistema de estadísticas y no afectar a otros jugadores, conservaremos de forma anónima tu historial deportivo (resultados de partidos jugados, goles, MVPs, tu posición preferida en la cancha), los reportes de sistema y los mensajes de chat enviados previamente (los cuales aparecerán a nombre de "Usuario eliminado").',
    ],
  },
  {
    title: '9. Derechos de los Usuarios',
    paragraphs: [
      'De conformidad con la Ley N.º 25.326 de Protección de los Datos Personales de la República Argentina, tenés derecho a solicitar el acceso, rectificación, actualización o supresión de tus datos personales. Podés ejercer estos derechos enviando un correo electrónico a tornearcc@gmail.com, indicando tu nombre de usuario y el derecho que deseás ejercer.',
    ],
  },
  {
    title: '10. Protección de Menores de Edad',
    paragraphs: [
      'TorneAR está dirigida exclusivamente a personas mayores de dieciocho (18) años. No recopilamos de manera intencional información de menores. Si detectamos que una cuenta pertenece a un menor de edad, procederemos a su bloqueo y eliminación inmediata, conservando únicamente la información técnica necesaria para evitar que vuelva a registrarse.',
    ],
  },
  {
    title: '11. Modificaciones a la Política',
    paragraphs: [
      'Podemos actualizar esta Política de Privacidad periódicamente para reflejar mejoras técnicas o cambios legales. Si realizamos cambios sustanciales, te lo notificaremos a través de la aplicación para que puedas revisar y aceptar las nuevas condiciones antes de seguir utilizando TorneAR.',
      'La versión vigente de este documento siempre está disponible en https://tornear.app/legal/privacidad.',
    ],
  },
];
