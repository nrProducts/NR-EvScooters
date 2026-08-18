import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { computeLateRenewalFee } from "../payments/renewalFee";
import * as service from "./invoices.service";
import { ListInvoicesFilters } from "./invoices.types";

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
    const result = await service.listInvoices({
        ...page, userId: req.user!.id, bookingId, sortBy: "created_at", sortDir: "desc",
    });

    const data = await Promise.all(result.data.map(async (invoice) => {
        if (invoice.payment_type !== "rental" || invoice.payment_status !== "pending" || !invoice.booking_id) {
            return invoice;
        }
        const { isLate, lateFee, daysLate } = await computeLateRenewalFee(invoice.booking_id, invoice.due_date);
        if (!isLate) return invoice;
        return { ...invoice, late_fee: lateFee, days_late: daysLate, total_due: invoice.amount_due + lateFee };
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
