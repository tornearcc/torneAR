import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { SafeAreaBottomSheet } from '@/components/ui/SafeAreaBottomSheet';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { joinMatchAsGuest } from '@/lib/match-actions';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import {
  formatGuestCodeExpiry,
  getGuestCodeExpiry,
  getGuestJoinErrorMessage,
  isGuestCodeExpired,
} from '@/lib/guest-code';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

interface MatchPreview {
  id: string;
  teamAName: string;
  teamBName: string;
  /** E7 — hasta cuándo vale el código. `null` = sin dato para calcularlo. */
  expiresAt: Date | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful join so the caller can navigate to the match */
  onJoined: (matchId: string, myTeamId: string) => void;
}

export function GuestJoinModal({ visible, onClose, onJoined }: Props) {
  const [code, setCode] = useState('');
  const [teamSide, setTeamSide] = useState<'A' | 'B' | null>(null);
  const [matchPreview, setMatchPreview] = useState<MatchPreview | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showAlert, AlertComponent } = useCustomAlert();

  function handleClose() {
    setCode('');
    setTeamSide(null);
    setMatchPreview(null);
    onClose();
  }

  async function lookupMatch(rawCode: string) {
    const trimmed = rawCode.trim().toUpperCase();
    if (trimmed.length === 0) return;

    setLookupLoading(true);
    setMatchPreview(null);
    setTeamSide(null);
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(
          'id, scheduled_at, created_at, team_a:teams!team_a_id(name), team_b:teams!team_b_id(name)',
        )
        .eq('unique_code', trimmed)
        .single();

      if (error || !data) {
        // Supabase devuelve el fallo como valor: sin esto, un error de RLS se
        // ve exactamente igual que un código que no existe.
        Logger.warn('Búsqueda de partido por código de invitado sin resultado', {
          scope: 'GuestJoinModal.lookupMatch',
          hasError: error !== null,
          error,
        });
        showAlert('Código inválido', 'No se encontró ningún partido con ese código.');
        return;
      }

      // E7 — pre-chequeo, no autorización: la guarda real es GUEST_CODE_EXPIRED
      // en `join_match_as_guest`. Acá sólo se evita que el usuario elija equipo
      // y toque "Unirse" para recién ahí enterarse de que el código no vale.
      if (isGuestCodeExpired(data.scheduled_at, data.created_at)) {
        showAlert(
          'Código vencido',
          'Este código ya no admite invitados. Pedile al capitán el código de un partido vigente.',
        );
        return;
      }

      const teamA = Array.isArray(data.team_a) ? data.team_a[0] : data.team_a;
      const teamB = Array.isArray(data.team_b) ? data.team_b[0] : data.team_b;

      setMatchPreview({
        id: data.id,
        teamAName: teamA?.name ?? 'Equipo A',
        teamBName: teamB?.name ?? 'Equipo B',
        expiresAt: getGuestCodeExpiry(data.scheduled_at, data.created_at),
      });
    } catch (err) {
      Logger.error('Fallo la búsqueda del partido por código de invitado', {
        scope: 'GuestJoinModal.lookupMatch',
        error: err,
      });
      showAlert('Error', getGenericSupabaseErrorMessage(err));
    } finally {
      setLookupLoading(false);
    }
  }

  function handleCodeChange(text: string) {
    const upper = text.toUpperCase();
    setCode(upper);
    setMatchPreview(null);
    setTeamSide(null);
    if (upper.length === 8) {
      void lookupMatch(upper);
    }
  }

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) {
      showAlert('Código requerido', 'Ingresá el código del partido.');
      return;
    }
    if (!matchPreview) {
      showAlert('Buscá el partido', 'Presioná "Buscar" para encontrar el partido primero.');
      return;
    }
    if (!teamSide) {
      showAlert('Equipo requerido', 'Seleccioná en qué equipo querés jugar.');
      return;
    }

    setLoading(true);
    try {
      const result = await joinMatchAsGuest(trimmed, teamSide);
      Logger.info('Invitado sumado a un partido', {
        scope: 'GuestJoinModal.handleJoin',
        matchId: result.matchId,
        teamId: result.teamId,
        teamSide,
      });
      handleClose();
      onJoined(result.matchId, result.teamId);
    } catch (err) {
      // E7: el traductor distingue "código vencido" de un error genérico.
      Logger.error('No se pudo sumar al invitado al partido', {
        scope: 'GuestJoinModal.handleJoin',
        matchId: matchPreview.id,
        teamSide,
        error: err,
      });
      showAlert('No pudimos sumarte', getGuestJoinErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaBottomSheet
      visible={visible}
      onClose={handleClose}
      overlay={AlertComponent}
      maxHeight="80%"
      /* El campo del código de invitado necesita que el sheet se levante con el
         teclado: en iOS un <Modal> nativo no reacciona salvo que el
         KeyboardAvoidingView esté adentro, que es lo que monta esta prop. */
      avoidKeyboard
    >
      {/* Header fijo: queda fuera del ScrollView para que no se vaya con el
          contenido al scrollear. */}
      <View className="flex-row items-center justify-between px-5 py-4">
        <Text className="font-uiBold text-lg text-neutral-on-surface">Unirse como invitado</Text>
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
        contentContainerStyle={{ paddingBottom: 16, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Code input + search button */}
        <View>
          <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
            Código del partido
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              value={code}
              onChangeText={handleCodeChange}
              placeholder="Ej: AB12CD"
              placeholderTextColor="#869585"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              className="flex-1 rounded-xl border border-neutral-outline/30 bg-surface-high px-4 py-3 font-displayBlack text-2xl tracking-[6px] text-neutral-on-surface"
            />
            <TouchableOpacity
              onPress={() => void lookupMatch(code)}
              activeOpacity={0.8}
              disabled={lookupLoading || code.trim().length === 0}
              className="items-center justify-center rounded-xl bg-surface-high px-4 border border-neutral-outline/30"
            >
              {lookupLoading ? (
                <ActivityIndicator size="small" color="#53E076" />
              ) : (
                <AppIcon family="material-community" name="magnify" size={22} color="#53E076" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Team side selector — shown only after match is found */}
        {matchPreview && (
          <View>
            <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
              ¿En qué equipo jugás?
            </Text>
            <View className="flex-row gap-3">
              {([
                { side: 'A' as const, name: matchPreview.teamAName },
                { side: 'B' as const, name: matchPreview.teamBName },
              ]).map(({ side, name }) => (
                <TouchableOpacity
                  key={side}
                  onPress={() => setTeamSide(side)}
                  activeOpacity={0.8}
                  className={`flex-1 rounded-xl border py-3 px-2 ${
                    teamSide === side
                      ? 'border-brand-primary bg-brand-primary/15'
                      : 'border-neutral-outline/30 bg-surface-high'
                  }`}
                >
                  <Text
                    className={`font-uiBold text-center text-sm ${
                      teamSide === side ? 'text-brand-primary' : 'text-neutral-on-surface-variant'
                    }`}
                    numberOfLines={2}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Info note */}
        <View className="flex-row items-start gap-2 rounded-xl bg-info-secondary/10 px-4 py-3">
          <AppIcon family="material-community" name="information-outline" size={16} color="#8CCDFF" />
          <Text className="font-ui flex-1 text-xs leading-5 text-info-secondary">
            Como invitado podés hacer check-in y cargar el resultado del partido, pero no formás parte del equipo de forma permanente.
          </Text>
        </View>

        {/* E7 — el código tiene fecha de vencimiento; decirlo evita el
            "lo guardo para la próxima" que ya no va a funcionar. */}
        {matchPreview?.expiresAt ? (
          <View className="flex-row items-center gap-2">
            <AppIcon family="material-community" name="clock-alert-outline" size={14} color="#869585" />
            <Text className="font-ui flex-1 text-[11px] text-neutral-outline">
              Este código vale hasta el {formatGuestCodeExpiry(matchPreview.expiresAt)}.
            </Text>
          </View>
        ) : null}

        {/* Submit */}
        <TouchableOpacity
          onPress={() => void handleJoin()}
          disabled={loading || !matchPreview || !teamSide}
          activeOpacity={0.8}
          className={`rounded-xl py-3.5 ${matchPreview && teamSide ? 'bg-brand-primary' : 'bg-surface-high'}`}
        >
          <Text className={`font-uiBold text-center text-sm ${matchPreview && teamSide ? 'text-[#003914]' : 'text-neutral-outline'}`}>
            {loading ? 'Uniéndose...' : 'Unirse al partido'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaBottomSheet>
  );
}
