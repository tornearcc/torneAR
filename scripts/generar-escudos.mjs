// Genera components/census/club-crests.ts a partir del catálogo de lib/favorite-teams.ts.
// Cada club necesita su PNG en assets/escudos/<slug>.png (slug = logoFile sin el hash).
// Para sumar un club: agregarlo al catálogo, bajar su escudo de football-logos.cc
// (https://assets.football-logos.cc/logos/argentina/256x256/<logoFile>.png, con User-Agent de navegador)
// a assets/escudos/ y correr: node scripts/generar-escudos.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const fuente = readFileSync('lib/favorite-teams.ts', 'utf8');
const clubes = [...fuente.matchAll(/\{ name: (['"])(.+?)\1, logoFile: '([^']+)' \}/g)].map((m) => ({
  name: m[2],
  slug: m[3].split('.')[0],
}));
const faltan = clubes.filter((c) => !existsSync(`assets/escudos/${c.slug}.png`));
if (faltan.length) throw new Error(`Faltan escudos en assets/escudos: ${faltan.map((c) => c.name).join(', ')}`);

const salida = `// ⚠️ ARCHIVO GENERADO por scripts/generar-escudos.mjs: no editar a mano.
//
// Escudos de los clubes del cuadro favorito, guardados DENTRO de la app
// (assets/escudos, PNG 256x256 de football-logos.cc). Antes se cargaban de
// internet y en algunos celulares quedaban en blanco (círculo gris) sin llegar
// a dar error: guardados acá se dibujan al instante, sin red. Metro necesita un
// require literal por archivo, por eso es una lista y no una función.
import type { ImageSourcePropType } from 'react-native';

export const CLUB_CRESTS: Readonly<Record<string, ImageSourcePropType>> = {
${clubes.map((c) => `  ${JSON.stringify(c.name)}: require('../../assets/escudos/${c.slug}.png'),`).join('\n')}
};
`;
writeFileSync('components/census/club-crests.ts', salida);
console.log(`club-crests.ts: ${clubes.length} escudos`);
