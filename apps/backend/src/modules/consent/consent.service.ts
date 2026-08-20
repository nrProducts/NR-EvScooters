import type { Request } from "express";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import type { AuthContext } from "../../types";
import {
    ALL_PURPOSES, OPTIONAL_PURPOSES, REQUIRED_PURPOSES, isRequiredPurpose,
} from "./consent.purposes";
import type {
    ConsentAction, ConsentHistoryItem, ConsentLanguage, ConsentNoticeView,
    ConsentPurpose, ConsentSource, ConsentState, ConsentStateItem,
} from "./consent.types";
import type { PublishNoticeBody, RecordConsentBody } from "./consent.validation";

interface NoticeRow {
    id: string;
    version: string;
    effective_from: string;
    body_en: string;
    body_ta: string;
    body_sha256: string;
    purposes: ConsentPurpose[];
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

/** The single live notice. Everything else in this module is measured against it. */
export async function getActiveNotice(): Promise<NoticeRow> {
    const { data, error } = await supabaseAdmin
        .from("consent_notices")
        .select("id, version, effective_from, body_en, body_ta, body_sha256, purposes")
        .is("retired_at", null)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        // Only reachable if someone retired the seeded notice without
        // publishing a replacement. Surfaced loudly rather than defaulting to
        // "no consent needed", which would be the dangerous failure mode.
        throw notFound("No privacy notice is currently published.");
    }
    return data as NoticeRow;
}

export async function getNoticeView(lang: ConsentLanguage): Promise<ConsentNoticeView> {
    const row = await getActiveNotice();
    return {
        id: row.id,
        version: row.version,
        effective_from: row.effective_from,
        language: lang,
        body: lang === "ta" ? row.body_ta : row.body_en,
        body_sha256: row.body_sha256,
        purposes: row.purposes,
        required_purposes: [...REQUIRED_PURPOSES],
        optional_purposes: [...OPTIONAL_PURPOSES],
    };
}

export async function listNotices(): Promise<Array<Omit<NoticeRow, "body_en" | "body_ta"> & {
    retired_at: string | null;
}>> {
    const { data, error } = await supabaseAdmin
        .from("consent_notices")
        .select("id, version, effective_from, retired_at, body_sha256, purposes")
        .order("effective_from", { ascending: false });
    if (error) throw error;
    return (data ?? []) as never;
}

/**
 * Publishes a new notice and retires the current one.
 *
 * This deliberately has no "edit" counterpart. Editing a notice that riders
 * have already consented against would silently change what they agreed to and
 * break the body_sha256 integrity anchor. A correction is a new version, which
 * re-prompts everyone — that cost is the point.
 */
export async function publishNotice(
    input: PublishNoticeBody,
    actor: AuthContext,
    req?: Request,
): Promise<ConsentNoticeView> {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from("consent_notices")
        .select("id")
        .eq("version", input.version)
        .maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw conflict(`Notice version ${input.version} already exists.`);

    const sha = createHash("sha256")
        .update(`${input.body_en}|${input.body_ta}`)
        .digest("hex");

    // Retire the live notice first. The unique partial index would reject the
    // insert otherwise, so ordering here is load-bearing, not stylistic.
    const { error: retireError } = await supabaseAdmin
        .from("consent_notices")
        .update({ retired_at: new Date().toISOString() })
        .is("retired_at", null);
    if (retireError) throw retireError;

    const { data, error } = await supabaseAdmin
        .from("consent_notices")
        .insert({
            version: input.version,
            effective_from: input.effective_from ?? new Date().toISOString(),
            body_en: input.body_en,
            body_ta: input.body_ta,
            body_sha256: sha,
            purposes: [...ALL_PURPOSES],
            created_by_user_id: actor.id,
        })
        .select("id, version, effective_from, body_en, body_ta, body_sha256, purposes")
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "consent.notice_published",
        entityType: "consent_notice",
        entityId: data.id as string,
        after: { version: input.version, body_sha256: sha },
        req,
    });

    const row = data as NoticeRow;
    return {
        id: row.id,
        version: row.version,
        effective_from: row.effective_from,
        language: "en",
        body: row.body_en,
        body_sha256: row.body_sha256,
        purposes: row.purposes,
        required_purposes: [...REQUIRED_PURPOSES],
        optional_purposes: [...OPTIONAL_PURPOSES],
    };
}

// ---------------------------------------------------------------------------
// Reading a rider's consent state
// ---------------------------------------------------------------------------

interface CurrentConsentRow {
    purpose: ConsentPurpose;
    action: ConsentAction;
    notice_version_snapshot: string;
    decided_at: string;
}

export async function getConsentState(userId: string): Promise<ConsentState> {
    const notice = await getActiveNotice();

    const { data, error } = await supabaseAdmin
        .from("v_current_consents")
        .select("purpose, action, notice_version_snapshot, decided_at")
        .eq("user_id", userId);
    if (error) throw error;

    const current = new Map<ConsentPurpose, CurrentConsentRow>();
    for (const row of (data ?? []) as CurrentConsentRow[]) current.set(row.purpose, row);

    const items: ConsentStateItem[] = ALL_PURPOSES.map((purpose) => {
        const row = current.get(purpose);
        return {
            purpose,
            required: isRequiredPurpose(purpose),
            granted: row?.action === "granted",
            decided_at: row?.decided_at ?? null,
            notice_version: row?.notice_version_snapshot ?? null,
        };
    });

    // "Up to date" means granted AND granted against the notice that is live
    // now. Anything weaker would let a notice revision pass unnoticed, which
    // is exactly the case re-consent exists for.
    const up_to_date = items
        .filter((i) => i.required)
        .every((i) => i.granted && i.notice_version === notice.version);

    return { current_notice_version: notice.version, up_to_date, items };
}

/**
 * Single-purpose check used as a precondition by other modules — notably the
 * KYC upload path, which must refuse to store an identity document from a
 * rider who has not consented to identity verification.
 */
export async function hasGrantedConsent(
    userId: string,
    purpose: ConsentPurpose,
): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("v_current_consents")
        .select("action")
        .eq("user_id", userId)
        .eq("purpose", purpose as NonNullable<typeof purpose>)
        .maybeSingle();
    if (error) throw error;
    return (data as { action: ConsentAction } | null)?.action === "granted";
}

export async function getConsentHistory(userId: string): Promise<ConsentHistoryItem[]> {
    const { data, error } = await supabaseAdmin
        .from("consent_records")
        .select("id, purpose, action, notice_version_snapshot, language, source, created_at, actor:actor_user_id(id, full_name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
        const actor = row.actor as { id: string; full_name: string } | null;
        return {
            id: row.id as string,
            purpose: row.purpose as ConsentPurpose,
            action: row.action as ConsentAction,
            notice_version: row.notice_version_snapshot as string,
            language: row.language as ConsentLanguage,
            source: row.source as ConsentSource,
            recorded_by: actor ?? null,
            created_at: row.created_at as string,
        };
    });
}

// ---------------------------------------------------------------------------
// Writing consent
// ---------------------------------------------------------------------------

/**
 * Records the rider's choices.
 *
 * Two rules do the real work here:
 *
 *  1. A decision is only written when the purpose's state actually CHANGED.
 *     consent_records is a change log; writing an unchanged purpose on every
 *     screen visit would bury the real decisions and inflate a table that has
 *     an 8-year retention.
 *
 *  2. The submitted notice_version_snapshot must be the live one. If a new notice was
 *     published while the screen was open, the whole submission is rejected
 *     with a 409 so the client re-fetches. Accepting it would record consent
 *     against words the rider never saw.
 */
export async function recordConsents(
    userId: string,
    input: RecordConsentBody,
    opts: { source: ConsentSource; actorId?: string | null; req?: Request },
): Promise<ConsentState> {
    const notice = await getActiveNotice();

    if (input.notice_version !== notice.version) {
        throw conflict(
            "The privacy notice has been updated since this screen was opened. " +
            "Please review the current notice and choose again.",
            { notice_version: `Expected ${notice.version}.` },
        );
    }

    const before = await getConsentState(userId);
    const beforeByPurpose = new Map(before.items.map((i) => [i.purpose, i]));

    const changed = input.grants.filter((g) => {
        const prev = beforeByPurpose.get(g.purpose as ConsentPurpose);
        // A purpose the rider has never decided on counts as changed even when
        // granted === false: "I looked at this and said no" is a record worth
        // having, and without it a withdrawal has nothing to withdraw from.
        if (!prev || prev.decided_at === null) return true;
        if (prev.granted !== g.granted) return true;
        // Re-affirming against a NEW notice version is also a real decision.
        return prev.notice_version !== notice.version;
    });

    if (changed.length === 0) return before;

    const context = requestContext(opts.req);
    const rows = changed.map((g) => ({
        user_id: userId,
        purpose: g.purpose as ConsentPurpose,
        action: (g.granted ? "granted" : "withdrawn") as ConsentAction,
        consent_notice_id: notice.id,
        notice_version_snapshot: notice.version,
        language: input.language,
        source: opts.source,
        ip_address: context.ip,
        user_agent: context.userAgent,
        device_id: input.device_id ?? null,
        actor_user_id: opts.actorId ?? null,
    }));

    const { error } = await supabaseAdmin.from("consent_records").insert(rows);
    if (error) throw error;

    const granted = changed.filter((g) => g.granted).map((g) => g.purpose);
    const withdrawn = changed.filter((g) => !g.granted).map((g) => g.purpose);

    // Two audit entries rather than one, so a withdrawal is greppable on its
    // own — it is the event anyone investigating a complaint looks for first.
    if (granted.length > 0) {
        await writeAudit({
            actorId: opts.actorId ?? userId,
            targetUserId: userId,
            action: "consent.granted",
            entityType: "consent_record",
            entityId: userId,
            after: { purposes: granted, notice_version_snapshot: notice.version, source: opts.source },
            req: opts.req,
        });
    }
    if (withdrawn.length > 0) {
        await writeAudit({
            actorId: opts.actorId ?? userId,
            targetUserId: userId,
            action: "consent.withdrawn",
            entityType: "consent_record",
            entityId: userId,
            after: { purposes: withdrawn, notice_version_snapshot: notice.version, source: opts.source },
            req: opts.req,
        });
    }

    return getConsentState(userId);
}

/**
 * Withdrawing a single purpose — the toggle in the app's privacy screen.
 *
 * Withdrawal of a REQUIRED purpose is refused with a 409 that points at
 * account closure. This is not obstruction: DPDPA s.6(6) lets a fiduciary stop
 * providing a service whose delivery depends on the withdrawn consent, and
 * silently accepting a withdrawal we would then have to ignore would be the
 * dishonest option. The rider is given the real path instead.
 */
export async function withdrawConsent(
    userId: string,
    purpose: ConsentPurpose,
    opts: { source: ConsentSource; actorId?: string | null; req?: Request },
): Promise<ConsentState> {
    if (isRequiredPurpose(purpose)) {
        throw conflict(
            "This permission is needed to rent a scooter, so it cannot be switched off on " +
            "its own. If you no longer want us to hold your data, you can close your " +
            "account from Privacy → Delete my account.",
            { purpose: "Required for service delivery." },
        );
    }

    const notice = await getActiveNotice();
    return recordConsents(
        userId,
        { notice_version: notice.version, language: "en", grants: [{ purpose, granted: false }] },
        opts,
    );
}

function requestContext(req?: Request): { ip: string | null; userAgent: string | null } {
    if (!req) return { ip: null, userAgent: null };
    return {
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
    };
}
