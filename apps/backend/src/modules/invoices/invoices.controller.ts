import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./invoices.service";
import { ListInvoicesFilters } from "./invoices.types";

export async function listInvoicesHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListInvoicesFilters>(req);
    res.json(await service.listInvoices(filters));
}

export async function getInvoiceHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getInvoiceById(req.params.id as string));
}

export async function refundInvoiceHandler(req: AuthedRequest, res: Response) {
    const { reason } = req.body as { reason?: string };
    const invoice = await service.refundInvoice(req.params.id as string, reason, req.user!);
    res.json(invoice);
}
