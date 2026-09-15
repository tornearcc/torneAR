// Guarda contra el OTA que rompe la app: cambio nativo sin subir `version`.
//
// ── El riesgo ────────────────────────────────────────────────────────────────
// `runtimeVersion` usa la política `appVersion` (app.json), así que el runtime
// de un build ES su `version`. Si alguien agrega una dependencia nativa, un
// plugin o cambia `app.json` SIN subir `version`, el JS nuevo se publica contra
// el mismo runtime `1.0.0` y `eas update` se lo entrega a los binarios viejos,
// que no tienen ese módulo. La app no arranca, para todos, y el rollback tarda
// lo que tarde el update siguiente.
//
// ── La regla ─────────────────────────────────────────────────────────────────
// Si existe un build de producción con el MISMO runtime que la `version` local
// y su fingerprint nativo difiere del de este checkout, esto falla.
// Si no existe ninguno —porque se subió la versión— pasa: ese es justamente el
// camino correcto para un cambio nativo.
// La regla se mantiene sola: para el build 1.1.0 no hay con qué comparar y
// pasa; apenas ese build existe, el próximo cambio nativo sin bump falla.
//
// ── Por qué también es un script y no sólo un job de CI ──────────────────────
// Los OTA se publican A MANO desde el checkout local (docs/WORKFLOW.md §1), y
// una rama de hotfix que sale del commit del build vigente puede no pasar por
// un PR. Un chequeo que viva sólo en CI no cubre el momento en que el daño
// ocurre. De ahí `npm run ota:check`, obligatorio antes de `eas update`.
//
// ── Por qué iOS por defecto ──────────────────────────────────────────────────
// El fingerprint de Android incluye el CONTENIDO de `google-services.json`, que
// no está versionado (el repo es público): en CI el archivo no existe y la
// comparación daría un falso positivo. Android se habilita cuando la app se
// publique en Play y el secret se materialice en el runner. Hoy, además, no hay
// binarios de Android en la calle: iOS es el único que puede romperse.
//
// ── Una trampa verificada ────────────────────────────────────────────────────
// Los `scripts` de package.json entran en el fingerprint, porque `android` e
// `ios` contienen `expo run:*`. Agregar un script de npm mueve el hash sin que
// cambie una línea de código nativo. Por eso esto NO se cablea como
// `npm run ota:check`: la herramienta habría cambiado lo que mide y el primer
// PR en agregarla se habría marcado a sí mismo como cambio nativo.
//
// Uso:
//   node scripts/check-native-fingerprint.mjs              # iOS
//   node scripts/check-native-fingerprint.mjs --platform android
//
// Necesita sesión de EAS: `eas login` en local, o EXPO_TOKEN en CI.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_PROFILE = 'production';
const ENVIRONMENT = 'production';

const platform = parsePlatform(process.argv.slice(2));

function parsePlatform(argv) {
  const i = argv.indexOf('--platform');
  if (i === -1) return 'ios';

  const value = argv[i + 1];
  if (value !== 'ios' && value !== 'android') {
    fail(`--platform acepta "ios" o "android", no ${JSON.stringify(value)}.`);
  }
  return value;
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/**
 * Corre eas-cli y devuelve su stdout.
 *
 * Siempre por `npx`: en CI el `eas` global que instala expo-github-action ya
 * está en el PATH y npx lo encuentra, y en local no obliga a instalarlo.
 * `shell` en Windows porque ahí `npx` es un .cmd y spawn no lo resuelve solo.
 */
function eas(args) {
  const result = spawnSync('npx', ['--yes', 'eas-cli', ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    fail(`falló \`eas ${args.join(' ')}\`:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

/**
 * eas-cli imprime una línea humana ("Environment variables ... loaded") ANTES
 * del JSON aun con --json, así que hay que recortar hasta el primer `{` o `[`.
 * Parsear la salida cruda tira "Invalid JSON primitive".
 */
function parseJson(stdout, label) {
  const start = stdout.search(/[[{]/);
  if (start === -1) fail(`la salida de ${label} no traía JSON.`);

  try {
    return JSON.parse(stdout.slice(start));
  } catch (error) {
    fail(`no se pudo parsear el JSON de ${label}: ${error.message}`);
  }
}

// ── 1. El runtime de este checkout ──────────────────────────────────────────
const appJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'app.json'), 'utf8'));
const version = appJson.expo?.version;
const policy = appJson.expo?.runtimeVersion?.policy;

if (!version) fail('app.json no declara expo.version.');

// Con otra política, "runtime = version" deja de ser cierto y este chequeo
// pasaría en verde sin mirar nada. Falla a propósito: que alguien lo revise.
if (policy !== 'appVersion') {
  fail(
    `este chequeo asume la política de runtimeVersion "appVersion" y app.json declara ${JSON.stringify(policy)}. ` +
      'Actualizá scripts/check-native-fingerprint.mjs antes de seguir.',
  );
}

console.log(`· Plataforma ${platform} · versión local ${version}`);

// ── 2. El build de producción que comparte ese runtime ──────────────────────
const builds = parseJson(
  eas([
    'build:list',
    '--platform', platform,
    '--status', 'finished',
    '--build-profile', BUILD_PROFILE,
    '--runtime-version', version,
    '--limit', '50',
    '--json',
    '--non-interactive',
  ]),
  'eas build:list',
);

const reference = builds.find((build) => build.fingerprint?.hash);

if (!reference) {
  console.log(
    builds.length === 0
      ? `✔ No hay build de producción con runtime ${version}: es una versión nueva, no hay binario viejo que romper.`
      : `✔ Los builds con runtime ${version} no tienen fingerprint registrado (son anteriores a que EAS lo calculara): nada que comparar.`,
  );
  process.exit(0);
}

console.log(
  `· Referencia: build ${reference.appVersion} (${reference.appBuildVersion}) · ${reference.id} · fingerprint ${reference.fingerprint.hash}`,
);

// ── 3. El fingerprint de este checkout ──────────────────────────────────────
const local = parseJson(
  eas([
    'fingerprint:generate',
    '--platform', platform,
    '--environment', ENVIRONMENT,
    '--json',
    '--non-interactive',
  ]),
  'eas fingerprint:generate',
);

if (!local.hash) fail('eas fingerprint:generate no devolvió un hash.');

console.log(`· Local: ${local.hash}`);

// ── 4. Veredicto ────────────────────────────────────────────────────────────
if (local.hash === reference.fingerprint.hash) {
  console.log(`✔ El nativo no cambió respecto del build en la calle: este JS puede salir por OTA a ${version}.`);
  process.exit(0);
}

console.error(
  [
    '',
    `✖ El fingerprint nativo cambió y \`version\` sigue en ${version}.`,
    '',
    `  build ${reference.appBuildVersion}: ${reference.fingerprint.hash}`,
    `  este checkout:  ${local.hash}`,
    '',
    '  Un OTA publicado así llega a binarios que no tienen el código nativo nuevo y la app no arranca.',
    '',
    '  Salidas:',
    `   · Si el cambio nativo es intencional: subí "version" en app.json y sacá un build nuevo.`,
    `   · Si no lo es: mirá qué se coló con`,
    `       npx eas-cli fingerprint:compare --build-id ${reference.id} --environment ${ENVIRONMENT}`,
    '',
  ].join('\n'),
);
process.exit(1);
