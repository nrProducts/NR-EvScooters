import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, forbidden, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { businessToday } from "../../common/dates";
import { writeAudit } from "../../common/audit";
import { logPiiAccess } from "../../common/piiAccess";
import type { AuthContext, Paginated } from "../../types";
import type { Database } from "../../types/database.types";
import { buildPrivacySummary, type PrivacySummary } from "./privacy.summary";
import { assertErasable, eraseUser } from "./privacy.erasure";
import { graceEndsAt, slaDueAt } from "./retention.constants";
import type {
    DpRequestStatus, DpRequestType, ListPrivacyRequestsFilters, NomineeView,
    PrivacyRequestAdminView, PrivacyRequestView,
} from "./privacy.types";
import type {
    CreateRequestBody, ExecuteErasureBody, UpdateNomineeBody, UpdateRequestBody,
} from "./privacy.validation";

// `type:request_type` and `assignee:...assigned_to_user_id_fkey` are aliases,
// not renames: the column and the foreign key are what the schema calls them,
// while the wire shape both apps already read stays `type` and `assigned_to`.
const RIDER_COLUMNS = `
    id, reference, type:request_type, status, details, requested_changes, sla_due_at,
    grace_ends_at, resolution_notes, rejection_reason, completed_at,
    created_at, updated_at
`;

const ADMIN_COLUMNS = `
    ${RIDER_COLUMNS}, channel,
    rider:users!data_principal_requests_user_id_fkey(id, full_name, phone, email),
    assignee:users!data_principal_requests_assigned_to_user_id_fkey(id, full_name)
`;

/** Statuses from which a request can still change. */
const OPEN_STATUSES: DpRequestStatus[] = ["open", "in_progress", "awaiting_principal"];

const isClosed = (status: DpRequestStatus): boolean => !OPEN_STATUSES.includes(status);

/**
 * `data_principal_requests.reference` is `not null unique` with no default and
 * no trigger behind it, so the backend has to mint it. Date plus eight random
 * base32 characters: readable enough for a rider to quote over the phone, and
 * wide enough (~10^12) that a collision is not a practical concern. The unique
 * index is still the authority — a 23505 on insert is handled by the caller.
 */
const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function newReference(now: Date): string {
    // The business day, not the UTC one: a rider who files a request at
    // 01:00 IST quotes this reference back, and it must carry the date they
    // and the console both think they filed it on.
    const day = businessToday(now).replace(/-/g, "");
    let suffix = "";
    for (let i = 0; i < 8; i += 1) {
        suffix += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
    }
    return `DPR-${day}-${suffix}`;
}

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
            reference: newReference(now),
            request_type: input.type,
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

    if (filters.type) query = query.eq("request_type", filters.type);

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
// Rider: access summary (DPDPA s.11)
// ---------------------------------------------------------------------------

/**
 * The rider reading their own s.11 summary.
 *
 * No request row, no rate limit and no audit entry: this is a person looking
 * at their own record, which is the thing the right exists to permit. A
 * queue entry per view would turn an instant answer into a 30-day SLA, and
 * logging a rider's reads of themselves records nothing anyone can act on.
 *
 * A STAFF member reading it is a different act entirely — see
 * summaryForUser(), which logs.
 */
export async function getMySummary(userId: string): Promise<PrivacySummary> {
    return buildPrivacySummary(userId);
}

/**
 * Staff reading a rider's summary, for a request that arrived off-app.
 *
 * Logged to pii_access_log as a read of the rider's whole record, because
 * that is what it is. The SOP requires the requester's identity to be
 * verified before this is used — an access request is exactly how a
 * social-engineering attempt on someone else's data begins.
 */
export async function summaryForUser(
    userId: string,
    actor: AuthContext,
    req?: Request,
): Promise<PrivacySummary> {
    const summary = await buildPrivacySummary(userId);

    await logPiiAccess({
        actor,
        targetUserId: userId,
        resource: "data_export",
        fields: ["complete_record"],
        reason: "rights_request",
        req,
    });

    return summary;
}

// ---------------------------------------------------------------------------
// Rider: nominee (DPDPA s.14)
// ---------------------------------------------------------------------------

export async function getNominee(userId: string): Promise<NomineeView> {
    const { data, error } = await supabaseAdmin
        .from("user_related_persons")
        .select("full_name, relationship, phone, email, updated_at")
        .eq("user_id", userId)
        .eq("person_role", "nominee")
        .maybeSingle();
    if (error) throw error;

    // Absent is not an error: most riders have not named a nominee, and the
    // five `users.nominee_*` columns this replaces were null on all of them.
    if (!data) {
        return { full_name: null, relationship: null, phone: null, email: null, updated_at: null };
    }

    return {
        full_name: data.full_name,
        relationship: data.relationship,
        phone: data.phone,
        email: data.email,
        updated_at: data.updated_at,
    };
}

export async function updateNominee(
    userId: string,
    input: UpdateNomineeBody,
    req?: Request,
): Promise<NomineeView> {
    // A nominee is a PERSON, not five columns on the rider — which is also
    // why an emergency contact and a nominee are now the same table with
    // different `person_role`s, instead of one being columns and one a row.
    //
    // There is no unique index on (user_id, person_role), so this cannot be an
    // upsert with an onConflict target — read first, then update or insert,
    // the same shape `users.service.ts` uses for the emergency contact.
    const { data: existing, error: readError } = await supabaseAdmin
        .from("user_related_persons")
        .select("id")
        .eq("user_id", userId)
        .eq("person_role", "nominee")
        .maybeSingle();
    if (readError) throw readError;

    const row = {
        user_id: userId,
        person_role: "nominee" as const,
        full_name: input.full_name,
        relationship: input.relationship,
        phone: input.phone ?? null,
        email: input.email ?? null,
    };

    const { error } = existing
        ? await supabaseAdmin.from("user_related_persons").update(row).eq("id", existing.id)
        : await supabaseAdmin.from("user_related_persons").insert(row);
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
    // Deleted, not blanked: the row IS the nominee, so removing them is a
    // delete rather than five nulls.
    const { error } = await supabaseAdmin
        .from("user_related_persons")
        .delete()
        .eq("user_id", userId)
        .eq("person_role", "nominee");
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

    if (filters.type) query = query.eq("request_type", filters.type);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.assignedTo) query = query.eq("assigned_to_user_id", filters.assignedTo);
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

    // Built field by field rather than spread: the request body speaks the wire
    // name `assigned_to`, the column is `assigned_to_user_id`, and a spread
    // would send the wire name straight to PostgREST.
    const patch: Database["public"]["Tables"]["data_principal_requests"]["Update"] = {};
    if (input.status !== undefined) patch.status = input.status;
    if (input.assigned_to !== undefined) patch.assigned_to_user_id = input.assigned_to;
    if (input.resolution_notes !== undefined) patch.resolution_notes = input.resolution_notes;
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
        .update({ status: "in_progress", grace_ends_at: grace, assigned_to_user_id: actor.id })
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
        .eq("request_type", "erasure")
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
        rider: unwrap(row.rider),
        assigned_to: unwrap(row.assignee),
        is_overdue: !isClosed(status) && new Date(row.sla_due_at as string) < new Date(),
    };
}
