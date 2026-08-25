import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase";
import { safeAuditPayload } from "./mask";
import type { Json } from "../types/database.types";

/**
 * `audit_logs.action` is free text in the database — this union is the
 * application's own discipline about what it will write, so a typo is a
 * compile error rather than a row nobody can query for.
 *
 * Kept close to the old list on purpose. An action name is a historical
 * record: renaming one would make old rows and new rows describe the same
 * event differently, which is precisely what an audit trail must not do.
 * Names change here only where the underlying concept genuinely changed.
 */
export type AuditAction =
    | "user.created" | "user.self_signed_up" | "user.updated" | "user.soft_deleted" | "user.restored"
    | "user.activated" | "user.deactivated" | "user.suspended"
    | "user.roles_changed" | "user.permissions_changed"
    | "user.photo_uploaded"
    | "kyc.document_uploaded" | "kyc.document_updated" | "kyc.document_deleted"
    | "kyc.submitted"
    | "kyc.document_verified" | "kyc.document_rejected"
    | "kyc.approved" | "kyc.rejected"
    // `kyc.number_revealed` is new: reading a decrypted document number is an
    // event worth a row of its own, now that the number is stored at all.
    | "kyc.number_revealed"
    | "booking.created" | "booking.approved" | "booking.rejected" | "booking.fulfilled"
    | "booking.cancelled" | "booking.payment_completed"
    | "vehicle.created" | "vehicle.updated" | "vehicle.scrapped" | "vehicle.assigned"
    | "maintenance.created" | "maintenance.updated" | "maintenance.outcome_set"
    | "notification.broadcast" | "notification_setting.updated"
    | "invoice.refunded"
    // The late fee, at the moment it becomes a line on the bill rather than
    // an unattributed surplus. is_financial_audit_action() matches it on
    // "invoice", so it inherits the financial retention period.
    | "invoice.late_fee_charged"
    | "rental.completed" | "rental.moved_to_maintenance" | "rental.return_requested" | "rental.return_rejected"
    | "return.inspected" | "return.payment_verified"
    | "referral.redeemed" | "referral.qualified"
    | "payment.order_created" | "payment.verified" | "payment.failed" | "payment.webhook_received"
    // Added with the payment hardening work. `unallocated_surplus` and
    // `partial` are the two money-arrived-but-not-settled cases the
    // Reconciliation console needs to be able to find; `signature_invalid`
    // is the forged-webhook trail.
    | "payment.order_superseded" | "payment.webhook_signature_invalid"
    | "payment.unallocated_surplus" | "payment.partial"
    | "deposit.held" | "deposit.refund_initiated" | "deposit.refunded" | "deposit.forfeited"
    | "damage.created" | "damage.disputed" | "damage.resolved"
    | "refund.initiated" | "refund.submitted" | "refund.processed" | "refund.failed"
    // The `plan.*` names are kept even though the state they describe moved
    // from bookings to `subscriptions`: the events are the same events, and
    // renaming them would split the history in two.
    | "plan.activated" | "plan.paused" | "plan.resumed" | "plan.due" | "plan.updated" | "plan.renewed"
    | "plan_renewal_settings.updated"
    | "return_recovery_settings.updated"
    | "settlement.created" | "settlement.refund_issued" | "settlement.due_created" | "settlement.completed"
    | "battery_station.created" | "battery_station.updated" | "battery_station.shown"
    | "battery_station.hidden" | "battery_station.soft_deleted"
    // charges and discounts merged into one signed-amount path, so the four
    // old rule/instance actions collapse into two.
    | "pricing_rule.created" | "pricing_rule.updated" | "pricing_rule.deleted" | "subscription_adjustment.waived"
    // DPDPA — consent (ss.5-6)
    | "consent.granted" | "consent.withdrawn" | "consent.notice_published"
    // DPDPA — data-principal rights (ss.11-14)
    | "privacy.request_created" | "privacy.request_updated" | "privacy.request_assigned"
    | "privacy.request_completed" | "privacy.request_rejected" | "privacy.request_cancelled"
    | "privacy.export_generated" | "privacy.correction_applied" | "privacy.nominee_updated"
    | "privacy.erasure_requested" | "privacy.erasure_approved"
    | "privacy.erasure_executed" | "privacy.erasure_cancelled"
    // DPDPA — retention
    | "retention.purge_run"
    // Mini HRMS
    | "attendance.checked_in" | "attendance.checked_out"
    | "leave.applied" | "leave.approved" | "leave.rejected" | "leave.cancelled"
    | "holiday.created" | "holiday.updated" | "holiday.deleted";

export interface AuditEntry {
    actorId: string | null;
    targetUserId: string | null;
    action: AuditAction;
    /**
     * Table names, tracking the new schema.
     *
     * Unlike the action names above, these SHOULD follow the rename: the point
     * of `entity_type` + `entity_id` is that someone reading a row can go and
     * find the thing, and a name that no longer resolves to a table defeats
     * that. `user_capability` is simply gone — capabilities are permissions.
     */
    entityType:
        | "user" | "user_role" | "user_permission" | "kyc_document"
        | "booking" | "booking_cancellation"
        | "subscription" | "subscription_period" | "subscription_adjustment"
        | "vehicle" | "vehicle_document" | "vehicle_disposal" | "maintenance_ticket"
        | "hub" | "battery_station"
        | "rental" | "rental_return" | "rental_settlement" | "settlement"
        | "invoice" | "payment_order" | "payment_transaction" | "payment_allocation"
        | "payment_webhook_event" | "deposit" | "refund" | "plan" | "pricing_rule"
        | "incident" | "damage" | "damage_dispute" | "support_ticket"
        | "notification_broadcast" | "notification_setting" | "notification_message"
        | "return_recovery_setting"
        | "consent_record" | "consent_notice" | "privacy_request" | "retention_run"
        | "referral"
        | "attendance_record" | "leave_request" | "holiday";
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
        actor_user_id: entry.actorId,
        target_user_id: entry.targetUserId,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        // The columns are `jsonb`, and the generated `Json` type is a closed
        // recursive union that an open `Record<string, unknown>` does not
        // satisfy structurally — even though every value these helpers produce
        // is JSON-serialisable, which is exactly what safeAuditPayload()
        // guarantees by round-tripping through JSON.stringify.
        before_data: safeAuditPayload(entry.before) as Json,
        after_data: safeAuditPayload(entry.after) as Json,
        request_context: (entry.req ? requestContext(entry.req) : null) as Json,
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
