/**
 * Rider authentication — phone OTP (primary) + Google OAuth (secondary),
 * straight against Supabase Auth. Mirrors apps/mobile/src/lib/api.ts's OTP /
 * Google helpers and apps/mobile/src/lib/googleAuth.ts, adapted for the browser
 * (full-page OAuth redirect instead of an in-app browser session).
 *
 * The Express backend never brokers login — it verifies the resulting JWT.
 */
import { supabase } from "@/lib/supabaseClient";
import { apiClient, ApiError } from "@/services/api/httpClient";
import { toE164 } from "../lib/authValidation";

function mapOtpStatus(error: { status?: number }): number {
  return error?.status === 429 ? 429 : 400;
}

/** Ask Supabase to send an SMS OTP. A first-time number becomes an account on verify. */
export async function requestOtp(rawPhone: string): Promise<string> {
  const phone = toE164(rawPhone);
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: true },
  });
  if (error) throw new ApiError(error.message, mapOtpStatus(error), "OTP_REQUEST_FAILED");
  return phone;
}

/** Verify the 6-digit code — on success a Supabase session is established. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: "sms" });
  if (error) throw new ApiError(error.message, 401, "UNAUTHENTICATED");
}

/** Full-page redirect to Google; lands back on /rider/auth/callback. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/rider/auth/callback` },
  });
  if (error) throw new ApiError(error.message, 400, "OAUTH_FAILED");
}

/** Best-effort server revocation, then local sign-out. */
export async function signOut(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } catch {
    // ignore — local sign-out below is what the user sees
  }
  await supabase.auth.signOut();
}
