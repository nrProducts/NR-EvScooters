import { useEffect, useState } from "react";
import { AppRoutes } from "@/routes/AppRoutes";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RealtimeProvider } from "@/providers/RealtimeProvider";
import { BrandedLoader } from "@/components/common/BrandedLoader";
import { fetchCurrentSession } from "@/services/api/staff";
import { useRiderAuthStore } from "@/store/riderAuthStore";

export default function App() {
  const theme = useUiStore((s) => s.theme);
  const { user, setUser, logout } = useAuthStore();
  const [checkedSession, setCheckedSession] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Zustand persists `user` in localStorage for a fast reload, but the
  // underlying Supabase session may have since expired or been revoked.
  // Reconcile once on boot so a stale local user never gets a false sense
  // of being signed in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await fetchCurrentSession();
      if (cancelled) return;
      if (current) setUser(current);
      else if (user) logout();
      // Reconcile the rider session too (no-op when there's no Supabase
      // session or the account isn't a rider). Parallel to the staff path
      // above and never touches authStore.
      await useRiderAuthStore.getState().bootstrap();
      if (cancelled) return;
      setCheckedSession(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checkedSession) return <BrandedLoader />;

  return (
    <TooltipProvider delayDuration={200}>
      <RealtimeProvider>
        <AppRoutes />
      </RealtimeProvider>
    </TooltipProvider>
  );
}
