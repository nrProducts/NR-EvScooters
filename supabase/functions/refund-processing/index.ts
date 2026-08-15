// =========================================================================
// refund-processing  —  pg_cron job, every 5-10 min
//
// Drives refunds.status='pending' rows through Razorpay's refund API.
// Mirrors apps/backend/src/modules/refunds/refunds.service.ts's
// processRefund() exactly (re-implemented — this function can't import
// backend TS). Kept on its own schedule, separate from
// refund-eligibility-sweep, so retrying a slow/failing gateway call never
// blocks discovery of newly-eligible deposits.
//
// Only picks up 'pending' rows — a 'failed' one is retried by
// failed-refund-retry instead, under its own attempt cap, so a refund that
// keeps failing doesn't get hammered every 5-10 minutes forever.
//
// refund_type='deposit' ONLY — a booking_cancellation refund is deliberately
// left at 'pending' until a staff member approves it (POST
// /refunds/:id/retry doubles as Approve for those), so this sweep must never
// pick one up. See 20260815100000_refund_type_enum.sql.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

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

    const { data: pending, error } = await admin
        .from("refunds")
        .select("id, deposit_id, booking_id, amount, attempt_count")
        .eq("status", "pending")
        .eq("refund_type", "deposit");

    if (error) {
        console.error("[refund-processing] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const refund of (pending ?? []) as RefundRow[]) {
        processed++;

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
            failed++;
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
                failed++;
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

            // Keep the Payments screen (apps/web) in sync — it reads
            // invoices.payment_status directly, not the deposits table.
            await admin
                .from("invoices")
                .update({ payment_status: "refunded" })
                .eq("booking_id", refund.booking_id)
                .eq("payment_type", "deposit")
                .eq("payment_status", "succeeded");

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
                after_data: { gateway_refund_id: result.id }, request_context: { source: "refund-processing" },
            });

            succeeded++;
        } catch (err) {
            console.error("[refund-processing] gateway call threw", { refundId: refund.id, err });
            await markFailed(admin, refund.id, err instanceof Error ? err.message : "Network error calling the payment gateway.");
            failed++;
        }
    }

    return json({ processed, succeeded, failed }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
