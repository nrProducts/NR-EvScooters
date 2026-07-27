import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StaffUser } from "@/types";

interface AuthState {
  user: StaffUser | null;
  setUser: (user: StaffUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: "swapngo-auth" },
  ),
);
