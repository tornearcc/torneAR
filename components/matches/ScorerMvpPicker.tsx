import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import type { ScorerPickerPerson } from '@/components/matches/types';

interface ScorerMvpPickerProps {
  // Forma mínima (profileId + fullName + inSquad?): la cumplen el plantel
  // completo que pasa ResultModal y la convocatoria que pasa WoModal.
  participants: ScorerPickerPerson[];
  scorers: Record<string, number>;                 // profileId -> goles
  onScorerGoalsChange: (profileId: string, goals: number) => void;
  mvpId: string | null;
  onMvpChange: (profileId: string | null) => void;
  goalCap?: number;                                 // tope total de goles (WO = 3). Sin tope si undefined.
  scorersLabel?: string;
  mvpLabel?: string;
  /** Qué bloque mostrar. ResultModal los muestra de a uno (un paso por pantalla); WoModal, los dos. */
  section?: 'both' | 'scorers' | 'mvp';
}

/**
 * Selector reutilizable de goleadores (stepper de goles por jugador) + MVP (chips).
 * Dumb component: recibe todo por props, no hace fetch. Usado por ResultModal y WoModal.
 */
export function ScorerMvpPicker({
  participants,
  scorers,
  onScorerGoalsChange,
  mvpId,
  onMvpChange,
  goalCap,
  scorersLabel = 'Goleadores (opcional)',
  mvpLabel = 'MVP (opcional)',
  section = 'both',
}: ScorerMvpPickerProps) {
  const showScorers = section !== 'mvp';
  const showMvp = section !== 'scorers';
  if (participants.length === 0) return null;

  const totalGoals = Object.values(scorers).reduce((sum, g) => sum + g, 0);
  const capReached = goalCap !== undefined && totalGoals >= goalCap;

  function increment(profileId: string) {
    if (capReached) return;
    onScorerGoalsChange(profileId, (scorers[profileId] ?? 0) + 1);
  }
  function decrement(profileId: string) {
    onScorerGoalsChange(profileId, Math.max(0, (scorers[profileId] ?? 0) - 1));
  }

  return (
    <>
      {/* Goleadores */}
      {showScorers && (
        <>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-ui text-xs uppercase tracking-widest text-neutral-outline">
              {scorersLabel}
            </Text>
            {goalCap !== undefined && (
              <Text className="font-uiBold text-xs text-neutral-on-surface-variant">
                {totalGoals}/{goalCap}
              </Text>
            )}
          </View>
          <View className="mb-4 gap-2">
            {participants.map((p) => (
              <View
                key={p.profileId}
                className="flex-row items-center justify-between rounded-xl bg-surface-high px-4 py-2"
              >
                <View className="flex-1 flex-row items-center gap-2" style={{ minWidth: 0 }}>
                  <Text
                    className="font-ui shrink text-sm text-neutral-on-surface"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {p.fullName}
                  </Text>
                  {/* El jugador está en el plantel pero no en la lista de buena fe.
                      Se le pueden cargar goles igual (entró de urgencia), pero el
                      capitán tiene que verlo explícitamente. */}
                  {p.inSquad === false && (
                    <View className="shrink-0 rounded-full bg-warning-tertiary/15 px-2 py-0.5">
                      <Text className="font-ui text-[9px] uppercase tracking-wide text-warning-tertiary">
                        Fuera de lista
                      </Text>
                    </View>
                  )}
                </View>
                {/* shrink-0: el stepper de goles no puede perder ancho por un
                    nombre largo, o los botones +/- quedan inutilizables. */}
                <View className="shrink-0 flex-row items-center gap-3">
                  {/* El pill visual mide 28x28 para no romper la densidad de la lista;
                      hitSlop de 8 lleva el area tactil a 44x44 sin tocar el layout.
                      Los botones estan a 44px entre si, asi que los hitSlop no se pisan. */}
                  <TouchableOpacity
                    onPress={() => decrement(p.profileId)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="h-7 w-7 items-center justify-center rounded-full bg-surface-container"
                  >
                    <AppIcon family="material-community" name="minus" size={14} color="#BCCBB9" />
                  </TouchableOpacity>
                  <Text className="font-uiBold w-5 text-center text-sm text-neutral-on-surface">
                    {scorers[p.profileId] ?? 0}
                  </Text>
                  <TouchableOpacity
                    onPress={() => increment(p.profileId)}
                    disabled={capReached}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className={`h-7 w-7 items-center justify-center rounded-full ${
                      capReached ? 'bg-brand-primary/40' : 'bg-brand-primary'
                    }`}
                  >
                    <AppIcon family="material-community" name="plus" size={14} color="#003914" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* MVP */}
      {showMvp && (
        <>
          <Text className="font-ui mb-2 text-xs uppercase tracking-widest text-neutral-outline">
            {mvpLabel}
          </Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {participants.map((p) => (
              <TouchableOpacity
                key={p.profileId}
                onPress={() => onMvpChange(mvpId === p.profileId ? null : p.profileId)}
                activeOpacity={0.8}
                // El chip mide ~36px de alto; +4 arriba y abajo lo lleva a 44. No se
                // extiende en horizontal para no solaparse con el chip vecino (gap-2).
                hitSlop={{ top: 4, bottom: 4 }}
                // max-w-full: el chip nunca excede el ancho de la fila; el nombre
                // se trunca dentro del chip en vez de estirarlo fuera del modal.
                className={`max-w-full rounded-xl px-3 py-2 ${
                  mvpId === p.profileId ? 'bg-warning-tertiary/20' : 'bg-surface-high'
                }`}
              >
                <Text
                  className={`font-ui text-sm ${
                    mvpId === p.profileId ? 'text-warning-tertiary' : 'text-neutral-on-surface-variant'
                  }`}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {mvpId === p.profileId ? '⭐ ' : ''}
                  {p.fullName}
                  {p.inSquad === false ? ' ·' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </>
  );
}
