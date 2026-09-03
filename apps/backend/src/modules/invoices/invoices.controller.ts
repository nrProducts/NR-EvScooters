import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { computeInvoiceLateFee } from "../payments/renewalFee";
import { syncOverdueLateFeeInvoiceForUser } from "../rentals/overdueLateFee";
import { recordOfflinePayment } from "../payments/payments.service";
import * as service from "./invoices.service";
import { ListInvoicesFilters } from "./invoices.types";
import type { AdhocChargeBody } from "./invoices.validation";

export async function listInvoicesHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListInvoicesFilters>(req);
    res.json(await service.listInvoices(filters));
}

/**
 * Rider's own payment history — userId is always the caller's, never
 * client-supplied. Also the ONE place an overdue 'rental' invoice gets its
 * late fee computed and attached before the rider taps Pay — see
 * InvoiceRow.late_fee's doc comment for why this doesn't happen on the
 * shared admin listing.
 */
export async function myInvoicesHandler(req: AuthedRequest, res: Response) {
    const { bookingId, ...page } = validatedQuery<{ page: number; pageSize: number; bookingId?: string }>(req);

    // The overdue-late-fee invoice (purpose 'adhoc') is a standing charge that
    // GROWS every day the rider stays overdue, but unlike a period renewal it
    // gets no live top-up below — computeInvoiceLateFee returns nothing for a
    // non-period purpose. Without this the bill kept quoting the amount from
    // the day it was minted, so Billing said "1 day / ₹334" while Home said
    // "overdue by 2 days / ₹668" for the same debt. Re-pricing the row itself
    // (rather than decorating the response) is what also keeps
    // createOrderForInvoice — which charges the row's balance — in step.
    //
    // Best-effort: a payment history that fails to load is strictly worse than
    // one that briefly shows yesterday's figure.
    await syncOverdueLateFeeInvoiceForUser(req.user!.id).catch(() => undefined);

    const result = await service.listInvoices({
        ...page, userId: req.user!.id, bookingId, sortBy: "created_at", sortDir: "desc",
    });

    const data = await Promise.all(result.data.map(async (invoice) => {
        // Only an unpaid PERIOD renewal can be late. `initial` is what starts
        // the subscription (nothing to be late against), and `settlement` /
        // `adhoc` are not renewals.
        //
        // Two things were wrong here before the audit: this tested
        // `payment_type === "rental"` against a column that no longer exists,
        // and it passed `invoice.booking_id` — also gone — into
        // computeLateRenewalFee, whose first parameter is a SUBSCRIPTION id.
        // Even had the column existed, it would have looked up a late-fee
        // override keyed on the wrong entity and silently found none.
        if (invoice.purpose !== "subscription_period") return invoice;
        if (invoice.payment_state === "paid") return invoice;

        // computeInvoiceLateFee, not computeLateRenewalFee(invoice.due_on):
        // a RENEWAL invoice is for the period being bought, whose due date is
        // in the future, so measuring against it reported every overdue rider
        // as on time. The anchor is the current period's due date — the day
        // their plan ran out. See lateFeeAnchorFor.
        const { isLate, lateFee, daysLate } = await computeInvoiceLateFee(invoice);
        if (!isLate) return invoice;
        return {
            ...invoice,
            late_fee: lateFee,
            days_late: daysLate,
            // What the rider actually has to pay: what is still outstanding
            // on the bill, not the whole bill again.
            total_due: Math.round((invoice.balance_amount + lateFee) * 100) / 100,
        };
    }));

    res.json({ ...result, data });
}

export async function getInvoiceHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getInvoiceById(req.params.id as string));
}

export async function refundInvoiceHandler(req: AuthedRequest, res: Response) {
    const { reason } = req.body as { reason?: string };
    const invoice = await service.refundInvoice(req.params.id as string, reason, req.user!);
    res.json(invoice);
}

/**
 * Records a payment collected offline (cash at the hub, a confirmed UPI
 * transfer, …) against this invoice. Works for any unpaid invoice — an
 * admin-created booking's first period, a renewal a rider paid at the hub,
 * a return settlement, etc.
 */
export async function recordInvoicePaymentHandler(req: AuthedRequest, res: Response) {
    const { method } = req.body as { method: "upi" | "card" | "netbanking" | "wallet" | "cash" };
    await recordOfflinePayment(req.params.id as string, method, req.user!);
    res.json(await service.getInvoiceById(req.params.id as string));
}

/** Raises a one-off charge against a rider (lost key, cleaning fee, fine, …). */
export async function adhocChargeHandler(req: AuthedRequest, res: Response) {
    const body = req.body as AdhocChargeBody;
    const invoice = await service.addAdhocCharge(
        { userId: body.user_id, description: body.description, amount: body.amount, payment: body.payment },
        req.user!,
    );
    res.status(201).json(invoice);
}
