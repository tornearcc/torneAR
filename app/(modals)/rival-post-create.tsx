import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/ui/AppIcon';
import { AppDateTimePicker } from '@/components/ui/AppDateTimePicker';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { HeroButton } from '@/components/ui/HeroButton';
import { ZoneSelectSheet } from '@/components/ui/ZoneSelect';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { useTeamStore } from '@/stores/teamStore';
import { Logger } from '@/lib/logger';
import { fetchVenuesByZoneName, type VenueEntry } from '@/lib/venue-data';
import { fetchActiveTeamRankingInfo } from '@/lib/ranking-data';
import { closeRivalPost, fetchTeamRivalPost, publishRivalPost } from '@/lib/rival-posts-api';
import {
  getRivalPostErrorMessage,
  MATCH_TYPE_PREFS,
  RIVAL_POST_NOTE_MAX_LENGTH,
  shortFormat,
  TIME_SLOTS,
  validateRivalPostDraft,
  WEEK_DAYS,
  type MatchTypePref,
  type RivalPostMode,
  type TeamFormat,
  type TimeSlot,
} from '@/lib/rival-posts-utils';
import { TEAM_FORMAT_OPTIONS } from '@/lib/team-options';

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 font-uiBold text-xs uppercase tracking-wider text-neutral-on-surface-variant">
      {children}
    </Text>
  );
}

function ChoiceChip({
  label,
  active,
  onPress,
  grow = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  grow?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`items-center rounded-xl border px-3 py-2.5 ${grow ? 'flex-1' : ''} ${
        active ? 'border-brand-primary bg-brand-primary/15' : 'border-surface-high bg-transparent'
      }`}
    >
      <Text className={`font-uiBold text-xs ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseTime(time: string): Date {
  const [h, min] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(h, min, 0, 0);
  return date;
}

/**
 * «Estamos para jugar»: publicar o editar la publicación de Buscan rival.
 * Llega con `teamId` (un equipo donde el usuario es capitán o subcapitán).
 */
export default function RivalPostCreateModal() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { profile } = useAuth();
  const { showAlert, showLoader, hideLoader } = useUI();
  const teamName = useTeamStore((state) => state.myTeams.find((team) => team.id === teamId)?.name ?? null);

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [format, setFormat] = useState<TeamFormat | null>(null);
  const [mode, setMode] = useState<RivalPostMode>('DAYS');
  const [days, setDays] = useState<number[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [matchDate, setMatchDate] = useState<Date | null>(null);
  const [matchTime, setMatchTime] = useState<Date | null>(null);
  const [zone, setZone] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [matchTypePref, setMatchTypePref] = useState<MatchTypePref>('AMBOS');
  const [note, setNote] = useState('');

  const [showZonePicker, setShowZonePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [venuesByZone, setVenuesByZone] = useState<{ zone: string; venues: VenueEntry[] } | null>(null);

  // Hay zonas con decenas de canchas: se muestran 12, con la elegida primero
  // para que no quede escondida al editar.
  const zoneVenues = venuesByZone?.zone === zone ? venuesByZone.venues : [];
  const venues = [
    ...zoneVenues.filter((venue) => venue.id === venueId),
    ...zoneVenues.filter((venue) => venue.id !== venueId),
  ].slice(0, 12);
  const loadingVenues = Boolean(zone) && venuesByZone?.zone !== zone;

  // Precarga: la publicación vigente si hay; si no, zona y formato del equipo.
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      try {
        const [existing, info] = await Promise.all([
          fetchTeamRivalPost(teamId, teamId),
          fetchActiveTeamRankingInfo(teamId).catch(() => null),
        ]);
        if (cancelled) return;
        if (existing) {
          setIsEditing(true);
          setFormat(existing.format);
          setMode(existing.matchDate ? 'DATE' : 'DAYS');
          setDays(existing.days);
          setTimeSlots(existing.timeSlots);
          setMatchDate(existing.matchDate ? parseLocalDate(existing.matchDate) : null);
          setMatchTime(existing.matchTime ? parseTime(existing.matchTime) : null);
          setZone(existing.postZone);
          setVenueId(existing.venueId);
          setMatchTypePref(existing.matchTypePref);
          setNote(existing.note ?? '');
        } else {
          setFormat(info?.format ?? null);
          setZone(info?.zone ?? profile?.zone ?? '');
        }
      } catch (error) {
        Logger.error('No se pudo cargar la publicación de Buscan rival', {
          scope: 'rival-post-create.load',
          teamId,
          error,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, profile?.zone]);

  // Cambiar de zona a mano descarta la cancha elegida. Va en el handler y no
  // derivado del render: la precarga también cambia la zona y no tiene que
  // borrar la cancha de una publicación existente.
  const handleZoneSelect = (value: string) => {
    if (value !== zone) setVenueId(null);
    setZone(value);
  };

  useEffect(() => {
    if (!zone) return;
    let cancelled = false;
    fetchVenuesByZoneName(zone)
      .then((list) => {
        if (!cancelled) setVenuesByZone({ zone, venues: list });
      })
      .catch((error: unknown) => {
        Logger.warn('No se pudieron cargar las canchas de la zona', {
          scope: 'rival-post-create.fetchVenues',
          zone,
          error,
        });
        if (!cancelled) setVenuesByZone({ zone, venues: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [zone]);

  const toggleDay = (value: number) =>
    setDays((current) => (current.includes(value) ? current.filter((d) => d !== value) : [...current, value]));
  const toggleSlot = (value: TimeSlot) =>
    setTimeSlots((current) => (current.includes(value) ? current.filter((s) => s !== value) : [...current, value]));

  const handleSubmit = async () => {
    if (!teamId || isSubmitting) return;
    const draft = {
      teamId,
      format,
      mode,
      days,
      timeSlots,
      matchDate,
      matchTime,
      zone,
      venueId,
      matchTypePref,
      note,
    };
    const problem = validateRivalPostDraft(draft);
    if (problem) {
      showAlert('Falta un dato', problem);
      return;
    }

    setIsSubmitting(true);
    showLoader(isEditing ? 'Guardando...' : 'Publicando...');
    try {
      const result = await publishRivalPost(draft);
      Logger.info('Publicación de Buscan rival guardada', {
        scope: 'rival-post-create.submit',
        teamId,
        isNew: result.isNew,
        alerted: result.alerted,
      });
      if (result.isNew) {
        showAlert(
          '¡Listo, ya están en la vidriera!',
          result.alerted > 0
            ? `Tu equipo aparece en Buscan rival y les avisamos a ${result.alerted} ${result.alerted === 1 ? 'equipo' : 'equipos'} cerca. Los desafíos te llegan como siempre.`
            : 'Tu equipo aparece en Buscan rival. Los desafíos te llegan como siempre.',
        );
      } else {
        showAlert('Cambios guardados', 'Tu publicación sigue visible en Buscan rival.');
      }
      router.back();
    } catch (error) {
      Logger.warn('No se pudo publicar en Buscan rival', { scope: 'rival-post-create.submit', teamId, error });
      showAlert('No pudimos publicar', getRivalPostErrorMessage(error));
    } finally {
      setIsSubmitting(false);
      hideLoader();
    }
  };

  const handleClose = async () => {
    if (!teamId) return;
    showLoader('Sacando publicación...');
    try {
      await closeRivalPost(teamId);
      showAlert('Publicación sacada', 'Tu equipo ya no aparece en Buscan rival.');
      router.back();
    } catch (error) {
      Logger.warn('No se pudo sacar la publicación de Buscan rival', { scope: 'rival-post-create.close', teamId, error });
      showAlert('No pudimos sacarla', getRivalPostErrorMessage(error, 'Probá de nuevo en un rato.'));
    } finally {
      hideLoader();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['bottom']}>
      <SecondaryHeader title="Estamos para jugar" subtitle={teamName ?? undefined} />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#53E076" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView
            className="flex-1 px-5 pt-5"
            contentContainerStyle={{ paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="mb-6 font-ui text-sm leading-5 text-neutral-on-surface-variant">
              Tu equipo aparece en Mercado › Buscan rival y les avisamos a los equipos de tu zona. El que quiera
              jugar ve tu ficha y te desafía.
            </Text>

            <View className="mb-6">
              <SectionLabel>Formato</SectionLabel>
              <View className="flex-row flex-wrap gap-2">
                {TEAM_FORMAT_OPTIONS.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={shortFormat(option.value)}
                    active={format === option.value}
                    onPress={() => setFormat(option.value)}
                  />
                ))}
              </View>
            </View>

            <View className="mb-6">
              <SectionLabel>¿Cuándo?</SectionLabel>
              <View className="mb-3 flex-row gap-1 rounded-xl bg-surface-low p-1">
                {(['DAYS', 'DATE'] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setMode(value)}
                    activeOpacity={0.8}
                    className="flex-1 items-center rounded-lg py-2.5"
                    style={mode === value ? { backgroundColor: '#53E076' } : undefined}
                  >
                    <Text className="font-uiBold text-xs" style={{ color: mode === value ? '#003914' : '#BCCBB9' }}>
                      {value === 'DAYS' ? 'Días que pueden' : 'Fecha puntual'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {mode === 'DAYS' ? (
                <View className="mb-2 flex-row gap-1.5">
                  {WEEK_DAYS.map((day) => (
                    <ChoiceChip
                      key={day.value}
                      label={day.short}
                      active={days.includes(day.value)}
                      onPress={() => toggleDay(day.value)}
                      grow
                    />
                  ))}
                </View>
              ) : (
                <View className="mb-2 gap-2">
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.7}
                    className="flex-row items-center justify-between rounded-xl bg-surface-low p-3"
                  >
                    <Text className={`font-ui ${matchDate ? 'text-neutral-on-surface' : 'text-neutral-outline'}`}>
                      {matchDate ? formatDate(matchDate) : 'Elegir fecha'}
                    </Text>
                    <AppIcon family="material-community" name="calendar" size={18} color="#869585" />
                  </TouchableOpacity>
                  <View className="flex-row items-center rounded-xl bg-surface-low">
                    <TouchableOpacity onPress={() => setShowTimePicker(true)} activeOpacity={0.7} className="flex-1 p-3">
                      <Text className={`font-ui ${matchTime ? 'text-neutral-on-surface' : 'text-neutral-outline'}`}>
                        {matchTime
                          ? `${matchTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`
                          : 'Hora (opcional)'}
                      </Text>
                    </TouchableOpacity>
                    {matchTime ? (
                      <TouchableOpacity
                        onPress={() => setMatchTime(null)}
                        className="px-3 py-3"
                        accessibilityLabel="Quitar hora"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppIcon family="material-icons" name="close" size={16} color="#869585" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )}

              {mode === 'DAYS' || !matchTime ? (
                <View className="flex-row gap-2">
                  {TIME_SLOTS.map((slot) => (
                    <ChoiceChip
                      key={slot.value}
                      label={slot.label}
                      active={timeSlots.includes(slot.value)}
                      onPress={() => toggleSlot(slot.value)}
                      grow
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <View className="mb-6">
              <SectionLabel>¿Dónde?</SectionLabel>
              <TouchableOpacity
                onPress={() => setShowZonePicker(true)}
                activeOpacity={0.7}
                className="mb-2 flex-row items-center justify-between rounded-xl bg-surface-low p-3"
              >
                <Text className={`font-ui ${zone ? 'text-neutral-on-surface' : 'text-neutral-outline'}`}>
                  {zone || 'Elegir zona'}
                </Text>
                <Text className="font-ui text-xs text-neutral-outline">Cambiar</Text>
              </TouchableOpacity>

              <Text className="mb-1.5 mt-2 font-ui text-xs text-neutral-on-surface-variant">Cancha (opcional)</Text>
              {loadingVenues ? (
                <ActivityIndicator size="small" color="#53E076" style={{ alignSelf: 'flex-start' }} />
              ) : venues.length === 0 ? (
                <Text className="font-ui text-xs text-neutral-outline">
                  {zone ? 'No hay canchas cargadas en esta zona.' : 'Elegí una zona para ver sus canchas.'}
                </Text>
              ) : (
                <View className="gap-2">
                  {venues.map((venue) => {
                    const selected = venueId === venue.id;
                    return (
                      <TouchableOpacity
                        key={venue.id}
                        onPress={() => setVenueId(selected ? null : venue.id)}
                        activeOpacity={0.8}
                        className={`flex-row items-center gap-3 rounded-xl p-3 ${
                          selected ? 'border border-brand-primary/40 bg-brand-primary/10' : 'bg-surface-low'
                        }`}
                      >
                        <View
                          className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                            selected ? 'border-brand-primary' : 'border-neutral-outline'
                          }`}
                        >
                          {selected ? <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" /> : null}
                        </View>
                        <View className="flex-1">
                          <Text className="font-uiBold text-sm text-neutral-on-surface">{venue.name}</Text>
                          {venue.address ? (
                            <Text className="font-ui text-xs text-neutral-on-surface-variant">{venue.address}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <View className="mb-6">
              <SectionLabel>Tipo de partido</SectionLabel>
              <View className="flex-row gap-2">
                {MATCH_TYPE_PREFS.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    active={matchTypePref === option.value}
                    onPress={() => setMatchTypePref(option.value)}
                    grow
                  />
                ))}
              </View>
            </View>

            <View className="mb-8">
              <View className="mb-2 flex-row items-center justify-between">
                <SectionLabel>Mensaje (opcional)</SectionLabel>
                <Text className="font-ui text-xs text-neutral-outline">
                  {note.length}/{RIVAL_POST_NOTE_MAX_LENGTH}
                </Text>
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                maxLength={RIVAL_POST_NOTE_MAX_LENGTH}
                placeholder="Ej: Tranqui, amistoso, después tercer tiempo"
                placeholderTextColor="#869585"
                className="rounded-xl bg-surface-low p-3 font-ui text-neutral-on-surface"
              />
            </View>

            <Text className="mb-3 text-center font-ui text-xs text-neutral-outline">
              Se ve 7 días (con fecha puntual, hasta ese día). Podés editarla o sacarla cuando quieras.
            </Text>
            <HeroButton
              label={isEditing ? 'Guardar cambios' : 'Publicar'}
              onPress={handleSubmit}
              disabled={isSubmitting}
            />

            {isEditing ? (
              <TouchableOpacity onPress={handleClose} activeOpacity={0.8} className="mt-4 items-center py-3">
                <Text className="font-uiBold text-sm text-danger-error">Sacar publicación</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <ZoneSelectSheet
        visible={showZonePicker}
        onClose={() => setShowZonePicker(false)}
        selectedValue={zone || null}
        onSelect={(selected) => handleZoneSelect(selected.value)}
        title="Zona donde juegan"
        suggestedValue={profile?.zone ?? null}
      />

      <AppDateTimePicker
        visible={showDatePicker}
        value={matchDate ?? new Date()}
        mode="date"
        title="Día del partido"
        minimumDate={new Date()}
        onCancel={() => setShowDatePicker(false)}
        onConfirm={(date) => {
          setShowDatePicker(false);
          setMatchDate(date);
        }}
      />

      <AppDateTimePicker
        visible={showTimePicker}
        value={matchTime ?? new Date()}
        mode="time"
        title="Hora del partido"
        onCancel={() => setShowTimePicker(false)}
        onConfirm={(date) => {
          setShowTimePicker(false);
          setMatchTime(date);
        }}
      />
    </SafeAreaView>
  );
}
