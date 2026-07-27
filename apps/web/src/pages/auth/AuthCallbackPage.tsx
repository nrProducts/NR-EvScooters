import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store/authStore";
import { completeGoogleLogin } from "@/services/api/staff";
import { ApiError } from "@/services/api/httpClient";

/**
 * Landing point for Supabase's Google OAuth redirect. supabase-js's
 * detectSessionInUrl (on by default in the browser) exchanges the ?code=
 * param for a session as soon as the client initializes on this page — we
 * just wait for that via onAuthStateChange, then resolve the caller's role
 * the same way password login does.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error_description") || params.get("error");
    if (oauthError) {
      setError(oauthError);
      return;
    }

    const finish = async () => {
      if (settled.current) return;
      settled.current = true;
      try {
        const user = await completeGoogleLogin();
        setUser(user);
        navigate("/dashboard", { replace: true });
      } catch (err) {
        settled.current = false;
        setError(err instanceof ApiError ? err.message : "Google sign-in failed. Please try again.");
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) void finish();
      else if (event === "SIGNED_OUT") setError("Google sign-in did not complete.");
    });

    // Covers the case where the session was already established by the time
    // this effect runs (onAuthStateChange only fires on subsequent changes).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void finish();
    });

    return () => subscription.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <Card className="animate-fade-in">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => navigate("/login", { replace: true })}
          >
            Back to login
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <CardContent className="flex flex-col items-center gap-3 p-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Finishing sign-in...</p>
      </CardContent>
    </Card>
  );
}
