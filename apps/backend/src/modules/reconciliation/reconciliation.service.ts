import { supabaseAdmin } from "../../config/supabase";
import { getRazorpay } from "../../config/razorpay";
import { env } from "../../config/env";
import { badRequest } from "../../common/AppError";
import {
    FailedWebhookEvent, MissingGatewayPayment, ReconciliationFilters, ReconciliationReport,
    UnmatchedInternalPayment,
} from "./reconciliation.types";

function toUnixSeconds(isoDate: string): number {
    const ms = new Date(`${isoDate}T00:00:00Z`).getTime();
    if (Number.isNaN(ms)) throw badRequest("Invalid date.");
    return Math.floor(ms / 1000);
}

/**
 * Compares our payment_transactions ledger against Razorpay's own payments
 * list for the same window. This is a read-only diff — nothing here writes
 * to the DB or the gateway, so it's safe to run as often as an admin wants.
 */
export async function getReconciliationReport(filters: ReconciliationFilters): Promise<ReconciliationReport> {
    const fromUnix = toUnixSeconds(filters.from);
    // +1 day so `to` is inclusive of the whole calendar day.
    const toUnix = toUnixSeconds(filters.to) + 86_400;

    const { data: internalRows, error: internalError } = await supabaseAdmin
        .from("payment_transactions")
        // `applied_at` is `captured_at` — the moment the gateway captured the
        // money, which is what a reconciliation window should be cut on. The
        // old name described when WE processed it, which drifts under retries.
        .select("gateway_payment_id, amount, captured_at")
        // Succeeded only. `payment_transactions` now also records DECLINED
        // attempts (nullable captured_at, plus failure_code/failure_reason),
        // which carry a real gateway_payment_id and would otherwise show up
        // here as internal payments Razorpay has no capture for — a
        // reconciliation report full of false discrepancies.
        .eq("status", "succeeded")
        .gte("captured_at", filters.from)
        .lt("captured_at", new Date(toUnix * 1000).toISOString());
    if (internalError) throw internalError;

    // `webhook_events` is `payment_webhook_events`; three columns renamed
    // (`signature_valid` → `is_signature_valid`, `error` → `processing_error`)
    // and `processed` became the nullable `processed_at`, which is strictly
    // more useful — it says WHEN, not just whether.
    //
    // "Failed" is therefore: a bad signature, or received but never processed.
    const { data: webhookRows, error: webhookError } = await supabaseAdmin
        .from("payment_webhook_events")
        .select("id, event_type, is_signature_valid, processed_at, processing_error, received_at")
        .gte("received_at", filters.from)
        .lt("received_at", new Date(toUnix * 1000).toISOString())
        .or("is_signature_valid.eq.false,processed_at.is.null");
    if (webhookError) throw webhookError;

    const failedWebhooks: FailedWebhookEvent[] = (webhookRows ?? []).map((w) => ({
        id: w.id,
        eventType: w.event_type,
        signatureValid: w.is_signature_valid,
        processed: w.processed_at !== null,
        error: w.processing_error,
        receivedAt: w.received_at,
    }));

    if (!env.razorpayKeyId || !env.razorpayKeySecret) {
        return {
            range: filters,
            internalPaymentCount: internalRows?.length ?? 0,
            gatewayPaymentCount: 0,
            unmatchedInternal: [],
            missingInternal: [],
            failedWebhooks,
            gatewayUnavailable: true,
        };
    }

    const razorpay = getRazorpay();
    const gatewayResult = await razorpay.payments.all({ from: fromUnix, to: toUnix, count: 100 });

    const gatewayIds = new Set(gatewayResult.items.map((p) => p.id));
    const internalIds = new Set((internalRows ?? []).map((r) => r.gateway_payment_id));

    const unmatchedInternal: UnmatchedInternalPayment[] = (internalRows ?? [])
        .filter((r) => !gatewayIds.has(r.gateway_payment_id))
        .map((r) => ({ gatewayPaymentId: r.gateway_payment_id, amount: Number(r.amount), appliedAt: r.captured_at! }));

    const missingInternal: MissingGatewayPayment[] = gatewayResult.items
        .filter((p) => p.status === "captured" && !internalIds.has(p.id))
        .map((p) => ({
            gatewayPaymentId: p.id,
            amount: Number(p.amount) / 100,
            status: p.status,
            createdAt: new Date(p.created_at * 1000).toISOString(),
        }));

    return {
        range: filters,
        internalPaymentCount: internalRows?.length ?? 0,
        gatewayPaymentCount: gatewayResult.items.length,
        unmatchedInternal,
        missingInternal,
        failedWebhooks,
        gatewayUnavailable: false,
    };
}
