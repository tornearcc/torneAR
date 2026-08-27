import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

import { AppIcon } from '@/components/ui/AppIcon';
import { SecondaryHeader } from '@/components/ui/SecondaryHeader';
import { HeroButton } from '@/components/ui/HeroButton';
import { PitchSelector } from '@/components/ui/PitchSelector';
import { ZoneSelectSheet } from '@/components/ui/ZoneSelect';
import { ActiveTeamSelector } from '@/components/ui/ActiveTeamSelector';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { useTeamStore } from '@/stores/teamStore';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

import { Logger } from '@/lib/logger';
import { createTeamPost, createPlayerPost, fetchUserManagedTeams, ManagedTeam } from '@/lib/market-api';
import { TEAM_FORMAT_OPTIONS, TeamFormat } from '@/lib/team-options';
import { fetchVenuesByZoneName, VenueEntry } from '@/lib/venue-data';
import { useDistanceResolver } from '@/hooks/useDistanceResolver';
import {
  createTeamPostSchema,
  createPlayerPostSchema,
  MARKET_DESCRIPTION_MAX_LENGTH,
} from '@/lib/schemas/marketSchema';

type PostType = 'BUSCA_EQUIPO' | 'BUSCA_PARTIDO';

export default function MarketCreateModal() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const creationType = type === 'PLAYER' ? 'PLAYER' : 'TEAM';

  const { user, profile } = useAuth();
  const { showAlert, showLoader, hideLoader } = useUI();
  const { activeTeamId, fetchMyTeams } = useTeamStore();

  const [managedTeams, setManagedTeams] = useState<ManagedTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compartidos
  const [position, setPosition] = useState<string>('CUALQUIERA');
  const [description, setDescription] = useState('');

  // Específicos de Equipo
  const [matchDate, setMatchDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [matchTime, setMatchTime] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [zone, setZone] = useState('');
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [complex, setComplex] = useState('');
  const [venues, setVenues] = useState<VenueEntry[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueEntry | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const { label: distanceLabel } = useDistanceResolver();
  const [pitchType, setPitchType] = useState<TeamFormat | null>(null);

  // Específicos de Jugador
  const [playerPostType, setPlayerPostType] = useState<PostType>('BUSCA_EQUIPO');

  // ── Teclado vs. campo «Descripción» ──────────────────────────────────────
  // La descripción es el último campo del formulario y en Android el teclado la
  // tapaba mientras se escribía. Con edge-to-edge la ventana no se redimensiona,
  // así que el ScrollView conserva su alto completo: el teclado se dibuja encima
  // y no hay recorrido extra por el que desplazarse. El `padding` del KAV tampoco
  // aplica en Android (ver `useKeyboardAwareBottomInset`).
  //
  // El padding le da al ScrollView el recorrido que le falta, y el scroll acerca
  // el campo enfocado. Se scrollea al abrirse el teclado y no en el `onFocus`
  // porque en Android el alto recién se conoce con `keyboardDidShow`: antes de
  // eso el recorrido todavía no existe.
  const scrollRef = useRef<ScrollView>(null);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);
  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    if (keyboardHeight === 0 || !isDescriptionFocused) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [keyboardHeight, isDescriptionFocused]);

  // En iOS el KeyboardAvoidingView ya achica el contenedor; sumar el alto acá
  // abriría un hueco del tamaño del teclado.
  const scrollBottomPadding =
    Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + 24 : 100;

  useEffect(() => {
    if (!user) return;
    fetchUserManagedTeams(user.id)
      .then((teams) => {
        setManagedTeams(teams);
      })
      .catch((err: unknown) => {
        // Sin equipos gestionados el formulario sólo deja publicar como
        // jugador. Un fallo acá se ve igual que "no sos capitán de nadie".
        Logger.error('No se pudieron cargar los equipos que gestiona el usuario', {
          scope: 'market-create',
          authUserId: user.id,
          error: err,
        });
      })
      .finally(() => setIsLoadingTeams(false));
  }, [user]);

  useEffect(() => {
    if (profile?.id) {
      void fetchMyTeams(profile.id);
    }
  }, [profile?.id, fetchMyTeams]);

  // Fetch venues when zone changes
  useEffect(() => {
    if (!zone) {
      setVenues([]);
      setSelectedVenue(null);
      setComplex('');
      return;
    }
    setLoadingVenues(true);
    setSelectedVenue(null);
    setComplex('');
    fetchVenuesByZoneName(zone)
      .then(setVenues)
      .catch((err: unknown) => {
        // Vaciar la lista es indistinguible de "esta zona no tiene canchas":
        // el usuario publica sin sede y nadie se entera de que la carga falló.
        Logger.warn('No se pudieron cargar las canchas de la zona; se muestra la lista vacía', {
          scope: 'market-create.fetchVenues',
          zone,
          error: err,
        });
        setVenues([]);
      })
      .finally(() => setLoadingVenues(false));
  }, [zone]);

  // Keep `complex` string in sync with the selected venue (used by createTeamPost)
  useEffect(() => {
    if (selectedVenue) setComplex(selectedVenue.name);
  }, [selectedVenue]);

  const formatDate = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatLocalIsoDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    showLoader('Creando publicación...');
    try {
      if (creationType === 'TEAM') {
        const selectedTeamId = activeTeamId ?? managedTeams[0]?.id;
        const canPostWithSelectedTeam = !!selectedTeamId && managedTeams.some((team) => team.id === selectedTeamId);

        if (!canPostWithSelectedTeam || !selectedTeamId) {
          Logger.warn('No se pudo resolver un equipo gestionado para publicar', {
            scope: 'market-create',
            activeTeamId,
            selectedTeamId: selectedTeamId ?? null,
            managedTeamsCount: managedTeams.length,
          });
          showAlert('Error', 'Seleccioná en el header un equipo donde seas Capitán o Subcapitán.');
          setIsSubmitting(false);
          hideLoader();
          return;
        }

        const teamPostPayload = {
          teamId: selectedTeamId,
          positionWanted: position as any,
          pitchType: pitchType ?? undefined,
          matchDate: matchDate ? formatLocalIsoDate(matchDate) : '',
          matchTime: matchTime ? matchTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
          zone,
          complex,
          // Enlace al catálogo: es de donde salen las coordenadas del badge de
          // distancia. `undefined` si la cancha se escribió a mano.
          venueId: selectedVenue?.id,
          description,
        };
        const validation = createTeamPostSchema.safeParse(teamPostPayload);
        if (!validation.success) {
          showAlert('Error de validación', validation.error.issues[0].message);
          setIsSubmitting(false);
          hideLoader();
          return;
        }

        await createTeamPost(teamPostPayload);
        Logger.info('Publicación de equipo creada en el mercado', {
          scope: 'market-create',
          teamId: teamPostPayload.teamId,
          zone,
        });
        showAlert('¡Éxito!', 'La publicación del equipo ha sido creada.');
        router.back();
      } else {
        const playerPostPayload = {
          postType: playerPostType,
          position: position as any,
          description,
        };
        const validation = createPlayerPostSchema.safeParse(playerPostPayload);
        if (!validation.success) {
          showAlert('Error de validación', validation.error.issues[0].message);
          setIsSubmitting(false);
          hideLoader();
          return;
        }

        await createPlayerPost(playerPostPayload);
        Logger.info('Publicación de jugador creada en el mercado', {
          scope: 'market-create',
          postType: playerPostType,
          profileId: profile?.id,
        });
        showAlert('¡Éxito!', 'Has publicado tu búsqueda correctamente.');
        router.back();
      }

    } catch (err) {
      // El alert genérico no dice nada: sin log, un fallo de RLS y uno de red
      // producen el mismo mensaje y no hay forma de saber cuál fue.
      Logger.error('No se pudo crear la publicación del mercado', {
        scope: 'market-create',
        creationType,
        error: err,
      });
      showAlert('Error', 'Hubo un problema al crear la publicación.');
    } finally {
      setIsSubmitting(false);
      hideLoader();
    }
  };

  return (
    // Sin `edges={['top']}`: el inset superior ya lo aplica SecondaryHeader.
    <SafeAreaView className="flex-1 bg-surface-base" edges={['bottom']}>
      <SecondaryHeader
        title={creationType === 'TEAM' ? 'Buscar Jugador' : 'Buscar Equipo / Partido'}
        rightSlot={creationType === 'TEAM' ? <ActiveTeamSelector /> : null}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
      <ScrollView
        ref={scrollRef}
        className="flex-1 px-6 pt-6"
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* --- CAMPOS EXCLUSIVOS DE EQUIPO --- */}
        {creationType === 'TEAM' && (
          <View>
            {isLoadingTeams ? (
              <ActivityIndicator size="large" color="#00E65B" className="mb-6" />
            ) : managedTeams.length === 0 ? (
              <View className="bg-surface-high p-6 rounded-xl mb-6 border border-danger-error/20">
                <Text className="text-danger-error font-uiBold text-base mb-2 text-center">Acceso Restringido</Text>
                <Text className="text-neutral-on-surface-variant text-sm text-center">
                  Debés ser Capitán o Subcapitán de un equipo para crear esta publicación.
                </Text>
              </View>
            ) : null}

            <View className="mb-6 p-4 bg-surface-low rounded-xl border border-surface-high">
              <Text className="text-neutral-on-surface font-uiBold mb-1">¿Es para un partido específico?</Text>
              <Text className="text-neutral-on-surface-variant font-ui text-xs mb-4">Completá estos datos si les falta 1 para jugar pronto. Dejalo en blanco si buscan fijo.</Text>

              <View className="mb-4">
                <Text className="text-neutral-on-surface font-ui text-xs mb-1">Día</Text>
                <View className="flex-row items-center bg-surface-high rounded-lg overflow-hidden">
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.7}
                    className="flex-1 p-3"
                  >
                    <Text className={`font-ui ${matchDate ? 'text-neutral-on-surface' : 'text-[#88998D]'}`}>
                      {matchDate ? formatDate(matchDate) : 'Seleccionar fecha'}
                    </Text>
                  </TouchableOpacity>
                  {matchDate && (
                    <TouchableOpacity
                      onPress={() => setMatchDate(null)}
                      activeOpacity={0.7}
                      className="px-3 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <AppIcon family="material-icons" name="close" size={16} color="#88998D" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-neutral-on-surface font-ui text-xs mb-1">Hora</Text>
                <View className="flex-row items-center bg-surface-high rounded-lg overflow-hidden">
                  <TouchableOpacity
                    onPress={() => setShowTimePicker(true)}
                    activeOpacity={0.7}
                    className="flex-1 p-3"
                  >
                    <Text className={`font-ui ${matchTime ? 'text-neutral-on-surface' : 'text-[#88998D]'}`}>
                      {matchTime
                        ? `${matchTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`
                        : 'Seleccionar hora'}
                    </Text>
                  </TouchableOpacity>
                  {matchTime && (
                    <TouchableOpacity
                      onPress={() => setMatchTime(null)}
                      activeOpacity={0.7}
                      className="px-3 py-3"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <AppIcon family="material-icons" name="close" size={16} color="#88998D" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View>
                <Text className="text-neutral-on-surface font-ui text-xs mb-1">Zona</Text>
                <TouchableOpacity
                  onPress={() => setShowZonePicker(true)}
                  activeOpacity={0.7}
                  className="flex-row items-center justify-between bg-surface-high p-3 rounded-lg"
                >
                  <Text className={`font-ui ${zone ? 'text-neutral-on-surface' : 'text-[#88998D]'}`}>
                    {zone || 'Seleccionar zona'}
                  </Text>
                  <AppIcon family="material-icons" name="arrow-drop-down" size={20} color="#88998D" />
                </TouchableOpacity>
              </View>

              <View className="mt-4">
                <Text className="text-neutral-on-surface font-ui text-xs mb-1">Complejo (opcional)</Text>
                {zone ? (
                  loadingVenues ? (
                    <ActivityIndicator size="small" color="#53E076" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                  ) : venues.length === 0 ? (
                    <View className="bg-surface-high p-3 rounded-lg">
                      <Text className="font-ui text-sm text-[#88998D]">Sin complejos registrados en esta zona</Text>
                    </View>
                  ) : (
                    <View className="gap-2">
                      {venues.map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          onPress={() => setSelectedVenue(selectedVenue?.id === v.id ? null : v)}
                          activeOpacity={0.8}
                          className={`rounded-xl p-3 ${selectedVenue?.id === v.id ? 'border border-brand-primary/40 bg-brand-primary/10' : 'bg-surface-high'}`}
                        >
                          <View className="flex-row items-center gap-3">
                            <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${selectedVenue?.id === v.id ? 'border-brand-primary' : 'border-neutral-outline'}`}>
                              {selectedVenue?.id === v.id && (
                                <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
                              )}
                            </View>
                            <View className="flex-1">
                              <View className="flex-row items-center justify-between gap-2">
                                <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface">{v.name}</Text>
                                {/* Misma resolución que el Mercado y la propuesta
                                    de partido: sin esto el usuario elegía a ciegas
                                    y recién veía la distancia con el aviso ya
                                    publicado. */}
                                {(() => {
                                  const distance = distanceLabel({
                                    coords: v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null,
                                    zone,
                                    complex: v.name,
                                  });
                                  return distance ? (
                                    <Text className="font-ui text-[11px] text-brand-primary">{distance}</Text>
                                  ) : null;
                                })()}
                              </View>
                              {v.address && (
                                <Text className="font-ui text-xs text-neutral-on-surface-variant">{v.address}</Text>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )
                ) : (
                  /* Sin texto libre: el complejo sale sólo del catálogo `venues`.
                     Escribirlo a mano generaba predios fantasma que no matchean
                     con ninguna cancha real ni tienen coordenadas. */
                  <View className="bg-surface-high p-3 rounded-lg">
                    <Text className="font-ui text-sm text-[#88998D]">
                      Elegí una zona para ver sus complejos
                    </Text>
                  </View>
                )}
              </View>

              <View className="mt-4">
                <Text className="text-neutral-on-surface font-ui text-xs mb-2">Tipo de cancha (opcional)</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TEAM_FORMAT_OPTIONS.map((item) => {
                    const active = pitchType === item.value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        onPress={() => setPitchType(active ? null : item.value)}
                        activeOpacity={0.75}
                        className={`px-4 py-2 rounded-full border ${active ? 'border-brand-primary bg-brand-primary/10' : 'border-surface-high bg-surface-high'}`}
                      >
                        <Text className={`font-uiBold text-xs ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* --- CAMPOS EXCLUSIVOS DE JUGADOR --- */}
        {creationType === 'PLAYER' && (
          <View className="mb-6">
            <Text className="text-neutral-on-surface font-uiBold mb-2">¿Qué estás buscando?</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setPlayerPostType('BUSCA_EQUIPO')}
                activeOpacity={0.8}
                className={`flex-1 p-4 rounded-xl border items-center ${playerPostType === 'BUSCA_EQUIPO' ? 'bg-brand-primary/10 border-brand-primary' : 'bg-surface-low border-transparent'}`}
              >
                <Text className={`font-ui text-center ${playerPostType === 'BUSCA_EQUIPO' ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>
                  Unirme a Equipo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPlayerPostType('BUSCA_PARTIDO')}
                activeOpacity={0.8}
                className={`flex-1 p-4 rounded-xl border items-center ${playerPostType === 'BUSCA_PARTIDO' ? 'bg-brand-primary/10 border-brand-primary' : 'bg-surface-low border-transparent'}`}
              >
                <Text className={`font-ui text-center ${playerPostType === 'BUSCA_PARTIDO' ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>
                  Jugar un Partido
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* --- CAMPOS COMPARTIDOS --- */}
        <View className="mb-6">
          <Text className="text-neutral-on-surface font-uiBold mb-2">
            {creationType === 'TEAM' ? 'Posición Buscada' : 'Mi Posición'}
          </Text>
          {/* @ts-ignore */}
          <PitchSelector value={position} onChange={(val) => setPosition(val)} />
          <TouchableOpacity
            className="mt-4 p-3 border border-brand-primary/30 rounded-lg items-center bg-surface-low"
            onPress={() => setPosition('CUALQUIERA')}
            activeOpacity={0.7}
          >
            <Text className="text-brand-primary font-ui text-sm">
              {creationType === 'TEAM' ? 'Cualquier posición / Flexible' : 'Soy Flexible / Cualquier posición'}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mb-8">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-neutral-on-surface font-uiBold">Descripción (Opcional)</Text>
            <Text className="text-neutral-on-surface-variant font-ui text-xs">
              {description.length}/{MARKET_DESCRIPTION_MAX_LENGTH}
            </Text>
          </View>
          <TextInput
            value={description}
            onChangeText={setDescription}
            onFocus={() => setIsDescriptionFocused(true)}
            onBlur={() => setIsDescriptionFocused(false)}
            multiline
            numberOfLines={4}
            maxLength={MARKET_DESCRIPTION_MAX_LENGTH}
            placeholder={creationType === 'TEAM' ? "Ej: Buscamos arquero con experiencia para torneo los sábados..." : "Ej: Juego de 5, tengo disponibilidad por la noche..."}
            placeholderTextColor="#88998D"
            className="bg-surface-low p-4 rounded-xl text-neutral-on-surface font-ui min-h-[100px]"
            textAlignVertical="top"
          />
        </View>

        <HeroButton
          label="Crear Publicación"
          onPress={handleSubmit}
          disabled={isSubmitting || (creationType === 'TEAM' && managedTeams.length === 0)}
        />

      </ScrollView>
      </KeyboardAvoidingView>

      <ZoneSelectSheet
        visible={showZonePicker}
        onClose={() => setShowZonePicker(false)}
        selectedValue={zone || null}
        onSelect={(selected) => setZone(selected.value)}
        title="Zona del partido"
        suggestedValue={profile?.zone ?? null}
      />

      {showDatePicker && (
        <DateTimePicker
          value={matchDate ?? new Date()}
          mode="date"
          display="default"
          minimumDate={new Date()}
          locale="es-AR"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (event.type !== 'dismissed' && date) setMatchDate(date);
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={matchTime ?? new Date()}
          mode="time"
          display="default"
          onChange={(event, date) => {
            setShowTimePicker(false);
            if (event.type !== 'dismissed' && date) setMatchTime(date);
          }}
        />
      )}
    </SafeAreaView>
  );
}
