import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase";
import { safeAuditPayload } from "./mask";

export type AuditAction =
    | "user.created" | "user.updated" | "user.soft_deleted" | "user.restored"
    | "user.activated" | "user.deactivated" | "user.suspended"
    | "user.roles_changed" | "user.photo_uploaded"
    | "kyc.document_uploaded" | "kyc.document_updated" | "kyc.document_deleted"
    | "kyc.submitted"
    | "kyc.document_verified" | "kyc.document_rejected"
    | "kyc.approved" | "kyc.rejected"
    | "booking.created" | "booking.fulfilled";

export interface AuditEntry {
    actorId: string | null;
    targetUserId: string | null;
    action: AuditAction;
    entityType: "user" | "user_document" | "user_role" | "booking";
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    req?: Request;
}

/**
 * Best-effort append to audit_logs. Deliberately does not throw: a failed
 * audit write must not roll back a completed business action, but it is
 * logged loudly so the gap is visible in monitoring.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
        actor_id: entry.actorId,
        target_user_id: entry.targetUserId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        before_data: safeAuditPayload(entry.before),
        after_data: safeAuditPayload(entry.after),
        request_context: entry.req ? requestContext(entry.req) : null,
    });

    if (error) {
        console.error("[audit] failed to record action", {
            action: entry.action,
            entityId: entry.entityId,
            error: error.message,
        });
    }
}

function requestContext(req: Request): Record<string, unknown> {
    return {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip ?? null,
        user_agent: req.get("user-agent") ?? null,
        request_id: req.get("x-request-id") ?? null,
    };
}
