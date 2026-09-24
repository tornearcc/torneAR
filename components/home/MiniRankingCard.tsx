import { View, Text, TouchableOpacity } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { TeamShield } from '@/components/ui/TeamShield';
import { BRONZE, GOLD, SILVER } from '@/constants/podium';
import type { MiniRankingContext, MiniRankingEntry } from './types';
import type { Database } from '@/types/supabase';

type TeamFormat = Database['public']['Enums']['team_format'];
type TeamCategory = Database['public']['Enums']['team_category'];

const FORMAT_LABEL: Record<TeamFormat, string> = {
  FUTBOL_5: 'Fútbol 5',
  FUTBOL_6: 'Fútbol 6',
  FUTBOL_7: 'Fútbol 7',
  FUTBOL_8: 'Fútbol 8',
  FUTBOL_9: 'Fútbol 9',
  FUTBOL_11: 'Fútbol 11',
};

const CATEGORY_LABEL: Record<TeamCategory, string> = {
  HOMBRES: 'Hombres',
  MUJERES: 'Mujeres',
  MIXTO: 'Mixto',
};

/** Chip de contexto de la cabecera (categoría, zona). */
function ContextChip({ label, icon }: { label: string; icon: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2 py-0.5">
      <AppIcon
        family="material-community"
        name={icon}
        size={10}
        color="#53E076"
      />

      <Text className="font-uiBold text-[9px] text-brand-primary">
        {label}
      </Text>
    </View>
  );
}

/**
 * Oro / plata / bronce. El resto cae en el gris de siempre.
 *
 * Los hexes salen de `constants/podium` y no van escritos acá: el mismo oro lo
 * usan la tabla del ranking y los badges de MVP, y tenerlo repetido en cada
 * pantalla es cómo terminan desincronizados.
 */
const PODIUM_STYLE: Record<
  number,
  { bg: string; text: string; border: string }
> = {
  1: {
    bg: `${GOLD}22`,
    text: GOLD,
    border: `${GOLD}55`,
  },
  2: {
    bg: `${SILVER}22`,
    text: SILVER,
    border: `${SILVER}55`,
  },
  3: {
    bg: `${BRONZE}22`,
    text: '#E0A46A',
    border: `${BRONZE}55`,
  },
};

interface RowProps {
  entry: MiniRankingEntry;
  isLast: boolean;
}

function MiniRankingRow({ entry, isLast }: RowProps) {
  const podium = PODIUM_STYLE[entry.rankPosition] ?? {
    bg: '#2A2A2A',
    text: '#BCCBB9',
    border: '#86958555',
  };

  return (
    <View>
      <View
        className={`flex-row items-center gap-3 py-2.5 pr-4 ${
          entry.isMyTeam
            ? 'border-l-2 border-brand-primary bg-brand-primary/10 pl-[14px]'
            : 'pl-4'
        }`}
      >
        {/* Posición */}
        <View
          className="h-7 w-7 items-center justify-center rounded-full border"
          style={{
            backgroundColor: podium.bg,
            borderColor: podium.border,
          }}
        >
          <Text
            className="font-displayBlack text-[12px]"
            style={{ color: podium.text }}
          >
            {entry.rankPosition}
          </Text>
        </View>

        {/* Escudo */}
        <TeamShield
          shieldUrl={entry.shieldUrl}
          size={31}
          isMyTeam={entry.isMyTeam}
          teamId={entry.teamId}
          viewerTitle={entry.teamName}
          expandable
        />

        {/* Equipo */}
        <View className="flex-1">
          <Text
            className={`font-uiBold text-[13px] ${
              entry.isMyTeam
                ? 'text-brand-primary'
                : 'text-neutral-on-surface'
            }`}
            numberOfLines={1}
          >
            {entry.teamName}
          </Text>

          {entry.isMyTeam && (
            <Text className="font-ui mt-0.5 text-[9px] uppercase tracking-wider text-brand-primary/70">
              Tu equipo
            </Text>
          )}
        </View>

        {/* ELO */}
        <View className="items-end">
          <Text className="font-displayBlack text-[15px] leading-4 text-neutral-on-surface">
            {entry.eloRating}
          </Text>

          <Text className="font-ui mt-0.5 text-[8px] uppercase tracking-wider text-neutral-outline">
            Ranking
          </Text>
        </View>
      </View>

      {!isLast && (
        <View className="mx-4 h-px bg-neutral-outline/15" />
      )}
    </View>
  );
}

interface Props {
  entries: MiniRankingEntry[];

  /**
   * Zona + categoría + formato con los que se consultó el top 3. `null` mientras
   * no se conoce. Es el mismo contexto que se manda por params a la tab Ranking:
   * lo que se lee en los chips es exactamente lo que se va a ver al entrar.
   */
  context: MiniRankingContext | null;

  loading: boolean;
  onPress: () => void;
}

/**
 * Tarjeta de sólo presentación: la consulta a Supabase vive en la pantalla Home.
 * Acá no hay más lógica que elegir entre esqueleto, vacío y las tres filas.
 */
export function MiniRankingCard({
  entries,
  context,
  loading,
  onPress,
}: Props) {
  const formatLabel = context?.format
    ? FORMAT_LABEL[context.format]
    : null;

  const categoryLabel = context?.category
    ? CATEGORY_LABEL[context.category]
    : null;

  return (
    <View className="mb-5">
      {/* Section header */}
      <View className="mb-3 px-0.5">
        <Text className="font-displayBlack text-sm uppercase tracking-wider text-neutral-on-surface-variant">
          Ranking
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        className="overflow-hidden rounded-2xl bg-surface-container"
      >
        {/* Context header */}
        <View className="flex-row items-center gap-3 border-b border-neutral-outline/15 bg-surface-high/40 px-4 py-3">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-primary/10">
            <AppIcon
              family="material-community"
              name="trophy"
              size={18}
              color="#53E076"
            />
          </View>

          <View className="flex-1">
            <Text
              className="font-displayBlack text-[15px] leading-[18px] text-neutral-on-surface"
              numberOfLines={1}
            >
              Top 3 {formatLabel ?? 'del ranking'}
            </Text>

            <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
              {categoryLabel && (
                <ContextChip
                  label={categoryLabel}
                  icon="account-group"
                />
              )}

              {context?.zone && (
                <ContextChip
                  label={context.zone}
                  icon="map-marker"
                />
              )}

              {!categoryLabel && !context?.zone && (
                <Text className="font-ui text-[9px] uppercase tracking-wider text-neutral-outline">
                  Todas las zonas y categorías
                </Text>
              )}
            </View>
          </View>
        </View>

        {loading ? (
          <View className="py-1">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                className="flex-row items-center gap-3 px-4 py-2.5"
              >
                <View className="h-7 w-7 rounded-full bg-surface-high" />
                <View className="h-8 w-8 rounded-full bg-surface-high" />
                <View className="h-3 flex-1 rounded-full bg-surface-high" />
                <View className="h-3 w-10 rounded-full bg-surface-high" />
              </View>
            ))}
          </View>
        ) : entries.length === 0 ? (
          <View className="items-center px-4 py-8">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-surface-high">
              <AppIcon
                family="material-community"
                name="trophy-outline"
                size={27}
                color="#869585"
              />
            </View>

            <Text className="font-ui mt-3 text-center text-[13px] leading-5 text-neutral-on-surface-variant">
              Todavía no hay equipos rankeados
              {formatLabel ? ` en ${formatLabel}` : ''}
            </Text>
          </View>
        ) : (
          <>
            {entries.map((entry, index) => (
              <MiniRankingRow
                key={entry.teamId}
                entry={entry}
                isLast={index === entries.length - 1}
              />
            ))}

            {/* Footer */}
            <View className="flex-row items-center justify-center gap-1.5 border-t border-neutral-outline/15 bg-surface-high/30 py-2.5">
              <Text className="font-uiBold text-[10px] text-info-secondary">
                Ver la tabla completa
              </Text>

              <AppIcon
                family="material-community"
                name="arrow-right"
                size={12}
                color="#8CCDFF"
              />
            </View>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}