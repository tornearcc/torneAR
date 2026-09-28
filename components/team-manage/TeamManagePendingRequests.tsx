import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { TeamJoinRequestRow } from './types';
import { positionLabel } from '@/lib/team-helpers';
import { Avatar } from '@/components/ui/Avatar';
import { resolveAvatarUrl } from '@/lib/supabase-storage';

interface TeamManagePendingRequestsProps {
  requests: TeamJoinRequestRow[];
  processingRequestId: string | null;
  onApprove: (request: TeamJoinRequestRow) => void;
  onReject: (request: TeamJoinRequestRow) => void;
}

export function TeamManagePendingRequests({
  requests,
  processingRequestId,
  onApprove,
  onReject,
}: TeamManagePendingRequestsProps) {
  if (requests.length === 0) {
    return (
      <View className="mt-4 rounded-xl bg-surface-low p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Solicitudes pendientes</Text>
          <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>0</Text>
        </View>
        <EmptyState
          compact
          icon="account-clock-outline"
          title="Sin solicitudes"
          description="Cuando alguien pida sumarse con el código de invitación, la solicitud aparece acá para que la apruebes o la rechaces."
        />
      </View>
    );
  }

  return (
    <View className="mt-4 rounded-xl bg-surface-low p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Solicitudes pendientes</Text>
        <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>{requests.length}</Text>
      </View>

      {requests.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              processing={processingRequestId === request.id}
              onApprove={() => onApprove(request)}
              onReject={() => onReject(request)}
              isWide
            />
          ))}
        </ScrollView>
      ) : (
        <View className="gap-2">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              processing={processingRequestId === request.id}
              onApprove={() => onApprove(request)}
              onReject={() => onReject(request)}
              isWide={false}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function RequestCard({
  request,
  processing,
  onApprove,
  onReject,
  isWide,
}: {
  request: TeamJoinRequestRow;
  processing: boolean;
  onApprove: () => void;
  onReject: () => void;
  isWide: boolean;
}) {
  return (
    <View className={`${isWide ? 'w-[280px]' : ''} rounded-lg bg-surface-high px-3 py-3`}>
      <View className="flex-row items-start gap-3">
        <Avatar
          uri={resolveAvatarUrl(request.profiles?.avatar_url)}
          size={40}
          profileId={request.profile_id}
          name={request.profiles?.full_name ?? request.profiles?.username ?? undefined}
          backgroundClassName="bg-surface-variant"
          expandable
        />
        <View className="flex-1">
          <Text className="font-uiBold text-sm text-neutral-on-surface">
            {request.profiles?.full_name ?? request.profiles?.username ?? 'Jugador'}
          </Text>
          <Text className="font-ui text-xs text-neutral-on-surface-variant">
            @{request.profiles?.username ?? 'sin_usuario'}
          </Text>
        </View>
        <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
          {positionLabel(request.profiles?.preferred_position ?? 'CUALQUIERA')}
        </Text>
      </View>

      <View className="mt-3 flex-row gap-2">
        {processing ? (
          <View className="w-full flex-row items-center justify-center rounded-md bg-surface-variant py-2.5">
            <ActivityIndicator size="small" color="#BCCBB9" />
            <Text className="font-display ml-2 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
              Procesando...
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={onReject}
              activeOpacity={0.9}
              className="flex-1 flex-row items-center justify-center rounded-md border border-neutral-outline-variant/15 py-2.5"
            >
              <AppIcon family="material-community" name="close" size={16} color="#BCCBB9" />
              <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">
                Rechazar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onApprove}
              activeOpacity={0.9}
              className="flex-1 flex-row items-center justify-center rounded-md bg-brand-primary py-2.5"
            >
              <AppIcon family="material-community" name="check" size={16} color="#003914" />
              <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#003914]">
                Aprobar
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
