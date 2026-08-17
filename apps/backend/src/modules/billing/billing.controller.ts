import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./billing.service";
import {
    CancelRiderDiscountBody, CreateChargeRuleBody, CreateDiscountRuleBody, ListChargeRulesQuery,
    ListDiscountRulesQuery, ListRiderChargesQuery, ListRiderDiscountsQuery, UpdateChargeRuleBody,
    UpdateDiscountRuleBody, WaiveRiderChargeBody,
} from "./billing.validation";

export async function listChargeRulesHandler(req: AuthedRequest, res: Response) {
    const { chargeCode, scope, vehicleId, active, ...page } = validatedQuery<ListChargeRulesQuery>(req);
    res.json(await service.listChargeRules({ ...page, chargeCode, scope, vehicleId, active }));
}

export async function getChargeRuleHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getChargeRuleById(req.params.id as string));
}

export async function createChargeRuleHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateChargeRuleBody;
    const rule = await service.createChargeRule(body, req.user!);
    res.status(201).json(rule);
}

export async function updateChargeRuleHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateChargeRuleBody;
    res.json(await service.updateChargeRule(req.params.id as string, body, req.user!));
}

export async function listRiderChargesHandler(req: AuthedRequest, res: Response) {
    const { bookingId, status, ...page } = validatedQuery<ListRiderChargesQuery>(req);
    res.json(await service.listRiderCharges({ ...page, bookingId, status }));
}

export async function waiveRiderChargeHandler(req: AuthedRequest, res: Response) {
    const body = req.body as WaiveRiderChargeBody;
    res.json(await service.waiveRiderCharge(req.params.id as string, body, req.user!));
}

export async function listDiscountRulesHandler(req: AuthedRequest, res: Response) {
    const { discountCode, scope, vehicleId, active, ...page } = validatedQuery<ListDiscountRulesQuery>(req);
    res.json(await service.listDiscountRules({ ...page, discountCode, scope, vehicleId, active }));
}

export async function getDiscountRuleHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getDiscountRuleById(req.params.id as string));
}

export async function createDiscountRuleHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateDiscountRuleBody;
    const rule = await service.createDiscountRule(body, req.user!);
    res.status(201).json(rule);
}

export async function updateDiscountRuleHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateDiscountRuleBody;
    res.json(await service.updateDiscountRule(req.params.id as string, body, req.user!));
}

export async function listRiderDiscountsHandler(req: AuthedRequest, res: Response) {
    const { bookingId, status, ...page } = validatedQuery<ListRiderDiscountsQuery>(req);
    res.json(await service.listRiderDiscounts({ ...page, bookingId, status }));
}

export async function cancelRiderDiscountHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CancelRiderDiscountBody;
    res.json(await service.cancelRiderDiscount(req.params.id as string, body, req.user!));
}
