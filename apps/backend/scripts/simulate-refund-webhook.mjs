#!/usr/bin/env node
/**
 * Locally simulate the Razorpay `refund.processed` / `refund.failed` webhook.
 *
 * Why this exists: nothing marks a refund `succeeded` (and releases the
 * deposit) except the `refund.processed` webhook — see
 * apps/backend/src/modules/refunds/refunds.service.ts::applyRefundWebhookResult
 * and docs/payment/10-refund-design.md. Razorpay cannot deliver a webhook to
 * localhost, so during local testing you post it yourself. The signature is a
 * real HMAC over the raw body using RAZORPAY_WEBHOOK_SECRET, so it goes through
 * the exact same verification path as a genuine delivery.
 *
 *   node scripts/simulate-refund-webhook.mjs <gateway_refund_id>
 *   node scripts/simulate-refund-webhook.mjs <gateway_refund_id> failed "Bank rejected"
 *
 * <gateway_refund_id> is refunds.gateway_refund_id (looks like `rfnd_...`),
 * set on the row by processRefund after it calls the gateway. Find it in the
 * admin Refunds table ("Transaction ID" column) or:
 *   select id, status, gateway_refund_id from refunds order by created_at desc;
 *
 * Nothing is written by this script directly — it only makes the HTTP call.
 */
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";

const [, , refundId, outcomeArg, reasonArg] = process.argv;
const outcome = outcomeArg === "failed" ? "failed" : "processed";
const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
const url = process.env.WEBHOOK_URL
    ?? `http://localhost:${process.env.PORT ?? 4000}/api/v1/payments/webhook`;

if (!refundId) {
    console.error("usage: node scripts/simulate-refund-webhook.mjs <gateway_refund_id> [processed|failed] [reason]");
    process.exit(1);
}
if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set in apps/backend/.env — the backend would reject this anyway.");
    process.exit(1);
}

const entity = { id: refundId, entity: "refund", status: outcome };
if (outcome === "failed") entity.error_description = reasonArg ?? "Simulated gateway failure.";

const bodyObj = {
    entity: "event",
    // Stable id → a redelivery of the same event is a no-op, like the real thing.
    id: `evt_sim_${refundId}_${outcome}`,
    event: `refund.${outcome}`,
    contains: ["refund"],
    payload: { refund: { entity } },
    created_at: Math.floor(Date.now() / 1000),
};

const raw = JSON.stringify(bodyObj);
const signature = createHmac("sha256", secret).update(raw).digest("hex");

const res = await fetch(url, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": `${bodyObj.id}_${randomUUID().slice(0, 8)}`,
    },
    body: raw,
});

console.log(`POST ${url}`);
console.log(`event: refund.${outcome}   refund: ${refundId}`);
console.log(`-> HTTP ${res.status}`);
console.log(await res.text());
console.log("\nNow check: select status, completed_at, failure_reason from refunds where gateway_refund_id = '" + refundId + "';");
