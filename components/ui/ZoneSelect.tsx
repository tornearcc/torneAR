import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useBottomInset } from '@/hooks/useBottomInset';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useRecentZones } from '@/hooks/useRecentZones';
import { useZoneCatalog } from '@/hooks/useZoneCatalog';
import { buildZoneIndex, searchZones } from '@/lib/zone-search';
import type { ZoneOption } from '@/lib/zone-search';

export type { ZoneOption } from '@/lib/zone-search';

/**
 * Alto de fila. Fijo a propósito: el alto de la lista es un múltiplo exacto de
 * este número, así nunca queda una fila cortada al medio insinuando que la
 * lista sigue cuando en realidad terminó.
 */
const ROW_HEIGHT = 52;
const SECTION_HEIGHT = 34;
const MAX_VISIBLE_ROWS = 7;
const MIN_VISIBLE_ROWS = 3;

/**
 * Cabecera (título + buscador) + contador + inset inferior. Es lo que ocupa el
 * sheet fuera de la lista, y lo que hay que descontar para saber cuántas filas
 * entran.
 */
const SHEET_CHROME = 236;

/** Porción de pantalla que puede ocupar el sheet. */
const SHEET_RATIO = 0.88;

/** Aire entre el fondo del sheet y el teclado, igual que `SafeAreaBottomSheet`. */
const KEYBOARD_GAP = 8;

/**
 * Alto de la lista en filas enteras, según lo que quede libre.
 *
 * No es un número fijo porque el teclado se come la mitad de la pantalla: con
 * un alto constante, en un teléfono chico y con el teclado abierto las últimas
 * filas quedaban recortadas por el `overflow-hidden` del sheet — justo mientras
 * el usuario escribe, que es cuando más necesita ver los resultados.
 */
function useListHeight(keyboardHeight: number): number {
  const { height: windowHeight } = useWindowDimensions();
  const available = windowHeight * SHEET_RATIO - SHEET_CHROME - keyboardHeight;
  const rows = Math.floor(available / ROW_HEIGHT);
  return ROW_HEIGHT * Math.min(Math.max(rows, MIN_VISIBLE_ROWS), MAX_VISIBLE_ROWS);
}

type ZoneRow =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'clear'; key: string; label: string }
  | { kind: 'zone'; key: string; option: ZoneOption; selected: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Filas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `memo` no es decorativo: sin él, cada tecla vuelve a renderizar las ~15 filas
 * montadas aunque el resultado no las haya tocado. Con él, sólo cambian las que
 * entran o salen de la ventana.
 */
const ZoneRowItem = memo(function ZoneRowItem({
  option,
  selected,
  onSelect,
}: {
  option: ZoneOption;
  selected: boolean;
  onSelect: (option: ZoneOption) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onSelect(option)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={option.name}
      className="flex-row items-center justify-between px-5"
      style={{ height: ROW_HEIGHT }}
    >
      <View className="flex-1 pr-3">
        <Text
          numberOfLines={1}
          className={`font-ui text-base ${selected ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
        >
          {option.name}
        </Text>
        {option.subtitle ? (
          <Text numberOfLines={1} className="font-ui text-xs text-neutral-on-surface-variant">
            {option.subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <AppIcon family="material-icons" name="check" size={20} color="#53E076" />
      ) : null}
    </TouchableOpacity>
  );
});

const SectionRow = memo(function SectionRow({ label }: { label: string }) {
  return (
    <View className="justify-end px-5 pb-1.5" style={{ height: SECTION_HEIGHT }}>
      <Text className="font-display text-[11px] uppercase tracking-widest text-neutral-outline">
        {label}
      </Text>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Sheet
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneSelectSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `option.value` de la zona elegida. Con el catálogo por defecto, su nombre. */
  selectedValue: string | null;
  onSelect: (zone: ZoneOption) => void;
  title?: string;
  /** Catálogo propio. Si se omite, usa todas las zonas activas. */
  options?: ZoneOption[];
  /** Estado de carga de `options`. Sólo aplica si se pasan opciones propias. */
  optionsLoading?: boolean;
  /** Texto de la fila que limpia la selección (filtros). Sin esto no se muestra. */
  clearLabel?: string;
  onClear?: () => void;
  /** Zona sugerida arriba de todo — típicamente la del perfil. */
  suggestedValue?: string | null;
  suggestedLabel?: string;
  /**
   * `true` para renderizar como overlay absoluto en vez de `<Modal>`.
   *
   * Modal adentro de Modal es frágil en Android (dos ventanas nativas, con su
   * propio manejo de back y de teclado). Los tres sheets que ya son Modal
   * —filtros de market, filtros de ranking y proponer partido— pasan este sheet
   * por la prop `overlay` de `SafeAreaBottomSheet`, que lo monta como hermano
   * adentro de la MISMA ventana.
   */
  inline?: boolean;
  /** Abrir con el teclado desplegado. Por defecto no: con recientes se elige sin escribir. */
  autoFocus?: boolean;
}

export function ZoneSelectSheet({
  visible,
  onClose,
  selectedValue,
  onSelect,
  title = 'Elegí tu zona',
  options,
  optionsLoading = false,
  clearLabel,
  onClear,
  suggestedValue,
  suggestedLabel = 'Tu zona',
  inline = false,
  autoFocus = false,
}: ZoneSelectSheetProps) {
  const [query, setQuery] = useState('');
  const { recent, remember } = useRecentZones();
  const keyboardHeight = useKeyboardHeight();
  const listHeight = useListHeight(keyboardHeight);

  // Sólo pega a la base si no le dieron opciones. `enabled` no depende de
  // `visible`: la request arranca al montar la pantalla y para cuando el usuario
  // toca el campo la lista ya está — y de todos modos es una sola por sesión.
  const catalog = useZoneCatalog(!options);
  const zones = options ?? catalog.zones;
  const loading = options ? optionsLoading : catalog.loading;

  /*
   * `useDeferredValue` (React 19) en lugar de un debounce con setTimeout.
   *
   * El problema real de escribir sobre 245 zonas no es filtrarlas —eso son
   * microsegundos— sino que React reconcilie la lista en el mismo commit que la
   * letra recién tecleada, lo que se ve como un input que "se traba". Acá el
   * TextInput se actualiza con prioridad de input y la lista se recalcula
   * después, en una pasada de baja prioridad que React puede interrumpir si
   * llega otra tecla.
   *
   * Contra un debounce fijo: no agrega latencia artificial. En un teléfono que
   * llega, la lista sale en el mismo frame; en uno lento, se atrasa sola lo que
   * haga falta. Un `setTimeout(200)` cobra esos 200 ms siempre.
   */
  const deferredQuery = useDeferredValue(query);
  const index = useMemo(() => buildZoneIndex(zones), [zones]);
  const results = useMemo(() => searchZones(index, deferredQuery), [index, deferredQuery]);

  const hasQuery = deferredQuery.trim().length > 0;

  // Recientes + zona del perfil, acotadas a las que existen en este contexto:
  // una reciente guardada en el market no tiene por qué existir en la lista de
  // zonas con canchas del flujo de proponer partido.
  const suggestions = useMemo(() => {
    if (hasQuery) return [];
    const wanted = [suggestedValue, ...recent].filter((name): name is string => !!name);
    const seen = new Set<string>();
    const out: ZoneOption[] = [];
    for (const name of wanted) {
      if (seen.has(name)) continue;
      seen.add(name);
      const match = zones.find((zone) => zone.value === name || zone.name === name);
      if (match) out.push(match);
    }
    return out;
  }, [hasQuery, suggestedValue, recent, zones]);

  const rows = useMemo(() => {
    const out: ZoneRow[] = [];

    if (clearLabel) {
      out.push({ kind: 'clear', key: '__clear', label: clearLabel });
    }

    if (suggestions.length > 0) {
      const label = suggestions.length === 1 && suggestions[0].value === suggestedValue
        ? suggestedLabel
        : 'Sugeridas';
      out.push({ kind: 'section', key: '__suggested', label });
      for (const option of suggestions) {
        out.push({
          kind: 'zone',
          // Prefijo: la misma zona puede estar arriba como sugerida y abajo en
          // el listado completo, y dos filas no pueden compartir key.
          key: `sug:${option.value}`,
          option,
          selected: option.value === selectedValue,
        });
      }
      out.push({ kind: 'section', key: '__all', label: 'Todas las zonas' });
    }

    for (const option of results) {
      out.push({ kind: 'zone', key: option.value, option, selected: option.value === selectedValue });
    }

    return out;
  }, [clearLabel, suggestions, suggestedValue, suggestedLabel, results, selectedValue]);

  // Cada apertura arranca limpia: encontrarse el sheet filtrado por lo que se
  // buscó la vez anterior parece una lista incompleta.
  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const handleSelect = useCallback(
    (option: ZoneOption) => {
      remember(option.name);
      onSelect(option);
      onClose();
    },
    [remember, onSelect, onClose],
  );

  const handleClear = useCallback(() => {
    onClear?.();
    onClose();
  }, [onClear, onClose]);

  const renderItem = useCallback(
    ({ item }: { item: ZoneRow }) => {
      if (item.kind === 'section') return <SectionRow label={item.label} />;
      if (item.kind === 'clear') {
        return (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleClear}
            accessibilityRole="button"
            className="flex-row items-center justify-between px-5"
            style={{ height: ROW_HEIGHT }}
          >
            <Text
              className={`font-ui text-base ${selectedValue === null ? 'text-brand-primary' : 'text-neutral-on-surface'}`}
            >
              {item.label}
            </Text>
            {selectedValue === null ? (
              <AppIcon family="material-icons" name="check" size={20} color="#53E076" />
            ) : null}
          </TouchableOpacity>
        );
      }
      return <ZoneRowItem option={item.option} selected={item.selected} onSelect={handleSelect} />;
    },
    [handleClear, handleSelect, selectedValue],
  );

  const body = (
    <View style={{ flexShrink: 1 }}>
      {/* Cabecera */}
      <View className="px-5 pt-3">
        <View className="mx-auto mb-4 h-1 w-9 rounded-full bg-surface-high" />
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="font-displayBlack text-lg uppercase tracking-widest text-neutral-on-surface">
            {title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <AppIcon family="material-community" name="close" size={22} color="#869585" />
          </TouchableOpacity>
        </View>

        {/* Buscador */}
        <View className="mb-2 flex-row items-center rounded-xl border border-neutral-outline-variant/15 bg-surface-low px-3">
          <AppIcon family="material-icons" name="search" size={20} color="#869585" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar zona o barrio"
            placeholderTextColor="#5E5A58"
            autoFocus={autoFocus}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Buscar zona"
            className="font-ui flex-1 px-2 py-3 text-base text-neutral-on-surface"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
            >
              <AppIcon family="material-community" name="close-circle" size={18} color="#869585" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Lista */}
      {loading ? (
        <View className="items-center justify-center" style={{ height: listHeight }}>
          <ActivityIndicator size="small" color="#53E076" />
        </View>
      ) : catalog.failed && !options ? (
        <View className="items-center justify-center px-8" style={{ height: listHeight }}>
          <Text className="font-ui mb-3 text-center text-sm text-neutral-on-surface-variant">
            No pudimos cargar las zonas. Revisá tu conexión.
          </Text>
          <TouchableOpacity
            onPress={catalog.reload}
            activeOpacity={0.85}
            className="rounded-xl bg-surface-high px-5 py-2.5"
          >
            <Text className="font-display text-xs uppercase tracking-wider text-brand-primary">
              Reintentar
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderItem}
          style={{ height: listHeight }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={MAX_VISIBLE_ROWS + 3}
          maxToRenderPerBatch={12}
          windowSize={7}
          /* Sólo Android: en iOS `removeClippedSubviews` tiene historial de
             dejar filas en blanco al scrollear rápido. */
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View className="items-center justify-center px-8" style={{ height: listHeight }}>
              <Text className="font-ui text-center text-sm text-neutral-on-surface-variant">
                No encontramos ninguna zona con “{query.trim()}”.
              </Text>
            </View>
          }
        />
      )}

      {/* Contador: confirma que la búsqueda hizo algo y cuánto queda por scrollear. */}
      {!loading && rows.length > 0 ? (
        <View className="border-t border-neutral-outline-variant/10 px-5 py-2.5">
          <Text className="font-ui text-xs text-neutral-outline">
            {hasQuery
              ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`
              : `${zones.length} zonas disponibles`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (inline) {
    return (
      <ZoneSelectOverlay visible={visible} onClose={onClose} keyboardHeight={keyboardHeight}>
        {body}
      </ZoneSelectOverlay>
    );
  }

  return (
    <SafeAreaBottomSheet visible={visible} onClose={onClose} avoidKeyboard dismissOnBackdropPress>
      {body}
    </SafeAreaBottomSheet>
  );
}

/**
 * Shell del modo `inline`: mismo aspecto que `SafeAreaBottomSheet` pero sin
 * `<Modal>`, para montarse adentro de uno ya abierto.
 *
 * Repite el cálculo de padding inferior de `SafeAreaBottomSheet` (inset en
 * reposo, alto del teclado cuando está abierto) porque acá no hay ventana
 * nativa propia que reciba los insets: los toma de la que ya está montada.
 */
function ZoneSelectOverlay({
  visible,
  onClose,
  keyboardHeight,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  keyboardHeight: number;
  children: React.ReactNode;
}) {
  const restingInset = useBottomInset();

  if (!visible) return null;

  const paddingBottom = keyboardHeight > 0 ? keyboardHeight + KEYBOARD_GAP : restingInset;

  return (
    // `elevation` además de `zIndex`: en Android el orden de pintado lo decide
    // la elevación, no el z-index.
    <View className="absolute inset-0 justify-end" style={{ zIndex: 9999, elevation: 99 }}>
      <Pressable
        className="absolute inset-0 bg-black/60"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
      />
      <View
        className="overflow-hidden rounded-t-3xl bg-surface-container"
        style={{ maxHeight: '88%', paddingBottom }}
      >
        {children}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Disparador
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneSelectTriggerProps {
  /** Nombre a mostrar. `null` = sin elegir. */
  value: string | null;
  onPress: () => void;
  label?: string;
  placeholder?: string;
  error?: string;
  loading?: boolean;
  disabled?: boolean;
}

/** Campo que abre el selector. Separado del sheet para los casos en que el sheet
 *  tiene que vivir en otro lado del árbol (ver `inline`). */
export function ZoneSelectTrigger({
  value,
  onPress,
  label,
  placeholder = 'Seleccioná una zona',
  error,
  loading = false,
  disabled = false,
}: ZoneSelectTriggerProps) {
  return (
    <View>
      {label ? (
        <Text className="font-display mb-2 text-xs uppercase tracking-wider text-neutral-on-surface-variant">
          {label}
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Zona'}
        accessibilityValue={{ text: value ?? placeholder }}
        className={`w-full flex-row items-center justify-between rounded-xl border px-4 py-4 ${
          error ? 'border-danger-error' : 'border-neutral-outline-variant/15'
        } ${disabled ? 'bg-surface-low opacity-50' : 'bg-surface-low'}`}
      >
        <Text
          numberOfLines={1}
          className={`font-ui flex-1 ${value ? 'text-neutral-on-surface' : 'text-surface-bright'}`}
        >
          {value ?? placeholder}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color="#53E076" />
        ) : (
          <AppIcon family="material-icons" name="keyboard-arrow-down" size={22} color="#BCCBB9" />
        )}
      </TouchableOpacity>
      {error ? <Text className="font-ui mt-1 text-xs text-danger-error">{error}</Text> : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drop-in
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneSelectFieldProps {
  /** Nombre de la zona elegida — así se guarda en perfil, equipos y filtros. */
  value: string | null;
  onChange: (zoneName: string | null) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  title?: string;
  /** Zona del perfil: se ofrece arriba de todo con la búsqueda vacía. */
  suggestedValue?: string | null;
  /** Habilita la fila que limpia la selección. Para filtros. */
  clearLabel?: string;
}

/**
 * Campo + sheet, listo para enchufar en un formulario.
 *
 * Es la variante que usan onboarding, editar perfil, crear equipo y crear
 * publicación. Los sheets que ya son `<Modal>` no pueden usarla: arman el
 * trigger y el sheet por separado y pasan el sheet por `overlay` (ver `inline`).
 */
export function ZoneSelectField({
  value,
  onChange,
  label,
  placeholder,
  error,
  disabled = false,
  title,
  suggestedValue,
  clearLabel,
}: ZoneSelectFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ZoneSelectTrigger
        value={value}
        onPress={() => setOpen(true)}
        label={label}
        placeholder={placeholder}
        error={error}
        disabled={disabled}
      />
      <ZoneSelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        selectedValue={value}
        onSelect={(zone) => onChange(zone.value)}
        title={title}
        suggestedValue={suggestedValue}
        clearLabel={clearLabel}
        onClear={() => onChange(null)}
      />
    </>
  );
}
