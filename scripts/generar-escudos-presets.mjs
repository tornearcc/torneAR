// Escudos prediseñados para los equipos sin foto (P3-26).
// Dibuja 15 escudos genéricos en SVG y arma el script de Playwright que los pasa a PNG 512×512.
// Uso (desde tornear/):
//   node scripts/generar-escudos-presets.mjs
//   playwright-cli open && playwright-cli run-code --filename=<el path que imprime> && playwright-cli close
// Salida: supabase/storage-seed/shields/presets/escudo-01.png … escudo-15.png (se suben al bucket
// `shields` en la carpeta `presets/`) y supabase/storage-seed/shields/muestra-presets.png (vista previa).
// El script de Playwright va a la carpeta temporal del sistema: no se versiona (y tocar .gitignore
// cambia el fingerprint nativo).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const RUN = join(tmpdir(), 'escudos-presets-run.js');

const OUT = resolve('supabase/storage-seed/shields/presets');
mkdirSync(OUT, { recursive: true });

// Silueta del escudo en un lienzo de 200×240.
const S = 'M24 12 H176 Q188 12 188 24 V104 C188 164 152 204 100 230 C48 204 12 164 12 104 V24 Q12 12 24 12 Z';

const C = {
  blanco: '#F4F4F2', negro: '#151515', rojo: '#D62828', azul: '#1D4E9E', marino: '#14213D',
  celeste: '#6EC6F0', amarillo: '#F5C518', verde: '#1F8A4C', tornear: '#1DB954', violeta: '#5B2A86',
  granate: '#7A1E2C', naranja: '#F77F00', dorado: '#E0B04A', lima: '#53E076',
};

const estrella = (cx, cy, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};

const pelota = (cx, cy, r) => {
  const pent = (rr, rot) => Array.from({ length: 5 }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / 5;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
  const p = pent(r * 0.36, -Math.PI / 2);
  const q = pent(r * 0.98, -Math.PI / 2);
  const lines = p.map(([x, y], i) => `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${q[i][0].toFixed(1)}" y2="${q[i][1].toFixed(1)}"/>`).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.blanco}" stroke="${C.negro}" stroke-width="5"/>
    <g stroke="${C.negro}" stroke-width="4">${lines}</g>
    <polygon points="${p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${C.negro}"/>`;
};

// Cada escudo: el relleno (recortado por la silueta) y el color del borde.
const ESCUDOS = [
  { nombre: 'Bastones rojo y blanco', borde: C.negro,
    fondo: `<rect width="200" height="240" fill="${C.blanco}"/>${[0, 2, 4].map((i) => `<rect x="${12 + i * 35.2}" width="35.2" height="240" fill="${C.rojo}"/>`).join('')}` },
  { nombre: 'Mitades azul y amarillo', borde: C.blanco,
    fondo: `<rect width="100" height="240" fill="${C.azul}"/><rect x="100" width="100" height="240" fill="${C.amarillo}"/>` },
  { nombre: 'Banda roja', borde: C.negro,
    fondo: `<rect width="200" height="240" fill="${C.blanco}"/><polygon points="0,40 40,0 200,190 200,240 170,240 0,58" fill="${C.rojo}"/>` },
  { nombre: 'Franja celeste', borde: C.blanco,
    fondo: `<rect width="200" height="240" fill="${C.marino}"/><rect y="92" width="200" height="54" fill="${C.celeste}"/>` },
  { nombre: 'Cuartelado verde', borde: C.negro,
    fondo: `<rect width="200" height="240" fill="${C.blanco}"/><rect width="100" height="110" fill="${C.verde}"/><rect x="100" y="110" width="100" height="130" fill="${C.verde}"/>` },
  { nombre: 'Chevron amarillo', borde: C.amarillo,
    fondo: `<rect width="200" height="240" fill="${C.negro}"/><polygon points="0,70 100,150 200,70 200,120 100,200 0,120" fill="${C.amarillo}"/>` },
  { nombre: 'Rayas celestes', borde: C.marino,
    fondo: `<rect width="200" height="240" fill="${C.blanco}"/>${[0, 2, 4, 6].map((i) => `<rect y="${12 + i * 31}" width="200" height="31" fill="${C.celeste}"/>`).join('')}` },
  { nombre: 'Estrella violeta', borde: C.blanco,
    fondo: `<rect width="200" height="240" fill="${C.violeta}"/>${estrella(100, 112, 58, C.blanco)}` },
  { nombre: 'Ajedrezado granate', borde: C.blanco,
    fondo: `<rect width="200" height="240" fill="${C.celeste}"/>${Array.from({ length: 6 * 7 }, (_, k) => {
      const col = k % 6; const fil = Math.floor(k / 6);
      return (col + fil) % 2 === 0 ? `<rect x="${12 + col * 29.4}" y="${12 + fil * 31}" width="29.4" height="31" fill="${C.granate}"/>` : '';
    }).join('')}` },
  { nombre: 'Cruz verde', borde: C.negro,
    fondo: `<rect width="200" height="240" fill="${C.blanco}"/><rect x="78" width="44" height="240" fill="${C.tornear}"/><rect y="78" width="200" height="44" fill="${C.tornear}"/>` },
  { nombre: 'Diagonal naranja', borde: C.blanco,
    fondo: `<rect width="200" height="240" fill="${C.negro}"/><polygon points="0,0 200,0 0,240" fill="${C.naranja}"/>` },
  { nombre: 'Pelota', borde: C.blanco,
    fondo: `<rect width="200" height="240" fill="${C.tornear}"/>${pelota(100, 114, 54)}` },
  { nombre: 'Tres estrellas', borde: C.dorado,
    fondo: `<rect width="200" height="240" fill="${C.azul}"/><rect width="200" height="62" fill="${C.rojo}"/>${[58, 100, 142].map((x) => estrella(x, 38, 15, C.blanco)).join('')}<rect y="152" width="200" height="16" fill="${C.blanco}"/>` },
  { nombre: 'Rayo', borde: C.lima,
    fondo: `<rect width="200" height="240" fill="${C.negro}"/><polygon points="116,30 58,128 96,128 80,210 146,100 106,100" fill="${C.lima}"/>` },
  { nombre: 'Anillo', borde: C.blanco,
    fondo: `<rect width="200" height="240" fill="${C.rojo}"/><circle cx="100" cy="112" r="56" fill="${C.blanco}"/><circle cx="100" cy="112" r="38" fill="${C.negro}"/><circle cx="100" cy="112" r="18" fill="${C.rojo}"/>` },
];

const svg = (e, i) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 0 240 240" width="512" height="512">
  <defs>
    <clipPath id="c${i}"><path d="${S}"/></clipPath>
    <linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".18"/>
    </linearGradient>
  </defs>
  <path d="${S}" fill="none" stroke="#0E0E0E" stroke-width="18" stroke-linejoin="round"/>
  <g clip-path="url(#c${i})">${e.fondo}<rect width="200" height="240" fill="url(#g${i})"/></g>
  <path d="${S}" fill="none" stroke="${e.borde}" stroke-width="9" stroke-linejoin="round"/>
</svg>`;

const id = (i) => `escudo-${String(i + 1).padStart(2, '0')}`;
const sueltos = ESCUDOS.map((e, i) => `<div class="s" id="${id(i)}">${svg(e, i)}</div>`).join('');
// Vista previa: como se ve en la app (TeamShield: círculo surface-high, escudo al 65 %).
const muestra = `<div id="_muestra">${ESCUDOS.map((e, i) => `<figure><div class="ci">${svg(e, i).replace('width="512" height="512"', 'width="100%" height="100%"')}</div><figcaption>${String(i + 1).padStart(2, '0')} · ${e.nombre}</figcaption></figure>`).join('')}</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box} body{background:transparent;font-family:Inter,Segoe UI,sans-serif}
.s{width:512px;height:512px}
#_muestra{width:1200px;padding:40px;background:#131313;display:grid;grid-template-columns:repeat(5,1fr);gap:36px 20px}
figure{display:flex;flex-direction:column;align-items:center;gap:12px}
.ci{width:150px;height:150px;border-radius:50%;background:#2A2A2A;border:1px solid rgba(134,149,133,.2);display:flex;align-items:center;justify-content:center;padding:26px}
figcaption{color:#BCCBB9;font-size:15px;text-align:center}
</style></head><body>${sueltos}${muestra}</body></html>`;

const outJs = OUT.replace(/\\/g, '/');
writeFileSync(RUN, `async page => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(${JSON.stringify(html)});
  for (const n of ${JSON.stringify(ESCUDOS.map((_, i) => id(i)))})
    await (await page.$('#' + n)).screenshot({ path: '${outJs}/' + n + '.png', omitBackground: true });
  await (await page.$('#_muestra')).screenshot({ path: '${outJs}/../muestra-presets.png' });
  return 'ok';
}`);
console.log(`${ESCUDOS.length} escudos → ${OUT}
Script de Playwright: ${RUN}`);
