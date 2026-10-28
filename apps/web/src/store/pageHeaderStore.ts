import { create } from "zustand";
import type { ReactNode } from "react";

interface PageHeaderState {
  /** Set by usePageSubtitle() on whichever page is currently mounted; read by Header.tsx. Not persisted — it's route-scoped, not a user preference. */
  subtitle: ReactNode;
  setSubtitle: (subtitle: ReactNode) => void;
  /**
   * True while the mounted page draws its own heading (a record's name, "Revenue
   * Overview"), so the header hides its own title rather than stacking a second
   * one above it. Set by usePageOwnsTitle().
   */
  ownsTitle: boolean;
  setOwnsTitle: (ownsTitle: boolean) => void;
}

export const usePageHeaderStore = create<PageHeaderState>((set) => ({
  subtitle: null,
  setSubtitle: (subtitle) => set({ subtitle }),
  ownsTitle: false,
  setOwnsTitle: (ownsTitle) => set({ ownsTitle }),
}));
