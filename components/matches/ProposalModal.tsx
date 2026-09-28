import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { AppDateTimePicker } from '@/components/ui/AppDateTimePicker';
import { useDistanceResolver } from '@/hooks/useDistanceResolver';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { ZoneSelectSheet, ZoneSelectTrigger } from '@/components/ui/ZoneSelect';
import type { ZoneOption } from '@/components/ui/ZoneSelect';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { getProposalErrorMessage } from '@/lib/match-actions';
import type { MatchProposalFormData } from '@/components/matches/types';
import type { Database } from '@/types/supabase';
import { fetchZonesWithVenues, fetchVenuesByZone } from '@/lib/venue-data';
import type { ZoneEntry, VenueEntry } from '@/lib/venue-data';
import { Logger } from '@/lib/logger';

type TeamFormat = Database['public']['Enums']['team_format'];
type MatchType = Database['public']['Enums']['match_type'];

const FORMATS: { label: string; value: TeamFormat }[] = [
  { label: 'F5', value: 'FUTBOL_5' },
  { label: 'F6', value: 'FUTBOL_6' },
  { label: 'F7', value: 'FUTBOL_7' },
  { label: 'F8', value: 'FUTBOL_8' },
  { label: 'F9', value: 'FUTBOL_9' },
  { label: 'F11', value: 'FUTBOL_11' },
];

const DURATIONS = [60, 75, 90];

interface Props {
  visible: boolean;
  matchType?: MatchType;
  onClose: () => void;
  onSubmit: (data: MatchProposalFormData) => Promise<void>;
}

// D13: el default era `new Date()` — es decir, una fecha ya vencida en el
// instante en que se abre el formulario. Como el servidor ahora rechaza
// `scheduled_at <= now()`, arrancar en "ahora" habría dejado el sheet bloqueado
// de entrada. Dos horas es el piso razonable para coordinar un partido.
function defaultScheduledDate(): Date {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

export function ProposalModal({ visible, matchType = 'RANKING', onClose, onSubmit }: Props) {
  const [format, setFormat] = useState<TeamFormat>('FUTBOL_5');
  const [scheduledDate, setScheduledDate] = useState(defaultScheduledDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [signalAmount, setSignalAmount] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [loading, setLoading] = useState(false);

  // Zone + Venue. La cancha SÓLO puede salir del catálogo `venues`: el campo de
  // texto libre que había acá guardaba la dirección en `location` dejando
  // `venue_id` en null, y el geofence del check-in arranca con
  // `IF v_match.venue_id IS NOT NULL` — así que una dirección escrita a mano
  // desactivaba la validación geoespacial sin ningún aviso.
  const [zones, setZones] = useState<ZoneEntry[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<VenueEntry | null>(null);
  // Canchas de la última zona resuelta. Guardar la zona junto al resultado deja
  // derivar `venues` y `loadingVenues` en el render, sin encenderlos a mano al
  // arrancar cada carga (eso sería un setState síncrono dentro del efecto).
  const [venuesByZone, setVenuesByZone] = useState<{ zoneId: string; venues: VenueEntry[] } | null>(
    null,
  );
  const [zonesLoaded, setZonesLoaded] = useState(false);
  /** A14: `venueId` → metros. Vacío si no hay ubicación disponible. */
  /*
   * A14 — distancia a cada complejo.
   *
   * El calculo vive en `useDistanceResolver` y no aca: esta pantalla media
   * desde el GPS del dispositivo mientras el Mercado medía desde el centroide
   * de la zona del perfil, y el mismo predio aparecia a "100 m" en una y a
   * "600 m" en la otra. Ahora las dos comparten origen, destino y formato.
   */
  const { label: venueDistanceLabel } = useDistanceResolver();

  // Alert propio, renderizado DENTRO del <Modal> (ver abajo). Un <Modal> nativo se
  // presenta en una ventana del sistema por encima de todo el arbol React, asi que
  // un alert montado en la pantalla padre queda detras y el usuario no lo ve.
  const { showAlert, AlertComponent } = useCustomAlert();

  // Load zones once when modal opens. Sólo zonas con complejos cargados: elegir
  // una zona vacía era un callejón sin salida (no hay texto libre de reemplazo).
  useEffect(() => {
    if (!visible || zonesLoaded) return;
    fetchZonesWithVenues()
      .then(setZones)
      .catch((err: unknown) => {
        // El `catch {}` vacío dejaba el selector de zonas mudo y sin opciones:
        // desde la UI parecía que no hay ninguna zona con canchas cargadas.
        Logger.warn('No se pudieron cargar las zonas con canchas; el selector queda vacío', {
          scope: 'ProposalModal.fetchZones',
          error: err,
        });
      })
      .finally(() => setZonesLoaded(true));
  }, [visible, zonesLoaded]);


  const venues = venuesByZone?.zoneId === selectedZoneId ? venuesByZone.venues : [];
  const loadingVenues = Boolean(selectedZoneId) && venuesByZone?.zoneId !== selectedZoneId;

  // Cambiar de zona invalida la cancha elegida. Se ajusta durante el render y no
  // en un efecto para que no exista un frame con una cancha de la zona anterior
  // todavía seleccionada.
  const [venueZoneId, setVenueZoneId] = useState(selectedZoneId);
  if (selectedZoneId !== venueZoneId) {
    setVenueZoneId(selectedZoneId);
    setSelectedVenue(null);
  }

  // Load venues when zone changes
  useEffect(() => {
    if (!selectedZoneId) return;

    // El flag descarta la respuesta de una zona que ya no es la elegida: sin
    // esto una respuesta lenta pisaría la caché con la zona vieja y la lista
    // quedaría cargando para siempre.
    let cancelled = false;
    fetchVenuesByZone(selectedZoneId)
      .then((list) => {
        if (!cancelled) setVenuesByZone({ zoneId: selectedZoneId, venues: list });
      })
      .catch((err: unknown) => {
        Logger.warn('No se pudieron cargar las canchas de la zona; el selector queda vacío', {
          scope: 'ProposalModal.fetchVenues',
          zoneId: selectedZoneId,
          error: err,
        });
        if (!cancelled) setVenuesByZone({ zoneId: selectedZoneId, venues: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedZoneId]);

  // D13 (bis): reloj contra el que se compara la fecha propuesta. Leer
  // `Date.now()` durante el render es impuro y, además, un sheet abierto y
  // quieto no vuelve a renderizar solo: el aviso de «la fecha ya pasó» podía
  // no aparecer nunca. El tick corre sólo mientras el modal está visible.
  //
  // Sin resincronización al abrir: el primer tick llega a los 5 s, así que
  // recién reabierto el reloj puede estar hasta 5 s atrasado. Es irrelevante
  // acá —el default de la fecha es dentro de 2 h y el picker tiene
  // granularidad de minutos— y el rechazo real lo hace el servidor con
  // `scheduled_at <= now()`; este aviso es sólo para no mandar el submit a
  // ciegas.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    const intervalId = setInterval(() => setNowTs(Date.now()), 5_000);
    return () => clearInterval(intervalId);
  }, [visible]);

  function handleClose() {
    // Reset state
    setFormat('FUTBOL_5');
    setScheduledDate(defaultScheduledDate());
    setDurationMinutes(60);
    setSignalAmount('');
    setTotalCost('');
    setSelectedZoneId(null);
    setSelectedVenue(null);
    onClose();
  }

  async function handleSubmit() {
    if (loading || blockReason) return;
    setLoading(true);
    try {
      await onSubmit({
        format,
        matchType,
        scheduledAt: scheduledDate,
        durationMinutes,
        venueId: selectedVenue?.id ?? null,
        // `location` queda como denormalización para display; la fuente de verdad
        // de la cancha es `venueId`, único dato que el geofence puede usar.
        location: selectedVenue
          ? [selectedVenue.name, selectedVenue.address].filter(Boolean).join(' — ')
          : null,
        signalAmount: signalAmount ? parseFloat(signalAmount) : null,
        totalCost: totalCost ? parseFloat(totalCost) : null,
      });
      Logger.info('Propuesta de partido confirmada desde el modal', {
        scope: 'ProposalModal.handleSubmit',
        format,
        matchType,
        venueId: selectedVenue?.id ?? null,
        durationMinutes,
      });
      handleClose();
    } catch (err) {
      Logger.error('No se pudo enviar la propuesta de partido', {
        scope: 'ProposalModal.handleSubmit',
        format,
        matchType,
        venueId: selectedVenue?.id ?? null,
        error: err,
      });
      // El sheet queda abierto a proposito: el usuario no pierde lo que cargo y
      // puede corregir y reintentar sin volver a completar el formulario.
      //
      // D13: con el genérico, "el equipo ya tiene un partido a esa hora" llegaba
      // como "No se pudo completar la operación" — justo el dato que le permite
      // corregir la fecha en vez de reintentar igual.
      showAlert(
        'No se pudo enviar',
        getProposalErrorMessage(err),
      );
    } finally {
      setLoading(false);
    }
  }

  function formatDateDisplay(d: Date): string {
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTimeDisplay(d: Date): string {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  const selectedZoneName = zones.find((z) => z.id === selectedZoneId)?.name ?? null;

  /*
   * Acá el `value` es el uuid y no el nombre: lo que se guarda en la propuesta
   * es `venues.zone_id`. El subtítulo con la cantidad de complejos evita el
   * callejón de elegir una zona y encontrarla vacía.
   */
  const zoneOptions = useMemo<ZoneOption[]>(
    () =>
      zones.map((z) => ({
        value: z.id,
        name: z.name,
        subtitle: `${z.venueCount} ${z.venueCount === 1 ? 'complejo' : 'complejos'}`,
      })),
    [zones],
  );

  // Un partido de RANKING mueve ELO y se valida con geofence al hacer check-in:
  // sin `venue_id` no hay coordenadas contra las cuales medir, así que la cancha
  // oficial es obligatoria. En AMISTOSO queda opcional, pero si se define tiene
  // que salir igual del catálogo — no hay otra vía de carga.
  //
  // D13: la fecha pasada se avisa acá y no después del rechazo del servidor. El
  // `minimumDate` del picker sólo acota la fecha al abrirlo — no impide dejar
  // el sheet abierto hasta que la hora elegida quede atrás.
  const blockReason: string | null =
    scheduledDate.getTime() <= nowTs
      ? 'La fecha y hora propuestas ya pasaron: elegí un horario futuro.'
      : matchType === 'RANKING' && !selectedVenue
        ? zonesLoaded && zones.length === 0
          ? 'Todavía no hay complejos cargados. Escribinos para sumar tu cancha y poder proponer partidos de ranking.'
          : 'Elegí zona y complejo: los partidos de ranking necesitan una cancha oficial para validar el check-in.'
        : null;

  return (
    <SafeAreaBottomSheet
      visible={visible}
      onClose={handleClose}
      maxHeight="80%"
      /* Los campos de Seña y Costo total viven abajo del todo del sheet y en
         iOS el teclado los tapaba. La prop sólo aplica en iOS —Android
         redimensiona la ventana solo—, pero esa decisión vive dentro de
         SafeAreaBottomSheet, no acá. */
      avoidKeyboard
      /* Dentro del <Modal>: si se montara en la pantalla padre quedaría detrás
         de esa ventana nativa y el error sería invisible. Mismo motivo para el
         selector de zonas, que además evita anidar dos Modal nativos. */
      overlay={
        <>
          {AlertComponent}
          <ZoneSelectSheet
            inline
            visible={zonePickerOpen}
            onClose={() => setZonePickerOpen(false)}
            selectedValue={selectedZoneId}
            onSelect={(zone) => setSelectedZoneId(zone.value)}
            title="Zona del partido"
            options={zoneOptions}
            optionsLoading={!zonesLoaded}
          />
        </>
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Proponer detalles</Text>
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <AppIcon family="material-community" name="close" size={22} color="#869585" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Date ── */}
        <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
          Fecha
        </Text>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.8}
          className="mb-4 rounded-xl bg-surface-high px-4 py-3"
        >
          <Text className="font-ui text-sm text-neutral-on-surface">
            {formatDateDisplay(scheduledDate)}
          </Text>
        </TouchableOpacity>
        <AppDateTimePicker
          visible={showDatePicker}
          value={scheduledDate}
          mode="date"
          title="Fecha del partido"
          minimumDate={new Date()}
          onCancel={() => setShowDatePicker(false)}
          onConfirm={(d) => {
            setShowDatePicker(false);
            const merged = new Date(scheduledDate);
            merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
            setScheduledDate(merged);
          }}
        />

        {/* ── Time ── */}
        <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
          Hora
        </Text>
        <TouchableOpacity
          onPress={() => setShowTimePicker(true)}
          activeOpacity={0.8}
          className="mb-4 rounded-xl bg-surface-high px-4 py-3"
        >
          <Text className="font-ui text-sm text-neutral-on-surface">
            {formatTimeDisplay(scheduledDate)}
          </Text>
        </TouchableOpacity>
        <AppDateTimePicker
          visible={showTimePicker}
          value={scheduledDate}
          mode="time"
          title="Hora del partido"
          onCancel={() => setShowTimePicker(false)}
          onConfirm={(d) => {
            setShowTimePicker(false);
            const merged = new Date(scheduledDate);
            merged.setHours(d.getHours(), d.getMinutes());
            setScheduledDate(merged);
          }}
        />

        {/* ── Duration ── */}
        <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
          Duración
        </Text>
        <View className="mb-4 flex-row gap-2">
          {DURATIONS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setDurationMinutes(d)}
              activeOpacity={0.8}
              className={`flex-1 rounded-xl py-2.5 ${
                durationMinutes === d ? 'bg-brand-primary' : 'bg-surface-high'
              }`}
            >
              <Text
                className={`font-uiBold text-center text-sm ${
                  durationMinutes === d ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                }`}
              >
                {d} min
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Format ── */}
        <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
          Formato
        </Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {FORMATS.map((f) => (
            <TouchableOpacity
              key={f.value}
              onPress={() => setFormat(f.value)}
              activeOpacity={0.8}
              className={`rounded-xl px-4 py-2.5 ${
                format === f.value ? 'bg-brand-primary' : 'bg-surface-high'
              }`}
            >
              <Text
                className={`font-uiBold text-sm ${
                  format === f.value ? 'text-[#003914]' : 'text-neutral-on-surface-variant'
                }`}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Zone ── */}
        <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
          Zona
        </Text>
        {zonesLoaded && zones.length === 0 ? (
          <View className="mb-4 rounded-xl bg-surface-high px-4 py-3">
            <Text className="font-ui text-sm text-neutral-on-surface-variant">
              Todavía no hay zonas con complejos cargados.
            </Text>
          </View>
        ) : (
          <View className="mb-4">
            <ZoneSelectTrigger
              value={selectedZoneName}
              placeholder="Elegí la zona"
              loading={!zonesLoaded}
              disabled={!zonesLoaded}
              onPress={() => setZonePickerOpen(true)}
            />
          </View>
        )}

        {/* ── Venue (shown after zone is selected) ── */}
        {selectedZoneId && (
          <>
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Complejo en {selectedZoneName}
            </Text>
            {loadingVenues ? (
              <ActivityIndicator color="#53E076" style={{ marginBottom: 16, alignSelf: 'flex-start' }} />
            ) : venues.length === 0 ? (
              <View className="mb-1 rounded-xl bg-surface-high px-4 py-3">
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  Los complejos de esta zona ya no están disponibles. Elegí otra zona.
                </Text>
              </View>
            ) : (
              <View className="mb-1 gap-2">
                {venues.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setSelectedVenue(selectedVenue?.id === v.id ? null : v)}
                    activeOpacity={0.8}
                    className={`rounded-xl p-3 ${
                      selectedVenue?.id === v.id
                        ? 'border border-brand-primary/40 bg-brand-primary/10'
                        : 'bg-surface-high'
                    }`}
                  >
                    <View className="flex-row items-center gap-3">
                      <View
                        className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                          selectedVenue?.id === v.id
                            ? 'border-brand-primary'
                            : 'border-neutral-outline'
                        }`}
                      >
                        {selectedVenue?.id === v.id && (
                          <View className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
                        )}
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="font-uiBold flex-1 text-sm text-neutral-on-surface">
                            {v.name}
                          </Text>
                          {/* A14: `null` cuando no hay origen utilizable (sin
                              permiso de ubicacion y sin zona en el perfil). */}
                          {(() => {
                            const distance = venueDistanceLabel({
                              coords: v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null,
                            });
                            return distance ? (
                              <Text className="font-ui text-[11px] text-brand-primary">
                                {distance}
                              </Text>
                            ) : null;
                          })()}
                        </View>
                        {v.address && (
                          <Text className="font-ui text-xs text-neutral-on-surface-variant">
                            {v.address}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View className="mb-4" />
          </>
        )}

        {/* ── Costs ── */}
        <View className="mb-4 flex-row gap-2">
          <View className="flex-1">
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Seña ($)
            </Text>
            <TextInput
              value={signalAmount}
              onChangeText={setSignalAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#869585"
              className="rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
            />
          </View>
          <View className="flex-1">
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              Costo total ($)
            </Text>
            <TextInput
              value={totalCost}
              onChangeText={setTotalCost}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#869585"
              className="rounded-xl bg-surface-high px-4 py-3 text-sm text-neutral-on-surface"
            />
          </View>
        </View>

        {/* ── Submit ── */}
        {/* Motivo inline en vez de alert: el usuario ve por qué no puede
            enviar sin tener que tocar el botón para descubrirlo. */}
        {blockReason && (
          <View className="mb-2 flex-row items-start gap-2 rounded-xl bg-warning-tertiary/10 px-3 py-2">
            <AppIcon family="material-community" name="alert-circle-outline" size={14} color="#FABD32" />
            <Text className="font-ui flex-1 text-xs text-warning-tertiary">{blockReason}</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => void handleSubmit()}
          disabled={loading || blockReason !== null}
          activeOpacity={0.8}
          className={`rounded-xl py-3.5 ${
            loading || blockReason !== null ? 'bg-surface-high' : 'bg-brand-primary'
          }`}
        >
          <Text
            className={`font-uiBold text-center text-sm ${
              loading || blockReason !== null ? 'text-neutral-outline' : 'text-[#003914]'
            }`}
          >
            {loading ? 'Enviando...' : 'Enviar propuesta'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaBottomSheet>
  );
}
