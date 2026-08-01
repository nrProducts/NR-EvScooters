import { create } from "zustand";

export type ToastTone = "success" | "warning" | "error" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message: string;
  onClick?: () => void;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 5000;

/** Ephemeral by design — no persist middleware, toasts don't survive a reload. */
export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { ...toast, id }] });
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
