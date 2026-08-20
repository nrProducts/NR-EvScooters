// =========================================================================
// failed-refund-retry  —  hourly pg_cron job
//
// Retries `failed` refunds under a capped attempt count, so a transient
// gateway failure recovers on its own instead of waiting on an admin's
// manual "Retry" click. Same gateway logic as processRefund() in
// apps/backend/src/modules/refunds/refunds.service.ts, scoped to
// status='failed' + attempt_count < cap.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// The old version had to GO LOOKING for something to refund against —
// `invoices.gateway_ref`, filtered by a `payment_type` guessed from the
// refund's own type — and gave up if it guessed wrong. That whole search is
// gone: `refunds.payment_transaction_id` is NOT NULL, so the refund already
// names the captured payment it reverses, chosen when someone actually knew
// which money was coming back.
//
// Three mirror columns went with it, and nothing writes them any more:
//
//   deposits.refund_id             the refund names its own chain
//   bookings.refund_status         cancellation state lives on the refund
//   invoices.payment_status        derived by v_invoice_balances
//
// `partially_refunded` is not a deposit status any more either. A partial
// return leaves the deposit `held`, which is the truthful description — it
// genuinely still holds a balance — so release is conditional on the refund
// covering everything that was refundable.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { notifyUser } from "../_shared/notify.ts";
import { writeAudit } from "../_shared/audit.ts";

const SOURCE = "failed-refund-retry";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const MAX_ATTEMPTS = Number.parseInt(Deno.env.get("FAILED_REFUND_MAX_ATTEMPTS") ?? "5", 10);

interface RefundRow {
    id: string;
    user_id: string;
    payment_transaction_id: string;
    amount: number;
    attempt_count: number;
    reason: string;
    payment_transactions:
        | { gateway_payment_id: string | null; payment_orders: unknown }
        | Array<{ gateway_payment_id: string | null; payment_orders: unknown }>
        | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

async function markFailed(admin: Admin, refundId: string, reason: string): Promise<void> {
    await admin
        .from("refunds")
        .update({ status: "failed", failure_reason: reason })
        .eq("id", refundId)
        .neq("status", "succeeded");
}

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        return json({ error: "Payment gateway not configured." }, 500);
    }

    const admin = adminClient();
    const authHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    // The chain the refund already carries: which capture, and which
    // subscription that capture belonged to.
    const { data: failed, error } = await admin
        .from("refunds")
        .select(
            "id, user_id, payment_transaction_id, amount, attempt_count, reason, "
            + "payment_transactions(gateway_payment_id, payment_orders(invoices(subscription_id)))",
        )
        .eq("status", "failed")
        .lt("attempt_count", MAX_ATTEMPTS);

    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    let retried = 0;
    let succeeded = 0;
    let stillFailed = 0;

    for (const refund of (failed ?? []) as unknown as RefundRow[]) {
        retried++;

        const txn = unwrap<{ gateway_payment_id: string | null; payment_orders: unknown }>(
            refund.payment_transactions,
        );
        const sourcePaymentId = txn?.gateway_payment_id ?? null;
        if (!sourcePaymentId) {
            await markFailed(
                admin,
                refund.id,
                "The payment this refund reverses has no gateway reference.",
            );
            stillFailed++;
            continue;
        }

        const order = unwrap<{ invoices: unknown }>(txn?.payment_orders);
        const invoice = unwrap<{ subscription_id: string }>(order?.invoices);
        const subscriptionId = invoice?.subscription_id ?? null;

        await admin
            .from("refunds")
            .update({
                status: "processing",
                last_attempted_at: new Date().toISOString(),
                attempt_count: refund.attempt_count + 1,
            })
            .eq("id", refund.id);

        try {
            const res = await fetch(
                `https://api.razorpay.com/v1/payments/${sourcePaymentId}/refund`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json", authorization: authHeader },
                    body: JSON.stringify({
                        amount: Math.round(Number(refund.amount) * 100),
                        notes: { refund_id: refund.id, reason: refund.reason },
                    }),
                },
            );
            const result = await res.json().catch(() => null);

            if (!res.ok || !result?.id) {
                await markFailed(
                    admin,
                    refund.id,
                    result?.error?.description ?? `Gateway returned ${res.status}.`,
                );
                stillFailed++;
                continue;
            }

            await admin
                .from("refunds")
                .update({
                    status: "succeeded",
                    gateway_refund_id: result.id,
                    completed_at: new Date().toISOString(),
                })
                .eq("id", refund.id);

            if (subscriptionId) {
                await releaseDepositIfFullyRefunded(admin, subscriptionId, Number(refund.amount));
            }

            await writeAudit(admin, {
                targetUserId: refund.user_id,
                action: "refund.processed",
                entityType: "refund",
                entityId: refund.id,
                after: { gateway_refund_id: result.id, retried: true },
                source: SOURCE,
            });

            await notifyUser(admin, refund.user_id, {
                typeCode: "refund_completed",
                subjectType: "refund",
                subjectId: refund.id,
                title: "Refund Completed",
                body: refund.reason === "booking_cancellation"
                    ? `Your refund of ₹${Number(refund.amount)} for the cancelled booking has been completed.`
                    : "Your security deposit refund has been completed.",
                screen: refund.reason === "booking_cancellation" ? "booking-history" : "my-plan",
            });

            succeeded++;
        } catch (err) {
            console.error(`[${SOURCE}] gateway call threw`, { refundId: refund.id, err });
            await markFailed(
                admin,
                refund.id,
                err instanceof Error ? err.message : "Network error calling the payment gateway.",
            );
            await writeAudit(admin, {
                targetUserId: refund.user_id,
                action: "refund.failed",
                entityType: "refund",
                entityId: refund.id,
                after: { retried: true },
                source: SOURCE,
            });
            stillFailed++;
        }
    }

    return json({ retried, succeeded, stillFailed }, 200);
});

/**
 * Releases the deposit once its money has actually gone back.
 *
 * "Fully" means against what was REFUNDABLE, not against the face value:
 * assessed damage has already come off, so a deposit reduced by a ₹300
 * damage is fully settled by a refund of the remainder.
 */
async function releaseDepositIfFullyRefunded(
    admin: Admin,
    subscriptionId: string,
    refundAmount: number,
): Promise<void> {
    const { data: deposit } = await admin
        .from("deposits")
        .select("id, amount, status")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();
    if (!deposit || deposit.status !== "held") return;

    const { data: rentals } = await admin
        .from("rentals")
        .select("id")
        .eq("subscription_id", subscriptionId);
    const rentalIds = (rentals ?? []).map((r: { id: string }) => r.id);

    let damage = 0;
    if (rentalIds.length > 0) {
        const { data: damages, error } = await admin
            .from("damages")
            .select("assessed_amount, incidents!inner(rental_id)")
            .in("incidents.rental_id", rentalIds)
            .neq("status", "disputed");
        if (error) return; // Unknown damage must not release a deposit.
        damage = (damages ?? []).reduce(
            (sum: number, d: { assessed_amount: number }) => sum + Number(d.assessed_amount),
            0,
        );
    }

    const refundable = Math.max(0, round2(Number(deposit.amount) - damage));
    if (round2(refundAmount) < refundable) return;

    await admin
        .from("deposits")
        .update({ status: "released", released_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "held");
}
