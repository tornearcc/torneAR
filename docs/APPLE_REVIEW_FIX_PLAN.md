# Plan de remediación — Rechazo de App Review #2 (Submission f80970f0)

Fecha de revisión: 11/09/2026 · Versión revisada: 1.0 (6) · Dispositivo: iPad Air 11" (M3)

Tres guidelines citadas: **4.8** (falta Sign in with Apple), **5.1.1(ii)** (purpose string de
fotos), **1.2** (precauciones de contenido generado por usuarios).

Rama de trabajo: `feature/apple-review-prep` (repo `tornear/`).
El dashboard es un repo aparte, hoy en `feature/legal-tyc-v11-privacidad`.

---

## REGISTRO DE AVANCE

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado esperando una gestión tuya

### Código

- [x] **A1** — `expo-image-picker` declarado como plugin con purpose strings propios
- [x] **A2** — Purpose string de ubicación reescrito, cubriendo sus dos usos reales
- [x] **A2b** — Eliminados cuatro permisos que la app nunca usa (micrófono, ubicación
      siempre/background x2, movimiento) y el `RECORD_AUDIO` de Android
- [x] **A3** — Verificado con `npx expo config --type introspect`
- [x] **B3** — `expo-apple-authentication` instalado y en `plugins`; entitlement verificado
- [x] **B4** — `signInWithApple()` e `isAppleSignInAvailable()` en `lib/auth-data.ts`
- [x] **B5** — `components/ui/AppleAuthButton.tsx`
- [x] **B6** — Botón de Apple en `app/login.tsx`, arriba de Google
- [ ] **B9** — Probar en dispositivo físico (compartir correo, ocultar correo, re-login)
- [x] **B7** — Revocación del token de Apple al borrar la cuenta (tabla, edge function, cliente).
      Queda deployarla → **G4**, **G5**, **G11**
- [x] **C1.1** — Cláusula de tolerancia cero como sección 10 en los dos `termsContent.ts`
- [x] **C1.2** — Versión Final 12 y `TERMS_LAST_UPDATED` al 11/09/2026 en ambos
- [x] **C1.3** — Aviso legal con enlaces en el modo login (`LegalLinksNotice`)
- [ ] **C1.4** — Deploy de la web legal con la versión 12 → depende de **G6**
- [x] **C2** — Filtro de palabras: `banned_words`, `normalize_for_filter`,
      `contains_banned_word` y triggers en las cinco superficies de texto libre.
      Migración `20260911160000`, aplicada. Spec pgTAP en
      `supabase/tests/380-content-filter.spec.sql` ⚠️ sin correr: `supabase test db`
      necesita Docker, que no está levantado en esta máquina. Sus aserciones se
      verificaron a mano contra la base
- [x] **C3** — Reportes con contexto en chats y Mercado. Enum ampliado, RPC
      `submit_content_report` que resuelve autor y snapshot en el servidor, motivos por
      tipo de contenido. Migraciones `20260911140000` y `20260911150000`, aplicadas
- [x] **C4 backend** — `user_blocks`, helpers, RPCs, policies RESTRICTIVE, triggers y patch
      del inbox. Migración `20260911130000`, aplicada y verificada en producción
- [x] **C4 cliente** — `lib/blocks-data.ts`, menú de moderación en perfil, chat y las dos
      listas del Mercado, y pantalla «Usuarios bloqueados» en Preferencias
- [ ] **TEAM** — denunciar nombre o escudo de equipo. El tipo de entidad y la RPC ya lo
      soportan; falta el punto de entrada en el perfil del equipo
- [ ] **C5** — Eliminar contenido denunciado desde el dashboard
- [ ] **D1** — Datos demo del revisor ampliados

### Gestiones tuyas (yo no las puedo hacer)

| # | Gestión | Dónde | Bloquea a | Estado |
|---|---|---|---|---|
| G1 | Habilitar la capability **Sign in with Apple** en el App ID `com.agussala2003.tornear` | developer.apple.com → Certificates, IDs & Profiles → Identifiers | Build de B | [x] |
| G2 | Regenerar el provisioning profile después de G1 | `eas credentials` (o confirmar el prompt en el primer `eas build`) | Build de B | [x] perfil viejo borrado, se regenera en el próximo build |
| G3 | Habilitar el provider **Apple** en Supabase y poner `com.agussala2003.tornear` en **Client IDs** | Supabase → Authentication → Providers → Apple | B4 en runtime | [x] |
| G4 | Crear una **Sign in with Apple Key** (`.p8`) y anotar Key ID + Team ID | developer.apple.com → Keys | B7 en runtime | [x] key `WCC3AZZR2F`, team `2W55Q48ABC` |
| G5 | Cargar los cuatro secretos en Supabase | Supabase → Edge Functions → Secrets | B7 en runtime | [x] |
| G11 | Deployar la edge function `apple-auth` | `npx supabase functions deploy apple-auth` | B7 en runtime | [x] verificada contra Apple |
| G6 | **Crítico.** Deploy del dashboard con los Términos versión 12 a `tornear.vercel.app/legal/tyc` | Vercel | C1.4 — ver nota abajo | [ ] |
| G7 | Grabar el video en dispositivo físico | iPhone/iPad real | Envío | [ ] |
| G8 | Screenshots nuevas de iPhone **y iPad** con el login nuevo | App Store Connect | Envío | [ ] |
| G9 | Aplicar las migraciones nuevas a producción | Supabase | Antes de enviar el build | [ ] |
| G10 | Regenerar el PDF legal como `Terminos_y_Condiciones_TorneAR_Version_12` con la cláusula nueva | `docs/legales/` | Nada técnico; cierra la trazabilidad del documento | [ ] |

> **Por qué G6 es crítico y no un trámite.** `LEGAL_LINK_MODE` está en `'external'`
> (`constants/legal.ts`), así que todos los enlaces legales de la app —el checkbox de registro, el
> aviso del login y el botón «Leer los Términos actualizados» de `LegalVersionGate`— abren
> `tornear.vercel.app/legal/tyc`, no la copia embebida. Si el dashboard no está deployado con la
> versión 12, el reviewer toca el enlace y lee el texto viejo, **sin** la cláusula de tolerancia
> cero. Eso es un incumplimiento directo de la 1.2 mostrado en cámara.
>
> Contingencia si el deploy no sale a tiempo: poner `LEGAL_LINK_MODE = 'in-app'`. Las rutas
> `/(modals)/terms` y `/(modals)/privacy` ya existen y renderizan el mismo archivo versionado que
> acabamos de editar, así que el texto viajaría dentro del binario y no habría carrera posible.

### Decisiones cerradas

| # | Decisión | Resuelto |
|---|---|---|
| D1 | Alcance de Sign in with Apple | **Solo iOS.** Google queda igual en Android y web. |
| D2 | Bloqueo en chats jugador↔equipo | Ocultar la conversación si hay bloqueo con cualquier persona del otro lado que haya participado. |
| D3 | Simetría del bloqueo | **Simétrico en visibilidad.** Si A bloquea a B, ninguno ve al otro. |
| D4 | Dónde vive el filtro de palabras | **Servidor obligatorio** (trigger). Cliente opcional, después. |
| D5 | Escudos de clubes profesionales | **Se quedan.** Apple no los citó en ninguna de las dos rondas. |

---

## 0. Veredicto sobre la sugerencia de la IA

| Punto | Veredicto | Qué corregir |
|---|---|---|
| 4.8 — Sign in with Apple | Correcto en el diagnóstico | La config de Supabase que propone es la del flujo **web**, no la nativa. Y omite la revocación de token en el borrado de cuenta. |
| 5.1.1(ii) — purpose string | Correcto el diagnóstico, **incompleto y con un dato falso** el fix | El texto propuesto menciona "adjuntar una foto en una publicación del Mercado": el Mercado **no** sube fotos. Un purpose string que describe algo que la app no hace es otro rechazo. Además hay dos strings más en juego (cámara y micrófono) que la IA no vio. |
| 1.2 — UGC | La lista de cinco requisitos es correcta | La lectura del estado actual es genérica. El checkbox de EULA **ya existe**, la cola de moderación **ya existe**, y los reportes **ya existen** para dos entidades. Lo que falta es distinto de lo que dice. |
| Sacar los escudos de clubes | Discrepo | Apple no lo citó en ninguna de las dos rondas, y en la respuesta anterior ya les ofrecimos sacarlos y no pidieron nada. Cambiarlo ahora es trabajo que no cierra ninguna guideline citada. Queda como decisión aparte. |

### Lo que la IA no mencionó y sí importa

1. **Revocación del token de Apple al eliminar la cuenta.** Apple exige que una app que
   ofrece Sign in with Apple *y* borrado de cuenta llame a `POST /auth/revoke` de la REST API
   de Apple. torneAR ya ofrece borrado de cuenta (se lo declaramos a review en la respuesta
   anterior), así que agregar SIWA crea esta obligación nueva bajo 5.1.1(v).
2. **El review corrió en iPad.** `supportsTablet: true`. El botón de Apple tiene que verse bien
   en iPad y las screenshots de iPad de la ficha también hay que rehacerlas.
3. **Nada de esto sale por EAS Update.** `expo-apple-authentication` es código nativo: hace
   falta un binario nuevo. Las migraciones de Supabase sí son independientes del binario.
4. **La cuenta demo del revisor no tiene con qué demostrar reporte ni bloqueo.**
   `supabase/demo-data/apple-reviewer-setup.sql` siembra equipos y partidos, pero ni un chat
   con mensajes entrantes ni una publicación de Mercado ajena.
5. **Los textos legales están duplicados** entre `tornear/components/legal/termsContent.ts` y
   `dashboard/lib/legal/termsContent.ts`. Tocar uno solo deja la web desincronizada con la app.
6. **Existe `LegalVersionGate`**: subir `TERMS_LAST_UPDATED` fuerza re-aceptación a todos los
   usuarios existentes. Es exactamente lo que queremos al agregar la cláusula de tolerancia cero,
   pero hay que saberlo antes de tocarlo.

---

## 1. Estado actual verificado

Lo que sigue lo verifiqué leyendo el código, no es supuesto.

### Auth
- `app/login.tsx`: email/password + `GoogleAuthButton`. No hay Apple.
- `lib/auth-data.ts`: `signInWithGoogle()` con `WebBrowser.openAuthSessionAsync` +
  `establishSessionFromUrl`. No hay `signInWithIdToken`.
- `expo-apple-authentication` **no está** en `package.json`.
- No existe `tornear/ios/` → el proyecto iOS es totalmente managed (CNG). El plugin de Apple
  agrega el entitlement solo en el prebuild de EAS.

### Purpose strings
- `app.json` declara **solo** `NSLocationWhenInUseUsageDescription`.
- `expo-image-picker` **no** figura en el array `plugins`, pero su config plugin se aplica igual
  (verificado: `npx expo config --type prebuild` muestra `RECORD_AUDIO` y `READ_EXTERNAL_STORAGE`
  en `android.permissions`, que salen de ese plugin).
- Por lo tanto el Info.plist buildeado hoy tiene los defaults **en inglés** del paquete:
  - `NSPhotoLibraryUsageDescription` = "Allow TorneAR to access your photos" ← lo que Apple rechazó
  - `NSCameraUsageDescription` = "Allow TorneAR to access your camera"
  - `NSMicrophoneUsageDescription` = "Allow TorneAR to access your microphone" ← **la app nunca graba audio**
- Usos reales del picker, tres y solo tres:
  - `components/profile/ProfileHeader.tsx` → foto de perfil (galería)
  - `app/team-manage.tsx` → escudo del equipo (galería)
  - `components/matches/WoModal.tsx` → prueba fotográfica de un reclamo de WO (galería **y cámara**)

### UGC — qué hay y qué no

| Requisito Apple | Estado | Detalle |
|---|---|---|
| (a) EULA antes de registrarse | **Parcial** | `components/ui/LegalConsentCheckbox.tsx` gatea email y Google en modo registro. Falta: cláusula explícita de tolerancia cero en los Términos, y el botón de Google en **modo login** no está gateado (un usuario nuevo se da de alta por ahí sin pasar por el checkbox). |
| (b) Filtro de contenido objetable | **No existe** | No hay blocklist ni trigger. `sanitizeMarketDescription` solo recorta whitespace. |
| (c) Reportar contenido | **Parcial** | `content_reports` + `ReportModal`, pero el enum `report_entity_type` solo tiene `USER` y `MATCH`. Puntos de entrada: `app/profile-stats.tsx` y `app/match-detail.tsx`. **No hay reporte en chats, ni en publicaciones del Mercado, ni en nombres de equipo.** |
| (d) Bloquear usuarios | **No existe** | Cero código. |
| (e) Actuar en 24hs | **Parcial** | `dashboard/app/(admin)/dashboard/moderation/page.tsx` + `ReportsQueue` permiten marcar revisada/desestimada y suspender/levantar usuario (`admin_suspend_user` / `admin_unban_user`). **No hay acción de eliminar el contenido denunciado.** |

### Modelo de datos relevante para el bloqueo
`conversations` es **jugador ↔ equipo** (`player_id`, `team_id`, `type = 'MARKET_DM'`), no
jugador ↔ jugador. Del lado del equipo pueden escribir capitán y subcapitán. El bloqueo es entre
personas, así que hay que definir la regla de qué pasa con una conversación cuyo otro lado es un
equipo. Esto no es un detalle: es la decisión de diseño que ordena toda la fase.

---

## 2. Decisiones a tomar antes de empezar

| # | Decisión | Recomendación |
|---|---|---|
| D1 | ¿SIWA solo en iOS o también web/Android? | **Solo iOS.** 4.8 es una regla de la App Store. Google sigue igual en Android y web. |
| D2 | Regla de bloqueo en chats jugador↔equipo | Ocultar la conversación si hay bloqueo entre yo y **cualquier** persona del otro lado que haya participado (el jugador, o quien haya escrito por el equipo). Es lo más simple de explicar y de demostrar en el video. |
| D3 | ¿Bloqueo simétrico o unilateral? | **Simétrico en visibilidad**: si A bloquea a B, ninguno ve al otro. Evita que el bloqueado siga leyendo y abriendo chats nuevos. |
| D4 | Filtro de palabras: ¿cliente, servidor o ambos? | **Servidor obligatorio** (trigger), cliente opcional después. El trigger es la evidencia de que no se puede saltear. |
| D5 | Escudos de clubes profesionales | Dejarlos. No fue citado. Revisitar solo si aparece en una ronda futura. |

---

## 3. Plan de ejecución

Cinco fases. Las fases A y B son cortas y desbloquean el binario; C es el grueso; D es backoffice;
E es empaquetado y envío. **Recomiendo hacerlas en orden**, porque el video final (E) tiene que
mostrar A y C funcionando juntos en un build real.

---

### FASE A — Guideline 5.1.1(ii): purpose strings

La más barata. Media hora.

**A1. Declarar `expo-image-picker` como plugin con textos propios.**
En `tornear/app.json`, agregar al array `plugins`:

```json
[
  "expo-image-picker",
  {
    "photosPermission": "TorneAR accede a tus fotos solo cuando vos elegís una imagen: por ejemplo, para poner tu foto de perfil, subir el escudo de tu equipo, o adjuntar la captura que respalda un reclamo de walkover de un partido.",
    "cameraPermission": "TorneAR usa la cámara solo cuando vos sacás una foto en el momento: por ejemplo, para adjuntar la evidencia de un reclamo de walkover de un partido.",
    "microphonePermission": false
  }
]
```

Por qué el plugin y no `ios.infoPlist` a mano: `applyPermissions` de `@expo/config-plugins`
resuelve `props ?? infoPlist ?? default`, así que pasar la prop es la vía que no depende del orden
en que corren los mods. Y `microphonePermission: false` es la única forma de **borrar**
`NSMicrophoneUsageDescription` y la permission `RECORD_AUDIO` de Android: hoy las pedimos y la app
no graba audio nunca. Eso es superficie de rechazo gratis, en las dos tiendas.

**A2. Reescribir el string de ubicación.** El anterior decía *"TorneAR necesita tu ubicación para
verificar que estás en la cancha al hacer check-in."* Apple no lo objetó, pero además de faltarle
el ejemplo concreto **era incompleto**: la ubicación se usa en dos lugares, no en uno.

- `lib/checkin-location.ts` pide el permiso y llama a `getCurrentPositionAsync` en el check-in.
- `hooks/useDistanceResolver.ts` usa `getLastKnownPositionAsync` —solo si el permiso ya está
  concedido, nunca lo pide— para las etiquetas de distancia del Mercado, el alta de oferta y la
  propuesta de partido.

Un purpose string que declara un solo uso cuando hay dos es exactamente el defecto que la
guideline describe. El texto nuevo cubre los dos y usa el radio real del geofence, 150 m
(`20260714201000_squad_formats_checkin_rpc.sql`).

Va en los **dos** lugares: `ios.infoPlist.NSLocationWhenInUseUsageDescription` y la prop
`locationWhenInUsePermission` del plugin `expo-location`.

**A2b. Cuatro permisos declarados que la app nunca usa.** Los descubrió la verificación de A3, no
estaban en el diagnóstico inicial. Todos venían con el texto default en inglés, es decir el mismo
defecto por el que nos rechazaron:

| Clave | La agregaba | Por qué sobra |
|---|---|---|
| `NSMicrophoneUsageDescription` | `expo-image-picker` | La app nunca graba audio. |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | `expo-location` | Solo usamos ubicación en primer plano. |
| `NSLocationAlwaysUsageDescription` | `expo-location` | Ídem. |
| `NSMotionUsageDescription` | `expo-location` | No usamos el sensor de movimiento. |

Se apagan pasando `false` en la prop correspondiente: `applyPermissions` de
`@expo/config-plugins` borra la clave cuando la prop es `false`. De paso cae `RECORD_AUDIO` del
manifest de Android, que Play también mira.

`NSLocalNetworkUsageDescription` queda y **no hay que tocarla**: la agrega `expo-dev-launcher`,
que es `debugOnly`, y su config plugin instala un build phase de Xcode que borra la clave del
Info.plist compilado siempre que el texto contenga "Expo Dev Launcher". Si la sobrescribiéramos
con un texto propio, ese borrado dejaría de dispararse y la clave sí llegaría al binario.

**A3. Verificación.** `npx expo prebuild -p ios` **no funciona en Windows**: aborta con
*"Skipping generating the iOS native project files. Run npx expo prebuild again from macOS or
Linux"*. La alternativa que sí corre en Windows y ejecuta los mods en memoria es:

```
cd tornear
npx expo config --type introspect --json
```

y mirar `ios.infoPlist`. Ojo: `--type prebuild` **no** sirve para esto, porque los purpose strings
los escriben mods (`withInfoPlist`) que esa variante no ejecuta.

Resultado esperado, y el que quedó verificado: solo tres claves `*UsageDescription` propias, las
tres en español (`NSLocationWhenInUse`, `NSPhotoLibrary`, `NSCamera`), `UIBackgroundModes` en
`null`, y sin `RECORD_AUDIO` en los permisos de Android.

---

### FASE B — Guideline 4.8: Sign in with Apple

**B1. Portal de Apple Developer.** Habilitar la capability *Sign in with Apple* en el App ID
`com.agussala2003.tornear`. Con EAS, después hay que dejar que regenere el provisioning profile
(`eas credentials` → iOS → build credentials, o simplemente confirmar el prompt en el primer
`eas build` posterior). Si el perfil no se regenera, el build falla por entitlement mismatch.

**B2. Supabase — acá la IA se equivocó.**
Authentication → Providers → Apple → habilitar, y en **Client IDs** poner el bundle ID:
`com.agussala2003.tornear`.

Los campos Services ID / Team ID / Key ID / clave `.p8` son para el flujo **OAuth por navegador**
(web y Android). Para el login nativo de iOS no hacen falta: el flujo es
`AppleAuthentication.signInAsync()` → `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`,
y Supabase valida el `aud` del identity token contra esa lista de Client IDs. Cargar el secret
sirve si más adelante queremos Apple en la web; hoy no hace falta y agrega una clave que rota.

**B3. Dependencia y plugin.**

```
npx expo install expo-apple-authentication
```

y agregar `"expo-apple-authentication"` al array `plugins` de `app.json`. Eso inyecta el
entitlement `com.apple.developer.applesignin` en el prebuild.

**B4. `lib/auth-data.ts` — nueva función `signInWithApple()`.**

Forma, siguiendo el estilo del módulo (devolver `{ error, cancelled }` como `OAuthResult`):

- `AppleAuthentication.isAvailableAsync()` como guard, expuesto como
  `isAppleSignInAvailable()` (agrega el chequeo de `Platform.OS === 'ios'`).
- `signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })`.
- `supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken })`.

> **Corrección: va SIN nonce.** El plan original decía generar un nonce, mandarle a Apple el
> SHA-256 y a Supabase el valor crudo. Se descartó al revisar el paquete: `signInAsync` pasa el
> nonce **verbatim** a `ASAuthorizationAppleIDRequest.nonce` (ver
> `node_modules/expo-apple-authentication/ios/AppleAuthenticationRequest.swift:31`), no lo hashea.
> O sea que el hasheo queda del lado nuestro, y si se invierte el orden el canje falla con un
> error opaco que no se puede diagnosticar sin un dispositivo a mano. El flujo documentado por
> Supabase para Expo omite el nonce, y es lo que se implementó: el token igual se valida por firma
> y por audiencia contra el bundle ID del provider. `expo-crypto` quedó instalado por si más
> adelante se quiere agregar.
- Si el usuario cancela, `signInAsync` lanza un error con `code === 'ERR_REQUEST_CANCELED'` →
  devolver `{ error: null, cancelled: true }`, mismo criterio que Google.
- **Capturar el nombre en el acto.** Apple manda `credential.fullName` solo en la primerísima
  autorización y el identity token no lo lleva, así que Supabase no lo guarda. Si viene,
  inmediatamente después del `signInWithIdToken`:
  `supabase.auth.updateUser({ data: { full_name: '<givenName> <familyName>' } })`.
  Con eso `app/onboarding.tsx` lo prellena solo — ya lee `user_metadata.full_name` / `.name`
  para Google, no hay que tocar la pantalla.
- Guardar `credential.authorizationCode` para B7 (revocación).

**B5. `components/ui/AppleAuthButton.tsx`.**
Wrapper de `AppleAuthentication.AppleAuthenticationButton` con
`buttonStyle=WHITE` (sobre `surface-base` oscuro), `buttonType=SIGN_IN`, `cornerRadius` igual al
de `GoogleAuthButton`, y la misma altura. Botón nativo, no uno propio: las HIG de Apple lo exigen
y es lo primero que mira el reviewer.

**B6. `app/login.tsx`.**
- Renderizar Apple **arriba** de Google, mismo ancho y altura, dentro del mismo bloque debajo del
  separador "o". 4.8 pide una opción *equivalente*, y el reviewer interpreta equivalente como
  "igual de visible". Enterrarlo abajo es motivo de rechazo por sí solo.
- Solo iOS: `Platform.OS === 'ios' && isAvailableAsync()`.
- Sujeto al **mismo** `acceptedLegal` que Google en modo registro (ver C1, que además lo extiende
  a modo login).
- `onApplePress` calcado de `onGooglePress`: mismos logs, mismo manejo de `cancelled`, sin
  `router.replace` (el guard de `app/_layout.tsx` decide el destino).

**B7. Revocación de token al eliminar la cuenta (5.1.1(v)).**
`delete_own_account()` anonimiza el perfil y banea `auth.users`. Con Sign in with Apple hay que
además revocar el token del lado de Apple. Implementado así:

- **`public.apple_credentials`** (migración `20260911120000_apple_credentials.sql`): una fila por
  `auth.users.id` con el refresh token. RLS habilitada y **cero policies**, más `REVOKE ALL` a
  `anon` y `authenticated`: es una credencial viva y no hay ningún caso en que el cliente deba
  leerla, ni siquiera su dueño. Sólo la toca el `service_role` de la edge function.
- **Edge function `apple-auth`**, una sola con dos acciones. `link` canjea el `authorizationCode`
  en `https://appleid.apple.com/auth/token` y guarda el refresh token; `revoke` lo revoca en
  `/auth/revoke` y borra la fila. Van juntas porque comparten los secretos y la firma ES256 del
  client secret, que es la parte delicada: partirla en dos duplicaría eso en dos deploys.
- **`verify_jwt = true`** (declarado explícitamente en `config.toml`), y el usuario se resuelve
  del JWT y nunca del body. Si viniera por parámetro, cualquiera podría revocarle la credencial
  a otra persona.
- **Cliente.** `signInWithApple()` llama a `link` en cada login, no sólo en el primero: el código
  vive 5 minutos y al momento de pedir la baja ya no existe. `deleteOwnAccount()` llama a `revoke`
  antes de la RPC, porque necesita la sesión activa.
- **Las dos llamadas son best-effort.** El login no falla si no se pudo guardar la credencial, y
  la baja de cuenta no se aborta si Apple no responde: dejar a alguien sin poder eliminar su
  cuenta sería incumplir la 5.1.1(v) que ya teníamos resuelta, además de un problema real de
  privacidad. Los fallos quedan en `app_logs`.

Detalle que cuesta un `invalid_client` si se pasa por alto: en el login **nativo** el `client_id`
que espera Apple es el **bundle ID**, no el Services ID. El Services ID es para el flujo web.

Cómo obtener lo que va en los secretos:

| Secreto | Dónde sale |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Account → **Membership details**. 10 caracteres. También aparece arriba a la derecha del portal. |
| `APPLE_KEY_ID` | developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → `+` → nombre → tildar **Sign in with Apple** → Configure → elegir el App ID `com.agussala2003.tornear` → Continue → Register. El Key ID aparece en esa pantalla. |
| `APPLE_PRIVATE_KEY` | El `.p8` que se descarga en ese mismo paso. **Se descarga una sola vez**; si se pierde hay que crear otra key. Va el contenido completo, con las líneas `BEGIN`/`END`. |
| `APPLE_CLIENT_ID` | `com.agussala2003.tornear` |

Sin costo: está incluido en la membresía del Apple Developer Program. El único límite es que no se
pueden tener más de dos keys de Sign in with Apple activas a la vez.

**Cómo verificar la configuración sin un dispositivo.** No hace falta esperar al build para saber
si los cuatro valores son correctos. Se arma el client secret y se manda un canje a
`https://appleid.apple.com/auth/token` con un `code` inventado:

| Respuesta de Apple | Qué significa |
|---|---|
| `invalid_grant` | Aceptó el client secret y sólo rechazó el código falso. **Los cuatro valores están bien.** |
| `invalid_client` | El client secret no le cierra: revisar Team ID, Key ID, que la key tenga Sign in with Apple configurado contra el App ID, y que `client_id` sea el bundle y no el Services ID. |

Hecho el 11/09/2026: devolvió `invalid_grant`, o sea configuración correcta. Antes de eso conviene
validar la firma sola —importar el `.p8` como PKCS#8 EC P-256, firmar y verificar contra la clave
pública derivada del propio archivo— porque el modo típico de fallar es que la firma salga en DER
en vez de los 64 bytes crudos `r||s` que pide JWS, y Apple responde `invalid_client` igual que si
el Team ID estuviera mal.

**B8. "Ocultar mi correo".** Verificar que nada valide el dominio del email. Revisado:
`lib/schemas/authSchema.ts` usa `z.email()` genérico y `delete_own_account` reescribe el mail con
un dominio propio. No veo bloqueo, pero conviene probar el alta real con relay activado.

**B9. Verificación.** Build de desarrollo en un iPhone/iPad físico. Probar: alta nueva con
"Compartir mi correo", alta nueva con "Ocultar mi correo", y re-login de una cuenta ya creada
(segunda vez Apple no manda el nombre: el perfil ya tiene que tenerlo guardado).

---

### FASE C — Guideline 1.2: UGC

El grueso. Cinco sub-bloques, uno por requisito de Apple.

#### C1. EULA con tolerancia cero, antes del registro

**C1.1 — Cláusula nueva en los Términos.** Agregar una sección explícita, con el vocabulario que
el reviewer busca. Borrador:

> **Tolerancia cero con el contenido objetable y los usuarios abusivos**
>
> TorneAR aplica una política de tolerancia cero al contenido objetable y a las conductas
> abusivas. No se tolera el acoso, las amenazas, el discurso de odio, la discriminación, el
> contenido sexual, la suplantación de identidad, el fraude, el spam ni la publicación de datos
> personales de terceros, en ningún espacio de la plataforma: mensajes, publicaciones del Mercado,
> nombres de usuario, nombres de equipo, escudos e imágenes de perfil.
>
> Al crear una cuenta aceptás no publicar ese tipo de contenido y no comportarte de forma abusiva
> con otras personas usuarias. TorneAR revisa las denuncias recibidas **dentro de las 24 horas**,
> elimina el contenido objetable y da de baja la cuenta responsable, sin aviso previo.
>
> Toda persona usuaria puede denunciar contenido y bloquear a otra persona desde la propia
> aplicación. Las denuncias se envían a tornearcc@gmail.com y a nuestro panel de moderación.

Va en **los dos archivos**: `tornear/components/legal/termsContent.ts` y
`dashboard/lib/legal/termsContent.ts`. Están duplicados y no hay nada que los sincronice.

Quedó insertada como **sección 10**, entre «9. Contenido prohibido» y la que era «10. Ausencia de
relación laboral», que es su lugar natural. Las secciones 10 a 32 pasaron a 11 a 33. Ningún
párrafo del documento se refiere a otro por número, así que la renumeración no rompe remisiones
internas; se verificó antes de tocar nada.

Dos detalles de los espejos que no son evidentes: el de la app usa comillas simples y CRLF, el del
dashboard comillas dobles y LF. Normalizar cualquiera de los dos habría reescrito el archivo
entero y el diff real habría quedado enterrado.

> ⚠️ El encabezado de ambos archivos dice que el texto legal se cambia **primero** en el PDF y
> después en el código. Acá se invirtió por el plazo de la revisión. Queda anotado en el propio
> header y como gestión **G10**: regenerar el PDF como Versión 12.

**C1.2 — Subir `TERMS_LAST_UPDATED`** en ambos. Efecto colateral deseado: `needsLegalAcceptance()`
compara la versión, así que `LegalVersionGate` va a pedir re-aceptación a todos los usuarios
existentes. Es correcto y además le da al reviewer una pantalla de EULA que puede filmar aunque
use la cuenta demo ya creada.

**C1.3 — Enlaces legales en el modo login.** El diagnóstico original decía que había que gatear el
OAuth con el checkbox también en modo login. Revisando `app/onboarding.tsx` resultó **menos grave
de lo previsto**: `mustAcceptLegal` deriva de `needsLegalAcceptance(user)` y gatea el botón de
guardar (`canSubmit`, línea 147), y el guard de `app/_layout.tsx` no deja entrar a la app con el
perfil incompleto. O sea que un alta por Google o Apple desde la pestaña de login **no puede
terminar** sin tildar el consentimiento: solo lo hace un paso más tarde.

Lo que sí faltaba es que la pantalla de login, en modo «Iniciar sesión», no mostraba los
documentos por ningún lado. Se agregó `components/ui/LegalLinksNotice.tsx`, un aviso de una línea
con los dos enlaces, debajo de los botones de OAuth y solo en ese modo (en registro ya están
enlazados desde el checkbox, repetirlos sería el mismo párrafo dos veces).

Se descartó forzar el checkbox en modo login: quien ya tiene cuenta aceptó al crearla, y los
cambios de versión los atrapa `LegalVersionGate`, que bloquea la app entera hasta re-aceptar.
Exigir un tilde para entrar sería fricción sin contrapartida.

De paso, la lógica de "ruta in-app o URL externa según `LEGAL_LINK_MODE`" estaba copiada dentro de
`LegalConsentCheckbox`. Con una tercera superficie enlazando a los mismos documentos se extrajo a
`openLegal()` en `constants/legal.ts`, así cambiar el modo es un solo lugar.

**C1.4 — Deploy de la web legal.** `tornear.vercel.app/legal/tyc` tiene que mostrar el texto nuevo
**antes** de enviar el build, porque el checkbox linkea ahí (`LEGAL_LINK_MODE = 'external'`).

#### C2. Filtro de contenido objetable (server-side)

**C2.1 — Migración `banned_words`.**

```
banned_words(word text primary key, severity text, created_at timestamptz)
```

RLS: SELECT solo para `is_admin`, sin grants para `anon`/`authenticated`. La lista no se expone al
cliente.

**C2.2 — Función `public.contains_banned_word(p_text text) returns boolean`.**
`SECURITY DEFINER`, normaliza: minúsculas + `unaccent` + colapso de repeticiones + separadores
(para que `p u t o` y `p*to` no pasen), y matchea con límite de palabra (`\m…\M`) para no pisar
falsos positivos.

> Ojo con los falsos positivos en español rioplatense: "concha" es apellido y nombre de lugar,
> "negro" es un apodo corriente y un color de camiseta. Arrancar con una lista corta y agresiva
> solo en lo inequívoco (insultos sexuales explícitos, slurs, amenazas) y ampliarla desde la cola
> de denuncias. Una lista larga y torpe rompe el producto y no suma nada frente a Apple.

**C2.3 — Triggers `BEFORE INSERT OR UPDATE`** que llamen a esa función y hagan
`RAISE EXCEPTION 'CONTENT_BLOCKED: …'` sobre:
- `messages.content`
- `market_team_posts.description`
- `market_player_posts.description`
- `teams.name`
- `profiles.full_name`, `profiles.username`

**C2.4 — Cliente.** Mapear el código `CONTENT_BLOCKED` en `lib/auth-error-messages.ts`
(`getGenericSupabaseErrorMessage`) a un mensaje claro: "Ese texto tiene contenido que no
permitimos. Editalo y volvé a intentar." Sin esto el usuario ve un error crudo de Postgres.

**C2.5 — Tests.** `supabase/tests/` ya tiene specs pgTAP-style; agregar una que verifique que el
INSERT de un mensaje sucio falla y el de uno limpio pasa. Es la evidencia más rápida de que el
filtro es real.

#### C3. Reportar contenido, en todas las superficies UGC

**C3.1 — Extender el enum.**

```sql
ALTER TYPE public.report_entity_type ADD VALUE 'MESSAGE';
ALTER TYPE public.report_entity_type ADD VALUE 'MARKET_TEAM_POST';
ALTER TYPE public.report_entity_type ADD VALUE 'MARKET_PLAYER_POST';
ALTER TYPE public.report_entity_type ADD VALUE 'TEAM';
```

> `ALTER TYPE … ADD VALUE` no se puede usar en la misma transacción que lo agrega. Que vaya en su
> **propia** migración, separada de la que lo empiece a usar.

**C3.2 — Por qué dos valores para el Mercado.** "market_posts" no existe como tabla: son
`market_team_posts` y `market_player_posts`. Con valores separados el dashboard resuelve el link
al contenido sin adivinar.

**C3.3 — Razones por tipo de entidad.** Hoy `ReportModal` tiene tres razones fijas
("Contenido inapropiado", "Comportamiento antideportivo", "Spam"). Para mensajes y publicaciones
hacen falta las que Apple espera ver: acoso, discurso de odio, contenido sexual, estafa,
suplantación de identidad. Convertir `REASONS` en un mapa por `entityType`.

**C3.4 — Puntos de entrada nuevos.**
- `app/market-chats/[id].tsx` → long-press o menú de tres puntos en cada burbuja de mensaje, y una
  acción en el header de la conversación para denunciar al interlocutor.
- `components/market/MarketCards.tsx` → menú en cada tarjeta del feed (los dos feeds).
- `app/team-manage.tsx` / perfil de equipo → denunciar nombre o escudo del equipo.
- Los dos existentes (`profile-stats`, `match-detail`) se quedan como están.

**C3.5 — Enriquecer el reporte.** Para que moderación pueda actuar en 24hs necesita el contenido,
no solo el ID. Agregar a `content_reports` una columna `content_snapshot text` que guarde el texto
denunciado al momento del reporte, y `reported_profile_id uuid` (el autor del contenido, resuelto
en el servidor). Sin eso, si el autor edita o borra, la denuncia queda sin objeto.

#### C4. Bloquear usuarios

**C4.1 — Tabla.**

```sql
user_blocks(
  blocker_profile_id uuid references profiles(id),
  blocked_profile_id uuid references profiles(id),
  reason text,
  created_at timestamptz default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
)
```

RLS: INSERT/DELETE/SELECT solo de filas propias (`blocker_profile_id = mi profile.id`), mismo
patrón que `content_reports`.

**C4.2 — RPC `block_user(p_blocked_profile_id uuid, p_reason text)`.** En una sola transacción:
1. Inserta en `user_blocks`.
2. **Inserta una fila en `content_reports`** tipo `USER` con el motivo, marcada como originada en
   un bloqueo. Esto es lo que satisface el "blocking should also notify the developer" de Apple
   y lo que hace que el bloqueo aparezca en la cola de moderación del dashboard.

Y su par `unblock_user(p_blocked_profile_id uuid)`.

**C4.3 — Helper `public.is_blocked_pair(a uuid, b uuid) returns boolean`**, simétrico, `STABLE`,
para reusar en todos los filtros de abajo sin repetir el `EXISTS`.

**C4.4 — Efecto instantáneo en el feed. Esto es lo que el reviewer filma, y tiene que ser del lado
del servidor, no un `.filter()` en el cliente.**

| Superficie | Dónde va el filtro |
|---|---|
| Feed de jugadores del Mercado | `lib/market-api.ts::fetchPlayerPosts` — hoy es un `.from()` directo. Convertirlo en RPC, o agregar una policy de SELECT sobre `market_player_posts` que excluya bloqueados. Prefiero la policy: es imposible de saltear. |
| Feed de equipos del Mercado | Ídem sobre `market_team_posts`, filtrando por `created_by`. |
| Bandeja de chats | `get_market_inbox` (migración `20260325183858` + parche `c2`). Es `SECURITY DEFINER`: agregar el `where not is_blocked_pair(...)` adentro. |
| Contador de no leídos | `get_unread_market_chat_count` deriva de la anterior, se arregla solo. |
| Mensajes de una conversación | `lib/chat-api.ts::fetchMessages` + policy de SELECT sobre `messages`. |
| Envío de mensajes | Trigger `BEFORE INSERT` en `messages` que rechace si hay bloqueo (`RAISE EXCEPTION 'USER_BLOCKED'`). |
| Postulaciones del Mercado | `market_team_post_applications` — un bloqueado no debería poder postularse. |

**C4.5 — UI.**
- Acción "Bloquear" en el mismo menú que "Denunciar" (perfil, chat, tarjeta del Mercado).
- Diálogo de confirmación que explique el efecto: "No vas a ver más sus publicaciones ni sus
  mensajes, y esa persona no va a poder escribirte."
- Pantalla **"Usuarios bloqueados"** en `app/(tabs)/profile/settings.tsx`, con desbloqueo. Apple
  espera poder revertirlo.
- Refresco inmediato del feed al volver del bloqueo (`useFocusEffect` ya está en el patrón de tabs).

#### C5. Actuar en 24 horas

**C5.1 — Acción "Eliminar contenido" en el dashboard.** `ReportsQueue` hoy solo cambia estado y
suspende. Falta una RPC `admin_remove_reported_content(p_report_id uuid)` que, según
`reported_entity_type`, borre o desactive el mensaje / la publicación / el nombre de equipo, y
deje traza en la tabla de logs.

**C5.2 — Mostrar el contenido denunciado en la cola.** Con `content_snapshot` de C3.5, la cola
pasa a ser accionable de un vistazo. Hoy muestra un UUID.

**C5.3 — Alerta.** Un canal que avise de denuncias nuevas (pg_cron ya está en uso — ver
`20260711034627_g3_b1_pgcron_jobs.sql` —, así que un job que mande mail a tornearcc@gmail.com con
los PENDING de las últimas horas es barato). Sin esto, "24 horas" es una promesa que depende de
que alguien entre al panel.

**C5.4 — Dejarlo por escrito** en la respuesta a App Review y en los Términos (ya cubierto en C1.1).

---

### FASE D — Datos del revisor y evidencia

**D1. Ampliar `supabase/demo-data/apple-reviewer-setup.sql`** para que la cuenta
`revisor@tornear.com` tenga, al abrir la app:
- Una conversación de Mercado con mensajes **entrantes** del capitán rival → algo que denunciar y
  alguien a quien bloquear.
- Al menos dos publicaciones de Mercado de otras personas visibles en el feed → para mostrar que
  una desaparece al bloquear a su autor.
- Que el teardown limpie todo eso (el archivo par ya existe).

**D2. Video nuevo, en dispositivo físico.** Orden exacto, sin cortes:
1. App recién instalada → pantalla de login → **checkbox de EULA visible**, tocar el link de
   Términos y mostrar el texto de tolerancia cero.
2. **Sign in with Apple**, incluyendo la opción "Ocultar mi correo".
3. Entrar al Mercado → menú de una publicación → **Denunciar** → elegir motivo → confirmación.
4. Abrir un chat → menú de un mensaje → **Denunciar**.
5. **Bloquear** a esa persona → volver al feed → **mostrar que su publicación ya no está**.
6. Perfil → Preferencias → **Usuarios bloqueados** → desbloquear.

**D3. Screenshots de la ficha**, iPhone **y iPad** (fueron a iPad Air 11"), con el login nuevo
visible. Lo pide explícitamente el mensaje de Apple.

**D4. Reescribir `review-apple/App-Review-Response-TorneAR.txt`** con una sección por guideline
citada, diciendo qué se hizo y dónde verlo. Adjuntarlo y pegar lo esencial en el Notes de App
Review Information junto con el link al video.

---

### FASE E — Build y envío

1. `npx expo prebuild -p ios --no-install` local solo para **verificar** el Info.plist y el
   entitlement de Apple; borrar `ios/` después.
2. `eas build -p ios --profile production`. `appVersionSource: remote` + `autoIncrement` lleva el
   build a 1.0 (7).
3. Smoke test en TestFlight sobre un iPad físico: login con Apple, denuncia, bloqueo, prompt de
   fotos en español.
4. Aplicar las migraciones a producción **antes** de enviar el build (la app nueva las necesita;
   la vieja no se rompe con ellas).
5. Enviar, con el video y el documento de respuesta en Notes.

---

## 4. Orden de ataque sugerido

| Orden | Bloque | Depende de | Tamaño |
|---|---|---|---|
| 1 | A (purpose strings) | nada | XS |
| 2 | C1 (EULA + tolerancia cero + gate de OAuth) | nada | S |
| 3 | B1–B6 (SIWA sin revocación) | C1.3 para el gate | M |
| 4 | C4 (bloqueo, backend + UI) | nada | L |
| 5 | C3 (reportes ampliados) | C4 comparte el menú | M |
| 6 | C2 (filtro de palabras) | nada | M |
| 7 | C5 (dashboard 24hs) | C3.5 | M |
| 8 | B7 (revocación del token de Apple) | B | M |
| 9 | D (datos demo + video + screenshots) | todo | M |
| 10 | E (build y envío) | todo | S |

C1, C2, C3 y C4 son independientes entre sí en el backend: si querés paralelizar, ese es el corte.

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| El entitlement de SIWA no se regenera y el build de EAS falla | Correr `eas credentials` y confirmar el provisioning profile **antes** del build de producción. |
| `ALTER TYPE … ADD VALUE` bloquea la migración | Migración separada, sin usar el valor nuevo en la misma transacción. |
| El filtro de palabras genera falsos positivos y rompe el alta de equipos | Lista corta al inicio, solo lo inequívoco. Test que verifique que "Los Pibes del Barrio" pasa. |
| Filtrar bloqueados con RLS degrada las consultas del Mercado | `is_blocked_pair` STABLE + índice en `user_blocks(blocked_profile_id)`. Revisar con `get_advisors` después de aplicar. |
| Los dos `termsContent.ts` se desincronizan | Editarlos en el mismo commit; dejar anotada la duplicación conocida. |
| Apple rechaza de nuevo por algo que no citó (escudos de clubes) | Decisión D5: asumido conscientemente, no olvidado. |
