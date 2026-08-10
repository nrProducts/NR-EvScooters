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
        .select("gateway_payment_id, amount, applied_at")
        .gte("applied_at", filters.from)
        .lt("applied_at", new Date(toUnix * 1000).toISOString());
    if (internalError) throw internalError;

    const { data: webhookRows, error: webhookError } = await supabaseAdmin
        .from("webhook_events")
        .select("id, event_type, signature_valid, processed, error, received_at")
        .gte("received_at", filters.from)
        .lt("received_at", new Date(toUnix * 1000).toISOString())
        .or("signature_valid.eq.false,processed.eq.false");
    if (webhookError) throw webhookError;

    const failedWebhooks: FailedWebhookEvent[] = (webhookRows ?? []).map((w) => ({
        id: w.id, eventType: w.event_type, signatureValid: w.signature_valid, processed: w.processed,
        error: w.error, receivedAt: w.received_at,
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
        .map((r) => ({ gatewayPaymentId: r.gateway_payment_id, amount: Number(r.amount), appliedAt: r.applied_at }));

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
