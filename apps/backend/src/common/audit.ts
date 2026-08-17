import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase";
import { safeAuditPayload } from "./mask";

export type AuditAction =
    | "user.created" | "user.updated" | "user.soft_deleted" | "user.restored"
    | "user.activated" | "user.deactivated" | "user.suspended"
    | "user.roles_changed" | "user.permissions_changed" | "user.capabilities_changed"
    | "user.photo_uploaded"
    | "kyc.document_uploaded" | "kyc.document_updated" | "kyc.document_deleted"
    | "kyc.submitted"
    | "kyc.document_verified" | "kyc.document_rejected"
    | "kyc.approved" | "kyc.rejected"
    | "booking.created" | "booking.approved" | "booking.rejected" | "booking.fulfilled"
    | "booking.cancelled" | "booking.payment_completed"
    | "vehicle.created" | "vehicle.updated" | "vehicle.scrapped" | "vehicle.assigned"
    | "maintenance.created" | "maintenance.updated" | "maintenance.outcome_set"
    | "notification.broadcast"
    | "invoice.refunded"
    | "rental.completed" | "rental.moved_to_maintenance" | "rental.return_requested" | "rental.return_rejected"
    | "referral.redeemed" | "referral.qualified"
    | "payment.order_created" | "payment.verified" | "payment.failed" | "payment.webhook_received"
    | "deposit.held" | "deposit.refund_initiated" | "deposit.refunded" | "deposit.forfeited"
    | "damage.created" | "damage.disputed" | "damage.resolved"
    | "refund.initiated" | "refund.processed" | "refund.failed"
    | "plan.activated" | "plan.paused" | "plan.resumed" | "plan.due" | "plan.updated"
    | "battery_station.created" | "battery_station.updated" | "battery_station.shown"
    | "battery_station.hidden" | "battery_station.soft_deleted"
    // Billing & Charges engine — see 20260817100000_billing_charge_engine.sql
    | "charge_rule.created" | "charge_rule.updated" | "rider_charge.waived"
    // Discount Rules engine — see 20260817120000_discount_rules_engine.sql
    | "discount_rule.created" | "discount_rule.updated" | "rider_discount.cancelled"
    // DPDPA — consent (ss.5-6)
    | "consent.granted" | "consent.withdrawn" | "consent.notice_published"
    // DPDPA — data-principal rights (ss.11-14)
    | "privacy.request_created" | "privacy.request_updated" | "privacy.request_assigned"
    | "privacy.request_completed" | "privacy.request_rejected" | "privacy.request_cancelled"
    | "privacy.export_generated" | "privacy.correction_applied" | "privacy.nominee_updated"
    | "privacy.erasure_requested" | "privacy.erasure_approved"
    | "privacy.erasure_executed" | "privacy.erasure_cancelled"
    // DPDPA — retention
    | "retention.purge_run";

export interface AuditEntry {
    actorId: string | null;
    targetUserId: string | null;
    action: AuditAction;
    entityType:
        | "user" | "user_document" | "user_role" | "user_permission" | "user_capability"
        | "booking" | "vehicle" | "vehicle_maintenance"
        | "notification_broadcast" | "invoice" | "rental" | "referral" | "battery_station"
        | "payment_order" | "payment_transaction" | "webhook_event" | "deposit" | "damage" | "refund" | "plan"
        | "consent_record" | "consent_notice" | "privacy_request" | "retention_run"
        | "charge_rule" | "rider_charge" | "discount_rule" | "rider_discount";
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
