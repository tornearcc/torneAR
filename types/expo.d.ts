/// <reference types="expo/types" />

// Gemelo versionado de `expo-env.d.ts` (el de la raíz), que existe sólo para
// que el type-check funcione en CI.
//
// El nombre NO puede ser `expo-env.d.ts`: el patrón del .gitignore no está
// anclado a la raíz, así que ignora ese nombre a cualquier profundidad y esta
// copia quedaría sin versionar —o sea, sin resolver nada.
//
// ── Por qué hace falta ──────────────────────────────────────────────────────
// `app/_layout.tsx` arranca con `import '../global.css'` (NativeWind). Para que
// TypeScript acepte ese import de side-effect necesita el `declare module
// '*.css'` que vive en `node_modules/expo/types/global.d.ts`, y ese archivo
// entra al programa únicamente a través de la directiva `/// <reference
// types="expo/types" />`.
//
// Esa directiva la genera el CLI de Expo en `expo-env.d.ts` (raíz), pero ese
// archivo está en `.gitignore` —lo pide el propio Expo en la nota que trae
// adentro— y ningún paso del workflow corre un comando de `expo` que lo
// regenere: el job hace `npm ci` y va derecho a `npx tsc --noEmit`. Resultado:
// en local pasa y en CI falla con
//
//   app/_layout.tsx(1,8): error TS2882: Cannot find module or type
//   declarations for side-effect import of '../global.css'.
//
// Antes del SDK 57 no se notaba: la versión anterior de TypeScript dejaba
// pasar los imports de side-effect sin declaración. TS2882 los empezó a
// marcar, así que el upgrade destapó el agujero.
//
// ── Por qué así y no de otra forma ──────────────────────────────────────────
// · No se saca `expo-env.d.ts` del .gitignore: es un archivo generado y el
//   propio Expo pide no versionarlo.
// · No se declara `module '*.css'` acá: chocaría con el de `expo/types` cuando
//   el archivo generado SÍ existe (o sea, en la máquina de cualquiera).
// · Una `/// <reference types="...">` repetida es idempotente para TypeScript,
//   así que convivir con el archivo de la raíz no molesta.
//
// Mismo criterio que `nativewind-env.d.ts`, que ya está versionado por el
// mismo motivo.
