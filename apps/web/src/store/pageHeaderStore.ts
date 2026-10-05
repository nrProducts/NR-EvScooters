import { create } from "zustand";
import type { ReactNode } from "react";

interface PageHeaderState {
  /** Set by usePageSubtitle() on whichever page is currently mounted; read by Header.tsx. Not persisted — it's route-scoped, not a user preference. */
  subtitle: ReactNode;
  setSubtitle: (subtitle: ReactNode) => void;
}

export const usePageHeaderStore = create<PageHeaderState>((set) => ({
  subtitle: null,
  setSubtitle: (subtitle) => set({ subtitle }),
}));
