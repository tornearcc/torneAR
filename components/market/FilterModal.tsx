import React, { useState } from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { HeroButton } from '@/components/ui/HeroButton';
import { ZoneSelectSheet, ZoneSelectTrigger } from '@/components/ui/ZoneSelect';
import { MarketSortBy, TabType } from './types';

const DAYS_OF_WEEK = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

interface FilterModalProps {
  visible: boolean;
  activeTab: TabType;
  zone: string | null;
  selectedDays: string[];
  sortBy: MarketSortBy;
  onApply: (zone: string | null, days: string[], sortBy: MarketSortBy) => void;
  onClose: () => void;
}

export function FilterModal({
  visible,
  activeTab,
  zone,
  selectedDays,
  sortBy,
  onApply,
  onClose,
}: FilterModalProps) {
  const [localZone, setLocalZone] = useState<string | null>(zone);
  const [localDays, setLocalDays] = useState<string[]>(selectedDays);
  const [localSortBy, setLocalSortBy] = useState<MarketSortBy>(sortBy);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);

  // El estado local se re-inicializa desde las props en el flanco de apertura,
  // ajustándolo durante el render en vez de copiarlo con un efecto: así el
  // sheet nunca llega a pintar un frame con los filtros de la apertura
  // anterior. `wasVisible` es lo que detecta ese flanco.
  //
  // De paso desaparece un problema del efecto: tenía `selectedDays` en deps y
  // esa prop es un array, así que si el padre lo recreaba en un render
  // cualquiera, la selección en curso se pisaba con la del padre en medio de
  // la edición.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setLocalZone(zone);
      setLocalDays(selectedDays);
      setLocalSortBy(sortBy);
    }
  }

  function toggleDay(day: string) {
    setLocalDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function handleApply() {
    onApply(localZone, localDays, localSortBy);
    onClose();
  }

  return (
    <SafeAreaBottomSheet
      visible={visible}
      onClose={onClose}
      maxHeight="85%"
      /* Adentro del <Modal>, no como hermano del sheet en la pantalla: dos
         ventanas nativas anidadas se pelean el back y el teclado en Android. */
      overlay={
        <ZoneSelectSheet
          inline
          visible={zonePickerOpen}
          onClose={() => setZonePickerOpen(false)}
          selectedValue={localZone}
          onSelect={(selected) => setLocalZone(selected.value)}
          title="Filtrar por zona"
          clearLabel="Cualquier zona"
          onClear={() => setLocalZone(null)}
        />
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-5 pb-4">
        <Text className="text-neutral-on-surface text-xl font-semibold">
          Filtros
        </Text>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-1"
        >
          <AppIcon family="material-icons" name="close" size={20} color="#E5E2E1" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Zone Section
            Antes: un chip por zona. Con 245 zonas activas eran 245 vistas
            montadas de una dentro del ScrollView del sheet, y el filtro más
            usado quedaba a varias pantallas de scroll de distancia. */}
        <View className="px-5 mb-6">
          <ZoneSelectTrigger
            label="Zona"
            value={localZone}
            placeholder="Cualquiera"
            onPress={() => setZonePickerOpen(true)}
          />
        </View>

        {/* Day Section — only for TEAMS_LOOKING */}
        {activeTab === 'TEAMS_LOOKING' && (
          <View className="px-5 mb-6">
            <Text className="text-neutral-on-surface-variant text-sm font-medium mb-3 uppercase tracking-wider">
              Día del partido
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = localDays.includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    activeOpacity={0.7}
                    onPress={() => toggleDay(day)}
                    className={`px-4 py-2 rounded-full border ${
                      isSelected
                        ? 'bg-brand-primary border-brand-primary'
                        : 'bg-surface-high border-surface-high'
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isSelected ? 'text-black' : 'text-neutral-on-surface'
                      }`}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Sort Section */}
        <View className="px-5 mb-6">
          <Text className="text-neutral-on-surface-variant text-sm font-medium mb-3 uppercase tracking-wider">
            Ordenar por
          </Text>
          <View className="gap-2">
            {/* Recent option */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setLocalSortBy('recent')}
              className={`flex-row items-center px-4 py-3 rounded-xl border ${
                localSortBy === 'recent'
                  ? 'border-brand-primary bg-surface-high'
                  : 'border-surface-high bg-surface-high'
              }`}
            >
              {/* Radio circle */}
              <View
                className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                  localSortBy === 'recent' ? 'border-brand-primary' : 'border-neutral-on-surface-variant'
                }`}
              >
                {localSortBy === 'recent' && (
                  <View className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                )}
              </View>
              <Text className="text-neutral-on-surface text-base">
                Más reciente
              </Text>
            </TouchableOpacity>

            {/* Nearest option */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setLocalSortBy('nearest')}
              className={`flex-row items-center px-4 py-3 rounded-xl border ${
                localSortBy === 'nearest'
                  ? 'border-brand-primary bg-surface-high'
                  : 'border-surface-high bg-surface-high'
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                  localSortBy === 'nearest' ? 'border-brand-primary' : 'border-neutral-on-surface-variant'
                }`}
              >
                {localSortBy === 'nearest' && (
                  <View className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                )}
              </View>
              <Text className="text-neutral-on-surface text-base">
                Partido más cercano
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Apply Button */}
        <View className="px-5">
          <HeroButton label="Aplicar Filtros" onPress={handleApply} />
        </View>
      </ScrollView>
    </SafeAreaBottomSheet>
  );
}
