// ============================================================
// tutorial-shields.mjs — escudos PNG para el tutorial (SOLO LOCAL)
// ------------------------------------------------------------
// Dibuja un escudo PNG por equipo del tutorial y lo sube al bucket `shields`
// del stack LOCAL (supabase start). `tutorial-onboarding-local.sql` usa el
// path del bucket (`tutorial/<slug>.png`) si el archivo existe; si no, cae en
// un escudo de ui-avatars.com. La app arma la URL pública con SU URL de
// Supabase, así que en el emulador carga desde 192.168.1.34 sin tocar nada.
//
//   cd tornear
//   node supabase/demo-data/tutorial-shields.mjs            # genera y sube
//   node supabase/demo-data/tutorial-shields.mjs --out DIR  # además guarda los PNG en DIR
//
// ⚠️ Se niega a correr contra algo que no sea 127.0.0.1 / localhost.
// Corre DESPUÉS de `npx supabase db reset` y ANTES del .sql.
// ============================================================

import { deflateSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// slug · color principal · secundario · borde · diseño · emblema
export const SHIELDS = [
  ['deportivo-dorrego',     '#0B6E4F', '#F2C14E', '#062B20', 'stripes',  'star'],
  ['atletico-villa-crespo', '#B3001B', '#FFFFFF', '#3D0009', 'sash',     'ball'],
  ['muchachos-almagro',     '#1D3557', '#E63946', '#0B1626', 'halves',   'star'],
  ['real-caballito',        '#5B2A86', '#FFFFFF', '#24103A', 'hoop',     'ball'],
  ['sportivo-nunez',        '#E85D04', '#1B1B1B', '#4A1D01', 'chevron',  'star'],
  ['juventud-belgrano',     '#0077B6', '#FFFFFF', '#00304A', 'stripes',  'ball'],
  ['colegiales-fc',         '#2B9348', '#FFFFFF', '#103A1C', 'quarters', 'star'],
  ['flores-unidos',         '#C1121F', '#003049', '#3F060A', 'halves',   'ball'],
  ['la-12-de-urquiza',      '#FFD60A', '#003566', '#5C4D00', 'sash',     'star'],
  ['recoleta-athletic',     '#14213D', '#FCA311', '#05080F', 'hoop',     'star'],
  ['saavedra-juniors',      '#6A040F', '#FFBA08', '#2A0206', 'chevron',  'ball'],
  ['defensores-vicente-lopez', '#023E8A', '#90E0EF', '#011A3B', 'stripes', 'star'],
  ['las-pibas-caballito',   '#D62F7F', '#FFFFFF', '#5A1235', 'sash',     'star'],
  ['leonas-belgrano',       '#7B2CBF', '#FFD60A', '#2E0F49', 'quarters', 'ball'],
  ['social-avellaneda',     '#9D0208', '#FFFFFF', '#3B0103', 'hoop',     'star'],
  ['ramos-mejia-fc',        '#1B4332', '#D8F3DC', '#081C15', 'halves',   'ball'],
  ['unidos-de-boedo',       '#3A0CA3', '#F72585', '#170448', 'chevron',  'star'],
  ['la-banda-de-liniers',   '#F48C06', '#03071E', '#5E3502', 'stripes',  'ball'],
  ['furia-de-coghlan',      '#212529', '#E9C46A', '#000000', 'sash',     'star'],
  ['viernes-fc',            '#0096C7', '#FFFFFF', '#003A4D', 'quarters', 'ball'],
];

const SIZE = 256;
const SS = 3; // supersampling por eje

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ── Geometría (coordenadas normalizadas 0..1) ─────────────────────────────
// Escudo clásico: tope recto con esquinas redondeadas, lados rectos hasta el
// 52 % y curva hasta la punta de abajo.
function insideShield(x, y, inset = 0) {
  const l = 0.12 + inset, r = 0.88 - inset, t = 0.08 + inset, bottom = 0.94 - inset * 1.4;
  if (y < t || x < l || x > r || y > bottom) return false;
  const rad = 0.06;
  if (y < t + rad) {
    if (x < l + rad && Math.hypot(x - (l + rad), y - (t + rad)) > rad) return false;
    if (x > r - rad && Math.hypot(x - (r - rad), y - (t + rad)) > rad) return false;
  }
  const mid = 0.5, shoulder = 0.52;
  if (y <= shoulder) return true;
  // Curva: el ancho cae como una parábola hasta la punta.
  const k = (y - shoulder) / (bottom - shoulder); // 0..1
  const half = (r - l) / 2 * (1 - k * k);
  return Math.abs(x - mid) <= half;
}

function pattern(kind, x, y) {
  switch (kind) {
    case 'stripes': return Math.floor((x - 0.12) / 0.152) % 2 === 1;
    case 'sash': { const d = (x - y) ; return d > -0.13 && d < 0.13; }
    case 'halves': return x > 0.5;
    case 'hoop': return y > 0.36 && y < 0.56;
    case 'quarters': return (x > 0.5) !== (y > 0.47);
    case 'chevron': { const v = 0.28 + Math.abs(x - 0.5) * 0.9; return y > v && y < v + 0.17; }
    default: return false;
  }
}

function insideStar(x, y, cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? R : R * 0.42;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insidePentagon(x, y, cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (2 * Math.PI / 5);
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Color (RGBA) de un punto. null = transparente.
function sample(x, y, cfg) {
  const [, c1, c2, border, kind, emblem] = cfg;
  if (!insideShield(x, y)) return null;
  if (!insideShield(x, y, 0.035)) return [...hex(border), 255];
  // Filete blanco interno.
  if (!insideShield(x, y, 0.05)) return [255, 255, 255, 255];
  const cx = 0.5, cy = 0.47, R = 0.145;
  const dist = Math.hypot(x - cx, y - cy);
  if (dist <= R + 0.022) {
    if (dist > R) return [...hex(border), 255];
    if (emblem === 'star') {
      return insideStar(x, y, cx, cy + 0.006, R * 0.8) ? [...hex(c2 === '#FFFFFF' ? c1 : c2), 255] : [255, 255, 255, 255];
    }
    // Pelota: blanco con pentágono central y gajos.
    if (insidePentagon(x, y, cx, cy, R * 0.36)) return [20, 20, 20, 255];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (2 * Math.PI / 5);
      if (insidePentagon(x, y, cx + R * 0.95 * Math.cos(a), cy + R * 0.95 * Math.sin(a), R * 0.3)) return [20, 20, 20, 255];
    }
    return [255, 255, 255, 255];
  }
  return [...hex(pattern(kind, x, y) ? c2 : c1), 255];
}

function render(cfg) {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  for (let py = 0; py < SIZE; py++) {
    for (let pxi = 0; pxi < SIZE; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((pxi + (sx + 0.5) / SS) / SIZE, (py + (sy + 0.5) / SS) / SIZE, cfg);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS, o = (py * SIZE + pxi) * 4;
      const cov = a / 255;
      px[o] = cov ? Math.round(r / cov) : 0;
      px[o + 1] = cov ? Math.round(g / cov) : 0;
      px[o + 2] = cov ? Math.round(b / cov) : 0;
      px[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(px);
}

// ── PNG mínimo (RGBA 8 bits, sin filtros) ──────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(rgba) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Subida al stack local ───────────────────────────────────────────────────
function localStack() {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const status = JSON.parse(raw.slice(raw.indexOf('{')));
    url = url || status.API_URL;
    key = key || status.SERVICE_ROLE_KEY;
  }
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Me niego a subir a ${url}: este script es SOLO para el stack local.`);
  }
  return { url, key };
}

async function ensureBucket({ url, key }, id, isPublic) {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name: id, public: isPublic }),
  });
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`No pude crear el bucket ${id}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outDir = outIdx > -1 ? process.argv[outIdx + 1] : null;
  if (outDir) mkdirSync(outDir, { recursive: true });

  const stack = localStack();
  await ensureBucket(stack, 'shields', true);
  await ensureBucket(stack, 'avatars', true);
  await ensureBucket(stack, 'wo_evidences', false);

  for (const cfg of SHIELDS) {
    const png = render(cfg);
    if (outDir) writeFileSync(join(outDir, `${cfg[0]}.png`), png);
    const res = await fetch(`${stack.url}/storage/v1/object/shields/tutorial/${cfg[0]}.png`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stack.key}`,
        apikey: stack.key,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
        'cache-control': 'max-age=3600',
      },
      body: png,
    });
    if (!res.ok) throw new Error(`Falló la subida de ${cfg[0]}: ${res.status} ${await res.text()}`);
    console.log(`ok  shields/tutorial/${cfg[0]}.png (${png.length} bytes)`);
  }
  console.log(`Listo: ${SHIELDS.length} escudos en el bucket local "shields".`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
