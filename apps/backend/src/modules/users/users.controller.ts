import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { isStaff, isAdmin, resolveTargetUserId } from "../../middleware/authorize.middleware";
import { badRequest, forbidden } from "../../common/AppError";
import { AccountStatus, RoleName } from "../../types";
import { ListUsersFilters } from "./users.types";
import * as service from "./users.service";
import { hasActiveBookingForUser } from "../bookings/bookings.service";

export async function listUsersHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListUsersFilters>(req);
    res.json(await service.listUsers(filters, req.user!));
}

export async function getUserHandler(req: AuthedRequest, res: Response) {
    const id = resolveTargetUserId(req);
    res.json(await service.getUserById(id, req.user!));
}

export async function createUserHandler(req: AuthedRequest, res: Response) {
    const user = await service.createUser(req.body, req.user!, req);
    res.status(201).json(user);
}

export async function updateUserHandler(req: AuthedRequest, res: Response) {
    const id = resolveTargetUserId(req);
    // A rider editing themselves has already been narrowed to the
    // self-service field set by the route's schema choice; staff editing
    // someone else may not use that route at all.
    if (id !== req.user!.id && !isStaff(req)) throw forbidden("You may only edit your own profile.");
    res.json(await service.updateUser(id, req.body, req.user!, req));
}

/**
 * PATCH /users/me has no ":id" route param — "/me" is a literal path — so
 * resolveTargetUserId() (which only special-cases "me" arriving as a param
 * value) can't be used here. Always the caller's own id, same as meHandler.
 */
export async function updateMyProfileHandler(req: AuthedRequest, res: Response) {
    res.json(await service.updateUser(req.user!.id, req.body, req.user!, req));
}

export async function deleteUserHandler(req: AuthedRequest, res: Response) {
    await service.softDeleteUser(req.params.id as string, req.user!, req);
    res.status(204).send();
}

export async function restoreUserHandler(req: AuthedRequest, res: Response) {
    res.json(await service.restoreUser(req.params.id as string, req.user!, req));
}

export async function updateStatusHandler(req: AuthedRequest, res: Response) {
    const { action, reason } = req.body as {
        action: "activate" | "deactivate" | "suspend";
        reason?: string;
    };
    res.json(await service.changeAccountStatus(req.params.id as string, action, reason, req.user!, req));
}

export async function getRolesHandler(req: AuthedRequest, res: Response) {
    const id = resolveTargetUserId(req);
    if (id !== req.user!.id && !isStaff(req)) throw forbidden("You may only view your own roles.");
    res.json({ roles: await service.getRoles(id) });
}

export async function updateRolesHandler(req: AuthedRequest, res: Response) {
    const { roles } = req.body as { roles: RoleName[] };
    res.json({ roles: await service.replaceRoles(req.params.id as string, roles, req.user!, req) });
}

/** Exposed for the mobile "am I allowed to unlock?" check. */
export async function meHandler(req: AuthedRequest, res: Response) {
    const detail = await service.getUserById(req.user!.id, req.user!);
    const [hasActiveRental, hasActiveBooking] = await Promise.all([
        service.hasActiveRentalForUser(req.user!.id),
        hasActiveBookingForUser(req.user!.id),
    ]);
    res.json({
        ...detail,
        can_rent: detail.kyc_status === "verified" && (detail.account_status as AccountStatus) === "active",
        is_admin: isAdmin(req),
        has_active_rental: hasActiveRental,
        has_active_booking: hasActiveBooking,
    });
}

export async function uploadMyPhotoHandler(req: AuthedRequest, res: Response) {
    const file = req.file;
    if (!file) throw badRequest("A photo is required.", { photo: "Attach a photo." });

    const result = await service.uploadMyPhoto(
        req.user!.id,
        { buffer: file.buffer, mimetype: file.mimetype, size: file.size, originalname: file.originalname },
        req.user!,
        req,
    );
    res.status(201).json(result);
}

export async function myPhotoUrlHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyPhotoUrl(req.user!.id));
}
