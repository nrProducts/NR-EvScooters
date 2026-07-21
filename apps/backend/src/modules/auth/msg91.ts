// =========================================================================
// MSG91 client (Flow API v5).
//
// This is the canonical, unit-tested MSG91 integration. At runtime the login
// OTP is delivered by the send-sms Edge Function (Supabase invokes it as the
// Send SMS hook); this module powers the admin "test send" diagnostic and is
// the reference implementation that function mirrors.
//
// Everything here is pure and takes its `fetch` by injection, so it can be
// exercised without a network or real credentials.
// =========================================================================

export interface Msg91Config {
    authKey: string;
    templateId: string;
    senderId?: string;
    /** Name of the OTP variable in the DLT/Flow template. */
    otpVar?: string;
    baseUrl?: string;
}

export interface Msg91SendInput {
    phone: string;
    otp: string;
}

export interface Msg91Result {
    ok: boolean;
    status: number;
    /** Provider request id / message on success, or the error text. */
    providerMessage: string | null;
}

type FetchLike = (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}) => Promise<{ status: number; json: () => Promise<unknown> }>;

const DEFAULT_BASE_URL = "https://control.msg91.com";

/** MSG91 wants country-code + number, digits only (no "+" or separators). */
export function toMsg91Mobile(phone: string): string {
    return (phone ?? "").replace(/[^\d]/g, "");
}

/** Build the MSG91 Flow API v5 request body. Pure. */
export function buildFlowRequest(cfg: Msg91Config, input: Msg91SendInput): Record<string, unknown> {
    const otpVar = cfg.otpVar || "otp";
    const recipient: Record<string, string> = { mobiles: toMsg91Mobile(input.phone) };
    recipient[otpVar] = input.otp;

    const body: Record<string, unknown> = {
        template_id: cfg.templateId,
        short_url: "0",
        recipients: [recipient],
    };
    if (cfg.senderId) body.sender = cfg.senderId;
    return body;
}

/**
 * MSG91 returns HTTP 200 with { type: "success" | "error", message }. Treat a
 * missing `type` on a 2xx as success (some endpoints omit it), anything else
 * as failure.
 */
export function interpretResponse(status: number, json: unknown): Msg91Result {
    const message = extractMessage(json);
    if (status < 200 || status >= 300) return { ok: false, status, providerMessage: message };
    const type = (json as { type?: string } | null)?.type;
    const ok = type === undefined || type === "success";
    return { ok, status, providerMessage: message };
}

function extractMessage(json: unknown): string | null {
    if (json && typeof json === "object" && "message" in json) {
        const m = (json as { message?: unknown }).message;
        return typeof m === "string" ? m : m == null ? null : String(m);
    }
    return null;
}

/**
 * Sends an OTP-style SMS via MSG91. `fetchImpl` defaults to global fetch but
 * is injectable for tests.
 */
export async function sendOtpSms(
    cfg: Msg91Config,
    input: Msg91SendInput,
    fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<Msg91Result> {
    if (!cfg.authKey || !cfg.templateId) {
        throw new Error("MSG91 is not configured (authKey and templateId are required).");
    }

    const url = `${(cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/api/v5/flow/`;
    const res = await fetchImpl(url, {
        method: "POST",
        headers: {
            authkey: cfg.authKey,
            "content-type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify(buildFlowRequest(cfg, input)),
    });

    const json = await res.json().catch(() => null);
    return interpretResponse(res.status, json);
}

/** Generates a numeric OTP of the given length (used only by the test-send). */
export function generateNumericOtp(length = 6): string {
    let out = "";
    for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 10).toString();
    return out;
}
