import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/common/Spinner";
import { ApiError } from "@/services/api/httpClient";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { requestOtp, verifyOtp } from "@/rider/services/riderAuth";
import { formatPhoneForDisplay, isValidOtp, sanitizeOtpInput } from "@/rider/lib/authValidation";

const RESEND_SECONDS = 30;

/** Rider phone-OTP verification. Reached from the shared /login page after
 *  "Send code"; on success the role is confirmed and the rider is routed to
 *  the rider web app. Rendered inside AuthLayout. */
export default function RiderOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = (location.state as { phone?: string } | null)?.phone ?? "";
  const bootstrap = useRiderAuthStore((s) => s.bootstrap);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (!phone) navigate("/login", { replace: true });
  }, [phone, navigate]);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async (value = code) => {
    if (verifying) return;
    if (!isValidOtp(value)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError("");
    setVerifying(true);
    try {
      await verifyOtp(phone, value);
      await bootstrap();
      const profile = useRiderAuthStore.getState().profile;
      navigate(profile?.role === "rider" ? "/rider" : "/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify the code. Please try again.");
      setCode("");
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (secondsLeft > 0) return;
    setError("");
    try {
      await requestOtp(phone);
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend the code.");
    }
  };

  return (
    <Card className="animate-fade-in">
      <CardContent className="p-6 sm:p-8">
        <button
          onClick={() => navigate("/login")}
          className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg border border-border"
          aria-label="Back to sign in"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Enter verification code</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          Sent to {phone ? formatPhoneForDisplay(phone) : "your number"}.
        </p>

        <Input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="Verification code"
          className="h-12 text-center text-xl font-bold tracking-[0.4em]"
          value={code}
          onChange={(e) => {
            const next = sanitizeOtpInput(e.target.value);
            setCode(next);
            if (error) setError("");
            if (next.length === 6) submit(next);
          }}
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <Button className="mt-5 w-full" onClick={() => submit()} disabled={verifying}>
          {verifying ? <Spinner className="h-4 w-4" /> : "Verify"}
        </Button>

        <div className="mt-5 text-center text-xs text-muted-foreground">
          {secondsLeft > 0 ? (
            <span>Resend code in {secondsLeft}s</span>
          ) : (
            <button onClick={resend} className="font-medium text-primary hover:underline">
              Resend code
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
