import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BrandedLoader } from "@/components/common/BrandedLoader";
import { supabase } from "@/lib/supabaseClient";
import { useRiderAuthStore } from "@/store/riderAuthStore";

/**
 * Landing page for the Google OAuth redirect. The web supabase client parses
 * the session from the URL automatically (detectSessionInUrl); we just wait
 * for it, hydrate the rider store, and route on.
 */
export default function RiderAuthCallback() {
  const navigate = useNavigate();
  const bootstrap = useRiderAuthStore((s) => s.bootstrap);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      // Give supabase-js a tick to consume the URL hash, then confirm.
      for (let i = 0; i < 20; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      await bootstrap();
      const profile = useRiderAuthStore.getState().profile;
      navigate(profile?.role === "rider" ? "/rider" : "/login", { replace: true });
    })();
  }, [bootstrap, navigate]);

  return <BrandedLoader />;
}
