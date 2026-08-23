import { create } from 'zustand';

export interface NotificationToastItem {
    id: string;
    title: string;
    body: string;
    /** Route to open on tap, e.g. "kyc" — same field the push payload's tap-handler already reads. */
    screen?: string;
}

interface NotificationToastState {
    current: NotificationToastItem | null;
    queue: NotificationToastItem[];
    enqueue: (item: NotificationToastItem) => void;
    dismissCurrent: () => void;
}

/**
 * A genuine FIFO queue, unlike useDialogStore's replace-semantics — a
 * notification landing while another is showing must not be dropped, so each
 * waits its turn instead of clobbering or overlapping the one on screen.
 */
export const useNotificationToastStore = create<NotificationToastState>((set, get) => ({
    current: null,
    queue: [],

    enqueue: (item) => {
        console.log('[push] popup displayed:', item.title);
        const { current, queue } = get();
        if (!current) {
            set({ current: item });
        } else {
            set({ queue: [...queue, item] });
        }
    },

    dismissCurrent: () => {
        const [next, ...rest] = get().queue;
        set({ current: next ?? null, queue: rest });
    },
}));
