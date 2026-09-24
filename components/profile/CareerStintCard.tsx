import { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { CareerStint, SeasonBreakdown, StintLeaveReason } from '@/lib/career-data';
import { AppIcon } from '@/components/ui/AppIcon';
import { ExpandablePhoto } from '@/components/ui/image-viewer/ExpandablePhoto';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { getTeamRoleLabel } from '@/lib/team-options';

type CareerStintCardProps = {
  stint: CareerStint;
};

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
}

function getLeaveReasonLabel(reason: StintLeaveReason, isReconstructed: boolean): string | null {
  switch (reason) {
    case 'ABANDONO':
      return 'Dejó el club';
    case 'EXPULSADO':
      return 'Desvinculado';
    case 'TRANSFERENCIA':
      return 'Transferido';
    case 'EQUIPO_DISUELTO':
      return 'Equipo disuelto';
    default:
      // Ciclos reconstruidos por el backfill: la baja ocurrió antes del ledger.
      return isReconstructed ? 'Etapa histórica' : null;
  }
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-1 rounded-md bg-surface-high px-2 py-1">
      <Text className="font-uiBold text-xs text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text className="font-display text-[9px] uppercase tracking-wide text-neutral-on-surface-variant">{label}</Text>
    </View>
  );
}

function SeasonRow({ season }: { season: SeasonBreakdown }) {
  return (
    <View className="flex-row items-center justify-between border-t border-neutral-outline/10 py-2.5">
      <View className="flex-1 pr-2">
        <Text className="font-ui text-sm text-neutral-on-surface">{season.season_name ?? 'Sin temporada'}</Text>
        <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>
          {season.pj_ranking} PJ Ranking · {season.pj_amistoso} Amistosos
        </Text>
      </View>
      <View className="items-end">
        <Text className="font-uiBold text-sm text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>
          {season.goals} Goles · {season.mvps} MVP
        </Text>
        <Text className="font-ui mt-0.5 text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>
          {season.wins}V {season.draws}E {season.losses}D · {season.clean_sheets} Vallas
        </Text>
      </View>
    </View>
  );
}

export function CareerStintCard({ stint }: CareerStintCardProps) {
  const [expanded, setExpanded] = useState(false);

  const total = stint.stats.total;
  const shieldUrl = stint.shield_url ? getSupabaseStorageUrl('shields', stint.shield_url) : '';
  const leaveLabel = stint.is_current ? null : getLeaveReasonLabel(stint.leave_reason, stint.is_reconstructed);
  const wasLeader = stint.last_role === 'CAPITAN' || stint.last_role === 'SUBCAPITAN';
  const period = `${formatMonthYear(stint.started_at)} – ${stint.ended_at ? formatMonthYear(stint.ended_at) : 'presente'}`;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => setExpanded((prev) => !prev)}
      className={`rounded-xl bg-surface-low p-3 ${stint.is_current ? 'border border-brand-primary/35' : ''}`}
    >
      <View className="flex-row items-center gap-3">
        <ExpandablePhoto uri={shieldUrl || null} subject={{ kind: 'shield', teamId: stint.team_id }} title={stint.team_name}>
          <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-variant">
            {shieldUrl ? (
              <Image source={{ uri: shieldUrl }} className="h-8 w-8" resizeMode="contain" />
            ) : (
              <AppIcon family="material-community" name="shield-outline" size={18} color="#BCCBB9" />
            )}
          </View>
        </ExpandablePhoto>

        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="font-display text-lg text-neutral-on-surface" numberOfLines={1}>
              {stint.team_name}
            </Text>
            {stint.is_current && (
              <View className="rounded bg-brand-primary/15 px-1.5 py-0.5">
                <Text className="font-uiBold text-[9px] uppercase tracking-wide text-brand-primary">Actual</Text>
              </View>
            )}
          </View>
          <View className="mt-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
            <Text className="font-ui text-xs text-neutral-on-surface-variant">{period}</Text>
            {leaveLabel && <Text className="font-ui text-xs text-neutral-on-surface-variant">· {leaveLabel}</Text>}
            {wasLeader && stint.last_role && (
              <View className="flex-row items-center gap-1">
                <AppIcon family="material-community" name="crown-outline" size={12} color="#FABD32" />
                <Text className="font-ui text-xs text-warning-tertiary">{getTeamRoleLabel(stint.last_role)}</Text>
              </View>
            )}
          </View>
        </View>

        <AppIcon family="material-icons" name={expanded ? 'expand-less' : 'expand-more'} size={20} color="#BCCBB9" />
      </View>

      <View className="mt-3 flex-row flex-wrap gap-1.5">
        <StatChip label="PJ Ranking" value={String(total.pj_ranking)} />
        <StatChip label="Amistosos" value={String(total.pj_amistoso)} />
        <StatChip label="Goles" value={String(total.goals)} />
        <StatChip label="MVP" value={String(total.mvps)} />
        <StatChip label="Vallas" value={String(total.clean_sheets)} />
        <StatChip label="V-E-D" value={`${total.wins}-${total.draws}-${total.losses}`} />
      </View>

      {expanded && (
        <View className="mt-3">
          {stint.stats.by_season.length === 0 ? (
            <Text className="font-ui border-t border-neutral-outline/10 pt-2.5 text-xs text-neutral-on-surface-variant">
              Sin partidos registrados en este ciclo.
            </Text>
          ) : (
            stint.stats.by_season.map((season, index) => (
              <SeasonRow key={season.season_id ?? `no-season-${index}`} season={season} />
            ))
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}
