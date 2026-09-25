/**
 * Verificación de punta a punta del borrado de archivos de avatars
 * (migración 20260925130000) contra el Supabase LOCAL.
 *
 * pgTAP (470) prueba lo que queda encolado en pg_net, pero las requests salen
 * recién después del COMMIT, así que ahí no se puede ver el archivo borrado.
 * Este script sí: sube archivos de verdad al Storage local, dispara los
 * triggers y espera a que pg_net los borre.
 *
 *   node scripts/verify-avatar-file-cleanup.mjs
 *
 * Lee URL y claves de `npx supabase status -o env`. Se niega a correr si la
 * URL no es local. Prepara el stack local con `docker exec` (contenedor
 * LOCAL_DB_CONTAINER, por defecto supabase_db_tornear):
 *   · carga el secreto storage_service_role_key en el Vault local, y
 *   · redefine storage_avatars_object_url() para que pg_net apunte al Storage
 *     local (http://supabase_kong_tornear:8000). Sólo en la base local: el
 *     próximo `supabase db reset` la deja como en la migración.
 *
 * Casos:
 *   1. Cambiar la foto borra la anterior y deja la nueva.
 *   2. Una foto que es evidencia de una denuncia abierta NO se borra.
 *   3. delete_own_account borra TODOS los archivos de la persona (también la
 *      evidencia) y ninguno de otra.
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const container = process.env.LOCAL_DB_CONTAINER ?? 'supabase_db_tornear';
const status = Object.fromEntries(
  execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: true })
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = status.API_URL;
const serviceKey = status.SERVICE_ROLE_KEY;
const anonKey = status.ANON_KEY;
const jwtSecret = status.JWT_SECRET;

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url ?? '')) {
  throw new Error(`Sólo contra el Supabase local. API_URL=${url || '(vacía)'}`);
}

// Perfiles del seed de testing: la persona que cambia de foto y se da de baja,
// y otra cuyos archivos no se pueden tocar.
const PERSON = { profileId: '33333333-3333-3333-3333-000000000001', authId: 'aaaaaaaa-0000-0000-0000-000000000001' };
const OTHER = { authId: 'aaaaaaaa-0000-0000-0000-000000000007' };
const ADMIN = { profileId: '33333333-3333-3333-3333-000000000004' };

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const bucket = service.storage.from('avatars');

function psql(sql) {
  return execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

function sign(sub) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  return `${header}.${payload}.${createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')}`;
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? '  ok ' : '  FALLA'} ${label}`);
  if (!condition) failures += 1;
}

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function upload(path) {
  const bytes = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
  await must(bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: true }), `subir ${path}`);
  return path;
}

async function exists(path) {
  const { data } = await bucket.exists(path);
  return data === true;
}

async function setAvatar(value) {
  await must(service.from('profiles').update({ avatar_url: value }).eq('id', PERSON.profileId).select('id'), 'actualizar avatar');
}

/** pg_net manda la request en segundo plano: se espera hasta ~15 s. */
async function waitUntilGone(path) {
  for (let i = 0; i < 30; i += 1) {
    if (!(await exists(path))) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/** Para los casos donde el archivo NO se tiene que borrar: se da tiempo a pg_net. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 6000));
}

async function main() {
  // ── Preparación del stack local ─────────────────────────────────────────────
  const { error: bucketError } = await service.storage.getBucket('avatars');
  if (bucketError) await must(service.storage.createBucket('avatars', { public: true }), 'crear bucket');

  psql(`select vault.create_secret('${serviceKey}', 'storage_service_role_key')
        where not exists (select 1 from vault.secrets where name = 'storage_service_role_key')`);
  psql(`create or replace function public.storage_avatars_object_url() returns text language sql immutable
        as $$ select 'http://supabase_kong_tornear:8000/storage/v1/object/avatars/'::text $$`);

  const run = Date.now();
  const p = (name) => `${PERSON.authId}/${run}-${name}.jpg`;

  console.log('1. Cambiar la foto borra la anterior');
  {
    await setAvatar(null);
    const first = await upload(p('primera'));
    await setAvatar(first);
    const second = await upload(p('segunda'));
    await setAvatar(second);
    check('la foto anterior se borró del bucket', await waitUntilGone(first));
    check('la nueva sigue', await exists(second));
  }

  console.log('2. La evidencia de una denuncia abierta no se borra');
  {
    const reported = await upload(p('denunciada'));
    await setAvatar(reported);
    await must(
      service.from('content_reports').insert({
        reporter_id: ADMIN.profileId,
        reported_entity_type: 'USER',
        reported_entity_id: PERSON.profileId,
        reason: 'Foto de perfil inapropiada',
      }).select('id'),
      'crear denuncia',
    );
    const after = await upload(p('despues-de-la-denuncia'));
    await setAvatar(after);
    await settle();
    check('la foto denunciada sigue en el bucket', await exists(reported));
  }

  console.log('3. delete_own_account borra todos los archivos de la persona');
  {
    const extra = await upload(p('vieja-sin-perfil'));
    const other = await upload(`${OTHER.authId}/${run}-no-tocar.jpg`);
    // Se listan ANTES de la baja: después ya podrían estar borrándose.
    const { data: listed } = await bucket.list(PERSON.authId, { limit: 1000 });
    const mine = (listed ?? []).map((o) => `${PERSON.authId}/${o.name}`);
    check(`antes de la baja la persona tiene archivos (${mine.length}), incluida la evidencia`,
      mine.includes(extra) && mine.some((path) => path.endsWith('-denunciada.jpg')));

    const asPerson = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${sign(PERSON.authId)}` } },
    });
    await must(asPerson.rpc('delete_own_account'), 'delete_own_account');

    let allGone = true;
    for (const path of mine) allGone = (await waitUntilGone(path)) && allGone;
    check('se borraron todos sus archivos', allGone);
    check('el archivo de otra persona sigue', await exists(other));
  }

  console.log(failures === 0 ? '\nTodo OK.' : `\n${failures} verificación(es) fallaron.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
