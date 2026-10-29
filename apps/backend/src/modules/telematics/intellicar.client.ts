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

async function post<T>(path: string, body: Record<string, unknown>, timeoutMs = 15_000, retried = false): Promise<Envelope<T>> {
    const res = await fetch(`${env.intellicarBaseUrl.replace(/\/$/, "")}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429) throw new Error("Tracking platform rate limit reached — try again later.");
    if (res.status === 401) {
        // Intellicar uses 401 for two different things: a dead token ("Failed to
        // authenticate the token") and an account that may not act on that
        // vehicle / endpoint ("Permission failure"). Only the first is cured by
        // logging in again, so say which one it was.
        const msg = ((await res.json().catch(() => ({}))) as Envelope<unknown>).msg ?? "";
        if (/authenticate the token/i.test(msg)) {
            cached = null;
            // The edge sync jobs log in on the same account, so a cached token
            // can go stale. A 401 means nothing was executed, so retrying once
            // with a fresh token is safe even for mobilise / immobilise.
            if (!retried && "token" in body) {
                return post<T>(path, { ...body, token: await token() }, timeoutMs, true);
            }
            throw new Error("Tracking platform rejected the login.");
        }
        throw new Error(msg ? `Tracking platform: ${msg}` : "Tracking platform rejected the request.");
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

const normKey = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

let listCache: { at: number; byNorm: Map<string, string> } | null = null;
const LIST_TTL_MS = 10 * 60_000;

/**
 * Intellicar names a vehicle by whatever it was registered under on their
 * side. For Swapngo that is the VIN / chassis number (e.g. MD92N41SKDH639243),
 * NOT the number plate — sending the plate gets "not found". The account's own
 * list is the source of truth, so a vehicle is matched against it by VIN first
 * and plate second, and the EXACT string Intellicar uses is what gets sent.
 * Returns null when the vehicle is not on the account at all.
 */
export async function resolveVehicleNo(vin: string | null, registration: string | null): Promise<string | null> {
    if (!listCache || Date.now() - listCache.at > LIST_TTL_MS) {
        const res = await post<{ vehicleno?: string }[]>("listvehicles", { token: await token() });
        if (res.status !== "SUCCESS" || !Array.isArray(res.data)) {
            throw new Error(res.msg ? `Tracking platform: ${res.msg}` : "Could not read the tracking vehicle list.");
        }
        const byNorm = new Map<string, string>();
        for (const row of res.data) if (row?.vehicleno) byNorm.set(normKey(row.vehicleno), row.vehicleno);
        listCache = { at: Date.now(), byNorm };
    }
    for (const candidate of [vin, registration]) {
        if (!candidate) continue;
        const hit = listCache.byNorm.get(normKey(candidate));
        if (hit) return hit;
    }
    return null;
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

/**
 * A vehicle's GPS history between two instants (epoch ms) — only the three
 * fields the daily-activity calculation needs. A day of history is ~1,500-2,500
 * readings, so a week is a large response: it gets a long timeout, and it must
 * be called sparingly (it counts toward the 24 history calls per bike per day).
 */
export async function getGpsHistory(
    vehicleNo: string,
    startMs: number,
    endMs: number,
): Promise<{ commtime: number; speed: number | null; ignstatus: number | string | null }[]> {
    const res = await post<Record<string, unknown>[]>("getgpshistory", {
        token: await token(),
        vehicleno: vehicleNo,
        starttime: startMs,
        endtime: endMs,
    }, 90_000);
    if (res.status !== "SUCCESS" || !Array.isArray(res.data)) {
        throw new Error(res.msg ? `Tracking platform: ${res.msg}` : "Tracking platform returned no history.");
    }
    return res.data
        .map((r) => ({
            commtime: Number(r.commtime),
            speed: num(r.speed),
            ignstatus: (r.ignstatus as number | string | null | undefined) ?? null,
        }))
        .filter((r) => Number.isFinite(r.commtime));
}

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

/**
 * Lock or unlock a vehicle through the platform's bulk endpoint, sent for ONE
 * vehicle. Unlike immobilise there is no mode, and the platform does not say
 * what the lock physically does — treat it with the same care as
 * sendControlCommand and call it only from control.service.ts.
 *
 * The answer lists vehicles under `LockCmndSentSuccess` / `LockCmndSentFailure`
 * (`Unlock…` for unlock). The overall `status` can read SUCCESS while the one
 * vehicle sits in the failure list, so the lists decide, not `status`. The
 * docs' own example mixes the two names, hence matching on the key's suffix.
 */
export async function sendLockCommand(
    action: "lock" | "unlock",
    vehicleNo: string,
): Promise<{ cmdId: string | null }> {
    const res = await post<Record<string, unknown>>(action, {
        token: await token(),
        vehicleno: [vehicleNo],
    });
    const listed = (suffix: RegExp): boolean =>
        Object.entries(res.data ?? {}).some(
            ([key, value]) => suffix.test(key) && Array.isArray(value) && value.includes(vehicleNo),
        );
    if (res.status !== "SUCCESS" || listed(/Failure$/i) || !listed(/Success$/i)) {
        throw new Error(res.msg ? `Tracking platform: ${res.msg}` : "Tracking platform did not accept the lock command.");
    }
    return { cmdId: null };
}
