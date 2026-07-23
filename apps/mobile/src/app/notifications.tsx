import React from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, Check } from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { useMyNotifications } from '../hooks/useNotifications';
import { COLORS } from '../constants/theme';
import { formatDate } from '../constants/status';
import type { ApiNotification } from '../types/api';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, unreadCount, loading, refreshing, error, refresh, retry, markRead, markAllRead } =
    useMyNotifications();

  const openNotification = async (n: ApiNotification) => {
    if (!n.read_at) await markRead(n.id);
    if (n.payload?.screen) router.push(`/${n.payload.screen}` as never);
  };

  return (
    <AppShell title="Notifications">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error.message} onRetry={retry} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            unreadCount > 0 ? (
              <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider">
                  {unreadCount} unread
                </Text>
                <TouchableOpacity onPress={() => void markAllRead()} accessibilityRole="button">
                  <Text style={{ color: COLORS.primary }} className="text-xs font-bold">Mark all read</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState icon={Bell} title="No notifications yet" subtitle="We'll let you know when something needs your attention." />
          }
          renderItem={({ item }) => {
            const unread = !item.read_at;
            return (
              <TouchableOpacity
                onPress={() => void openNotification(item)}
                accessibilityRole="button"
                className="flex-row items-start px-5 py-4 border-b mx-4 rounded-2xl mb-2"
                style={{ backgroundColor: unread ? COLORS.primary + '0A' : COLORS.card, borderColor: COLORS.border }}
              >
                <View
                  className="w-9 h-9 rounded-xl items-center justify-center mr-3 mt-0.5"
                  style={{ backgroundColor: unread ? COLORS.primary + '1A' : COLORS.background }}
                >
                  {unread ? <Bell size={16} color={COLORS.primary} /> : <Check size={16} color={COLORS.textSecondary} />}
                </View>
                <View className="flex-1">
                  <Text
                    style={{ color: COLORS.textPrimary }}
                    className={`text-sm ${unread ? 'font-extrabold' : 'font-semibold'}`}
                  >
                    {item.payload?.title ?? 'Notification'}
                  </Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-1 leading-relaxed">
                    {item.payload?.body ?? ''}
                  </Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold mt-2">
                    {formatDate(item.created_at)}
                  </Text>
                </View>
                {item.payload?.screen ? <ChevronRight size={16} color={COLORS.textSecondary} /> : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </AppShell>
  );
}
