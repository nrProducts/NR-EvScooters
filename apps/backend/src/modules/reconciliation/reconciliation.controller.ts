import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./reconciliation.service";
import { ReconciliationQuery } from "./reconciliation.validation";

export async function getReconciliationHandler(req: AuthedRequest, res: Response) {
    const { from, to } = validatedQuery<ReconciliationQuery>(req);
    res.json(await service.getReconciliationReport({ from, to }));
}
