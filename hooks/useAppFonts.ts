import { useFonts } from 'expo-font';
import { Inter_500Medium, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { Epilogue_700Bold } from '@expo-google-fonts/epilogue';

/** Las fuentes de `tailwind.config.js` (`font-ui*`, `font-display*`, `font-epic`). */
const APP_FONTS = {
  Inter_500Medium,
  Inter_700Bold,
  Inter_900Black,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  Epilogue_700Bold,
};

/**
 * `true` cuando las fuentes de la app ya están registradas.
 *
 * Lo usa `RootLayout` para cargarlas y cualquier pantalla que monte ANTES de
 * que terminen (la Home, que es el ancla de `(tabs)` y monta detrás del intro).
 * Llamarlo de nuevo no las vuelve a descargar: expo-font reutiliza la carga en
 * curso y, si ya terminó, devuelve `true` desde el primer render.
 *
 * Por qué una pantalla tiene que esperarlas (M-02, reporte #7761): en Android,
 * un texto medido con la fuente de reemplazo guarda esa medida en la caché
 * nativa. Cuando llega Inter, que es más ancha, se dibuja en la caja vieja, la
 * última palabra baja a una segunda línea y queda oculta ("Unirse con" en vez de
 * "Unirse con Código"). iOS vuelve a medir y no lo sufre.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts(APP_FONTS);
  return loaded;
}
