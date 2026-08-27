import { useState, useEffect } from 'react';
import { Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { ZoneSelectSheet, ZoneSelectTrigger } from '@/components/ui/ZoneSelect';
import type { RankingFiltersState } from './types';

const CATEGORIES = ['HOMBRES', 'MUJERES', 'MIXTO'] as const;
const FORMATS = ['FUTBOL_5', 'FUTBOL_6', 'FUTBOL_7', 'FUTBOL_8', 'FUTBOL_9', 'FUTBOL_11'] as const;
const FORMAT_LABELS: Record<string, string> = { FUTBOL_5: 'F5', FUTBOL_6: 'F6', FUTBOL_7: 'F7', FUTBOL_8: 'F8', FUTBOL_9: 'F9', FUTBOL_11: 'F11' };

interface Props {
    visible: boolean;
    onClose: () => void;
    filters: RankingFiltersState;
    onApply: (filters: RankingFiltersState) => void;
}

export function RankingFilterModal({ visible, onClose, filters, onApply }: Props) {
    const [localFilters, setLocalFilters] = useState<RankingFiltersState>(filters);
    const [zonePickerOpen, setZonePickerOpen] = useState(false);

    useEffect(() => {
        if (visible) setLocalFilters(filters);
    }, [visible, filters]);

    const updateFilter = <K extends keyof RankingFiltersState>(key: K, value: RankingFiltersState[K] | null) => {
        setLocalFilters(prev => ({ ...prev, [key]: prev[key] === value ? null : value }));
    };

    return (
        <SafeAreaBottomSheet
            visible={visible}
            onClose={onClose}
            dismissOnBackdropPress
            surfaceClassName="bg-[#1C1B1B]"
            /* Hermano del sheet DENTRO del <Modal>: anidar dos Modal nativos
               rompe el back y el teclado en Android. */
            overlay={
                <ZoneSelectSheet
                    inline
                    visible={zonePickerOpen}
                    onClose={() => setZonePickerOpen(false)}
                    selectedValue={localFilters.zone}
                    onSelect={(zone) => setLocalFilters(prev => ({ ...prev, zone: zone.value }))}
                    title="Filtrar por zona"
                    clearLabel="Global (todas)"
                    onClear={() => setLocalFilters(prev => ({ ...prev, zone: null }))}
                />
            }
        >
            <View className="px-5 pt-3" style={{ flexShrink: 1 }}>
                <View className="mx-auto mb-5 h-1 w-9 rounded-full bg-surface-high" />
                <Text className="mb-5 font-displayBlack text-lg uppercase tracking-widest text-neutral-on-surface">Filtros</Text>

                <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Zona — un chip por zona era una grilla de 245 vistas
                        montadas de golpe, y empujaba Formato y Categoría fuera
                        de la pantalla. */}
                    <View className="mb-5">
                        <ZoneSelectTrigger
                            label="Zona"
                            value={localFilters.zone}
                            placeholder="Global"
                            onPress={() => setZonePickerOpen(true)}
                        />
                    </View>

                    {/* Formato */}
                    <Text className="text-neutral-on-surface-variant text-sm font-medium mb-3 uppercase tracking-wider">Formato</Text>
                    <View className="mb-5 flex-row flex-wrap gap-2">
                        {FORMATS.map(fmt => (
                            <TouchableOpacity key={fmt} onPress={() => updateFilter('format', fmt)} className={`rounded-full border px-3.5 py-2 ${localFilters.format === fmt ? 'border-transparent bg-brand-primary' : 'border-transparent bg-surface-high'}`}>
                                <Text className={`font-uiBold text-xs ${localFilters.format === fmt ? 'text-surface-base' : 'text-neutral-on-surface-variant'}`}>{FORMAT_LABELS[fmt]}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Categoría */}
                    <Text className="text-neutral-on-surface-variant text-sm font-medium mb-3 uppercase tracking-wider">Categoría</Text>
                    <View className="mb-6 flex-row flex-wrap gap-2">
                        {CATEGORIES.map(cat => (
                            <TouchableOpacity key={cat} onPress={() => updateFilter('category', cat)} className={`rounded-full border px-3.5 py-2 ${localFilters.category === cat ? 'border-transparent bg-brand-primary' : 'border-transparent bg-surface-high'}`}>
                                <Text className={`font-uiBold text-xs capitalize ${localFilters.category === cat ? 'text-surface-base' : 'text-neutral-on-surface-variant'}`}>{cat.toLowerCase()}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Rivales Ideales toggle */}
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setLocalFilters(prev => ({ ...prev, rivalesIdeales: !prev.rivalesIdeales }))}
                        className="mb-6 flex-row items-center justify-between rounded-2xl bg-surface-container px-4 py-3.5"
                    >
                        <View className="flex-1 pr-4">
                            <Text className="font-uiBold text-sm text-neutral-on-surface">🎯 Rivales ideales</Text>
                            <Text className="mt-0.5 font-ui text-xs text-neutral-on-surface-variant">Solo equipos con rating ±200 del tuyo</Text>
                        </View>
                        <View className={`h-6 w-[42px] rounded-full ${localFilters.rivalesIdeales ? 'bg-warning-tertiary' : 'bg-surface-high'}`}>
                            <View className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${localFilters.rivalesIdeales ? 'right-[3px]' : 'left-[3px]'}`} />
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={0.8} onPress={() => { onApply(localFilters); onClose(); }} className="mb-3 items-center rounded-2xl bg-brand-primary py-3.5">
                        <Text className="font-displayBlack text-sm uppercase tracking-widest text-surface-base">Aplicar Filtros</Text>
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={0.6} onPress={() => setLocalFilters({ zone: null, category: null, format: null, rivalesIdeales: false })} className="items-center py-2">
                        <Text className="text-neutral-on-surface-variant text-sm font-medium uppercase tracking-wider">Limpiar todo</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </SafeAreaBottomSheet>
    );
}