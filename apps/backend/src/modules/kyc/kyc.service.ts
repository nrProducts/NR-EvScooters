import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, forbidden, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { maskDocumentNumber } from "../../common/mask";
import {
    AuthContext, KycDocType, KycStatus, MANDATORY_KYC_DOC_TYPES, Paginated, VerificationStatus,
} from "../../types";
import { kycCompletionPercent } from "../users/users.service";
import { notifyUser } from "../notifications/notifications.service";
import {
    assertValidFile, buildStoragePath, createSignedUrl, pathBelongsToUser,
    removeKycFiles, UploadedFile, uploadKycFile,
} from "./kyc.storage";

const DOC_COLUMNS = `
    id, user_id, doc_type, doc_number, storage_path, back_storage_path,
    verification_status, rejection_reason, verified_by, verified_at,
    expiry_date, submitted_at, created_at, updated_at
`;

export interface DocumentRow {
    id: string;
    user_id: string;
    doc_type: KycDocType;
    doc_number: string;
    storage_path: string | null;
    back_storage_path: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    verified_by: string | null;
    verified_at: string | null;
    expiry_date: string | null;
    submitted_at: string | null;
    created_at: string;
    updated_at: string;
}

/** Public shape: no storage paths, document number masked unless revealed. */
export interface DocumentView {
    id: string;
    doc_type: KycDocType;
    doc_number: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    expiry_date: string | null;
    is_expired: boolean;
    submitted_at: string | null;
    verified_at: string | null;
    has_back_side: boolean;
    created_at: string;
}

export function toDocumentView(row: DocumentRow, reveal: boolean): DocumentView {
    return {
        id: row.id,
        doc_type: row.doc_type,
        doc_number: reveal ? row.doc_number : maskDocumentNumber(row.doc_number),
        verification_status: row.verification_status,
        rejection_reason: row.rejection_reason,
        expiry_date: row.expiry_date,
        is_expired: isExpired(row.expiry_date),
        submitted_at: row.submitted_at,
        verified_at: row.verified_at,
        has_back_side: !!row.back_storage_path,
        created_at: row.created_at,
    };
}

const today = () => new Date().toISOString().slice(0, 10);
const isExpired = (date: string | null): boolean => !!date && date < today();

/** Aadhaar is always exactly 12 digits; spaces/hyphens are how it's usually printed. */
export function assertValidAadhaar(docNumber: string): void {
    const digits = docNumber.replace(/[\s-]/g, "");
    if (!/^\d{12}$/.test(digits)) {
        throw businessRule("Enter a valid 12-digit Aadhaar number.", {
            doc_number: "Must be exactly 12 digits.",
        });
    }
}

// ---------------------------------------------------------------------------
// Status derivation — mirrors public.compute_kyc_status()
// ---------------------------------------------------------------------------

/**
 * Kept in TypeScript as well as SQL so the API can explain a status without a
 * round trip. The DB trigger remains authoritative; if these ever disagree,
 * the DB wins and this function is the bug.
 */
export function deriveKycStatus(docs: Array<Pick<DocumentRow, "doc_type" | "verification_status" | "expiry_date">>): KycStatus {
    const mandatory = docs.filter((d) => MANDATORY_KYC_DOC_TYPES.includes(d.doc_type));
    if (mandatory.length === 0) return "not_submitted";

    if (mandatory.some((d) => d.verification_status === "rejected")) return "rejected";

    const verified = mandatory.filter(
        (d) => d.verification_status === "verified" && !isExpired(d.expiry_date),
    ).length;

    if (verified === MANDATORY_KYC_DOC_TYPES.length) return "verified";
    if (verified > 0) return "partially_verified";
    return "pending";
}

// ---------------------------------------------------------------------------
// Rider: read own KYC
// ---------------------------------------------------------------------------

export async function getKycForUser(userId: string, reveal: boolean) {
    const docs = await documentsFor(userId);
    const missing = MANDATORY_KYC_DOC_TYPES.filter(
        (type) => !docs.some((d) => d.doc_type === type && d.verification_status !== "rejected"),
    );

    return {
        user_id: userId,
        kyc_status: deriveKycStatus(docs),
        completion_percent: kycCompletionPercent(docs),
        missing_document_types: missing,
        can_submit: missing.length === 0,
        documents: docs.map((d) => toDocumentView(d, reveal)),
    };
}

// ---------------------------------------------------------------------------
// Rider: upload / replace / delete
// ---------------------------------------------------------------------------

export interface UploadDocumentInput {
    doc_type: KycDocType;
    doc_number: string;
    expiry_date?: string;
    front: UploadedFile;
    back?: UploadedFile;
}

export async function uploadDocument(
    userId: string,
    input: UploadDocumentInput,
    actor: AuthContext,
    req?: Request,
): Promise<DocumentView> {
    if (input.doc_type === "driving_license") {
        if (!input.expiry_date) {
            throw businessRule("A driving licence must include its expiry date.", {
                expiry_date: "Enter the licence expiry date.",
            });
        }
        if (isExpired(input.expiry_date)) {
            throw businessRule("This driving licence has already expired.", {
                expiry_date: "This licence has expired.",
            });
        }
    }
    if (input.doc_type === "aadhaar") {
        assertValidAadhaar(input.doc_number);
    }

    // uq_user_documents_active_type covers pending+verified. Check first so the
    // rider gets a clear 409 rather than a raw constraint error, and so an
    // orphan object is never uploaded for a doomed insert.
    const existing = await activeDocumentOfType(userId, input.doc_type);
    if (existing) {
        throw conflict(
            existing.verification_status === "verified"
                ? "This document is already verified and cannot be replaced."
                : "A document of this type is already awaiting review.",
        );
    }

    const frontMime = assertValidFile(input.front, "front");
    const backMime = input.back ? assertValidFile(input.back, "back") : null;

    const frontPath = buildStoragePath(userId, input.doc_type, frontMime, "front");
    const backPath = backMime && input.back ? buildStoragePath(userId, input.doc_type, backMime, "back") : null;

    await uploadKycFile(frontPath, input.front, frontMime);
    if (backPath && input.back && backMime) await uploadKycFile(backPath, input.back, backMime);

    const { data, error } = await supabaseAdmin
        .from("user_documents")
        .insert({
            user_id: userId,
            doc_type: input.doc_type,
            doc_number: input.doc_number.trim().toUpperCase(),
            storage_path: frontPath,
            back_storage_path: backPath,
            expiry_date: input.expiry_date ?? null,
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
        entityType: "user_document",
        entityId: row.id,
        after: { doc_type: row.doc_type, doc_number: row.doc_number, expiry_date: row.expiry_date },
        req,
    });

    return toDocumentView(row, false);
}

export async function updateOwnDocument(
    userId: string,
    documentId: string,
    patch: { doc_number?: string; expiry_date?: string; front?: UploadedFile; back?: UploadedFile },
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
        if (row.doc_type === "aadhaar") assertValidAadhaar(patch.doc_number);
        next.doc_number = patch.doc_number.trim().toUpperCase();
    }
    if (patch.expiry_date) {
        if (row.doc_type === "driving_license" && isExpired(patch.expiry_date)) {
            throw businessRule("This driving licence has already expired.", {
                expiry_date: "This licence has expired.",
            });
        }
        next.expiry_date = patch.expiry_date;
    }

    if (patch.front) {
        const mime = assertValidFile(patch.front, "front");
        const path = buildStoragePath(userId, row.doc_type, mime, "front");
        await uploadKycFile(path, patch.front, mime);
        next.storage_path = path;
        staleObjects.push(row.storage_path);
    }
    if (patch.back) {
        const mime = assertValidFile(patch.back, "back");
        const path = buildStoragePath(userId, row.doc_type, mime, "back");
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
        next.verified_by = null;
        next.verified_at = null;
        next.submitted_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
        .from("user_documents")
        .update(next)
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
        entityType: "user_document",
        entityId: documentId,
        before: { verification_status: row.verification_status, doc_number: row.doc_number },
        after: { verification_status: next.verification_status ?? row.verification_status },
        req,
    });

    return toDocumentView(data as unknown as DocumentRow, false);
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
    if (!pathBelongsToUser(row.storage_path ?? `${userId}/`, userId)) {
        throw forbidden("This document does not belong to you.");
    }

    const { error } = await supabaseAdmin
        .from("user_documents")
        .delete()
        .eq("id", documentId)
        .eq("user_id", userId);
    if (error) throw error;

    await removeKycFiles([row.storage_path, row.back_storage_path]);

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "kyc.document_deleted",
        entityType: "user_document",
        entityId: documentId,
        before: { doc_type: row.doc_type, verification_status: row.verification_status },
        req,
    });
}

// ---------------------------------------------------------------------------
// Rider: submit
// ---------------------------------------------------------------------------

export async function submitKyc(userId: string, actor: AuthContext, req?: Request) {
    const docs = await documentsFor(userId);

    const missing = MANDATORY_KYC_DOC_TYPES.filter(
        (type) => !docs.some((d) => d.doc_type === type && d.verification_status !== "rejected"),
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
        .from("user_documents")
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

    // kyc_status is maintained by trg_sync_user_kyc_status, so re-read rather
    // than assuming what it became.
    return getKycForUser(userId, false);
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
    let query = supabaseAdmin
        .from("users")
        .select("id, full_name, email, phone, kyc_status", { count: "exact" })
        .is("deleted_at", null);

    if (filters.status) query = query.eq("kyc_status", filters.status);
    else query = query.neq("kyc_status", "not_submitted");

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

    const rows = (data ?? []) as Array<{
        id: string; full_name: string; email: string | null; phone: string | null; kyc_status: KycStatus;
    }>;
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
            has_expired_document: docs.some((d) => isExpired(d.expiry_date)),
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
        documents: docs.map((d) => toDocumentView(d, true)),
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
): Promise<{ url: string; expires_in: number }> {
    const row = await requireDocument(documentId);
    if (!isStaffCaller && row.user_id !== actor.id) throw notFound("Document not found.");

    const path = side === "front" ? row.storage_path : row.back_storage_path;
    if (!path) throw notFound(`This document has no ${side} side.`);
    if (!pathBelongsToUser(path, row.user_id)) {
        // Defence in depth: a path outside the owner's prefix means the row
        // was tampered with, so refuse rather than sign it.
        throw forbidden("This document could not be verified as authentic.");
    }

    const url = await createSignedUrl(path);
    return { url, expires_in: 300 };
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
    if (isExpired(row.expiry_date)) {
        throw businessRule("This document has expired and cannot be verified.");
    }

    const updated = await applyVerification(documentId, actor.id, {
        verification_status: "verified",
        rejection_reason: null,
        verified_by: actor.id,
        verified_at: new Date().toISOString(),
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: row.user_id,
        action: "kyc.document_verified",
        entityType: "user_document",
        entityId: documentId,
        before: { verification_status: row.verification_status },
        after: { verification_status: "verified" },
        req,
    });

    return toDocumentView(updated, true);
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
        verified_by: actor.id,
        verified_at: new Date().toISOString(),
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: row.user_id,
        action: "kyc.document_rejected",
        entityType: "user_document",
        entityId: documentId,
        before: { verification_status: row.verification_status },
        after: { verification_status: "rejected", reason: reason.trim() },
        req,
    });

    return toDocumentView(updated, true);
}

// ---------------------------------------------------------------------------
// Admin: final approve / reject
// ---------------------------------------------------------------------------

export async function approveKyc(userId: string, actor: AuthContext, req?: Request) {
    if (userId === actor.id) throw forbidden("You cannot approve your own KYC.");
    const docs = await documentsFor(userId);

    const unverified = MANDATORY_KYC_DOC_TYPES.filter(
        (type) => !docs.some((d) => d.doc_type === type && d.verification_status === "verified"),
    );
    if (unverified.length > 0) {
        throw businessRule(
            `Every required document must be verified first. Outstanding: ${unverified.join(", ")}.`,
        );
    }
    if (docs.some((d) => d.verification_status === "verified" && isExpired(d.expiry_date))) {
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
    return getKycForUser(userId, true);
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
            verified_by: actor.id,
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

    return getKycForUser(userId, true);
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
    const { error: setError } = await supabaseAdmin.rpc("set_config", {
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
        .from("user_documents")
        .update(patch)
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
        .from("user_documents")
        .select(DOC_COLUMNS)
        .eq("id", documentId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Document not found.");
    return data as unknown as DocumentRow;
}

async function activeDocumentOfType(userId: string, docType: KycDocType): Promise<DocumentRow | null> {
    const { data, error } = await supabaseAdmin
        .from("user_documents")
        .select(DOC_COLUMNS)
        .eq("user_id", userId)
        .eq("doc_type", docType)
        .in("verification_status", ["pending", "verified"])
        .maybeSingle();
    if (error) throw error;
    return (data as unknown as DocumentRow) ?? null;
}

async function documentsFor(userId: string): Promise<DocumentRow[]> {
    const { data, error } = await supabaseAdmin
        .from("user_documents")
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
        .from("user_documents")
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
    let q = supabaseAdmin.from("user_documents").select("user_id");
    if (filters.docType) q = q.eq("doc_type", filters.docType);
    if (filters.submittedFrom) q = q.gte("submitted_at", filters.submittedFrom);
    if (filters.submittedTo) q = q.lte("submitted_at", filters.submittedTo);
    if (filters.expiringBefore) q = q.lte("expiry_date", filters.expiringBefore);
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
