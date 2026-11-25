// tornear/lib/favorite-teams.ts

/**
 * Catalogo cerrado de cuadros favoritos: Primera, Primera Nacional, B Metro,
 * C Metro y Federal (149 clubes + 'Otro / No tengo').
 *
 * Es una constante del cliente y NO una tabla, a proposito: el cuadro favorito
 * es un dato de identidad del usuario, no una entidad del dominio. Los `teams`
 * de torneAR son los equipos amateur de la app; mezclar clubes profesionales en
 * esa tabla contaminaria rankings, ELO y busquedas del mercado.
 *
 * Si en el futuro se necesitan filtros por club, migrar a una tabla
 * `football_clubs` con su propia migracion.
 */

/**
 * Base de los escudos, en 256x256 (suficiente para un avatar de 44px hasta 3x
 * de densidad, ~10 KB por archivo).
 *
 * ⚠️ El tamaño es parte de la identidad del archivo, no un parametro
 * intercambiable: football-logos.cc publica un hash DISTINTO por cada
 * resolucion del mismo escudo. Independiente Rivadavia, por ejemplo, es
 * `9af0d0c7` en 64x64, `fd293578` en 256x256 y `f8dad054` en 1500x1500.
 * Cambiar `256x256` por otro tamaño rompe todas las URLs de una.
 *
 * El CDN responde 403 a pedidos sin User-Agent de navegador (curl o fetch
 * pelado); las apps sí reciben la imagen. Para verificar URLs a mano, mandar
 * un User-Agent de navegador.
 */
const CLUB_LOGO_BASE_URL = 'https://assets.football-logos.cc/logos/argentina/256x256';

/**
 * Catalogo: nombre canonico + archivo del escudo.
 *
 * `logoFile` incluye el HASH del contenido y no solo el slug. No es un detalle
 * cosmetico: la URL sin hash devuelve 404 (verificado contra el servidor), asi
 * que no alcanza con concatenar un slug — hay que pinear el archivo exacto.
 *
 * Los valores se extrajeron del HTML de https://football-logos.cc/argentina
 * y se verificaron UNO POR UNO con una request real (HTTP 200 + image/png): los
 * 28 de Primera el 2026-08-11 y los 121 del ascenso el 2026-11-24. No estan
 * escritos de memoria.
 *
 * ⚠️ Los nombres son lo que se guarda en `profiles.favorite_team` y lo que
 * cuenta el censo (`get_favorite_team_census`): NUNCA renombrar uno existente,
 * porque los hinchas que ya lo eligieron quedarian fuera del catalogo. Los del
 * ascenso tienen nombres propios donde el del sitio era ambiguo o largo
 * («Racing» → 'Racing de Córdoba', «Club Atlético Temperley» → 'Temperley').
 * Argentinos Juniors conserva el archivo viejo `argeninos-juniors` (sigue
 * funcionando); el sitio ya publica uno con el nombre corregido.
 *
 * Ojo con los slugs que no coinciden con el nombre — son del proveedor, no
 * nuestros, y no se pueden "arreglar":
 *   · Argentinos Juniors  → `argeninos-juniors` (SIC: falta la 't', es un typo
 *                            del proveedor; corregirlo da 404)
 *   · Huracan             → `ca-huracan`
 *   · Gimnasia LP         → `gimnasia-lp` (hay otras cuatro "Gimnasia" en el
 *                            catalogo del sitio: Jujuy, Mendoza, Salta)
 *   · Instituto           → `instituto-cordoba`
 *   · San Lorenzo         → `san-lorenzo-de-almagro`
 *   · Racing Club         → `racing-club` (existe tambien `racing`, que es otro
 *                            club: el sitio lo titula "Racing" a secas)
 *   · Talleres            → `talleres` (existe `talleres-remedios-de-escalada`)
 *
 * `logoFile: null` es "no hay escudo que mostrar", no un dato faltante.
 */
export const FAVORITE_TEAMS = [
  { name: 'Acassuso', logoFile: 'acassuso.616c54ab' },
  { name: 'Agropecuario', logoFile: 'agropecuario-argentino.53023997' },
  { name: 'Aldosivi', logoFile: 'aldosivi.1869fe02' },
  { name: 'All Boys', logoFile: 'all-boys.8cfeed0f' },
  { name: 'Almagro', logoFile: 'almagro.a71d5562' },
  { name: 'Almirante Brown', logoFile: 'almirante-brown.470abf3d' },
  { name: 'Alvarado', logoFile: 'alvarado.37f5f84c' },
  { name: 'Argentino de Merlo', logoFile: 'argentino-de-merlo.b7ba2834' },
  { name: 'Argentino de Monte Maíz', logoFile: 'argentino-de-monte-maiz.f75bd1da' },
  { name: 'Argentino de Quilmes', logoFile: 'argentino-de-quilmes.568f6508' },
  { name: 'Argentino de Rosario', logoFile: 'argentino-de-rosario.ca7ecfbd' },
  { name: 'Argentinos Juniors', logoFile: 'argeninos-juniors.a7c47840' },
  { name: 'Arsenal de Sarandí', logoFile: 'arsenal-de-sarandi.3db49ff2' },
  { name: 'Atenas de Río Cuarto', logoFile: 'atenas-rio-cuarto.69a771ab' },
  { name: 'Atlanta', logoFile: 'atletico-atlanta.082f83af' },
  { name: 'Atlas', logoFile: 'atlas.333dca68' },
  { name: 'Atlético de Rafaela', logoFile: 'atletico-rafaela.8951f405' },
  { name: 'Atlético Policial', logoFile: 'atletico-policial.abc78bd9' },
  { name: 'Atlético Tucumán', logoFile: 'atletico-tucuman.3021868e' },
  { name: 'Banfield', logoFile: 'banfield.2b03df71' },
  { name: 'Barracas Central', logoFile: 'barracas-central.d735f375' },
  { name: 'Belgrano', logoFile: 'belgrano.a9ed5c35' },
  { name: 'Berazategui', logoFile: 'berazategui.94d537e8' },
  { name: 'Boca Juniors', logoFile: 'boca-juniors.533fd0f6' },
  { name: 'Boca Río Gallegos', logoFile: 'boca-rio-gallegos.cc5920a7' },
  { name: 'Boca Unidos', logoFile: 'boca-unidos.71ed12a8' },
  { name: 'Brown de Adrogué', logoFile: 'brown-de-adrogue.0b54e6bb' },
  { name: 'Cañuelas', logoFile: 'canuelas.36427f3d' },
  { name: 'Central Ballester', logoFile: 'central-ballester.5c6d884b' },
  { name: 'Central Córdoba', logoFile: 'central-cordoba.6116953f' },
  { name: 'Central Córdoba de Rosario', logoFile: 'central-cordoba-rosario.cb220407' },
  { name: 'Central Norte', logoFile: 'central-norte.0d992acc' },
  { name: 'Centro Español', logoFile: 'centro-espanol.e7025267' },
  { name: 'Chacarita Juniors', logoFile: 'chacarita-juniors.f00932d4' },
  { name: 'Chaco For Ever', logoFile: 'chaco-for-ever.8433731c' },
  { name: 'Ciudad de Bolívar', logoFile: 'ciudad-de-bolivar.67e70068' },
  { name: 'Claypole', logoFile: 'claypole.cac60e0b' },
  { name: 'Colegiales', logoFile: 'colegiales.dd8300ef' },
  { name: 'Colón', logoFile: 'colon-santa-fe.97b691ba' },
  { name: 'Comunicaciones', logoFile: 'comunicaciones.f96ac99d' },
  { name: 'Crucero del Norte', logoFile: 'crucero-del-norte.63950a5d' },
  { name: 'Defensa y Justicia', logoFile: 'defensa-y-justicia.00540812' },
  { name: 'Defensores de Belgrano', logoFile: 'defensores-de-belgrano.ffbce08e' },
  { name: 'Defensores de Cambaceres', logoFile: 'defensores-de-cambaceres.04f30746' },
  { name: 'Defensores Unidos', logoFile: 'defensores-unidos.c8baaa71' },
  { name: 'Deportivo Armenio', logoFile: 'deportivo-armenio.873fb0f0' },
  { name: 'Deportivo Camioneros', logoFile: 'deportivo-camioneros.d3fcfd73' },
  { name: 'Deportivo Español', logoFile: 'deportivo-espanol.4fe61fd1' },
  { name: 'Deportivo Laferrere', logoFile: 'deportivo-laferrere.91e7934c' },
  { name: 'Deportivo Madryn', logoFile: 'deportivo-madryn.2e0b8c0d' },
  { name: 'Deportivo Maipú', logoFile: 'deportivo-maipu.17c23841' },
  { name: 'Deportivo Merlo', logoFile: 'deportivo-merlo.ba0e738b' },
  { name: 'Deportivo Morón', logoFile: 'deportivo-moron.3b571401' },
  { name: 'Deportivo Muñiz', logoFile: 'deportivo-muniz.4e30fde5' },
  { name: 'Deportivo Paraguayo', logoFile: 'deportivo-paraguayo.d5b73e55' },
  { name: 'Deportivo Riestra', logoFile: 'deportivo-riestra.34842092' },
  { name: 'Deportivo Rincón', logoFile: 'deportivo-rincon.0c449f98' },
  { name: 'Dock Sud', logoFile: 'dock-sud.b770029a' },
  { name: 'Douglas Haig', logoFile: 'douglas-haig.e9443cf0' },
  { name: 'El Porvenir', logoFile: 'el-porvenir.f717a4ad' },
  { name: 'Estrella del Sur', logoFile: 'estrella-del-sur.32c9ca93' },
  { name: 'Estudiantes de Buenos Aires', logoFile: 'estudiantes-de-buenos-aires.059b6924' },
  { name: 'Estudiantes de La Plata', logoFile: 'estudiantes-de-la-plata.c58f9f29' },
  { name: 'Estudiantes de Río Cuarto', logoFile: 'estudiantes-de-rio-cuarto.96786cb1' },
  { name: 'Excursionistas', logoFile: 'excursionistas.328a0896' },
  { name: 'Fénix', logoFile: 'fenix.38a408ae' },
  { name: 'Ferro Carril Oeste', logoFile: 'ferro-carril-oeste.78bdb92d' },
  { name: 'Ferrocarril Midland', logoFile: 'ferrocarril-midland.4c653400' },
  { name: 'Flandria', logoFile: 'flandria.495f8b03' },
  { name: 'General Lamadrid', logoFile: 'general-lamadrid.de0bc20f' },
  { name: 'General Paz Juniors', logoFile: 'general-paz-juniors.b7c993f1' },
  { name: 'Germinal', logoFile: 'germinal.49bdee15' },
  { name: 'Gimnasia de Chivilcoy', logoFile: 'gimnasia-de-chivilcoy.de546596' },
  { name: 'Gimnasia de Concepción del Uruguay', logoFile: 'gimnasia-concepcion-del-uruguay.8968685a' },
  { name: 'Gimnasia y Esgrima de Jujuy', logoFile: 'gimnasia-de-jujuy.af840b1c' },
  { name: 'Gimnasia y Esgrima de Mendoza', logoFile: 'gimnasia-y-esgrima.cf409b59' },
  { name: 'Gimnasia y Esgrima La Plata', logoFile: 'gimnasia-lp.9ad61caf' },
  { name: 'Gimnasia y Tiro de Salta', logoFile: 'gimnasia-y-tiro.7570c567' },
  { name: 'Godoy Cruz', logoFile: 'godoy-cruz.28da0774' },
  { name: 'Guaraní Antonio Franco', logoFile: 'guarani-antonio-franco.e56057e1' },
  { name: 'Güemes (Santiago del Estero)', logoFile: 'guemes.63ccd0ef' },
  { name: 'Guillermo Brown', logoFile: 'guillermo-brown.ffe03c8c' },
  { name: 'Gutiérrez SC', logoFile: 'gutierrez-sc.ef1c4bb6' },
  { name: 'Huracán', logoFile: 'ca-huracan.c9e27138' },
  { name: 'Independiente', logoFile: 'independiente.091ccb51' },
  { name: 'Independiente Rivadavia', logoFile: 'independiente-rivadavia.fd293578' },
  { name: 'Instituto', logoFile: 'instituto-cordoba.9dd5a11e' },
  { name: 'Ituzaingó', logoFile: 'ituzaingo.47543b27' },
  { name: 'J.J. Urquiza', logoFile: 'justo-jose-de-urquiza.77e07d64' },
  { name: 'Jorge Gibson Brown', logoFile: 'jorge-gibson-brown.4e59dd55' },
  { name: 'Juventud Antoniana', logoFile: 'juventud-antoniana.ed220788' },
  { name: 'Juventud Unida', logoFile: 'juventud-unida-san-miguel.d2f06e43' },
  { name: 'Juventud Unida Universitario', logoFile: 'juventud-unida-universitario.2b45a0d5' },
  { name: 'Kimberley de Mar del Plata', logoFile: 'kimberley-mar-del-plata.4b35aa43' },
  { name: 'Lanús', logoFile: 'lanus.0b3284dc' },
  { name: 'Leandro N. Alem', logoFile: 'leandro-n-alem.6dc84117' },
  { name: 'Leones de Rosario', logoFile: 'leones-de-rosario.fd14cb8f' },
  { name: 'Libertad de Sunchales', logoFile: 'libertad-sunchales.32df1197' },
  { name: 'Liniers', logoFile: 'liniers.0a2875dc' },
  { name: 'Los Andes', logoFile: 'los-andes.8a418fbf' },
  { name: 'Lugano', logoFile: 'lugano.b64b6e1d' },
  { name: 'Luján', logoFile: 'lujan.799661dd' },
  { name: 'Mercedes', logoFile: 'club-mercedes.8dc0d2e6' },
  { name: 'Mitre (Santiago del Estero)', logoFile: 'mitre-santiago-del-estero.28ec8acd' },
  { name: "Newell's Old Boys", logoFile: 'newells-old-boys.323439bf' },
  { name: 'Nueva Chicago', logoFile: 'nueva-chicago.58bb4d4a' },
  { name: 'Olimpo', logoFile: 'olimpo.8d727ebb' },
  { name: 'Patronato', logoFile: 'patronato.5106b442' },
  { name: 'Platense', logoFile: 'platense.2ed87c5b' },
  { name: 'Puerto Nuevo', logoFile: 'puerto-nuevo.6a707b89' },
  { name: 'Quilmes', logoFile: 'quilmes.01c3dd47' },
  { name: 'Racing Club', logoFile: 'racing-club.2b4a44c9' },
  { name: 'Racing de Córdoba', logoFile: 'racing.1aa303b2' },
  { name: 'Racing de Olavarría', logoFile: 'racing-de-olavarria.ba8bb42d' },
  { name: 'Real Pilar', logoFile: 'real-pilar.169b7afd' },
  { name: 'Rivadavia de Lincoln', logoFile: 'rivadavia-de-lincoln.e76383ac' },
  { name: 'River Plate', logoFile: 'river-plate.44a77530' },
  { name: 'Rosario Central', logoFile: 'rosario-central.3341c8bd' },
  { name: 'Sacachispas', logoFile: 'sacachispas.1f86aab6' },
  { name: 'San Lorenzo', logoFile: 'san-lorenzo-de-almagro.94d7129e' },
  { name: 'San Martín de Burzaco', logoFile: 'san-martin-de-burzaco.46ce5656' },
  { name: 'San Martín de Formosa', logoFile: 'san-martin-de-formosa.3d415eba' },
  { name: 'San Martín de Tucumán', logoFile: 'san-martin-tucuman.5a83df4f' },
  { name: 'San Martín San Juan', logoFile: 'san-martin-san-juan.cb895fc3' },
  { name: 'San Miguel', logoFile: 'san-miguel.650ad1d0' },
  { name: 'San Telmo', logoFile: 'san-telmo.8db63c96' },
  { name: 'Santamarina', logoFile: 'santamarina.44d067ae' },
  { name: 'Sarmiento', logoFile: 'sarmiento.8f0e71f1' },
  { name: 'Sarmiento de La Banda', logoFile: 'sarmiento-de-la-banda.59c12895' },
  { name: 'Sportivo Barracas', logoFile: 'sportivo-barracas.a9c0a92f' },
  { name: 'Sportivo Belgrano', logoFile: 'sportivo-belgrano.823d169e' },
  { name: 'Sportivo Ben Hur', logoFile: 'sportivo-ben-hur.632e7101' },
  { name: 'Sportivo Desamparados', logoFile: 'sportivo-desamparados.57f150d4' },
  { name: 'Sportivo Italiano', logoFile: 'sportivo-italiano.ec4ce903' },
  { name: 'Talleres', logoFile: 'talleres.1dcd3bf7' },
  { name: 'Talleres (Remedios de Escalada)', logoFile: 'talleres-remedios-de-escalada.dacab79b' },
  { name: 'Temperley', logoFile: 'temperley.02e821be' },
  { name: 'Tigre', logoFile: 'tigre.81ae80b6' },
  { name: 'Tristán Suárez', logoFile: 'tristan-suarez.5efea01f' },
  { name: 'Tucumán Central', logoFile: 'tucuman-central.ebe61b12' },
  { name: 'UAI Urquiza', logoFile: 'uai-urquiza.749bc36c' },
  { name: 'Unión', logoFile: 'union.b8de0704' },
  { name: 'Unión de Sunchales', logoFile: 'union-sunchales.0bb0bb80' },
  { name: 'Vélez Sarsfield', logoFile: 'velez-sarsfield.d9813ef4' },
  { name: 'Victoriano Arenas', logoFile: 'victoriano-arenas.2b4437d0' },
  { name: 'Villa Dálmine', logoFile: 'villa-dalmine.3f274932' },
  { name: 'Villa Mitre', logoFile: 'villa-mitre.7d0aea2d' },
  { name: 'Villa San Carlos', logoFile: 'villa-san-carlos.b9942935' },
  { name: 'Yupanqui', logoFile: 'yupanqui.b460e6c5' },
  { name: 'Otro / No tengo', logoFile: null },
] as const;

export type FavoriteTeam = (typeof FAVORITE_TEAMS)[number]['name'];

/**
 * Solo los nombres, que es lo que consume el `OptionPickerDialog`.
 *
 * Se DERIVA del catalogo en vez de ser una segunda lista escrita a mano: con
 * dos arrays paralelos, sumar un club y olvidarse del otro es cuestion de
 * tiempo, y el sintoma seria un equipo elegible sin escudo (o al reves).
 */
export const FAVORITE_TEAM_OPTIONS: readonly string[] = FAVORITE_TEAMS.map((team) => team.name);

/** Indice nombre → archivo. `flatMap` en vez de `filter` para que TS descarte el null. */
const LOGO_FILE_BY_NAME: ReadonlyMap<string, string> = new Map(
  FAVORITE_TEAMS.flatMap((team) =>
    team.logoFile ? [[team.name, team.logoFile] as [string, string]] : [],
  ),
);

/**
 * URL del escudo, o `null` si el club no tiene uno mapeado.
 *
 * El `null` es un caso esperado y no un error: cubre 'Otro / No tengo' y
 * tambien cualquier valor legacy que la migracion de normalizacion no haya
 * podido resolver. Quien llama muestra el fallback (iniciales), nunca una
 * imagen rota.
 *
 * Es una funcion y no un string armado en la UI para que el dia que los
 * escudos se muden (a Supabase Storage, por ejemplo) cambie solo este archivo.
 */
export function getClubLogoUrl(teamName: string): string | null {
  const file = LOGO_FILE_BY_NAME.get(teamName.trim());
  return file ? `${CLUB_LOGO_BASE_URL}/${file}.png` : null;
}

/** Chequeo de pertenencia al catalogo (lo usa el `.refine` de userProfileSchema). */
export function isValidFavoriteTeam(value: string): boolean {
  return FAVORITE_TEAM_OPTIONS.includes(value);
}
