import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, Mail, Lock, Check } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import { useRiderAuthStore } from "@/store/riderAuthStore";

interface LoginForm {
  identifier: string;
  password: string;
}

/**
 * Single sign-in surface for every role. Staff, admin and rider accounts are
 * all one kind of account now — email + password — and the role is resolved
 * from GET /auth/session after the session is established, routing the user to
 * the console (/dashboard) or the rider web app (/rider).
 *
 * Rider phone-OTP / Google sign-in was removed from the web console; it lives
 * only in the Expo mobile app. A new account self-registers here, lands as
 * pending, and an admin approves it as staff or rider from Users → Awaiting
 * approval.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const riderProfile = useRiderAuthStore((s) => s.profile);
  const riderInitialising = useRiderAuthStore((s) => s.initialising);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ defaultValues: { identifier: "", password: "" } });

  // Already signed in as a rider — skip straight to the rider app.
  useEffect(() => {
    if (!riderInitialising && riderProfile?.role === "rider") navigate("/rider", { replace: true });
  }, [riderInitialising, riderProfile, navigate]);

  const onSubmit = (values: LoginForm) => {
    login.mutate(values, {
      onError: async (err) => {
        if (err instanceof ApiError && err.code === "RIDER_ACCOUNT") {
          // A rider signed in on the console login form. Their Supabase
          // session is live but the rider store bootstrapped at app mount
          // with no session — pull the profile now so RiderProtectedRoute
          // sees profile_completed / consent and routes to profile-setup
          // instead of needing a manual reload.
          await useRiderAuthStore.getState().bootstrap();
          navigate("/rider", { replace: true });
          return;
        }
        toastError(err, "Could not sign in");
      },
    });
  };

  const fieldIcon = "pointer-events-none absolute left-3.5 top-1/2 h-[1.05rem] w-[1.05rem] -translate-y-1/2 text-muted-foreground";

  return (
    <Card className="animate-fade-in border-border/80 shadow-card">
      <CardContent className="p-7 sm:p-9">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to access your Swapngo dashboard.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="identifier">Email address</Label>
            <div className="relative">
              <Mail className={fieldIcon} />
              <Input
                id="identifier"
                autoComplete="username"
                placeholder="Enter your email address"
                className={cn("h-12 rounded-[0.7rem] pl-10", errors.identifier && "border-destructive focus-visible:ring-destructive")}
                {...register("identifier", { required: "Email address is required" })}
              />
            </div>
            {errors.identifier && <p className="text-xs font-medium text-destructive">{errors.identifier.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className={fieldIcon} />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                className={cn("h-12 rounded-[0.7rem] pl-10 pr-10", errors.password && "border-destructive focus-visible:ring-destructive")}
                {...register("password", { required: "Password is required" })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-smooth hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="h-[1.05rem] w-[1.05rem]" /> : <Eye className="h-[1.05rem] w-[1.05rem]" />}
              </button>
            </div>
            {errors.password && <p className="text-xs font-medium text-destructive">{errors.password.message}</p>}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-foreground">
              <button
                type="button"
                role="checkbox"
                aria-checked={rememberMe}
                onClick={() => setRememberMe((v) => !v)}
                className={cn(
                  "flex h-[1.15rem] w-[1.15rem] shrink-0 items-center justify-center rounded-[0.35rem] border transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  rememberMe ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                )}
              >
                {rememberMe && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
              Remember me
            </label>
            <button
              type="button"
              className="text-sm font-semibold text-primary transition-smooth hover:text-primary-hover"
              onClick={() => navigate("/forgot-password")}
            >
              Forgot password?
            </button>
          </div>

          {login.isError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive">
              {(login.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <Button type="submit" className="h-12 w-full rounded-[0.7rem] text-[0.9rem] font-semibold" disabled={login.isPending}>
            {login.isPending ? (
              <>
                <Spinner className="h-4 w-4" /> Signing in…
              </>
            ) : (
              <>
                Sign in <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-7 border-t border-border pt-5 text-center text-xs text-muted-foreground">
          New here?{" "}
          <button
            type="button"
            className="font-semibold text-primary transition-smooth hover:text-primary-hover"
            onClick={() => navigate("/signup")}
          >
            Create an account
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
