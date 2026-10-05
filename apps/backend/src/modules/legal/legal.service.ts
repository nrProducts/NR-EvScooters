import type { Request } from "express";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import type { AuthContext } from "../../types";
import type {
    LegalAcceptanceContext, LegalAcceptanceState, LegalDocumentType,
    LegalDocumentView, LegalLanguage,
} from "./legal.types";
import type { AcceptDocumentBody, PublishDocumentBody } from "./legal.validation";

interface DocumentRow {
    id: string;
    doc_type: LegalDocumentType;
    version: string;
    effective_from: string;
    body_en: string;
    body_ta: string | null;
    body_sha256: string;
}

const DOCUMENT_COLUMNS = "id, doc_type, version, effective_from, body_en, body_ta, body_sha256";

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** The single live document of a type. Everything else is measured against it. */
export async function getActiveDocument(docType: LegalDocumentType): Promise<DocumentRow> {
    const { data, error } = await supabaseAdmin
        .from("legal_documents")
        .select(DOCUMENT_COLUMNS)
        .eq("doc_type", docType)
        .is("retired_at", null)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        // Only reachable if someone retired the seeded document without
        // publishing a replacement. Surfaced loudly rather than defaulting to
        // "no acceptance needed", which is the dangerous failure mode: it
        // would let riders book against terms that do not exist.
        throw notFound("No terms are currently published.");
    }
    return data as DocumentRow;
}

/**
 * Resolves the document for one language.
 *
 * The returned `language` is what was actually served, which is not always
 * what was asked for: `body_ta` is nullable because a legal document must not
 * be machine-translated, so a Tamil request falls back to English and SAYS SO.
 * Silently returning English while claiming it is Tamil would put the wrong
 * language in the acceptance record.
 */
export async function getDocumentView(
    docType: LegalDocumentType,
    lang: LegalLanguage,
): Promise<LegalDocumentView> {
    const row = await getActiveDocument(docType);
    const useTamil = lang === "ta" && !!row.body_ta;
    return {
        id: row.id,
        doc_type: row.doc_type,
        version: row.version,
        effective_from: row.effective_from,
        language: useTamil ? "ta" : "en",
        body: useTamil ? row.body_ta! : row.body_en,
        body_sha256: row.body_sha256,
    };
}

export async function listDocuments(docType: LegalDocumentType) {
    const { data, error } = await supabaseAdmin
        .from("legal_documents")
        .select("id, doc_type, version, effective_from, retired_at, body_sha256")
        .eq("doc_type", docType)
        .order("effective_from", { ascending: false });
    if (error) throw error;
    return data ?? [];
}

/**
 * Publishes a new version and retires the current one.
 *
 * Deliberately has no "edit" counterpart, for the same reason
 * consent.service.publishNotice does not: editing a document riders have
 * already accepted would silently change what they agreed to and break the
 * body_sha256 integrity anchor. A correction is a new version, which
 * re-prompts everyone — and that cost is the point.
 */
export async function publishDocument(
    input: PublishDocumentBody,
    actor: AuthContext,
    req?: Request,
): Promise<LegalDocumentView> {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from("legal_documents")
        .select("id")
        .eq("doc_type", input.doc_type)
        .eq("version", input.version)
        .maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw conflict(`Version ${input.version} already exists.`);

    // Must stay byte-identical to the migration's seed:
    //   encode(sha256(convert_to(body, 'UTF8')), 'hex')
    // The English body alone is hashed — body_ta is nullable, and folding a
    // null into the digest would make the hash unreproducible.
    const sha = createHash("sha256").update(input.body_en, "utf8").digest("hex");

    // Retire the live one FIRST. The unique partial index rejects a second
    // un-retired row of the same type, so this ordering is load-bearing.
    const { error: retireError } = await supabaseAdmin
        .from("legal_documents")
        .update({ retired_at: new Date().toISOString() })
        .eq("doc_type", input.doc_type)
        .is("retired_at", null);
    if (retireError) throw retireError;

    const { data, error } = await supabaseAdmin
        .from("legal_documents")
        .insert({
            doc_type: input.doc_type,
            version: input.version,
            body_en: input.body_en,
            body_ta: input.body_ta ?? null,
            body_sha256: sha,
            effective_from: input.effective_from ?? new Date().toISOString(),
            created_by: actor.id,
        })
        .select(DOCUMENT_COLUMNS)
        .single();
    if (error) throw error;

    await writeAudit({
        action: "legal_document.published",
        entityType: "legal_document",
        entityId: (data as DocumentRow).id,
        actorId: actor.id,
        targetUserId: null,
        after: { doc_type: input.doc_type, version: input.version, body_sha256: sha },
        req,
    });

    return getDocumentView(input.doc_type, "en");
}

// ---------------------------------------------------------------------------
// Acceptances
// ---------------------------------------------------------------------------

/**
 * Whether this rider owes an acceptance.
 *
 * Compares against the LIVE document rather than "has ever accepted
 * anything", so publishing a new version flips every rider to false at once —
 * exactly how consent's `up_to_date` behaves.
 */
export async function getAcceptanceState(
    userId: string,
    docType: LegalDocumentType,
): Promise<LegalAcceptanceState> {
    const current = await getActiveDocument(docType);

    const { data, error } = await supabaseAdmin
        .from("legal_acceptances")
        .select("document_version, accepted_at")
        .eq("user_id", userId)
        .eq("document_id", current.id)
        .maybeSingle();
    if (error) throw error;

    const row = data as { document_version: string; accepted_at: string } | null;
    return {
        doc_type: docType,
        current_version: current.version,
        up_to_date: !!row,
        accepted_version: row?.document_version ?? null,
        accepted_at: row?.accepted_at ?? null,
    };
}

/**
 * Records that a rider accepted the live document.
 *
 * The version the client was rendering is checked against the live one before
 * anything is written. Without that check a rider could be recorded as
 * accepting terms that were retired while their screen was open — and the
 * only thing this table is for is being able to say which words they saw.
 *
 * Re-accepting the same version is idempotent rather than an error: a retried
 * request after a dropped response must not fail the rider out of signup. The
 * unique index makes that a database guarantee, not a race between two reads.
 */
export async function acceptDocument(
    userId: string,
    input: AcceptDocumentBody,
    ctx: LegalAcceptanceContext,
    req?: Request,
): Promise<LegalAcceptanceState> {
    const current = await getActiveDocument(input.doc_type);

    if (current.version !== input.version) {
        throw conflict(
            "These terms have been updated. Please read the new version and accept it.",
        );
    }

    const { ip, userAgent } = requestContext(req);

    const { error } = await supabaseAdmin.from("legal_acceptances").insert({
        user_id: userId,
        document_id: current.id,
        doc_type: input.doc_type,
        document_version: current.version,
        language: input.language,
        source: ctx.source,
        ip,
        user_agent: userAgent,
        device_id: input.device_id ?? null,
        actor_id: ctx.actorId,
    });

    // 23505 = unique violation on (user_id, document_id): already accepted.
    // Idempotent by design — fall through and report the existing state.
    if (error && (error as { code?: string }).code !== "23505") throw error;

    if (!error) {
        await writeAudit({
            action: "legal_document.accepted",
            entityType: "legal_acceptance",
            entityId: current.id,
            actorId: ctx.actorId ?? userId,
            targetUserId: userId,
            after: {
                doc_type: input.doc_type,
                version: current.version,
                language: input.language,
            },
            req,
        });
    }

    return getAcceptanceState(userId, input.doc_type);
}

/** A rider's full acceptance history — their own audit trail. */
export async function getAcceptanceHistory(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("legal_acceptances")
        .select("doc_type, document_version, language, source, accepted_at")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
}

function requestContext(req?: Request): { ip: string | null; userAgent: string | null } {
    if (!req) return { ip: null, userAgent: null };
    return {
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
    };
}
