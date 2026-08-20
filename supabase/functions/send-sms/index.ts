// =========================================================================
// send-sms  —  Supabase "Send SMS" Auth Hook  →  MSG91
//
// Supabase Auth generates and verifies the OTP itself; it calls this function
// only to DELIVER the code. That keeps OTP generation, expiry, rate limiting
// and session/refresh-token issuance native to Supabase (best practice), with
// MSG91 as nothing more than the delivery channel.
//
// Request (signed with the standard-webhooks scheme using SEND_SMS_HOOK_SECRET):
//   { "user": { "id": "...", "phone": "919876543210" }, "sms": { "otp": "123456" } }
// Response:
//   200 {}                              on success
//   non-2xx { "error": { "message" } }  on failure (Supabase surfaces this)
//
// NOTE: the MSG91 request/response logic here is intentionally kept in sync
// with apps/backend/src/modules/auth/msg91.ts (which has the unit tests).
// If you change one, change the other.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// `auth_otp_attempts` is gone, so the per-send row this used to write has
// nowhere to go and the Supabase client is no longer needed here at all.
//
// That table stored a rider's phone number against every login attempt, and
// Supabase Auth already owns OTP generation, expiry and rate limiting — the
// row was a second copy of a decision made elsewhere, with a 30-day
// retention policy attached to it. Delivery failures are still visible: they
// are logged below (status and provider type only, never the number) and
// surfaced to Supabase Auth in the response.
// =========================================================================

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const HOOK_SECRET = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";
const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY") ?? "";
const MSG91_OTP_TEMPLATE_ID = Deno.env.get("MSG91_OTP_TEMPLATE_ID") ?? "";
const MSG91_SENDER_ID = Deno.env.get("MSG91_SENDER_ID") ?? "";
const MSG91_OTP_VAR = Deno.env.get("MSG91_OTP_VAR") ?? "otp";
const MSG91_BASE_URL = Deno.env.get("MSG91_BASE_URL") ?? "https://control.msg91.com";

interface HookPayload {
    user: { id?: string; phone?: string };
    sms: { otp: string };
}

/** MSG91 wants country-code + number with no "+" or separators. */
function toMsg91Mobile(phone: string): string {
    return (phone ?? "").replace(/[^\d]/g, "");
}

/** Build the MSG91 Flow API v5 request body. Pure — unit tested on the backend. */
function buildFlowRequest(phone: string, otp: string) {
    const recipient: Record<string, string> = { mobiles: toMsg91Mobile(phone) };
    recipient[MSG91_OTP_VAR] = otp;
    const body: Record<string, unknown> = {
        template_id: MSG91_OTP_TEMPLATE_ID,
        short_url: "0",
        recipients: [recipient],
    };
    if (MSG91_SENDER_ID) body.sender = MSG91_SENDER_ID;
    return body;
}

/** MSG91 returns { type: "success" | "error", message }. Success even on 200. */
function isMsg91Success(status: number, json: unknown): boolean {
    if (status < 200 || status >= 300) return false;
    const type = (json as { type?: string } | null)?.type;
    return type === undefined || type === "success";
}

Deno.serve(async (req) => {
    let payload: string;
    try {
        payload = await req.text();

        // Verify the request truly came from Supabase Auth.
        if (HOOK_SECRET) {
            const wh = new Webhook(HOOK_SECRET.replace("v1,whsec_", ""));
            const headers = Object.fromEntries(req.headers);
            wh.verify(payload, headers);
        }
    } catch (err) {
        console.error("[send-sms] signature verification failed", err);
        return json({ error: { message: "Invalid webhook signature." } }, 401);
    }

    let data: HookPayload;
    try {
        data = JSON.parse(payload) as HookPayload;
    } catch {
        return json({ error: { message: "Malformed hook payload." } }, 400);
    }

    const phone = data.user?.phone ?? "";
    const otp = data.sms?.otp ?? "";
    if (!phone || !otp) {
        return json({ error: { message: "Missing phone or otp in payload." } }, 400);
    }

    if (!MSG91_AUTH_KEY || !MSG91_OTP_TEMPLATE_ID) {
        console.error("[send-sms] MSG91 not configured");
        return json({ error: { message: "SMS provider is not configured." } }, 500);
    }

    try {
        const res = await fetch(`${MSG91_BASE_URL}/api/v5/flow/`, {
            method: "POST",
            headers: {
                authkey: MSG91_AUTH_KEY,
                "content-type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify(buildFlowRequest(phone, otp)),
        });

        const body = await res.json().catch(() => null);
        const ok = isMsg91Success(res.status, body);

        if (!ok) {
            // DPDPA: never log the raw MSG91 body. It echoes the recipient
            // mobile number back on failure, which would put a rider's phone
            // into the Edge Function log drain — a store we neither control
            // the retention of nor can purge on an erasure request. Only the
            // provider's own status/type fields are safe to keep.
            console.error("[send-sms] MSG91 rejected the send", {
                status: res.status,
                msg91_type: (body as { type?: string } | null)?.type ?? null,
            });
            return json({ error: { message: "Could not deliver the verification code." } }, 502);
        }
        return json({}, 200);
    } catch (err) {
        // Message only — a thrown Error can carry the request in `cause`, and
        // the request body contains the mobile number and the OTP.
        console.error("[send-sms] MSG91 request threw", (err as Error)?.message ?? "unknown");
        return json({ error: { message: "SMS delivery failed. Please try again." } }, 502);
    }
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
