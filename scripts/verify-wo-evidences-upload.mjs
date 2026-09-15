// Verificación de la subida de evidencias de WO con el bucket PRIVADO (D-48).
//
// Qué prueba: que un usuario normal (la cuenta demo del revisor de Apple) puede
// seguir subiendo una evidencia a `wo_evidences` con el bucket cerrado, con
// las mismas opciones que usa la app (lib/match-actions.ts, `claimWo`), y que
// el objeto de prueba se borra enseguida por la Storage API.
//
// No llama a `claim_wo`: no crea reclamos ni toca datos de nadie. Deja la
// base como estaba — lo único que escribe es el objeto de prueba, y lo borra.
//
// Cómo correrlo (desde tornear/, en PowerShell):
//
//   $env:SUPABASE_SERVICE_ROLE_KEY = ((npx supabase projects api-keys --project-ref yusfykqimalghmmhlfdn -o json | ConvertFrom-Json) | Where-Object name -eq 'service_role').api_key
//   node scripts/verify-wo-evidences-upload.mjs
//   Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
//
// Pide el email (por defecto el de la cuenta demo) y la contraseña con la
// entrada oculta. No imprime tokens, contraseñas ni URLs firmadas completas.
// La service_role sólo se usa para leer el estado del bucket y para borrar.

import { readFileSync } from "node:fs";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_HOST = "yusfykqimalghmmhlfdn.supabase.co";
const BUCKET = "wo_evidences";
const DEFAULT_EMAIL = "revisor@tornear.com";
// Carpeta con un UUID nulo: ningún partido real la usa, así que el objeto de
// prueba no se puede confundir con una evidencia verdadera.
const TEST_FOLDER = "00000000-0000-0000-0000-000000000000";
// JPEG válido de 1×1 px. Storage valida el content-type contra
// `allowed_mime_types` del bucket, no el contenido.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

function readEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// Un solo lector de consola: uno por pregunta pierde entrada al pegar el comando.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) rl.output.write(s);
};

async function ask(question, { hidden = false, fallback = "" } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pending = new Promise((resolve) => rl.question(question, resolve));
    muted = hidden;
    const answer = (await pending).trim();
    muted = false;
    if (hidden) process.stdout.write("\n");
    if (answer || fallback) return answer || fallback;
    console.log("  Vino vacío, probá de nuevo.");
  }
  console.error("Tres respuestas vacías seguidas. Corto acá.");
  process.exit(1);
}

const stripToken = (url) => (url ? url.split("?")[0] : url);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const env = readEnv(new URL("../.env", import.meta.url));
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const publicKey = env.EXPO_PUBLIC_SUPABASE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publicKey) fail("Falta EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_KEY en tornear/.env.");
if (new URL(url).host !== EXPECTED_HOST) fail(`tornear/.env no apunta a producción (${new URL(url).host}).`);
if (!serviceKey) fail("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno (ver el encabezado del script).");

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, noSession);
const result = { host: EXPECTED_HOST };

// 0) Precondición: la prueba es para el bucket YA cerrado.
const { data: bucket, error: bucketError } = await service.storage.getBucket(BUCKET);
if (bucketError) fail(`No se pudo leer el bucket: ${bucketError.message}`);
result.bucket_publico = bucket.public;
if (bucket.public) fail("wo_evidences todavía es público: esta prueba se corre después del cierre.");

// 1) Sesión de usuario normal.
const email = await ask(`Email de la cuenta (Enter = ${DEFAULT_EMAIL}): `, { fallback: DEFAULT_EMAIL });
const password = await ask("Contraseña (no se muestra): ", { hidden: true });
rl.close();

const user = createClient(url, publicKey, noSession);
const { data: signIn, error: signInError } = await user.auth.signInWithPassword({ email, password });
if (signInError || !signIn.session) fail(`No se pudo iniciar sesión: ${signInError?.message ?? "sin sesión"}`);

const { data: profile } = await user
  .from("profiles")
  .select("is_admin")
  .eq("auth_user_id", signIn.user.id)
  .maybeSingle();
result.cuenta = { es_admin: profile?.is_admin === true };
if (profile?.is_admin === true) {
  await user.auth.signOut({ scope: "local" });
  fail("La cuenta es admin: la prueba necesita un usuario normal.");
}

const path = `${TEST_FOLDER}/prueba-cierre_${Date.now()}.jpg`;
const bytes = Uint8Array.from(Buffer.from(TINY_JPEG_BASE64, "base64"));
let uploaded = false;

try {
  // 2) Subida con las mismas opciones que `claimWo`.
  const { data: upload, error: uploadError } = await user.storage
    .from(BUCKET)
    .upload(path, bytes.buffer, { contentType: "image/jpeg", upsert: true });
  uploaded = !uploadError && Boolean(upload?.path);
  result.subida = { ok: uploaded, path: upload?.path ?? null, error: uploadError?.message ?? null };

  if (uploaded) {
    // 3) El dueño puede firmar su propio objeto (policy del dueño) y la URL responde.
    const { data: signed, error: signError } = await user.storage.from(BUCKET).createSignedUrl(path, 60);
    const signedHead = signed?.signedUrl ? await fetch(signed.signedUrl, { method: "HEAD" }) : null;
    result.firma_del_dueno = {
      firmado: Boolean(signed?.signedUrl),
      error: signError?.message ?? null,
      url_sin_token: stripToken(signed?.signedUrl),
      head_status: signedHead?.status ?? null,
    };

    // 4) La URL pública ya no sirve la foto.
    const publicHead = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${path}`, { method: "HEAD" });
    result.url_publica = { status: publicHead.status, esperado: "distinto de 200" };

    // 5) El usuario no puede borrar (no hay policy DELETE): se registra, no se exige.
    const { data: userRemove, error: userRemoveError } = await user.storage.from(BUCKET).remove([path]);
    result.borrado_por_el_usuario = {
      objetos_borrados: userRemove?.length ?? 0,
      error: userRemoveError?.message ?? null,
    };
  }
} finally {
  // 6) Borrado por la Storage API con service_role, aunque algo de arriba falle.
  if (uploaded) {
    const { data: removed, error: removeError } = await service.storage.from(BUCKET).remove([path]);
    const { data: leftovers } = await service.storage
      .from(BUCKET)
      .list(TEST_FOLDER, { search: path.split("/")[1] });
    result.borrado_service_role = {
      objetos_borrados: removed?.length ?? 0,
      error: removeError?.message ?? null,
      queda_el_objeto: (leftovers ?? []).length > 0,
    };
  }
  await user.auth.signOut({ scope: "local" });
}

console.log(JSON.stringify(result, null, 2));

const ok =
  result.subida?.ok === true &&
  result.firma_del_dueno?.head_status === 200 &&
  result.url_publica?.status !== 200 &&
  result.borrado_service_role?.queda_el_objeto === false;
console.log(ok ? "\nRESULTADO: OK" : "\nRESULTADO: FALLÓ — revisar el JSON");
process.exit(ok ? 0 : 1);
