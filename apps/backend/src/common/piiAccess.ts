import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase";
import type { AuthContext } from "../types";

export type PiiAccessReason =
    | "kyc_review"
    | "support_ticket"
    | "fraud_investigation"
    | "rights_request"
    | "legal_request"
    | "rider_self"
    | "other";

export const PII_ACCESS_REASONS: readonly PiiAccessReason[] = [
    "kyc_review", "support_ticket", "fraud_investigation",
    "rights_request", "legal_request", "rider_self", "other",
] as const;

export type PiiResource =
    | "kyc_document_image"
    | "kyc_detail"
    | "user_profile"
    | "profile_photo"
    | "data_export"
    | "consent_history";

export interface PiiAccessEntry {
    actor: AuthContext;
    targetUserId: string;
    resource: PiiResource;
    resourceId?: string;
    /** Which sensitive fields were actually returned. */
    fields?: string[];
    reason?: PiiAccessReason;
    /** Support ticket or data-principal-request reference. */
    contextRef?: string;
    req?: Request;
}

/**
 * Records a READ of someone else's personal data.
 *
 * A sibling of writeAudit, not a wrapper of it — see the header comment on
 * supabase/migrations/20260814100400_dpdpa_pii_access_log.sql for why they are
 * separate tables. The contract is deliberately identical though: best effort,
 * never throws. A failed log must not fail the request the staff member was
 * legitimately making, but it is logged loudly so the gap is visible.
 */
export async function logPiiAccess(entry: PiiAccessEntry): Promise<void> {
    // A rider reading their own record is not an access event. Logging it
    // would swamp the table, bury the accesses that matter, and make the
    // rider-facing "who looked at my data" view useless — it would be
    // almost entirely the rider themselves.
    if (entry.actor.id === entry.targetUserId) return;

    // try/catch as well as the returned-error check: a network-level failure
    // rejects rather than resolving with `{ error }`, and letting that
    // propagate would turn a logging outage into a staff member being unable
    // to review a document. The log is evidence; it is not the workflow.
    try {
        const { error } = await supabaseAdmin.from("pii_access_log").insert({
            actor_id: entry.actor.id,
            actor_roles: entry.actor.roles,
            target_user_id: entry.targetUserId,
            resource: entry.resource,
            resource_id: entry.resourceId ?? null,
            fields: entry.fields ?? null,
            reason: entry.reason ?? "other",
            context_ref: entry.contextRef ?? null,
            ip: entry.req?.ip ?? null,
            user_agent: entry.req?.get("user-agent") ?? null,
            path: entry.req?.originalUrl ?? null,
        });

        if (error) throw new Error(error.message);
    } catch (err) {
        console.error("[pii-access] failed to record a read of personal data", {
            resource: entry.resource,
            actorId: entry.actor.id,
            error: (err as Error)?.message ?? "unknown",
        });
    }
}

/** Narrows an untrusted `?reason=` query value to the enum, defaulting safely. */
export function parseReason(value: unknown): PiiAccessReason {
    return PII_ACCESS_REASONS.includes(value as PiiAccessReason)
        ? (value as PiiAccessReason)
        : "other";
}
