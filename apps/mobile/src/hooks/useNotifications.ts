import { useCallback, useEffect, useState } from 'react';
import { notificationRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type { ApiNotification } from '../types/api';

const asApiError = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', fallback);

/** The signed-in rider's notification history plus unread count. */
export function useMyNotifications() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        notificationRepository.list({ pageSize: 50 }),
        notificationRepository.unreadCount(),
      ]);
      setNotifications(list.data);
      setUnreadCount(count);
    } catch (err) {
      setError(asApiError(err, 'Could not load your notifications.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    try {
      const updated = await notificationRepository.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      return updated;
    } catch (err) {
      return asApiError(err, 'Could not mark this as read.');
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await notificationRepository.markAllRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
      setUnreadCount(0);
      return null;
    } catch (err) {
      return asApiError(err, 'Could not mark all as read.');
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    refreshing,
    error,
    refresh: () => load('refresh'),
    retry: () => load('initial'),
    markRead,
    markAllRead,
  };
}

/** Lightweight — just the badge count, for AppShell's bell icon. */
export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await notificationRepository.unreadCount());
    } catch {
      // Badge failing to load isn't worth surfacing an error for.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { count, refresh };
}
