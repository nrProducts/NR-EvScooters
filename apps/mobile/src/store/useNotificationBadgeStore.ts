import { create } from 'zustand';
import { notificationRepository } from '../services';

interface NotificationBadgeState {
    unreadCount: number;
    /** Re-fetches the unread count from the server. */
    refresh: () => Promise<void>;
    /** Local decrement/reset so the badge and the notifications list can never disagree — see useMyNotifications. */
    decrement: () => void;
    reset: () => void;
}

/**
 * Single source of truth for the header bell badge (AppShell) and the
 * notifications list screen (useMyNotifications), replacing what used to be
 * two independent hook instances with their own local state — which meant
 * marking something read on the list screen never updated the badge until
 * AppShell happened to remount on a fresh navigation.
 */
export const useNotificationBadgeStore = create<NotificationBadgeState>((set, get) => ({
    unreadCount: 0,

    refresh: async () => {
        try {
            const count = await notificationRepository.unreadCount();
            set({ unreadCount: count });
        } catch {
            // Badge failing to load isn't worth surfacing an error for.
        }
    },

    decrement: () => set({ unreadCount: Math.max(0, get().unreadCount - 1) }),
    reset: () => set({ unreadCount: 0 }),
}));
