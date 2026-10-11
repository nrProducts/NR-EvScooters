import { createHmac } from "node:crypto";
import { env } from "../../config/env";

/**
 * A durable, one-way fingerprint of a real person — not an account row — so
 * "one redemption per person, ever" survives deleting and recreating the
 * account. `referral_identity_marks` (see supabase/migrations/
 * 20261011100000_referral_identity_marks.sql) is deliberately NOT touched by
 * anonymise_user(): the whole point is that it outlives the erasure that
 * scrubs everything else, the same way financial records already do for a
 * documented legal-obligation reason.
 *
 * Phone, not the KYC document number: every account has a phone (OTP sets it
 * directly; Google sign-up collects it at profile-setup), while a document
 * number is only available once a rider reaches the Aadhaar/licence step —
 * and the infrastructure to hash a document number safely
 * (fieldCrypto.ts's blindIndex) is built but not yet wired into the live KYC
 * upload path, so using it here would quietly depend on something not
 * actually running. This is weaker in a multi-SIM market (a recycled or
 * second number is a real gap) but needs no new live-identity-path changes.
 */

const FALLBACK_PEPPER = "swapngo-referral-identity-unconfigured-pepper-do-not-use-in-production";
let warnedUnconfigured = false;

function pepper(): string {
    if (env.referralIdentityPepper) return env.referralIdentityPepper;
    // Degrades rather than throws — unlike kycEncryptionKey/kycHmacPepper,
    // failing referral redemption outright because an operational pepper is
    // unset would be a worse outcome than a weaker (but working) dedup. Loud
    // exactly once per process, so it is visible in logs without spamming them.
    if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        console.warn(
            "[referrals] REFERRAL_IDENTITY_PEPPER is not set — falling back to a " +
                "built-in value. Phone-based referral dedup still works, but a leaked " +
                "referral_identity_marks table could then be brute-forced back to real " +
                "phone numbers (the space of valid Indian numbers is small enough to " +
                "enumerate). Set a real one with: openssl rand -base64 32",
        );
    }
    return FALLBACK_PEPPER;
}

/**
 * Collapses to the bare 10-digit subscriber number.
 *
 * `users.phone` is not uniformly E.164 across this table — OTP sign-ups
 * store "+91XXXXXXXXXX", older rows a bare 10-digit number (same drift
 * `normalizeCheckoutContact` in the mobile app works around for Razorpay
 * prefill) — so "+919600999046" and "9600999046" must hash identically or
 * the same real number silently evades the dedup check depending on which
 * form happened to be on file. Taking the last 10 digits does that without
 * needing full E.164 validation, which this is not: it is a fingerprint
 * input, not a deliverability check.
 */
function canonicalPhone(phone: string): string {
    return phone.replace(/\D/g, "").slice(-10);
}

/** Deterministic: the same real phone, however it was typed or stored, always produces the same hash. */
export function phoneIdentityHash(phone: string): string {
    return createHmac("sha256", pepper()).update(canonicalPhone(phone), "utf8").digest("hex");
}
