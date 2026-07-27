import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toggleTheme: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileNavOpen: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "light",
      sidebarCollapsed: false,
      mobileNavOpen: false,
      toggleTheme: () => set({ theme: get().theme === "light" ? "dark" : "light" }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
    }),
    { name: "swapngo-ui" },
  ),
);
