import { supabaseAdmin } from "../../config/supabase";
import { businessToday, wholeDaysBetween } from "../../common/dates";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The one place both the renewal preview (bookings.service.ts's
 * requestEarlyRecharge) and the actual charge (payments.service.ts's
 * createOrderForInvoice) compute the late-renewal fee, so they can never
 * drift from each other.
 *
 * The rate is a PER-DAY figure — the charge is that rate multiplied by how
 * many whole days have passed since the period was due, computed fresh every
 * time so it keeps growing the longer a rider waits, same as the late-return
 * fee already does.
 *
 * Two things moved underneath:
 *
 *   The global setting is `pricing_rules` code `late_fee` (`is_active` is the
 *   on/off switch, `amount` the rate), not `plan_renewal_settings`.
 *
 *   `bookings.late_fee_override` has no column in the new schema. It is a
 *   live feature (PATCH /bookings/:id/late-fee-override), so it is not
 *   dropped — it is expressed the way the new schema intends, as a
 *   `pricing_rules` row scoped to the subscription. That is what `scope` and
 *   `scope_ref_id` are for, and it gains effective dates and an audit trail
 *   the column never had.
 *
 *   The code carries the subscription id (`late_fee:<uuid>`) because
 *   `pricing_rules.code` is globally UNIQUE — a second plain `late_fee` row
 *   cannot exist. Matching is by scope and scope_ref_id, with the code prefix
 *   only to distinguish a late-fee override from any other subscription-scoped
 *   charge someone might add later.
 */
/**
 * Underscores, not a colon, and not the raw uuid.
 *
 * `pricing_rules.code` is constrained to `^[a-z][a-z0-9_]*$`, which allows
 * neither `:` nor `-`. The previous form — `late_fee:<uuid>` — could
 * therefore NEVER be inserted: setLateFeeOverride's insert failed the check
 * constraint every time, so a per-subscription override was impossible to
 * create. The read paths matched a code that could not exist, which is why
 * nothing ever surfaced an error — the lookup simply always missed and the
 * global rate was used instead.
 *
 * Both hyphens and the separator become underscores so the result conforms.
 */
export const lateFeeOverrideCode = (subscriptionId: string): string =>
    `late_fee_${subscriptionId.replace(/-/g, '_')}`;

/**
 * The date a renewal invoice's lateness is actually measured against.
 *
 * Usually that IS the invoice's own `due_on` — the sweep's markPastDue
 * re-invoices the SAME lapsed period, so its due_on never moves. But
 * billing.service.ts's generatePeriodInvoice advances to a fresh period once
 * the current one's own invoice is already settled (see
 * resolveInvoiceablePeriod / advanceToNextPeriod), and a period created that
 * way carries its OWN forward-looking due_on (when IT will next be due) —
 * not the date the rider was actually late against. Using it directly would
 * make every late renewal price as if paid on time, because the "due" date
 * on the invoice is now in the future.
 *
 * The tell is the immediately preceding period: this invoice's period only
 * exists because that one is being renewed out of, so ITS due_on is the date
 * lateness is measured against. Where there is no previous period (period 1,
 * the opening invoice) the invoice's own due_on is already right.
 *
 * NOT gated on the previous period being `closed`, though it reads as if it
 * should be. The preview runs BEFORE payment and nothing closes the running
 * period until a capture lands (applyRenewalSuccess), so at the exact moment
 * the rider is looking at the bill, the previous period is still `current` —
 * and anchoring on the new period's own forward-looking due_on there scored
 * every overdue rider as on time. A rider three days past their plan was
 * shown, and charged, a ₹0 late fee.
 *
 * Using the previous period's due_on in the `current` case costs nothing: an
 * early renewal is by definition before that date, so computeLateRenewalFee
 * returns not-late from it just the same.
 */
export async function lateFeeReferenceDate(
    subscriptionId: string,
    subscriptionPeriodId: string | null,
    invoiceDueOn: string | null,
): Promise<string | null> {
    if (!invoiceDueOn || !subscriptionPeriodId) return invoiceDueOn;

    const { data: period, error: periodError } = await supabaseAdmin
        .from("subscription_periods")
        .select("sequence_number")
        .eq("id", subscriptionPeriodId)
        .maybeSingle();
    if (periodError) throw periodError;
    if (!period || period.sequence_number <= 1) return invoiceDueOn;

    const { data: previous, error: previousError } = await supabaseAdmin
        .from("subscription_periods")
        .select("due_on, status")
        .eq("subscription_id", subscriptionId)
        .eq("sequence_number", period.sequence_number - 1)
        .maybeSingle();
    if (previousError) throw previousError;

    // 'scheduled' is the one status that is NOT an anchor: a period the rider
    // has not started paying for yet says nothing about how late they are.
    return previous && previous.status !== "scheduled" ? previous.due_on : invoiceDueOn;
}

/**
 * How many days of renewal late fee are owed, and the money for them.
 *
 * ── TODAY IS NOT CHARGED. ────────────────────────────────────────────────
 *
 * This is the rule that separates the RENEWAL fee from the RETURN fee, and
 * they are genuinely different questions:
 *
 *   Renewing buys today. applyRenewalSuccess re-anchors the new period's
 *   starts_on to businessToday(), so a rider renewing on the 3rd is paying
 *   full price for the 3rd. Charging a late fee for the 3rd as well bills
 *   the same day twice — once as plan, once as penalty.
 *
 *   Returning loses today. The rider held the scooter through the 3rd and
 *   hands it back having used it, so the 3rd IS chargeable. The return path
 *   (previewOverdueLateFee -> ensureOverdueLateFeeInvoice, overdueLateFee.ts)
 *   asks for exactly that by passing `chargeCurrentDay: true` — the overdue
 *   adhoc invoice is now the ONLY late fee the return flow collects
 *   (completeRide sets its own settlement late_fee_amount to 0), so the
 *   handover day has to be counted here or it is never charged at all.
 *
 * So with a period due on the 1st:
 *
 *   renew on the 2nd -> 0 days. The 2nd is the first unpaid day and renewing
 *                       today buys it. Late, but nothing lost, nothing owed.
 *   renew on the 3rd -> 1 day  (the 2nd was lost)
 *   renew on the 4th -> 2 days (the 2nd and 3rd were lost)
 *   return on the 3rd -> 2 days (chargeCurrentDay: the 2nd AND the 3rd,
 *                        because the scooter was out on both)
 *
 * Previously this counted `Math.max(1, dueDate -> today)`, which charged the
 * 3rd as well and floored at one day — so a rider renewing on the 2nd, who
 * has lost nothing at all, was charged a full day's penalty.
 *
 * `isLate` means A FEE IS OWED, not "the plan has lapsed". Those diverge for
 * exactly one day now (the 2nd above) and every consumer here wants the
 * money question — the lapsed-plan question is answered by
 * subscriptions.status / getRenewalEligibility on the client.
 *
 * Both ends are compared as IST calendar days rather than through the
 * server's local clock: `wholeDaysBetween` buckets with setHours(), so
 * feeding it `today` as an instant measured the gap in whatever timezone the
 * host happened to run in (UTC on Render), which is a different day boundary
 * from the `date` columns this is compared against. Anchoring BOTH sides at
 * UTC midnight of a business-day string makes the offset cancel exactly.
 */
export async function computeLateRenewalFee(
    subscriptionId: string,
    dueDate: string,
    options: { chargeCurrentDay?: boolean } = {},
): Promise<{ isLate: boolean; lateFee: number; daysLate: number; feePerDay: number }> {
    const elapsed = wholeDaysBetween(
        new Date(`${dueDate}T00:00:00Z`),
        new Date(`${businessToday()}T00:00:00Z`),
    );
    // Renewal drops today (`elapsed - 1`) because the renewal payment itself
    // buys it; a RETURN keeps today (`chargeCurrentDay`) because the rider used
    // the scooter through the handover day and nothing else charges for it.
    // Both floored at 0, which also covers acting early (elapsed <= 0).
    const daysLate = Math.max(0, elapsed - (options.chargeCurrentDay ? 0 : 1));
    if (daysLate <= 0) return { isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0 };

    // The rate lookup — subscription override first, then the global rule —
    // lives in lateFeeRateFor, so the return path resolves the same rate from
    // the same place rather than a constant of its own.
    const feePerDay = await lateFeeRateFor(subscriptionId);
    return { isLate: true, lateFee: round2(feePerDay * daysLate), daysLate, feePerDay };
}

/**
 * The per-day late-fee rate in force for one subscription, from
 * `pricing_rules` — the subscription-scoped override if there is one, the
 * global `late_fee` rule otherwise, and 0 when the rule is switched off or
 * absent (an unconfigured fee is not a fee).
 *
 * ONE rate, for both kinds of lateness. A rider whose plan has expired is
 * simultaneously late renewing and late returning; charging them ₹450/day at
 * the renewal screen and ₹100/day at the return screen — which is what the
 * hard-coded LATE_RETURN_FEE_PER_DAY did — is not two policies, it is one
 * policy with two answers. The admin console has a single "Late Fee &
 * Recovery Policy" card writing this rule, so this is the number an operator
 * believes they configured.
 *
 * LATE_RETURN_FEE_PER_DAY survives only as the default the rule row is
 * SEEDED at, and as the mobile mock repository's stand-in. Nothing on a
 * server path reads it any more.
 */
export async function lateFeeRateFor(subscriptionId: string | null): Promise<number> {
    return (await lateFeeRuleFor(subscriptionId))?.amount ?? 0;
}

export interface LateFeeRule {
    id: string;
    code: string;
    name: string;
    amount: number;
}

/**
 * The rule ITSELF, not just its rate — needed when the fee is materialised as
 * a `subscription_adjustments` row, which snapshots the rule's code and name
 * and points at its id.
 *
 * Null when no late fee applies: no rule configured, or the admin toggle off.
 */
export async function lateFeeRuleFor(subscriptionId: string | null): Promise<LateFeeRule | null> {
    const columns = "id, code, name, amount, is_active";

    if (subscriptionId) {
        const { data: override, error: overrideError } = await supabaseAdmin
            .from("pricing_rules")
            .select(columns)
            .eq("code", lateFeeOverrideCode(subscriptionId))
            .eq("is_active", true)
            .maybeSingle();
        if (overrideError) throw overrideError;
        if (override) {
            return {
                id: override.id, code: override.code,
                name: override.name, amount: Number(override.amount),
            };
        }
    }

    const { data: rule, error } = await supabaseAdmin
        .from("pricing_rules")
        .select(columns)
        .eq("code", "late_fee")
        .eq("scope", "global")
        .maybeSingle();
    if (error) throw error;
    if (!rule?.is_active) return null;

    return { id: rule.id, code: rule.code, name: rule.name, amount: Number(rule.amount) };
}

/**
 * The date an invoice's lateness is measured from.
 *
 * NOT always `invoices.due_on`. A renewal invoice belongs to the period being
 * BOUGHT (the next one), whose due_on is that future period's own end — so
 * measuring against it would say a three-weeks-overdue rider is early. What
 * they are late against is the period they are still riding on: the day their
 * plan ran out.
 *
 * The invoice-shaped front door to lateFeeReferenceDate, which is the one
 * implementation of that rule — callers that already hold an invoice row
 * (computeInvoiceLateFee) shouldn't have to unpack it into three arguments,
 * and two implementations of "which date counts as late" is exactly the drift
 * this file exists to prevent.
 *
 * Returns null when there is nothing to be late against — no period, no due
 * date — which callers treat as "not late".
 */
export async function lateFeeAnchorFor(invoice: {
    subscription_id: string;
    subscription_period_id: string | null;
    due_on: string | null;
}): Promise<string | null> {
    return lateFeeReferenceDate(
        invoice.subscription_id, invoice.subscription_period_id, invoice.due_on,
    );
}

/**
 * The fee STILL OWED on an invoice, measured from the right date. The single
 * entry point for "is this bill late, and by how much" — the renewal preview,
 * order creation, the rider's invoice list and the capture path all call
 * this, so the number the rider is shown and the number they are charged are
 * computed by the same code from the same anchor.
 *
 * "Still owed" because the fee becomes a real line on the invoice once it has
 * been paid (recordLateFeeCharge, payments.service.ts). Anything already
 * charged is inside `balance_amount` from then on, so adding the gross fee on
 * top a second time would bill it twice.
 */
export async function computeInvoiceLateFee(invoice: {
    subscription_id: string;
    subscription_period_id: string | null;
    due_on: string | null;
    purpose: string;
}): Promise<{ isLate: boolean; lateFee: number; daysLate: number; feePerDay: number }> {
    const none = { isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0 };
    if (invoice.purpose !== "subscription_period") return none;

    const anchor = await lateFeeAnchorFor(invoice);
    if (!anchor) return none;

    const charge = await computeLateRenewalFee(invoice.subscription_id, anchor);
    if (!charge.isLate || !invoice.subscription_period_id) return charge;

    const alreadyCharged = await lateFeeAlreadyCharged(
        invoice.subscription_id, invoice.subscription_period_id,
    );
    if (alreadyCharged <= 0) return charge;

    return { ...charge, lateFee: Math.max(0, round2(charge.lateFee - alreadyCharged)) };
}

/**
 * How much of this cycle's late fee the rider has ALREADY been charged.
 *
 * Two things can have collected it, and they were built independently:
 *
 *   · recordLateFeeCharge (payments.service.ts) writes it onto the renewal
 *     invoice as a `subscription_adjustments` row + line, at capture.
 *   · ensureOverdueLateFeeInvoice (rentals/overdueLateFee.ts) bills it as a
 *     standalone `adhoc` invoice, when an overdue rider chooses to RETURN the
 *     scooter instead of renewing.
 *
 * A rider who pays the return-gate invoice and then changes their mind and
 * renews would otherwise be charged the same days × rate a second time — the
 * adhoc invoice leaves no adjustment row for the first check to find. Netting
 * both off here is what makes "the late fee" one debt however it is collected.
 *
 * The adhoc window is the current period's own created_at, matching
 * currentPeriodWindow in overdueLateFee.ts: a fee paid off during an EARLIER
 * overdue cycle must not silently cover a later one.
 */
async function lateFeeAlreadyCharged(
    subscriptionId: string,
    subscriptionPeriodId: string,
): Promise<number> {
    const { data: adjustments, error } = await supabaseAdmin
        .from("subscription_adjustments")
        .select("amount")
        .eq("subscription_period_id", subscriptionPeriodId)
        .like("code_snapshot", "late_fee%")
        .neq("status", "voided");
    if (error) throw error;

    let total = (adjustments ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

    const { data: current, error: currentError } = await supabaseAdmin
        .from("subscription_periods")
        .select("created_at")
        .eq("subscription_id", subscriptionId)
        .eq("status", "current")
        .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return round2(total);

    const { data: adhoc, error: adhocError } = await supabaseAdmin
        .from("invoices")
        .select("id, total_amount")
        .eq("subscription_id", subscriptionId)
        .eq("purpose", "adhoc")
        .neq("status", "void")
        .gte("created_at", current.created_at);
    if (adhocError) throw adhocError;
    if ((adhoc ?? []).length === 0) return round2(total);

    // Only money that actually arrived counts — an unpaid adhoc invoice is a
    // debt, not a payment, and must not reduce what the renewal collects.
    const { data: balances, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("invoice_id, is_paid")
        .in("invoice_id", (adhoc ?? []).map((i) => i.id));
    if (balanceError) throw balanceError;

    const paid = new Set((balances ?? []).filter((b) => b.is_paid).map((b) => b.invoice_id));
    for (const row of adhoc ?? []) {
        if (paid.has(row.id)) total += Number(row.total_amount);
    }

    return round2(total);
}
