import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, forbidden, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { logPiiAccess } from "../../common/piiAccess";
import type { AuthContext, Paginated } from "../../types";
import {
    buildExportBundle, createExportSignedUrl, storeExportBundle,
} from "./privacy.export";
import { assertErasable, eraseUser } from "./privacy.erasure";
import {
    EXPORT_RATE_LIMIT_HOURS, EXPORT_URL_TTL_SECONDS, graceEndsAt, slaDueAt,
} from "./retention.constants";
import type {
    DpRequestStatus, DpRequestType, ListPrivacyRequestsFilters, NomineeView,
    PrivacyRequestAdminView, PrivacyRequestView,
} from "./privacy.types";
import type {
    CreateRequestBody, ExecuteErasureBody, UpdateNomineeBody, UpdateRequestBody,
} from "./privacy.validation";

const RIDER_COLUMNS = `
    id, reference, type, status, details, requested_changes, sla_due_at,
    grace_ends_at, resolution_notes, rejection_reason, completed_at,
    created_at, updated_at
`;

const ADMIN_COLUMNS = `
    ${RIDER_COLUMNS}, channel, ticket_ref, export_object_path,
    rider:users!data_principal_requests_user_id_fkey(id, full_name, phone, email),
    assignee:users!data_principal_requests_assigned_to_fkey(id, full_name)
`;

/** Statuses from which a request can still change. */
const OPEN_STATUSES: DpRequestStatus[] = ["open", "in_progress", "awaiting_principal"];

const isClosed = (status: DpRequestStatus): boolean => !OPEN_STATUSES.includes(status);

// ---------------------------------------------------------------------------
// Rider: create and read
// ---------------------------------------------------------------------------

export async function createRequest(
    userId: string,
    input: CreateRequestBody,
    req?: Request,
): Promise<PrivacyRequestView> {
    // Refuse an erasure that would strand a scooter or an unpaid balance,
    // BEFORE creating a row — a request that can never be actioned is worse
    // than a clear refusal with the reason.
    if (input.type === "erasure") {
        await assertErasable(userId);

        const existing = await findOpenErasure(userId);
        if (existing) {
            // Return the one they already have rather than a duplicate.
            throw conflict(
                `You already have a deletion request in progress (${existing.reference}). ` +
                "We will be in touch about that one.",
                { reference: existing.reference },
            );
        }
    }

    const now = new Date();
    const { data, error } = await supabaseAdmin
        .from("data_principal_requests")
        .insert({
            user_id: userId,
            type: input.type,
            details: input.details ?? null,
            requested_changes: input.requested_changes
                ? Object.fromEntries(input.requested_changes.map((c) => [c.field, c.value]))
                : null,
            sla_due_at: slaDueAt(input.type, now),
            // The grace clock starts at APPROVAL, not submission, so a slow
            // review does not eat into the rider's window to change their mind.
            grace_ends_at: null,
            channel: "app",
        })
        .select(RIDER_COLUMNS)
        .single();

    if (error) {
        if (error.code === "23505") {
            throw conflict("You already have a request of this kind in progress.");
        }
        throw error;
    }

    const row = data as unknown as PrivacyRequestView;

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: input.type === "erasure" ? "privacy.erasure_requested" : "privacy.request_created",
        entityType: "privacy_request",
        entityId: row.id,
        after: { reference: row.reference, type: row.type, sla_due_at: row.sla_due_at },
        req,
    });

    return row;
}

export async function listMyRequests(
    userId: string,
    filters: { page: number; pageSize: number; type?: DpRequestType },
): Promise<Paginated<PrivacyRequestView>> {
    let query = supabaseAdmin
        .from("data_principal_requests")
        .select(RIDER_COLUMNS, { count: "exact" })
        .eq("user_id", userId);

    if (filters.type) query = query.eq("type", filters.type);

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
    if (error) throw error;

    return paginate(data as unknown as PrivacyRequestView[], count ?? 0, filters);
}

/**
 * A rider's own request. 404 rather than 403 when it belongs to someone else —
 * matching deleteOwnDocument's existing style, and correct here: a 403 would
 * confirm that a given reference exists.
 */
export async function getMyRequest(userId: string, id: string): Promise<PrivacyRequestView> {
    const { data, error } = await supabaseAdmin
        .from("data_principal_requests")
        .select(RIDER_COLUMNS)
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Request not found.");
    return data as unknown as PrivacyRequestView;
}

/** The rider changing their mind. Only possible while the request is still open. */
export async function cancelMyRequest(
    userId: string,
    id: string,
    req?: Request,
): Promise<PrivacyRequestView> {
    const current = await getMyRequest(userId, id);
    if (isClosed(current.status)) {
        throw businessRule("This request has already been closed.");
    }

    const { data, error } = await supabaseAdmin
        .from("data_principal_requests")
        .update({ status: "withdrawn", completed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .select(RIDER_COLUMNS)
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: current.type === "erasure"
            ? "privacy.erasure_cancelled"
            : "privacy.request_cancelled",
        entityType: "privacy_request",
        entityId: id,
        before: { status: current.status },
        after: { status: "withdrawn" },
        req,
    });

    return data as unknown as PrivacyRequestView;
}

// ---------------------------------------------------------------------------
// Rider: data export (DPDPA s.11)
// ---------------------------------------------------------------------------

/**
 * Generates the bundle synchronously.
 *
 * A rider's footprint is hundreds of rows; a queue would need a worker for
 * one use case, and "we'll email it to you" is a worse experience than a
 * two-second wait. If p95 ever goes bad, the request row already models the
 * asynchronous case.
 */
export async function generateExport(
    userId: string,
    actor: AuthContext,
    req?: Request,
): Promise<{ request: PrivacyRequestView; url: string; expires_in: number }> {
    await assertExportNotRateLimited(userId);

    const now = new Date();
    const { data: created, error: createError } = await supabaseAdmin
        .from("data_principal_requests")
        .insert({
            user_id: userId,
            type: "access_export",
            status: "in_progress",
            sla_due_at: slaDueAt("access_export", now),
            channel: "app",
        })
        .select(RIDER_COLUMNS)
        .single();
    if (createError) throw createError;

    const request = created as unknown as PrivacyRequestView;

    const bundle = await buildExportBundle(userId);
    const stored = await storeExportBundle(userId, request.id, bundle);

    const { data: completed, error: completeError } = await supabaseAdmin
        .from("data_principal_requests")
        .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            export_object_path: stored.path,
            resolution_notes:
                "A copy of your data was generated and made available for download. " +
                "The file is deleted from our servers after 30 days.",
        })
        .eq("id", request.id)
        .select(RIDER_COLUMNS)
        .single();
    if (completeError) throw completeError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "privacy.export_generated",
        entityType: "privacy_request",
        entityId: request.id,
        after: { reference: request.reference, by_staff: actor.id !== userId },
        req,
    });

    // A staff-generated export is a read of the rider's entire record — the
    // single largest one possible — so it is logged as such.
    await logPiiAccess({
        actor,
        targetUserId: userId,
        resource: "data_export",
        resourceId: request.id,
        fields: ["complete_record"],
        reason: "rights_request",
        contextRef: request.reference,
        req,
    });

    return {
        request: completed as unknown as PrivacyRequestView,
        url: stored.url,
        expires_in: stored.expires_in,
    };
}

/** Re-mints the signed URL; the bundle itself is not regenerated. */
export async function getExportUrl(
    userId: string,
    requestId: string,
): Promise<{ url: string; expires_in: number }> {
    const request = await getMyRequest(userId, requestId);
    const { data, error } = await supabaseAdmin
        .from("data_principal_requests")
        .select("export_object_path")
        .eq("id", request.id)
        .single();
    if (error) throw error;

    const path = (data as { export_object_path: string | null }).export_object_path;
    if (!path) {
        throw notFound(
            "This request has no download. It may have expired — exports are deleted " +
            "after 30 days. Request a new copy.",
        );
    }

    return { url: await createExportSignedUrl(path), expires_in: EXPORT_URL_TTL_SECONDS };
}

async function assertExportNotRateLimited(userId: string): Promise<void> {
    const since = new Date(Date.now() - EXPORT_RATE_LIMIT_HOURS * 3600_000).toISOString();
    const { data, error } = await supabaseAdmin
        .from("data_principal_requests")
        .select("id, created_at")
        .eq("user_id", userId)
        .eq("type", "access_export")
        .gte("created_at", since)
        .limit(1);
    if (error) throw error;

    if (data && data.length > 0) {
        // Each bundle is the most concentrated PII artefact the system
        // produces; generating them on a loop is both a cost and a risk.
        throw conflict(
            `You can download a copy of your data once every ${EXPORT_RATE_LIMIT_HOURS} hours. ` +
            "Your most recent copy is still available from your requests list.",
        );
    }
}

// ---------------------------------------------------------------------------
// Rider: nominee (DPDPA s.14)
// ---------------------------------------------------------------------------

export async function getNominee(userId: string): Promise<NomineeView> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("nominee_full_name, nominee_relationship, nominee_phone, nominee_email, nominee_updated_at")
        .eq("id", userId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("User not found.");

    const row = data as Record<string, string | null>;
    return {
        full_name: row.nominee_full_name,
        relationship: row.nominee_relationship,
        phone: row.nominee_phone,
        email: row.nominee_email,
        updated_at: row.nominee_updated_at,
    };
}

export async function updateNominee(
    userId: string,
    input: UpdateNomineeBody,
    req?: Request,
): Promise<NomineeView> {
    const { error } = await supabaseAdmin
        .from("users")
        .update({
            nominee_full_name: input.full_name,
            nominee_relationship: input.relationship,
            nominee_phone: input.phone ?? null,
            nominee_email: input.email ?? null,
            nominee_updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    if (error) throw error;

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: "privacy.nominee_updated",
        entityType: "user",
        entityId: userId,
        // The nominee's own details are redacted by safeAuditPayload — they
        // are a third party who never consented to being in our audit trail.
        after: { nominee_full_name: input.full_name, has_nominee: true },
        req,
    });

    return getNominee(userId);
}

export async function clearNominee(userId: string, req?: Request): Promise<void> {
    const { error } = await supabaseAdmin
        .from("users")
        .update({
            nominee_full_name: null,
            nominee_relationship: null,
            nominee_phone: null,
            nominee_email: null,
            nominee_updated_at: null,
        })
        .eq("id", userId);
    if (error) throw error;

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: "privacy.nominee_updated",
        entityType: "user",
        entityId: userId,
        after: { has_nominee: false },
        req,
    });
}

// ---------------------------------------------------------------------------
// Staff: the queue
// ---------------------------------------------------------------------------

export async function listRequests(
    filters: ListPrivacyRequestsFilters,
): Promise<Paginated<PrivacyRequestAdminView>> {
    let query = supabaseAdmin
        .from("data_principal_requests")
        .select(ADMIN_COLUMNS, { count: "exact" });

    if (filters.type) query = query.eq("type", filters.type);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
    if (filters.overdueOnly) {
        query = query.lt("sla_due_at", new Date().toISOString()).in("status", OPEN_STATUSES);
    }

    const [from, to] = toRange(filters);
    // Oldest first: a queue sorted newest-first is a queue where the request
    // closest to breaching its SLA is the hardest one to find.
    const { data, error, count } = await query
        .order("sla_due_at", { ascending: true })
        .range(from, to);
    if (error) throw error;

    return paginate(
        (data ?? []).map((row) => toAdminView(row as Record<string, unknown>)),
        count ?? 0,
        filters,
    );
}

export async function getRequest(id: string): Promise<PrivacyRequestAdminView> {
    const { data, error } = await supabaseAdmin
        .from("data_principal_requests")
        .select(ADMIN_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Request not found.");
    return toAdminView(data as Record<string, unknown>);
}

export async function updateRequest(
    id: string,
    input: UpdateRequestBody,
    actor: AuthContext,
    req?: Request,
): Promise<PrivacyRequestAdminView> {
    const before = await getRequest(id);

    if (isClosed(before.status)) {
        throw businessRule("This request is closed and cannot be changed.");
    }

    // Erasure is never completed by editing a status field. It completes when
    // the data is actually destroyed, via execute-erasure — otherwise a
    // reviewer could mark a rider "done" while their Aadhaar scan is still
    // sitting in storage.
    if (input.status === "completed" && before.type === "erasure") {
        throw businessRule(
            "An erasure is completed by running it, not by changing its status. " +
            "Use approve, then execute.",
        );
    }

    const patch: Record<string, unknown> = { ...input };
    if (input.status === "completed") patch.completed_at = new Date().toISOString();

    const { error } = await supabaseAdmin
        .from("data_principal_requests")
        .update(patch)
        .eq("id", id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: before.rider?.id ?? null,
        action: input.status === "completed"
            ? "privacy.request_completed"
            : input.assigned_to !== undefined
                ? "privacy.request_assigned"
                : "privacy.request_updated",
        entityType: "privacy_request",
        entityId: id,
        before: { status: before.status },
        after: { status: input.status ?? before.status, reference: before.reference },
        req,
    });

    return getRequest(id);
}

export async function rejectRequest(
    id: string,
    reason: string,
    actor: AuthContext,
    req?: Request,
): Promise<PrivacyRequestAdminView> {
    const before = await getRequest(id);
    if (isClosed(before.status)) throw businessRule("This request is already closed.");

    const { error } = await supabaseAdmin
        .from("data_principal_requests")
        .update({
            status: "rejected",
            rejection_reason: reason,
            completed_at: new Date().toISOString(),
        })
        .eq("id", id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: before.rider?.id ?? null,
        action: "privacy.request_rejected",
        entityType: "privacy_request",
        entityId: id,
        before: { status: before.status },
        after: { status: "rejected", reason, reference: before.reference },
        req,
    });

    return getRequest(id);
}

// ---------------------------------------------------------------------------
// Staff: erasure, in two deliberate steps
// ---------------------------------------------------------------------------

/**
 * Step one: approve, which starts the cooling-off clock.
 *
 * Splitting approval from execution is the whole safety property. Approval is
 * reversible — the rider can still cancel, and so can ops. Execution is not.
 */
export async function approveErasure(
    id: string,
    actor: AuthContext,
    req?: Request,
): Promise<PrivacyRequestAdminView> {
    const before = await getRequest(id);
    if (before.type !== "erasure") throw businessRule("This is not an erasure request.");
    if (isClosed(before.status)) throw businessRule("This request is already closed.");
    if (before.grace_ends_at) throw businessRule("This erasure has already been approved.");
    if (!before.rider) throw businessRule("This request has no rider attached.");

    await assertErasable(before.rider.id);

    const grace = graceEndsAt();
    const { error } = await supabaseAdmin
        .from("data_principal_requests")
        .update({ status: "in_progress", grace_ends_at: grace, assigned_to: actor.id })
        .eq("id", id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: before.rider.id,
        action: "privacy.erasure_approved",
        entityType: "privacy_request",
        entityId: id,
        after: { reference: before.reference, grace_ends_at: grace },
        req,
    });

    return getRequest(id);
}

/**
 * Step two: execute. Irreversible.
 *
 * Refuses before the cooling-off window ends unless explicitly forced with a
 * reason, and refuses outright if the approver is the executor — two people,
 * as with roles and capabilities elsewhere. The rider's data is destroyed
 * here; there is no undo and no backup path that restores only this rider.
 */
export async function executeErasure(
    id: string,
    input: ExecuteErasureBody,
    actor: AuthContext,
    req?: Request,
): Promise<PrivacyRequestAdminView> {
    const before = await getRequest(id);
    if (before.type !== "erasure") throw businessRule("This is not an erasure request.");
    if (isClosed(before.status)) throw businessRule("This request is already closed.");
    if (!before.grace_ends_at) {
        throw businessRule("This erasure has not been approved yet.");
    }
    if (!before.rider) throw businessRule("This request has no rider attached.");

    const graceOver = new Date(before.grace_ends_at) <= new Date();
    if (!graceOver && !input.force) {
        throw businessRule(
            `This erasure cannot run until ${before.grace_ends_at}, so the rider has time ` +
            "to change their mind. Force it only if you have a reason to.",
            { grace_ends_at: before.grace_ends_at },
        );
    }

    if (before.assigned_to && before.assigned_to.id === actor.id && input.force) {
        throw forbidden(
            "The person who approved an erasure cannot also force it through early. " +
            "Ask another administrator.",
        );
    }

    await assertErasable(before.rider.id);

    const result = await eraseUser(before.rider.id, id);

    const notes =
        "Your account and identity have been erased. We have kept your invoices, " +
        "payments, deposits and refunds because tax and company law require it — " +
        "those records are no longer linked to your name or contact details. " +
        "Vehicle damage photographs are kept as evidence of a vehicle's condition." +
        (result.auth_scrubbed ? "" : " (Login identity requires manual removal.)");

    const { error } = await supabaseAdmin
        .from("data_principal_requests")
        .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            resolution_notes: notes,
        })
        .eq("id", id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: before.rider.id,
        action: "privacy.erasure_executed",
        entityType: "privacy_request",
        entityId: id,
        after: {
            reference: before.reference,
            forced: input.force,
            force_reason: input.reason ?? null,
            storage_objects_removed: result.storage_removed,
            auth_scrubbed: result.auth_scrubbed,
        },
        req,
    });

    return getRequest(id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findOpenErasure(userId: string): Promise<{ reference: string } | null> {
    const { data, error } = await supabaseAdmin
        .from("data_principal_requests")
        .select("reference")
        .eq("user_id", userId)
        .eq("type", "erasure")
        .in("status", OPEN_STATUSES)
        .maybeSingle();
    if (error) throw error;
    return (data as { reference: string } | null) ?? null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function toAdminView(row: Record<string, unknown>): PrivacyRequestAdminView {
    const status = row.status as DpRequestStatus;
    return {
        id: row.id as string,
        reference: row.reference as string,
        type: row.type as DpRequestType,
        status,
        details: (row.details as string | null) ?? null,
        requested_changes: (row.requested_changes as Record<string, unknown> | null) ?? null,
        sla_due_at: row.sla_due_at as string,
        grace_ends_at: (row.grace_ends_at as string | null) ?? null,
        resolution_notes: (row.resolution_notes as string | null) ?? null,
        rejection_reason: (row.rejection_reason as string | null) ?? null,
        completed_at: (row.completed_at as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: (row.updated_at as string | null) ?? null,
        channel: row.channel as PrivacyRequestAdminView["channel"],
        ticket_ref: (row.ticket_ref as string | null) ?? null,
        export_object_path: (row.export_object_path as string | null) ?? null,
        rider: unwrap(row.rider),
        assigned_to: unwrap(row.assignee),
        is_overdue: !isClosed(status) && new Date(row.sla_due_at as string) < new Date(),
    };
}
