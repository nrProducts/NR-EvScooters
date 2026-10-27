import { env } from "../../config/env";

/**
 * Minimal Intellicar client — READ-ONLY. It can fetch a token and ask for
 * distance; nothing here can lock, immobilise or otherwise command a vehicle.
 *
 * Limits (Intellicar): ≤3 calls/second with ≥400 ms between calls; 24 history
 * calls per vehicle per day. Callers must cache what they fetch (see
 * distance.service.ts).
 */

interface Envelope<T> { status?: string; data?: T; err?: unknown; msg?: string }

export const intellicarConfigured = (): boolean =>
    !!env.intellicarUsername && !!env.intellicarPassword;

let cached: { token: string; expiresAt: number } | null = null;
/** The platform's token lasts ~15 days; renew well before that. */
const TOKEN_TTL_MS = 10 * 24 * 3_600_000;

async function post<T>(path: string, body: Record<string, unknown>): Promise<Envelope<T>> {
    const res = await fetch(`${env.intellicarBaseUrl.replace(/\/$/, "")}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) throw new Error("Tracking platform rate limit reached — try again later.");
    if (res.status === 401) {
        cached = null;
        throw new Error("Tracking platform rejected the login.");
    }
    if (!res.ok && res.status !== 400) throw new Error(`Tracking platform returned HTTP ${res.status}.`);
    return (await res.json()) as Envelope<T>;
}

async function token(): Promise<string> {
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const res = await post<{ token?: string }>("gettoken", {
        username: env.intellicarUsername,
        password: env.intellicarPassword,
    });
    if (res.status !== "SUCCESS" || !res.data?.token) {
        throw new Error("Tracking platform login failed.");
    }
    cached = { token: res.data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return cached.token;
}

export interface DistanceResult {
    distance: number | null;
    startOdo: number | null;
    endOdo: number | null;
}

const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Distance a vehicle travelled between two instants (epoch ms). */
export async function getDistanceTravelled(
    vehicleNo: string,
    startMs: number,
    endMs: number,
): Promise<DistanceResult> {
    const res = await post<{ distance?: unknown; startodo?: unknown; endodo?: unknown }>("getdistancetravelled", {
        token: await token(),
        vehicleno: vehicleNo,
        starttime: startMs,
        endtime: endMs,
    });
    if (res.status !== "SUCCESS" || !res.data) {
        throw new Error(res.msg ? `Tracking platform: ${res.msg}` : "Tracking platform returned no distance.");
    }
    return {
        distance: num(res.data.distance),
        startOdo: num(res.data.startodo),
        endOdo: num(res.data.endodo),
    };
}

export type ControlMode = "ignition" | "crank" | "movement" | "can" | "charge" | "discharge" | "chargendischarge";

/**
 * Immobilise or mobilise a vehicle. This ACTS on a physical scooter — only
 * control.service.ts may call it, behind an admin check, a stated reason and
 * an audit row. The platform's optional `immediate` flag is deliberately
 * never sent, so its default applies; confirm on a test scooter how a
 * command behaves while the scooter is moving before relying on it.
 */
export async function sendControlCommand(
    action: "immobilise" | "mobilise",
    vehicleNo: string,
    mode: ControlMode,
): Promise<{ cmdId: string | null }> {
    const res = await post<{ cmdId?: unknown }>(action === "immobilise" ? "immobilize" : "mobilize", {
        token: await token(),
        vehicleno: vehicleNo,
        type: mode,
    });
    if (res.status !== "SUCCESS") {
        throw new Error(res.msg ? `Tracking platform: ${res.msg}` : "Tracking platform rejected the command.");
    }
    const id = res.data?.cmdId;
    return { cmdId: id === undefined || id === null ? null : String(id) };
}
