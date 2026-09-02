import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { isStaff, isAdmin, resolveTargetUserId } from "../../middleware/authorize.middleware";
import { badRequest, forbidden } from "../../common/AppError";
import { UserRole, UserStatus } from "../../types";
import { ListUsersFilters } from "./users.types";
import * as service from "./users.service";
import * as permissionsService from "./staff-permissions.service";
import { hasActiveBookingForUser } from "../bookings/bookings.service";
import { getConsentState } from "../consent/consent.service";
import { logPiiAccess } from "../../common/piiAccess";

export async function listUsersHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListUsersFilters>(req);
    res.json(await service.listUsers(filters, req.user!));
}

export async function getUserHandler(req: AuthedRequest, res: Response) {
    const id = resolveTargetUserId(req);
    const user = await service.getUserById(id, req.user!);

    // A staff member reading a rider's profile is a read of personal data.
    // logPiiAccess no-ops on self-access, so the "me" alias costs nothing.
    await logPiiAccess({
        actor: req.user!,
        targetUserId: id,
        resource: "user_profile",
        resourceId: id,
        fields: ["full_name", "phone", "email", "date_of_birth", "address", "emergency_contact"],
        req,
    });

    res.json(user);
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

/**
 * A user has one role now, but the response still carries a one-element
 * `roles` array. Both clients read `roles[]`, and reshaping the wire format
 * is frontend work the schema change does not require — Stage 10 collapses it.
 */
export async function getRolesHandler(req: AuthedRequest, res: Response) {
    const id = resolveTargetUserId(req);
    if (id !== req.user!.id && !isStaff(req)) throw forbidden("You may only view your own roles.");
    const role = await service.getRole(id);
    res.json({ role, roles: [role] });
}

export async function approveSignupHandler(req: AuthedRequest, res: Response) {
    const { role } = req.body as { role: "staff" | "rider" };
    res.json(await service.approveSignup(req.params.id as string, role, req.user!, req));
}

export async function updateRolesHandler(req: AuthedRequest, res: Response) {
    // Accepts either shape: `{ role }` or the legacy `{ roles: [one] }`.
    const body = req.body as { role?: UserRole; roles?: UserRole[] };
    const role = body.role ?? body.roles?.[0];
    if (!role) throw badRequest("A role is required.");
    const next = await service.changeRole(req.params.id as string, role, req.user!, req);
    res.json({ role: next, roles: [next] });
}

/**
 * Consent state for the profile payload, degrading rather than throwing.
 *
 * GET /users/me is the gateway to the entire app — if it 500s, the rider sees
 * "Couldn't load your profile" and cannot reach ANY screen, including the
 * privacy screen they would need to fix a consent problem. Coupling that
 * endpoint to a subsystem added later was a mistake; this decouples it again.
 *
 * It fails OPEN, reporting `up_to_date: true`, and that is safe because the
 * flag is only a NAVIGATION HINT. The actual control is server-side and
 * independent: uploadDocument() calls assertIdentityConsent() and refuses to
 * store an identity document without a live consent record. So a consent
 * outage means riders are not nagged to re-consent; it does not mean their
 * documents get collected without a lawful basis.
 *
 * Fail open on the hint, fail closed on the control.
 */
async function safeConsentState(userId: string) {
    try {
        return await getConsentState(userId);
    } catch (err) {
        console.error("[users.me] consent state unavailable; serving profile without it", {
            userId,
            error: (err as Error)?.message ?? "unknown",
        });
        return { up_to_date: true, current_notice_version: "" };
    }
}

export async function getPermissionsHandler(req: AuthedRequest, res: Response) {
    res.json({ modules: await permissionsService.getModulePermissions(req.params.id as string) });
}

export async function updatePermissionsHandler(req: AuthedRequest, res: Response) {
    const { modules } = req.body as { modules: permissionsService.ModulePermission[] };
    res.json({
        modules: await permissionsService.replaceModulePermissions(req.params.id as string, modules, req.user!, req),
    });
}

export async function applyPermissionProfileHandler(req: AuthedRequest, res: Response) {
    const { profile } = req.body as { profile: string };
    res.json({
        modules: await permissionsService.applyPermissionProfile(req.params.id as string, profile, req.user!, req),
    });
}


/** Exposed for the mobile "am I allowed to unlock?" check. */
export async function meHandler(req: AuthedRequest, res: Response) {
    const detail = await service.getUserById(req.user!.id, req.user!);
    const [hasActiveRental, hasActiveBooking, consent] = await Promise.all([
        service.hasActiveRentalForUser(req.user!.id),
        hasActiveBookingForUser(req.user!.id),
        safeConsentState(req.user!.id),
    ]);
    res.json({
        ...detail,
        can_rent: detail.kyc_status === "verified" && (detail.account_status as UserStatus) === "active",
        is_admin: isAdmin(req),
        has_active_rental: hasActiveRental,
        has_active_booking: hasActiveBooking,
        // Folded into /users/me so the mobile routing gate can decide whether
        // to show the consent screen without a second round trip — and so a
        // published notice revision re-prompts on the next profile refresh
        // rather than whenever the rider happens to open Privacy.
        consent_up_to_date: consent.up_to_date,
        consent_notice_version: consent.current_notice_version,
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

export async function getUserPhotoUrlHandler(req: AuthedRequest, res: Response) {
    const id = resolveTargetUserId(req);
    if (id !== req.user!.id && !isStaff(req)) throw forbidden("You may only view your own photo.");
    const result = await service.getMyPhotoUrl(id);

    // The KYC selfie. Logged after the call so a refusal is not recorded as
    // an access that happened.
    await logPiiAccess({
        actor: req.user!,
        targetUserId: id,
        resource: "profile_photo",
        resourceId: id,
        fields: ["profile_photo"],
        reason: "kyc_review",
        req,
    });

    res.json(result);
}

export async function registerPushTokenHandler(req: AuthedRequest, res: Response) {
    const { token, platform } = req.body as { token: string; platform?: "ios" | "android" };
    await service.registerPushToken(req.user!.id, token, platform);
    res.status(204).send();
}
