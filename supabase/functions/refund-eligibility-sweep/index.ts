// =========================================================================
// refund-eligibility-sweep  —  daily pg_cron job
//
// Finds deposits past their 15-day (configurable) post-return holding
// period with no open dispute, and creates a pending `refunds` row for
// each — mirrors apps/backend/src/modules/refunds/refunds.service.ts's
// initiateRefund() exactly (same idempotency guard: reuse an existing
// non-terminal-failed refund rather than minting a duplicate). Does NOT
// call the payment gateway itself — refund-processing does that, on its
// own separate schedule, so a slow/failing gateway call never blocks this
// sweep from discovering newly-eligible deposits.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface DepositRow {
    id: string;
    booking_id: string;
    amount: number;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: eligible, error } = await admin
        .from("deposits")
        .select("id, booking_id, amount")
        .eq("status", "held")
        .lte("refund_eligible_at", new Date().toISOString());

    if (error) {
        console.error("[refund-eligibility-sweep] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    let created = 0;
    let skippedDisputed = 0;
    let skippedExisting = 0;
    let skippedNothingToRefund = 0;

    for (const deposit of (eligible ?? []) as DepositRow[]) {
        const { count: openDisputeCount } = await admin
            .from("damages")
            .select("id", { count: "exact", head: true })
            .eq("booking_id", deposit.booking_id)
            .eq("status", "disputed");
        if ((openDisputeCount ?? 0) > 0) {
            skippedDisputed++;
            continue;
        }

        const { data: existingRefund } = await admin
            .from("refunds")
            .select("id")
            .eq("deposit_id", deposit.id)
            .in("status", ["pending", "processing", "success"])
            .maybeSingle();
        if (existingRefund) {
            skippedExisting++;
            continue;
        }

        const { data: damages } = await admin
            .from("damages")
            .select("deposit_deduction")
            .eq("booking_id", deposit.booking_id)
            .neq("status", "disputed");
        const totalDeduction = (damages ?? []).reduce((sum, d) => sum + Number(d.deposit_deduction), 0);
        const refundAmount = Math.max(0, round2(deposit.amount - totalDeduction));

        if (refundAmount <= 0) {
            skippedNothingToRefund++;
            continue;
        }

        const { error: insertError } = await admin
            .from("refunds")
            .insert({ deposit_id: deposit.id, booking_id: deposit.booking_id, amount: refundAmount, status: "pending" });
        if (insertError) {
            console.error("[refund-eligibility-sweep] insert failed", { depositId: deposit.id, error: insertError });
            continue;
        }
        created++;

        const { data: booking } = await admin.from("bookings").select("user_id").eq("id", deposit.booking_id).maybeSingle();
        if (booking) {
            await admin.from("notifications_log").insert({
                user_id: booking.user_id, channel: "push", template: "refund_initiated",
                payload: {
                    title: "Refund Initiated",
                    body: `Your security deposit refund of ₹${refundAmount} has been initiated.`,
                    screen: "billing",
                },
                status: "pending",
            });
        }

        await admin.from("audit_logs").insert({
            actor_id: null, target_user_id: booking?.user_id ?? null, action: "refund.initiated",
            entity_type: "deposit", entity_id: deposit.id,
            after_data: { amount: refundAmount }, request_context: { source: "refund-eligibility-sweep" },
        });
    }

    return json({
        eligible: eligible?.length ?? 0, created, skippedDisputed, skippedExisting, skippedNothingToRefund,
    }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
