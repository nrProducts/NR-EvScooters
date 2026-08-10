// =========================================================================
// failed-refund-retry  —  hourly pg_cron job
//
// Retries refunds.status='failed' rows under a capped attempt count, so a
// transient gateway failure recovers on its own instead of sitting stuck
// forever waiting on an admin's manual "Retry" click. Same gateway-call
// logic as refund-processing (duplicated on purpose — this function can't
// import that one; Edge Functions each deploy standalone), just scoped to
// 'failed' + attempt_count < cap instead of 'pending'.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const MAX_ATTEMPTS = Number.parseInt(Deno.env.get("FAILED_REFUND_MAX_ATTEMPTS") ?? "5", 10);

interface RefundRow {
    id: string;
    deposit_id: string;
    booking_id: string;
    amount: number;
    attempt_count: number;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

async function markFailed(admin: ReturnType<typeof createClient>, refundId: string, reason: string): Promise<void> {
    await admin.from("refunds").update({ status: "failed", failure_reason: reason }).eq("id", refundId).neq("status", "success");
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return json({ error: "Payment gateway not configured." }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
    const authHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const { data: failed, error } = await admin
        .from("refunds")
        .select("id, deposit_id, booking_id, amount, attempt_count")
        .eq("status", "failed")
        .lt("attempt_count", MAX_ATTEMPTS);

    if (error) {
        console.error("[failed-refund-retry] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    let retried = 0;
    let succeeded = 0;
    let stillFailed = 0;

    for (const refund of (failed ?? []) as RefundRow[]) {
        retried++;

        const { data: depositInvoice } = await admin
            .from("invoices")
            .select("gateway_ref")
            .eq("booking_id", refund.booking_id)
            .eq("payment_type", "deposit")
            .eq("payment_status", "succeeded")
            .maybeSingle();
        const sourcePaymentId = depositInvoice?.gateway_ref ?? null;

        if (!sourcePaymentId) {
            await markFailed(admin, refund.id, "No captured deposit payment found to refund against.");
            stillFailed++;
            continue;
        }

        await admin
            .from("refunds")
            .update({
                status: "processing", last_attempted_at: new Date().toISOString(),
                attempt_count: refund.attempt_count + 1, source_gateway_payment_id: sourcePaymentId,
            })
            .eq("id", refund.id);

        try {
            const res = await fetch(`https://api.razorpay.com/v1/payments/${sourcePaymentId}/refund`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: authHeader },
                body: JSON.stringify({
                    amount: Math.round(refund.amount * 100),
                    notes: { deposit_id: refund.deposit_id, refund_id: refund.id },
                }),
            });
            const result = await res.json().catch(() => null);

            if (!res.ok || !result?.id) {
                await markFailed(admin, refund.id, result?.error?.description ?? `Gateway returned ${res.status}.`);
                stillFailed++;
                continue;
            }

            await admin
                .from("refunds")
                .update({ status: "success", gateway_refund_id: result.id, processed_at: new Date().toISOString() })
                .eq("id", refund.id);

            const { data: deposit } = await admin.from("deposits").select("amount").eq("id", refund.deposit_id).maybeSingle();
            const fully = deposit ? round2(refund.amount) >= round2(Number(deposit.amount)) : true;
            await admin
                .from("deposits")
                .update({
                    status: fully ? "refunded" : "partially_refunded",
                    refunded_at: new Date().toISOString(), refund_id: refund.id,
                })
                .eq("id", refund.deposit_id);

            const { data: booking } = await admin.from("bookings").select("user_id").eq("id", refund.booking_id).maybeSingle();
            if (booking) {
                await admin.from("notifications_log").insert({
                    user_id: booking.user_id, channel: "push", template: "refund_completed",
                    payload: { title: "Refund Completed", body: "Your security deposit refund has been completed.", screen: "billing" },
                    status: "pending",
                });
            }

            await admin.from("audit_logs").insert({
                actor_id: null, target_user_id: booking?.user_id ?? null, action: "refund.processed",
                entity_type: "refund", entity_id: refund.id,
                after_data: { gateway_refund_id: result.id, retried: true }, request_context: { source: "failed-refund-retry" },
            });

            succeeded++;
        } catch (err) {
            console.error("[failed-refund-retry] gateway call threw", { refundId: refund.id, err });
            await markFailed(admin, refund.id, err instanceof Error ? err.message : "Network error calling the payment gateway.");
            stillFailed++;
        }
    }

    return json({ retried, succeeded, stillFailed }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
