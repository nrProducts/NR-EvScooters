import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import {
    ORIGINAL_DOC_LABEL, OriginalDocInput, OriginalDocType, OriginalDocumentView, OriginalsInput,
    RentalOriginalsView,
} from "./originals.types";

/**
 * Original documents held for riders.
 *
 * The tables are not in the generated types yet, hence the untyped client.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

/** Cleans what came in: drops stray labels, merges repeats of the same standard document. */
export function normaliseOriginals(input: OriginalsInput): { taken: boolean; documents: OriginalDocInput[] } {
    if ("none" in input) return { taken: false, documents: [] };

    const seen = new Set<OriginalDocType>();
    const documents: OriginalDocInput[] = [];
    for (const d of input.documents) {
        if (d.type === "other") {
            const label = (d.other_label ?? "").trim();
            if (!label) throw businessRule("Say what the other original document is.", { documents: "Describe the other document." });
            documents.push({ type: "other", other_label: label });
        } else if (!seen.has(d.type)) {
            // Ticking the same standard document twice is one document, not two.
            seen.add(d.type);
            documents.push({ type: d.type });
        }
    }
    if (documents.length === 0) throw businessRule("Choose at least one original document, or record that none were taken.");
    return { taken: true, documents };
}

/**
 * Saves the pickup decision for a rental. Throws on any failure — the caller
 * (confirmPickup) treats that as "the handover did not happen" and rolls back,
 * because originals that were physically taken but not recorded are exactly the
 * mistake this exists to prevent.
 */
export async function recordOriginalsAtPickup(args: {
    rentalId: string;
    userId: string;
    originals: OriginalsInput;
    actorId: string;
}): Promise<{ taken: boolean; documents: OriginalDocInput[] }> {
    const { taken, documents } = normaliseOriginals(args.originals);

    const { error: headerError } = await db.from("rental_originals").insert({
        rental_id: args.rentalId,
        user_id: args.userId,
        taken,
        recorded_by: args.actorId,
    });
    if (headerError) throw headerError;

    if (documents.length > 0) {
        const { error: docsError } = await db.from("rental_original_documents").insert(
            documents.map((d) => ({
                rental_id: args.rentalId,
                user_id: args.userId,
                doc_type: d.type,
                other_label: d.type === "other" ? d.other_label : null,
                received_by: args.actorId,
            })),
        );
        if (docsError) throw docsError;
    }
    return { taken, documents };
}

/** Pickup records for one rider or one rental, newest first, each with its documents. */
async function loadViews(scope: { userId?: string; rentalId?: string }): Promise<RentalOriginalsView[]> {
    let headerQuery = db
        .from("rental_originals")
        .select("rental_id, taken, recorded_at, recorded_by")
        .order("recorded_at", { ascending: false });
    if (scope.userId) headerQuery = headerQuery.eq("user_id", scope.userId);
    if (scope.rentalId) headerQuery = headerQuery.eq("rental_id", scope.rentalId);
    const { data: headers, error } = await headerQuery;
    if (error) throw error;
    const rows = (headers ?? []) as { rental_id: string; taken: boolean; recorded_at: string; recorded_by: string | null }[];
    if (rows.length === 0) return [];

    let docsQuery = db
        .from("rental_original_documents")
        .select("id, rental_id, doc_type, other_label, status, received_at, received_by, returned_at")
        .order("received_at", { ascending: true });
    if (scope.userId) docsQuery = docsQuery.eq("user_id", scope.userId);
    if (scope.rentalId) docsQuery = docsQuery.eq("rental_id", scope.rentalId);
    const { data: docs, error: docsError } = await docsQuery;
    if (docsError) throw docsError;
    const docRows = (docs ?? []) as {
        id: string; rental_id: string; doc_type: OriginalDocType; other_label: string | null;
        status: "held" | "returned"; received_at: string; received_by: string | null; returned_at: string | null;
    }[];

    const staffIds = [...new Set([
        ...rows.map((r) => r.recorded_by),
        ...docRows.map((d) => d.received_by),
    ].filter((x): x is string => !!x))];
    const { data: users, error: usersError } = staffIds.length
        ? await supabaseAdmin.from("users").select("id, full_name").in("id", staffIds)
        : { data: [], error: null };
    if (usersError) throw usersError;
    const names = new Map((users ?? []).map((u) => [u.id, u.full_name as string]));
    const person = (id: string | null) => (id ? { id, full_name: names.get(id) ?? "Staff" } : null);

    return rows.map((r) => ({
        rental_id: r.rental_id,
        taken: r.taken,
        recorded_at: r.recorded_at,
        recorded_by: person(r.recorded_by),
        documents: docRows
            .filter((d) => d.rental_id === r.rental_id)
            .map((d): OriginalDocumentView => ({
                id: d.id,
                doc_type: d.doc_type,
                label: d.doc_type === "other" ? (d.other_label ?? ORIGINAL_DOC_LABEL.other) : ORIGINAL_DOC_LABEL[d.doc_type],
                status: d.status,
                received_at: d.received_at,
                received_by: person(d.received_by),
                returned_at: d.returned_at,
            })),
    }));
}

/** Every pickup record for a rider, newest first, each with the documents taken. */
export function listOriginalsForUser(userId: string): Promise<RentalOriginalsView[]> {
    return loadViews({ userId });
}

/** The pickup record for one rental, or null if none was recorded (older rentals). */
export async function getOriginalsForRental(rentalId: string): Promise<RentalOriginalsView | null> {
    return (await loadViews({ rentalId }))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Handing them back, when the return is approved
// ---------------------------------------------------------------------------

/** The originals still held for a rental. Empty when none were taken, none were recorded, or all are back. */
export async function heldDocumentsForRental(rentalId: string): Promise<{ id: string; label: string }[]> {
    const { data, error } = await db
        .from("rental_original_documents")
        .select("id, doc_type, other_label")
        .eq("rental_id", rentalId)
        .eq("status", "held");
    if (error) {
        // Not migrated yet: nothing can be held, and a return must not be blocked by that.
        console.warn("[originals] rental_original_documents unreadable", error.message);
        return [];
    }
    return ((data ?? []) as { id: string; doc_type: OriginalDocType; other_label: string | null }[]).map((d) => ({
        id: d.id,
        label: d.doc_type === "other" ? (d.other_label ?? ORIGINAL_DOC_LABEL.other) : ORIGINAL_DOC_LABEL[d.doc_type],
    }));
}

/**
 * Completing a return must say what happened to the originals — IF any are held.
 * Throws when some are held and the answer is missing; returns what is held so
 * the caller can act on the answer once the return has gone through.
 */
export async function assertOriginalsAnswered(
    rentalId: string,
    answer: boolean | undefined,
): Promise<{ id: string; label: string }[]> {
    const held = await heldDocumentsForRental(rentalId);
    if (held.length > 0 && answer === undefined) {
        throw businessRule(
            `Were the original documents returned to the rider? Held: ${held.map((h) => h.label).join(", ")}.`,
            { originals_returned: "Answer Yes or No." },
        );
    }
    return held;
}

/**
 * Applies the answer. YES marks every held original as returned (now, by this
 * staff member); NO leaves them held. Either way it is audited, so "we kept
 * them" is a recorded decision. Idempotent: only rows still held are touched, so
 * a retry after a half-finished request does nothing twice.
 */
export async function applyOriginalsAnswer(args: {
    rentalId: string;
    userId: string | null;
    held: { id: string; label: string }[];
    answer: boolean | undefined;
    actor: AuthContext;
}): Promise<void> {
    const { rentalId, userId, held, answer, actor } = args;
    if (held.length === 0 || answer === undefined) return;

    if (answer) {
        const { error } = await db
            .from("rental_original_documents")
            .update({ status: "returned", returned_at: new Date().toISOString(), returned_by: actor.id })
            .eq("rental_id", rentalId)
            .eq("status", "held");
        if (error) throw error;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: answer ? "rental.originals_returned" : "rental.originals_not_returned",
        entityType: "rental",
        entityId: rentalId,
        after: { documents: held.map((h) => h.label) },
    });
}
