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
// ── Dos modos, que comparan cosas DISTINTAS a propósito ──────────────────────
//
//   1. Modo publicado (por defecto) — «¿este checkout puede salir por OTA?»
//      Compara el fingerprint de este árbol contra el del build de producción
//      que tiene el mismo runtime. Es la pregunta real antes de `eas update`.
//      Corre a mano, en la máquina desde la que se publica.
//
//   2. Modo rama (`--against <dir>`) — «¿este PR cambia el nativo?»
//      Compara este árbol contra otro (la base del PR), calculando los dos con
//      el MISMO `@expo/fingerprint` de node_modules. Es lo que corre en CI.
//
//      Asume que los DOS árboles son checkouts limpios, como en el runner. En
//      una máquina de desarrollo, lo que está en .gitignore pero existe en el
//      disco —`google-services.json`, la carpeta `android/` de un prebuild—
//      aparece como diferencia contra un worktree recién creado. No es un bug
//      del chequeo: son archivos que el otro árbol realmente no tiene.
//
// ── Por qué CI NO puede usar el modo 1 ───────────────────────────────────────
// `eas build` sube el WORKING COPY local, no el checkout de GitHub. En esta
// máquina `core.autocrlf=true`, así que los archivos de texto versionados viven
// con CRLF y el fingerprint del build quedó calculado sobre esos bytes. El
// runner de Linux siempre ve LF, y el fingerprint hashea contenido: `.gitignore`,
// `eas.json` y `plugins/withInstagramQueries.js` dan hashes distintos aunque no
// haya cambiado una línea. Verificado el 15/09/2026: convirtiendo esos tres
// archivos a LF, esta máquina reproduce exactamente el hash que calculó CI.
//
// No se arregla con `.gitattributes`: normalizar a LF cambiaría los bytes
// locales y entonces el modo 1 —el que protege los OTA de verdad— dejaría de
// coincidir con el build publicado. Sería cambiar un rojo inútil por uno
// peligroso. Por eso CI compara rama contra base, que es inmune al sistema
// operativo, y el modo 1 se queda donde su comparación es válida.
//
// ── Otra trampa verificada ───────────────────────────────────────────────────
// Los `scripts` de package.json entran en el fingerprint, porque `android` e
// `ios` contienen `expo run:*`. Agregar un script de npm mueve el hash sin que
// cambie una línea de código nativo. Por eso esto no se cablea como
// `npm run ota:check`: la herramienta habría cambiado lo que mide.
//
// Uso:
//   node scripts/check-native-fingerprint.mjs                  # contra el build publicado (iOS)
//   node scripts/check-native-fingerprint.mjs --platform android
//   node scripts/check-native-fingerprint.mjs --against ../base   # contra otro árbol (CI)

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createFingerprintAsync } = require('@expo/fingerprint');

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_PROFILE = 'production';
const ENVIRONMENT = 'production';
// Cuántas fuentes se listan antes de cortar: un cambio de SDK mueve cientos de
// archivos de node_modules y el listado completo tapa la señal.
const MAX_DIFF_LINES = 25;

const argv = process.argv.slice(2);
const against = readFlag('--against');
const platformFlag = readFlag('--platform');

function readFlag(name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function appVersion(root) {
  const config = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'));
  const version = config.expo?.version;
  const policy = config.expo?.runtimeVersion?.policy;

  if (!version) fail(`${root}/app.json no declara expo.version.`);

  // Con otra política, "runtime = version" deja de ser cierto y este chequeo
  // pasaría en verde sin mirar nada. Falla a propósito: que alguien lo revise.
  if (policy !== 'appVersion') {
    fail(
      `este chequeo asume la política de runtimeVersion "appVersion" y app.json declara ${JSON.stringify(policy)}. ` +
        'Actualizá scripts/check-native-fingerprint.mjs antes de seguir.',
    );
  }

  return version;
}

/** Fuentes que cambiaron entre dos fingerprints, ya recortadas para leer. */
function diffSources(before, after) {
  const keyOf = (source) => source.filePath ?? source.id ?? source.type;
  const toMap = (sources) => new Map((sources ?? []).map((s) => [keyOf(s), s.hash]));

  const a = toMap(before);
  const b = toMap(after);
  const lines = [];

  for (const [key, hash] of a) {
    if (!b.has(key)) lines.push(`   − sólo en la base:    ${key}`);
    else if (b.get(key) !== hash) lines.push(`   ~ cambió:             ${key}`);
  }
  for (const key of b.keys()) {
    if (!a.has(key)) lines.push(`   + sólo acá:           ${key}`);
  }

  if (lines.length === 0) {
    return ['   (ninguna: los hashes difieren pero las fuentes coinciden — revisá cómo se calcularon)'];
  }

  return lines.length > MAX_DIFF_LINES
    ? [...lines.slice(0, MAX_DIFF_LINES), `   … y ${lines.length - MAX_DIFF_LINES} más`]
    : lines;
}

// ════════════════════════════════════════════════════════════════════════════
// Modo 2 — rama contra base (CI)
// ════════════════════════════════════════════════════════════════════════════
// Sin red y sin EXPO_TOKEN: los dos lados se calculan acá con el
// `@expo/fingerprint` que fija package-lock.json. Por eso también corre en un
// PR desde un fork.
//
// Se miran las DOS plataformas: como los dos árboles se hashean en el mismo
// runner, un archivo sin versionar (`google-services.json`, que entra en el
// fingerprint de Android) falta en los dos lados por igual y no produce un
// falso positivo, que es lo que sí pasaba comparando contra un build.
async function runAgainstRef(baseRoot) {
  const platforms = platformFlag ? [platformFlag] : ['android', 'ios'];

  const [head, base] = await Promise.all([
    createFingerprintAsync(PROJECT_ROOT, { platforms }),
    createFingerprintAsync(baseRoot, { platforms }),
  ]);

  const headVersion = appVersion(PROJECT_ROOT);
  const baseVersion = appVersion(baseRoot);

  console.log(`· Plataformas ${platforms.join(', ')} · versión base ${baseVersion} · versión acá ${headVersion}`);
  console.log(`· base: ${base.hash}`);
  console.log(`· acá:  ${head.hash}`);

  if (head.hash === base.hash) {
    console.log('✔ Esta rama no cambia el nativo: lo que salga de acá puede viajar por OTA.');
    return 0;
  }

  if (headVersion !== baseVersion) {
    console.log(
      `✔ Cambia el nativo, y \`version\` sube de ${baseVersion} a ${headVersion}: el runtime nuevo no comparte binarios con el viejo.`,
    );
    return 0;
  }

  console.error(
    [
      '',
      `✖ Esta rama cambia el nativo y \`version\` sigue en ${headVersion}.`,
      '',
      '  Fuentes que difieren:',
      ...diffSources(base.sources, head.sources),
      '',
      '  Un OTA publicado contra ese runtime llega a binarios que no tienen el código nativo',
      '  nuevo y la app no arranca.',
      '',
      '  Salidas:',
      '   · Si el cambio nativo es intencional: subí "version" en app.json — el binario nuevo',
      '     estrena runtime y los viejos dejan de recibir estos updates.',
      '   · Si no lo es: sacá de la rama lo que aparece arriba.',
      '',
    ].join('\n'),
  );
  return 1;
}

// ════════════════════════════════════════════════════════════════════════════
// Modo 1 — contra el build publicado (local, antes de `eas update`)
// ════════════════════════════════════════════════════════════════════════════
// Acá SÍ se usa eas-cli para las dos puntas: el hash del build sale de su
// registro y el local de `fingerprint:generate --environment production`, que
// es el método verificado para reproducir el del build. Mezclar métodos entre
// las dos puntas de una comparación es exactamente lo que produce falsos rojos.

/**
 * Corre eas-cli y devuelve su stdout.
 *
 * Siempre por `npx`: en CI el `eas` global ya está en el PATH y npx lo
 * encuentra, y en local no obliga a instalarlo. `shell` en Windows porque ahí
 * `npx` es un .cmd y spawn no lo resuelve solo.
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

function runAgainstPublishedBuild() {
  const platform = platformFlag ?? 'ios';
  if (platform !== 'ios' && platform !== 'android') {
    fail(`--platform acepta "ios" o "android", no ${JSON.stringify(platform)}.`);
  }

  const version = appVersion(PROJECT_ROOT);
  console.log(`· Plataforma ${platform} · versión local ${version}`);

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
        : `✔ Los builds con runtime ${version} no tienen fingerprint registrado: nada que comparar.`,
    );
    return 0;
  }

  console.log(
    `· Referencia: build ${reference.appVersion} (${reference.appBuildVersion}) · ${reference.id} · fingerprint ${reference.fingerprint.hash}`,
  );

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

  if (local.hash === reference.fingerprint.hash) {
    console.log(`✔ El nativo no cambió respecto del build en la calle: este JS puede salir por OTA a ${version}.`);
    return 0;
  }

  // El detalle se pide en la misma corrida y no se deja para que alguien corra
  // `compare` a mano: sin las fuentes concretas, el mensaje no alcanza para
  // decidir nada.
  const comparison = parseJson(
    eas([
      'fingerprint:compare',
      '--build-id', reference.id,
      '--environment', ENVIRONMENT,
      '--json',
      '--non-interactive',
    ]),
    'eas fingerprint:compare',
  );

  console.error(
    [
      '',
      `✖ El fingerprint nativo cambió y \`version\` sigue en ${version}.`,
      '',
      `  build ${reference.appBuildVersion}: ${reference.fingerprint.hash}`,
      `  este checkout:  ${local.hash}`,
      '',
      '  Fuentes que difieren:',
      ...diffSources(comparison.fingerprint1?.sources, comparison.fingerprint2?.sources ?? local.sources),
      '',
      '  Un OTA publicado así llega a binarios que no tienen el código nativo nuevo y la app no arranca.',
      '',
      '  Salidas:',
      '   · Si el cambio nativo es intencional: subí "version" en app.json y sacá un build nuevo.',
      '   · Si el listado de arriba no muestra ningún cambio tuyo, es una diferencia de entorno',
      '     (finales de línea, archivos sin versionar): no subas "version" — ver el encabezado.',
      '',
    ].join('\n'),
  );
  return 1;
}

const exitCode = against ? await runAgainstRef(path.resolve(against)) : runAgainstPublishedBuild();
process.exit(exitCode);
