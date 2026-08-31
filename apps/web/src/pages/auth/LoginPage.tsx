import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Phone, ArrowRight } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { requestOtp, signInWithGoogle } from "@/rider/services/riderAuth";
import { isValidPhone } from "@/rider/lib/authValidation";

interface LoginForm {
  identifier: string;
  password: string;
}

/**
 * Single sign-in surface for all roles. Staff/admin use email or phone +
 * password; riders use phone OTP or Google (same as the mobile app — no
 * second auth system). After a session is established the role is resolved
 * from GET /auth/session and the user is routed to the console (/dashboard)
 * or the rider web app (/rider).
 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Rider (OTP / Google) sub-flow.
  const [riderMode, setRiderMode] = useState<"hidden" | "phone">("hidden");
  const [phone, setPhone] = useState("");
  const [riderBusy, setRiderBusy] = useState<"otp" | "google" | null>(null);
  const [riderError, setRiderError] = useState("");

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
      onError: (err) => {
        if (err instanceof ApiError && err.code === "RIDER_ACCOUNT") {
          navigate("/rider", { replace: true });
          return;
        }
        toastError(err, "Could not sign in");
      },
    });
  };

  const sendOtp = async () => {
    if (riderBusy) return;
    if (!isValidPhone(phone)) {
      setRiderError("Enter a valid mobile number.");
      return;
    }
    setRiderError("");
    setRiderBusy("otp");
    try {
      const e164 = await requestOtp(phone);
      navigate("/login/otp", { state: { phone: e164 } });
    } catch (err) {
      setRiderError(err instanceof ApiError ? err.message : "Could not send the code. Please try again.");
      setRiderBusy(null);
    }
  };

  const continueWithGoogle = async () => {
    if (riderBusy) return;
    setRiderError("");
    setRiderBusy("google");
    try {
      await signInWithGoogle(); // full-page redirect → /rider/auth/callback
    } catch (err) {
      setRiderError(err instanceof ApiError ? err.message : "Google sign-in failed. Please try again.");
      setRiderBusy(null);
    }
  };

  return (
    <Card className="animate-fade-in">
      <CardContent className="p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">Sign in to continue.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email or phone</Label>
            <Input
              id="identifier"
              placeholder="Email or phone"
              {...register("identifier", { required: "Email or phone is required" })}
            />
            {errors.identifier && <p className="text-xs text-destructive">{errors.identifier.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="pr-10"
                {...register("password", { required: "Password is required" })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={rememberMe} onCheckedChange={setRememberMe} />
              Remember me
            </label>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => navigate("/forgot-password")}
            >
              Forgot password?
            </button>
          </div>

          {login.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {(login.error as Error)?.message ?? "Something went wrong."}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending && <Spinner className="h-4 w-4" />}
            Login
          </Button>
        </form>

        {/* Rider sign-in — phone OTP / Google, same as the mobile app. */}
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">Rider sign-in</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {riderMode === "phone" ? (
          <div className="space-y-2">
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Phone"
                className="pl-9"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (riderError) setRiderError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We&apos;ll text you a 6-digit code. Indian numbers can be typed without +91.
            </p>
            <Button className="w-full" onClick={sendOtp} disabled={riderBusy === "otp"}>
              {riderBusy === "otp" ? <Spinner className="h-4 w-4" /> : <>Send code <ArrowRight className="h-4 w-4" /></>}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:underline"
              onClick={() => setRiderMode("hidden")}
            >
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button variant="outline" className="w-full" onClick={() => setRiderMode("phone")}>
              <Phone className="h-4 w-4" /> Sign in with phone
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={continueWithGoogle}
              disabled={riderBusy === "google"}
            >
              {riderBusy === "google" ? <Spinner className="h-4 w-4" /> : "Continue with Google"}
            </Button>
          </div>
        )}
        {riderError && <p className="mt-2 text-center text-xs text-destructive">{riderError}</p>}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          New here?{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => navigate("/signup")}
          >
            Create a staff account
          </button>
        </p>
      </CardContent>
    </Card>
  );
}
