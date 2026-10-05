#!/usr/bin/env node
/**
 * Checks whether a Razorpay key pair actually works, before it costs you a
 * round trip through the app.
 *
 * A dead key surfaces deep in the checkout flow as a failed payment, and the
 * gateway returns the same 401 whether the id is wrong, the secret is wrong,
 * or the pair has been deactivated — so guessing which half is at fault is
 * wasted effort. This just asks.
 *
 *   pnpm verify:razorpay                       # whatever is in .env
 *   pnpm verify:razorpay <key_id> <key_secret> # a pair before you commit it
 *
 * Nothing is written anywhere. The read is GET /v1/orders?count=1, which
 * creates nothing and is safe against a live account.
 */
import "dotenv/config";

const [, , argId, argSecret] = process.argv;
const keyId = argId ?? process.env.RAZORPAY_KEY_ID ?? "";
const keySecret = argSecret ?? process.env.RAZORPAY_KEY_SECRET ?? "";
const source = argId ? "command line" : "apps/backend/.env";

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log(`\nRazorpay key check  ${dim(`(from ${source})`)}\n`);

if (!keyId || !keySecret) {
    console.log(red("  Missing credentials."));
    console.log(`  key id:     ${keyId || red("(empty)")}`);
    console.log(`  key secret: ${keySecret ? "(set)" : red("(empty)")}`);
    process.exit(1);
}

// Shape checks first — these catch a paste error without a network round trip.
const problems = [];
if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    problems.push(`key id does not look like a Razorpay key: ${keyId}`);
}
if (/\s/.test(keySecret)) problems.push("key secret contains whitespace");
if (/^["']|["']$/.test(keySecret)) problems.push("key secret is wrapped in quotes");

const mode = keyId.startsWith("rzp_live_") ? "LIVE" : "TEST";

console.log(`  mode:       ${mode}${mode === "LIVE" ? red("  — real money") : ""}`);
console.log(`  key id:     ${keyId}`);
console.log(`  secret:     ${keySecret.length} chars, ending ${keySecret.slice(-4)}`);

if (problems.length) {
    console.log(`\n${red("  Rejected before calling Razorpay:")}`);
    for (const p of problems) console.log(`    - ${p}`);
    process.exit(1);
}

const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
let res;
try {
    res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
        headers: { Authorization: `Basic ${auth}` },
    });
} catch (err) {
    console.log(`\n${red("  Could not reach Razorpay:")} ${err.message}`);
    process.exit(1);
}

if (res.ok) {
    console.log(`\n${green("  VALID")} — Razorpay accepted this pair.\n`);
    process.exit(0);
}

if (res.status === 401) {
    console.log(`\n${red("  REJECTED (401)")} — Razorpay does not accept this pair.\n`);
    console.log("  The gateway will not say which half is wrong. In practice it is");
    console.log("  almost always one of these:\n");
    console.log("    1. The id and secret are from DIFFERENT generations.");
    console.log("       They are issued together. A new Key ID always comes with a");
    console.log("       new secret — the old secret does not carry over.");
    console.log("    2. The pair was deactivated by generating a newer one.");
    console.log("       Only one key set is active per account at a time.");
    console.log("    3. The secret was mis-copied. It is shown exactly once, at");
    console.log("       generation, and never again.\n");
    console.log("  Fix: Dashboard > Account & Settings > API Keys > Generate Key,");
    console.log("  then copy BOTH values in that one sitting and re-run this.\n");
    process.exit(1);
}

console.log(`\n${red(`  Unexpected HTTP ${res.status}`)}`);
console.log(`  ${(await res.text()).slice(0, 300)}\n`);
process.exit(1);
