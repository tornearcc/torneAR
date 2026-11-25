import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';

import { filterOptions } from '@/lib/option-search';

interface OptionPickerDialogProps {
  visible: boolean;
  title: string;
  options: readonly string[];
  selected?: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  emptyLabel?: string;
  /**
   * Muestra un buscador arriba de la lista. Pensado para catálogos largos (los
   * ~150 clubes del cuadro favorito); con pocas opciones no hace falta.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Texto cuando la búsqueda no encuentra nada. */
  noResultsLabel?: string;
}

const OptionSeparator = () => <View className="h-2" />;

/**
 * Select generico sobre un catalogo estatico de strings.
 *
 * Comparte el lenguaje visual de ZonePickerDialog (overlay absoluto, card
 * centrada, item seleccionado en verde), pero sin acoplarse a una fuente de
 * datos: ZonePickerDialog hace fetch de zonas, este recibe las opciones por
 * prop. Se usa para el cuadro favorito y sirve para cualquier catalogo cerrado
 * que venga despues.
 */
export function OptionPickerDialog(props: OptionPickerDialogProps) {
  // Igual que ZonePickerDialog: no montamos nada en el arbol si esta cerrado.
  // El contenido va en otro componente para que la busqueda arranque vacia
  // cada vez que se abre (el estado se descarta al desmontar).
  if (!props.visible) return null;
  return <OptionPickerContent {...props} />;
}

function OptionPickerContent({
  title,
  options,
  selected,
  onClose,
  onSelect,
  emptyLabel = 'No hay opciones disponibles.',
  searchable = false,
  searchPlaceholder = 'Buscar…',
  noResultsLabel = 'No hay resultados.',
}: OptionPickerDialogProps) {
  const [query, setQuery] = useState('');
  const visibleOptions = searchable ? filterOptions(options, query) : options;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 99 }]} className="flex-1">
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 items-center justify-center bg-black/80 px-6">
          <TouchableWithoutFeedback>
            <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-4">
              <Text className="font-display mb-3 text-lg text-neutral-on-surface">{title}</Text>

              {searchable ? (
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={searchPlaceholder}
                  placeholderTextColor="#869585"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel={searchPlaceholder}
                  className="font-ui mb-3 rounded-xl border border-neutral-outline-variant bg-surface-low px-3 py-3 text-sm text-neutral-on-surface"
                />
              ) : null}

              <FlatList
                data={visibleOptions as string[]}
                keyExtractor={(item) => item}
                style={{ maxHeight: searchable ? 360 : 320 }}
                ItemSeparatorComponent={OptionSeparator}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={20}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                    className={`rounded-lg border px-3 py-3 ${
                      selected === item
                        ? 'border-brand-primary bg-brand-primary/15'
                        : 'border-neutral-outline-variant/15 bg-surface-low'
                    }`}
                  >
                    <Text
                      className={`font-ui ${
                        selected === item ? 'text-brand-primary' : 'text-neutral-on-surface'
                      }`}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={() => (
                  <Text className="py-2 text-sm text-neutral-on-surface-variant">
                    {query ? noResultsLabel : emptyLabel}
                  </Text>
                )}
              />

              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.9}
                className="mt-4 items-center rounded-lg bg-surface-low py-3"
              >
                <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">
                  Cerrar
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
