import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, forbidden, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { maskLast4 } from "../../common/mask";
import {
    AuthContext, KycDocType, KycStatus, MANDATORY_KYC_DOC_TYPES, Paginated, VerificationStatus,
} from "../../types";
import { kycCompletionPercent } from "../users/users.service";
import { hasGrantedConsent } from "../consent/consent.service";
import { assertValidDocNumber, last4 } from "./kyc.docnumber";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { businessToday } from "../../common/dates";
import {
    assertValidFile, buildStoragePath, createSignedUrl, pathBelongsToUser,
    removeKycFiles, UploadedFile, uploadKycFile,
} from "./kyc.storage";

const DOC_COLUMNS = `
    id, user_id, document_type, document_number_last4, front_storage_path, back_storage_path,
    verification_status, rejection_reason, verified_by_user_id, verified_at,
    expires_on, submitted_at, created_at, updated_at
`;

export interface DocumentRow {
    id: string;
    user_id: string;
    document_type: KycDocType;
    /** Only the last four characters are stored — see kyc.docnumber.ts. */
    document_number_last4: string | null;
    front_storage_path: string | null;
    back_storage_path: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    verified_by_user_id: string | null;
    verified_at: string | null;
    expires_on: string | null;
    submitted_at: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Public shape: no storage paths, and no full document number anywhere — the
 * full value is validated at upload and then discarded, so there is nothing
 * left to reveal. `doc_number_masked` reuses the field name the admin console
 * and the mobile app already had on the user-detail shape, which unifies the
 * two rather than adding a third.
 */
export interface DocumentView {
    id: string;
    document_type: KycDocType;
    doc_number_masked: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    expires_on: string | null;
    is_expired: boolean;
    submitted_at: string | null;
    verified_at: string | null;
    has_back_side: boolean;
    created_at: string;
}

/**
 * The `reveal` parameter this used to take is gone. Nothing can be revealed:
 * the full number is never persisted. Riders and staff see the same masked
 * tail, which for the rider is fine — they typed it.
 */
export function toDocumentView(row: DocumentRow): DocumentView {
    return {
        id: row.id,
        document_type: row.document_type,
        doc_number_masked: maskLast4(row.document_number_last4),
        verification_status: row.verification_status,
        rejection_reason: row.rejection_reason,
        expires_on: row.expires_on,
        is_expired: isExpired(row.expires_on),
        submitted_at: row.submitted_at,
        verified_at: row.verified_at,
        has_back_side: !!row.back_storage_path,
        created_at: row.created_at,
    };
}

const today = () => businessToday();
const isExpired = (date: string | null): boolean => !!date && date < today();

// ---------------------------------------------------------------------------
// Status derivation — mirrors public.compute_kyc_status()
// ---------------------------------------------------------------------------

/**
 * Kept in TypeScript as well as SQL so the API can explain a status without a
 * round trip. The DB trigger remains authoritative; if these ever disagree,
 * the DB wins and this function is the bug.
 */
export function deriveKycStatus(docs: Array<Pick<DocumentRow, "document_type" | "verification_status" | "expires_on">>): KycStatus {
    const mandatory = docs.filter((d) => MANDATORY_KYC_DOC_TYPES.includes(d.document_type));
    if (mandatory.length === 0) return "not_submitted";

    if (mandatory.some((d) => d.verification_status === "rejected")) return "rejected";

    const verified = mandatory.filter(
        (d) => d.verification_status === "verified" && !isExpired(d.expires_on),
    ).length;

    if (verified === MANDATORY_KYC_DOC_TYPES.length) return "verified";
    if (verified > 0) return "partially_verified";
    return "pending";
}

// ---------------------------------------------------------------------------
// Rider: read own KYC
// ---------------------------------------------------------------------------

/**
 * The `reveal` parameter this used to take is gone along with the one on
 * toDocumentView: there is no full document number to reveal, so a caller
 * passing `true` was asking for something that cannot happen and reading like
 * it could.
 */
export async function getKycForUser(userId: string) {
    const docs = await documentsFor(userId);
    const missing = MANDATORY_KYC_DOC_TYPES.filter(
        (type) => !docs.some((d) => d.document_type === type && d.verification_status !== "rejected"),
    );

    return {
        user_id: userId,
        kyc_status: deriveKycStatus(docs),
        completion_percent: kycCompletionPercent(docs),
        missing_document_types: missing,
        can_submit: missing.length === 0,
        documents: docs.map((d) => toDocumentView(d)),
    };
}

// ---------------------------------------------------------------------------
// Rider: upload / replace / delete
// ---------------------------------------------------------------------------

export interface UploadDocumentInput {
    document_type: KycDocType;
    doc_number: string;
    expires_on?: string;
    front: UploadedFile;
    back?: UploadedFile;
}

export async function uploadDocument(
    userId: string,
    input: UploadDocumentInput,
    actor: AuthContext,
    req?: Request,
): Promise<DocumentView> {
    // DPDPA s.6: no lawful basis, no collection. This is the server-side half
    // of the consent screen — without it the mobile gate is decoration that a
    // direct API call walks straight past.
    await assertIdentityConsent(userId);

    if (input.document_type === "driving_licence") {
        if (!input.expires_on) {
            throw businessRule("A driving licence must include its expiry date.", {
                expires_on: "Enter the licence expiry date.",
            });
        }
        if (isExpired(input.expires_on)) {
            throw businessRule("This driving licence has already expired.", {
                expires_on: "This licence has expired.",
            });
        }
    }
    // Validated in memory, then discarded. From here on the full number is
    // out of scope and only last4() survives into the insert below.
    assertValidDocNumber(input.document_type, input.doc_number);

    // the partial unique index on (user_id, document_type) covers pending+verified. Check first so the
    // rider gets a clear 409 rather than a raw constraint error, and so an
    // orphan object is never uploaded for a doomed insert.
    const existing = await activeDocumentOfType(userId, input.document_type);
    if (existing) {
        throw conflict(
            existing.verification_status === "verified"
                ? "This document is already verified and cannot be replaced."
                : "A document of this type is already awaiting review.",
        );
    }

    const frontMime = assertValidFile(input.front, "front");
    const backMime = input.back ? assertValidFile(input.back, "back") : null;

    const frontPath = buildStoragePath(userId, input.document_type, frontMime, "front");
    const backPath = backMime && input.back ? buildStoragePath(userId, input.document_type, backMime, "back") : null;

    await uploadKycFile(frontPath, input.front, frontMime);
    if (backPath && input.back && backMime) await uploadKycFile(backPath, input.back, backMime);

    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .insert({
            user_id: userId,
            document_type: input.document_type,
            document_number_last4: last4(input.doc_number),
            front_storage_path: frontPath,
            back_storage_path: backPath,
            expires_on: input.expires_on ?? null,
            verification_status: "pending",
        })
        .select(DOC_COLUMNS)
        .single();

    if (error) {
        // Compensating action: the row lost, so the bytes must go too.
        await removeKycFiles([frontPath, backPath]);
        if (error.code === "23505") throw conflict("A document of this type is already on file.");
        throw error;
    }

    const row = data as unknown as DocumentRow;

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "kyc.document_uploaded",
        entityType: "kyc_document",
        entityId: row.id,
        // doc_number is deliberately absent: audit_logs is retained for
        // years and there is no version of this number worth putting there.
        after: { document_type: row.document_type, expires_on: row.expires_on },
        req,
    });

    return toDocumentView(row);
}

export async function updateOwnDocument(
    userId: string,
    documentId: string,
    patch: { doc_number?: string; expires_on?: string; front?: UploadedFile; back?: UploadedFile },
    actor: AuthContext,
    req?: Request,
): Promise<DocumentView> {
    const row = await requireDocument(documentId);
    if (row.user_id !== userId) throw notFound("Document not found.");

    // Verified documents are immutable from the rider side (§5). A rejected
    // one is exactly what the rider is expected to correct and resubmit.
    if (row.verification_status === "verified") {
        throw businessRule("A verified document cannot be changed. Contact support if it is wrong.");
    }

    const next: Record<string, unknown> = {};
    const staleObjects: Array<string | null> = [];

    if (patch.doc_number) {
        // Same rule as the upload path: checked in memory, only the tail
        // persisted. See kyc.docnumber.ts.
        assertValidDocNumber(row.document_type, patch.doc_number);
        next.document_number_last4 = last4(patch.doc_number);
    }
    if (patch.expires_on) {
        if (row.document_type === "driving_licence" && isExpired(patch.expires_on)) {
            throw businessRule("This driving licence has already expired.", {
                expires_on: "This licence has expired.",
            });
        }
        next.expires_on = patch.expires_on;
    }

    if (patch.front) {
        const mime = assertValidFile(patch.front, "front");
        const path = buildStoragePath(userId, row.document_type, mime, "front");
        await uploadKycFile(path, patch.front, mime);
        next.front_storage_path = path;
        staleObjects.push(row.front_storage_path);
    }
    if (patch.back) {
        const mime = assertValidFile(patch.back, "back");
        const path = buildStoragePath(userId, row.document_type, mime, "back");
        await uploadKycFile(path, patch.back, mime);
        next.back_storage_path = path;
        staleObjects.push(row.back_storage_path);
    }

    if (Object.keys(next).length === 0) throw businessRule("Provide at least one field to update.");

    // Correcting a rejected document returns it to the queue and clears the
    // old reason, so reviewers never see a stale rejection on a fresh file.
    if (row.verification_status === "rejected") {
        next.verification_status = "pending";
        next.rejection_reason = null;
        next.verified_by_user_id = null;
        next.verified_at = null;
        next.submitted_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .update(next as never)
        .eq("id", documentId)
        .eq("user_id", userId)
        .select(DOC_COLUMNS)
        .single();

    if (error) throw error;

    await removeKycFiles(staleObjects);

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "kyc.document_updated",
        entityType: "kyc_document",
        entityId: documentId,
        before: { verification_status: row.verification_status },
        after: { verification_status: next.verification_status ?? row.verification_status },
        req,
    });

    return toDocumentView(data as unknown as DocumentRow);
}

export async function deleteOwnDocument(
    userId: string,
    documentId: string,
    actor: AuthContext,
    req?: Request,
): Promise<void> {
    const row = await requireDocument(documentId);
    if (row.user_id !== userId) throw notFound("Document not found.");
    if (row.verification_status === "verified") {
        throw businessRule("A verified document cannot be deleted.");
    }
    if (!pathBelongsToUser(row.front_storage_path ?? `${userId}/`, userId)) {
        throw forbidden("This document does not belong to you.");
    }

    const { error } = await supabaseAdmin
        .from("kyc_documents")
        .delete()
        .eq("id", documentId)
        .eq("user_id", userId);
    if (error) throw error;

    await removeKycFiles([row.front_storage_path, row.back_storage_path]);

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "kyc.document_deleted",
        entityType: "kyc_document",
        entityId: documentId,
        before: { document_type: row.document_type, verification_status: row.verification_status },
        req,
    });
}

// ---------------------------------------------------------------------------
// Rider: submit
// ---------------------------------------------------------------------------

export async function submitKyc(userId: string, actor: AuthContext, req?: Request) {
    const docs = await documentsFor(userId);

    const missing = MANDATORY_KYC_DOC_TYPES.filter(
        (type) => !docs.some((d) => d.document_type === type && d.verification_status !== "rejected"),
    );
    if (missing.length > 0) {
        throw businessRule(
            `Upload all required documents before submitting: ${missing.join(", ")}.`,
        );
    }

    const current = deriveKycStatus(docs);
    if (current === "verified") throw businessRule("Your KYC is already verified.");
    if (current === "pending" && docs.every((d) => d.submitted_at)) {
        throw conflict("Your KYC is already awaiting review.");
    }

    const stamp = new Date().toISOString();
    const { error } = await supabaseAdmin
        .from("kyc_documents")
        .update({ submitted_at: stamp })
        .eq("user_id", userId)
        .is("submitted_at", null)
        .in("verification_status", ["pending"]);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "kyc.submitted",
        entityType: "user",
        entityId: userId,
        after: { submitted_at: stamp, document_count: docs.length },
        req,
    });

    await notify({
        notificationType: "kyc_review_needed",
        referenceType: "user",
        referenceId: userId,
        title: "KYC Review Needed",
        bodyFallback: "{rider} submitted documents for review.",
        screen: "/kyc",
        riderId: userId,
    });

    // kyc_status is maintained by trg_sync_user_kyc_status, so re-read rather
    // than assuming what it became.
    return getKycForUser(userId);
}

// ---------------------------------------------------------------------------
// Admin: queue
// ---------------------------------------------------------------------------

export interface KycListFilters {
    page: number;
    pageSize: number;
    search?: string;
    status?: KycStatus;
    docType?: KycDocType;
    submittedFrom?: string;
    submittedTo?: string;
    expiringBefore?: string;
    sortBy: "submitted_at" | "full_name" | "kyc_status";
    sortDir: "asc" | "desc";
}

export interface KycQueueItem {
    user_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    kyc_status: KycStatus;
    completion_percent: number;
    document_count: number;
    earliest_submitted_at: string | null;
    has_expired_document: boolean;
}

export async function listKycQueue(filters: KycListFilters): Promise<Paginated<KycQueueItem>> {
    // kyc_status moved to rider_profiles. `!inner` keeps the queue to riders
    // who actually have a profile — staff accounts have none and have no KYC.
    let query = supabaseAdmin
        .from("users")
        .select("id, full_name, email, phone, rider_profiles!inner(kyc_status)", { count: "exact" })
        .is("deleted_at", null);

    if (filters.status) query = query.eq("rider_profiles.kyc_status", filters.status);
    else query = query.neq("rider_profiles.kyc_status", "not_submitted");

    if (filters.search) {
        const term = filters.search.replace(/[%_\\,()]/g, "");
        query = query.or(
            `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
        );
    }

    if (filters.docType || filters.submittedFrom || filters.submittedTo || filters.expiringBefore) {
        const ids = await userIdsMatchingDocumentFilters(filters);
        if (ids.length === 0) return paginate<KycQueueItem>([], 0, filters);
        query = query.in("id", ids);
    }

    const sortColumn = filters.sortBy === "submitted_at" ? "updated_at" : filters.sortBy;
    const [from, to] = toRange(filters);
    query = query.order(sortColumn, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = ((data ?? []) as unknown as Array<{
        id: string; full_name: string; email: string | null; phone: string | null;
        rider_profiles: { kyc_status: KycStatus } | { kyc_status: KycStatus }[];
    }>).map((r) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        kyc_status: (Array.isArray(r.rider_profiles) ? r.rider_profiles[0] : r.rider_profiles).kyc_status,
    }));
    const docsByUser = await documentsForMany(rows.map((r) => r.id));

    const items: KycQueueItem[] = rows.map((row) => {
        const docs = docsByUser.get(row.id) ?? [];
        const submitted = docs.map((d) => d.submitted_at).filter((s): s is string => !!s).sort();
        return {
            user_id: row.id,
            full_name: row.full_name,
            email: row.email,
            phone: row.phone,
            kyc_status: row.kyc_status,
            completion_percent: kycCompletionPercent(docs),
            document_count: docs.length,
            earliest_submitted_at: submitted[0] ?? null,
            has_expired_document: docs.some((d) => isExpired(d.expires_on)),
        };
    });

    return paginate(items, count ?? 0, filters);
}

/** Full detail for the review screen. Staff see unmasked numbers here only. */
export async function getKycDetail(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, full_name, email, phone, date_of_birth, address_line_1, city, state, postal_code, country, kyc_status, account_status")
        .eq("id", userId)
        .is("deleted_at", null)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("User not found.");

    const docs = await documentsFor(userId);
    const history = await verificationHistory(userId);

    return {
        rider: data,
        kyc_status: deriveKycStatus(docs),
        completion_percent: kycCompletionPercent(docs),
        documents: docs.map((d) => toDocumentView(d)),
        history,
    };
}

/**
 * Signed URL for one document side. Minted per request, never stored, and
 * scoped to a caller the route layer has already authorised.
 */
export async function getDocumentSignedUrl(
    documentId: string,
    side: "front" | "back",
    actor: AuthContext,
    isStaffCaller: boolean,
    // user_id and document_type are returned alongside the URL so the controller can
    // record WHOSE document and WHICH document was opened, without a second
    // lookup. The controller strips them before responding.
): Promise<{ url: string; expires_in: number; user_id: string; document_type: KycDocType }> {
    const row = await requireDocument(documentId);
    if (!isStaffCaller && row.user_id !== actor.id) throw notFound("Document not found.");

    const path = side === "front" ? row.front_storage_path : row.back_storage_path;
    if (!path) throw notFound(`This document has no ${side} side.`);
    if (!pathBelongsToUser(path, row.user_id)) {
        // Defence in depth: a path outside the owner's prefix means the row
        // was tampered with, so refuse rather than sign it.
        throw forbidden("This document could not be verified as authentic.");
    }

    const url = await createSignedUrl(path);
    return { url, expires_in: 300, user_id: row.user_id, document_type: row.document_type };
}

// ---------------------------------------------------------------------------
// Admin: verify / reject
// ---------------------------------------------------------------------------

export async function verifyDocument(
    documentId: string,
    actor: AuthContext,
    req?: Request,
): Promise<DocumentView> {
    const row = await requireDocument(documentId);

    // Belt and braces: trg_guard_document_verification enforces this too, but
    // a clean 403 beats a mapped constraint error.
    if (row.user_id === actor.id) throw forbidden("You cannot verify your own document.");
    if (row.verification_status === "verified") throw conflict("This document is already verified.");
    if (isExpired(row.expires_on)) {
        throw businessRule("This document has expired and cannot be verified.");
    }

    const updated = await applyVerification(documentId, actor.id, {
        verification_status: "verified",
        rejection_reason: null,
        verified_by_user_id: actor.id,
        verified_at: new Date().toISOString(),
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: row.user_id,
        action: "kyc.document_verified",
        entityType: "kyc_document",
        entityId: documentId,
        before: { verification_status: row.verification_status },
        after: { verification_status: "verified" },
        req,
    });

    return toDocumentView(updated);
}

export async function rejectDocument(
    documentId: string,
    reason: string,
    actor: AuthContext,
    req?: Request,
): Promise<DocumentView> {
    const row = await requireDocument(documentId);
    if (row.user_id === actor.id) throw forbidden("You cannot reject your own document.");
    if (!reason?.trim()) throw businessRule("A rejection reason is required.", { reason: "Give a reason." });

    const updated = await applyVerification(documentId, actor.id, {
        verification_status: "rejected",
        rejection_reason: reason.trim(),
        verified_by_user_id: actor.id,
        verified_at: new Date().toISOString(),
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: row.user_id,
        action: "kyc.document_rejected",
        entityType: "kyc_document",
        entityId: documentId,
        before: { verification_status: row.verification_status },
        after: { verification_status: "rejected", reason: reason.trim() },
        req,
    });

    return toDocumentView(updated);
}

// ---------------------------------------------------------------------------
// Admin: final approve / reject
// ---------------------------------------------------------------------------

export async function approveKyc(userId: string, actor: AuthContext, req?: Request) {
    if (userId === actor.id) throw forbidden("You cannot approve your own KYC.");
    const docs = await documentsFor(userId);

    const unverified = MANDATORY_KYC_DOC_TYPES.filter(
        (type) => !docs.some((d) => d.document_type === type && d.verification_status === "verified"),
    );
    if (unverified.length > 0) {
        throw businessRule(
            `Every required document must be verified first. Outstanding: ${unverified.join(", ")}.`,
        );
    }
    if (docs.some((d) => d.verification_status === "verified" && isExpired(d.expires_on))) {
        throw businessRule("A verified document has expired. The rider must upload a current one.");
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "kyc.approved",
        entityType: "user",
        entityId: userId,
        after: { kyc_status: "verified" },
        req,
    });

    await notifyUser(userId, {
        template: "kyc_approved",
        title: "KYC Approved",
        body: "You're verified — go ahead and book a scooter.",
        screen: "home",
    });

    // No direct write to users.kyc_status: the trigger derives it. This
    // endpoint is the human checkpoint plus the audit record.
    return getKycForUser(userId);
}

export async function rejectKyc(userId: string, reason: string, actor: AuthContext, req?: Request) {
    if (userId === actor.id) throw forbidden("You cannot reject your own KYC.");
    if (!reason?.trim()) throw businessRule("A rejection reason is required.", { reason: "Give a reason." });

    const docs = await documentsFor(userId);
    const open = docs.filter((d) => d.verification_status === "pending");
    if (open.length === 0 && docs.every((d) => d.verification_status === "rejected")) {
        throw conflict("This rider's KYC is already rejected.");
    }

    for (const doc of open) {
        await applyVerification(doc.id, actor.id, {
            verification_status: "rejected",
            rejection_reason: reason.trim(),
            verified_by_user_id: actor.id,
            verified_at: new Date().toISOString(),
        });
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "kyc.rejected",
        entityType: "user",
        entityId: userId,
        after: { kyc_status: "rejected", reason: reason.trim() },
        req,
    });

    await notifyUser(userId, {
        template: "kyc_rejected",
        title: "KYC Needs Attention",
        body: reason.trim(),
        screen: "kyc",
    });

    return getKycForUser(userId);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * The verification trigger needs to know who is acting, and the service role
 * has no auth.uid(). set_config with is_local=false applies to the session;
 * because supabase-js uses a connection pool we set and clear it around the
 * write rather than relying on transaction scope.
 */
async function applyVerification(
    documentId: string,
    actorId: string,
    patch: Record<string, unknown>,
): Promise<DocumentRow> {
    // `set_config` is a Postgres built-in, not one of ours, so it is absent
    // from the generated RPC union — hence the cast. Whether it is callable
    // at all depends on the role's grants, which is why the failure below is
    // a debug line rather than an error.
    const { error: setError } = await (supabaseAdmin.rpc as unknown as (
        fn: string, args: Record<string, unknown>,
    ) => Promise<{ error: unknown }>)("set_config", {
        setting_name: "app.actor_id",
        new_value: actorId,
        is_local: false,
    });
    if (setError) {
        // set_config is not exposed by default; the trigger falls back to
        // auth.uid() (null for service role) and its self-verification guard
        // is then enforced by the explicit checks in verify/rejectDocument.
        console.debug("[kyc] app.actor_id not set; relying on service-layer guards");
    }

    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .update(patch as never)
        .eq("id", documentId)
        .select(DOC_COLUMNS)
        .single();

    if (error) {
        if (error.code === "P0001" || error.code === "23514") throw businessRule(error.message);
        throw error;
    }
    return data as unknown as DocumentRow;
}

async function requireDocument(documentId: string): Promise<DocumentRow> {
    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .select(DOC_COLUMNS)
        .eq("id", documentId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Document not found.");
    return data as unknown as DocumentRow;
}

/**
 * Refuses to store an identity document from a rider who has not granted
 * consent for identity verification, or who has since withdrawn it.
 *
 * Checked on every upload rather than once at onboarding: consent is a live
 * state, not a milestone, and a rider who withdrew last week must not be able
 * to add a document this week.
 */
async function assertIdentityConsent(userId: string): Promise<void> {
    const granted = await hasGrantedConsent(userId, "kyc_identity_verification");
    if (!granted) {
        throw forbidden(
            "We need your consent to verify your identity before we can accept an ID " +
            "document. Open Privacy in the app to review and give consent.",
        );
    }
}

async function activeDocumentOfType(userId: string, docType: KycDocType): Promise<DocumentRow | null> {
    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .select(DOC_COLUMNS)
        .eq("user_id", userId)
        .eq("document_type", docType)
        .in("verification_status", ["pending", "verified"])
        .maybeSingle();
    if (error) throw error;
    return (data as unknown as DocumentRow) ?? null;
}

async function documentsFor(userId: string): Promise<DocumentRow[]> {
    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .select(DOC_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as DocumentRow[];
}

async function documentsForMany(userIds: string[]): Promise<Map<string, DocumentRow[]>> {
    const map = new Map<string, DocumentRow[]>();
    if (userIds.length === 0) return map;
    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .select(DOC_COLUMNS)
        .in("user_id", userIds);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as DocumentRow[]) {
        const list = map.get(row.user_id) ?? [];
        list.push(row);
        map.set(row.user_id, list);
    }
    return map;
}

async function userIdsMatchingDocumentFilters(filters: KycListFilters): Promise<string[]> {
    let q = supabaseAdmin.from("kyc_documents").select("user_id");
    if (filters.docType) q = q.eq("document_type", filters.docType);
    if (filters.submittedFrom) q = q.gte("submitted_at", filters.submittedFrom);
    if (filters.submittedTo) q = q.lte("submitted_at", filters.submittedTo);
    if (filters.expiringBefore) q = q.lte("expires_on", filters.expiringBefore);
    const { data, error } = await q.limit(1000);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id))];
}

/** Prior verify/reject decisions, straight from the immutable audit trail. */
async function verificationHistory(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("audit_logs")
        .select("id, action, actor_id, created_at, after_data")
        .eq("target_user_id", userId)
        .in("action", [
            "kyc.document_verified", "kyc.document_rejected",
            "kyc.approved", "kyc.rejected", "kyc.submitted",
        ])
        .order("created_at", { ascending: false })
        .limit(50);
    if (error) throw error;
    return data ?? [];
}
