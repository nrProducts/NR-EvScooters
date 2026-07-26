import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { ChevronLeft, LifeBuoy, User, Phone } from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonList } from '../components/ui/Skeleton';
import { useAuthStore } from '../store/useAuthStore';
import { supportRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import {
  SUPPORT_PRIORITY_LABEL, SUPPORT_PRIORITY_TONE, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_TONE,
  formatDate,
} from '../constants/status';
import { COLORS } from '../constants/theme';
import type { ApiSupportQueueItem, SupportStatus } from '../types/api';

const STATUS_FILTERS: Array<{ key: SupportStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

const ALL_STATUSES: SupportStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export default function SupportReviewScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [filter, setFilter] = useState<SupportStatus | 'all'>('open');
  const [queue, setQueue] = useState<ApiSupportQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiSupportQueueItem | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    supportRepository
      .queue({ page: 1, pageSize: 50, status: filter === 'all' ? undefined : filter })
      .then((res) => setQueue(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load support requests.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const applyUpdate = async (id: string, patch: { status?: SupportStatus; assigned_to?: string }) => {
    setUpdating(true);
    try {
      const updated = await supportRepository.update(id, patch);
      setSelected(updated);
      load();
    } catch (err) {
      Alert.alert('Could not update', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const confirmStatusChange = (item: ApiSupportQueueItem, status: SupportStatus) => {
    if (status === item.status) return;
    Alert.alert(
      `Mark as ${SUPPORT_STATUS_LABEL[status]}?`,
      `"${item.subject}" will be marked ${SUPPORT_STATUS_LABEL[status].toLowerCase()}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => applyUpdate(item.id, { status }) },
      ],
    );
  };

  if (selected) {
    return (
      <AppShell title="Support Request">
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setSelected(null)} className="flex-row items-center mb-4">
            <ChevronLeft size={18} color={COLORS.textPrimary} />
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-1">Back to queue</Text>
          </TouchableOpacity>

          <View className="rounded-2xl p-4 border mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="flex-row items-center justify-between mb-3">
              <Badge label={SUPPORT_STATUS_LABEL[selected.status]} tone={SUPPORT_STATUS_TONE[selected.status]} />
              <Badge label={SUPPORT_PRIORITY_LABEL[selected.priority]} tone={SUPPORT_PRIORITY_TONE[selected.priority]} />
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-base font-black mb-1">{selected.subject}</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-4">{formatDate(selected.created_at)}</Text>
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-medium leading-relaxed">{selected.description}</Text>
          </View>

          <View className="rounded-2xl p-4 border mb-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="flex-row items-center mb-2">
              <User size={14} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">{selected.rider.full_name}</Text>
            </View>
            {selected.rider.phone ? (
              <View className="flex-row items-center">
                <Phone size={14} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-2">{selected.rider.phone}</Text>
              </View>
            ) : null}
            {selected.vehicle_id ? (
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2">
                Linked to an active ride at the time this was raised.
              </Text>
            ) : null}
          </View>

          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Update Status</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {ALL_STATUSES.map((status) => {
              const active = status === selected.status;
              return (
                <TouchableOpacity
                  key={status}
                  disabled={updating || active}
                  onPress={() => confirmStatusChange(selected, status)}
                  className="px-3.5 py-2.5 rounded-xl border"
                  style={{
                    backgroundColor: active ? COLORS.primary : COLORS.card,
                    borderColor: active ? COLORS.primary : COLORS.border,
                    opacity: updating ? 0.6 : 1,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: active ? '#FFF' : COLORS.textPrimary }}
                  >
                    {SUPPORT_STATUS_LABEL[status]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!selected.assigned_to || selected.assigned_to !== profile?.id ? (
            <TouchableOpacity
              disabled={updating}
              onPress={() => applyUpdate(selected.id, { assigned_to: profile!.id })}
              className="rounded-xl py-3.5 items-center"
              style={{ backgroundColor: COLORS.secondary + '30', opacity: updating ? 0.6 : 1 }}
            >
              <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-bold">Assign to Me</Text>
            </TouchableOpacity>
          ) : (
            <View className="rounded-xl py-3.5 items-center" style={{ backgroundColor: COLORS.background }}>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold">Assigned to you</Text>
            </View>
          )}

          {updating ? <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 12 }} /> : null}
        </ScrollView>
      </AppShell>
    );
  }

  return (
    <AppShell title="Support Requests">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 pt-4" contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {STATUS_FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              className="px-4 py-2 rounded-xl border"
              style={{ backgroundColor: active ? COLORS.primary : COLORS.card, borderColor: active ? COLORS.primary : COLORS.border }}
            >
              <Text className="text-xs font-bold" style={{ color: active ? '#FFF' : COLORS.textPrimary }}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View className="px-5 pt-2"><SkeletonList count={4} /></View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : queue.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No requests" subtitle="No support requests match this filter." />
      ) : (
        <ScrollView className="flex-1 px-5 pt-2" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="gap-3">
            {queue.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setSelected(item)}
                className="rounded-2xl p-4 border"
                style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold flex-1 mr-2" numberOfLines={1}>
                    {item.subject}
                  </Text>
                  <Badge label={SUPPORT_PRIORITY_LABEL[item.priority]} tone={SUPPORT_PRIORITY_TONE[item.priority]} />
                </View>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-2" numberOfLines={1}>
                  {item.rider.full_name}
                </Text>
                <View className="flex-row items-center justify-between">
                  <Badge label={SUPPORT_STATUS_LABEL[item.status]} tone={SUPPORT_STATUS_TONE[item.status]} />
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">{formatDate(item.created_at)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </AppShell>
  );
}
